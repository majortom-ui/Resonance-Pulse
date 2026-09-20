import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, State, Subscription } from 'react-native-ble-plx';
import base64 from 'base64-js';

// Standard Bluetooth LE Heart Rate Service (0x180D) / Heart Rate Measurement
// characteristic (0x2A37) — the same open profile chest straps use. Whoop's
// "HR Broadcast" toggle (Whoop app > Device Settings) advertises this service
// and includes per-beat RR-intervals in the measurement payload, which is what
// makes real RMSSD possible without a camera.
export const HEART_RATE_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
export const HEART_RATE_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

export interface HeartRateSample {
  bpm: number;
  rrIntervalsMs: number[];
  timestampMs: number;
}

export interface DiscoveredDevice {
  id: string;
  name: string;
  rssi: number | null;
}

type ConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected';

export class HeartRateMonitor {
  private manager = new BleManager();
  private device: Device | null = null;
  private monitorSub: Subscription | null = null;
  private disconnectSub: Subscription | null = null;

  onSample: ((sample: HeartRateSample) => void) | null = null;
  onDeviceFound: ((device: DiscoveredDevice) => void) | null = null;
  onConnectionStateChange: ((state: ConnectionState) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  private state: ConnectionState = 'disconnected';

  private setState(state: ConnectionState) {
    this.state = state;
    this.onConnectionStateChange?.(state);
  }

  getState(): ConnectionState {
    return this.state;
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    if (Platform.Version < 31) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
    );
  }

  async waitForPoweredOn(timeoutMs = 5000): Promise<boolean> {
    const current = await this.manager.state();
    if (current === State.PoweredOn) return true;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        sub.remove();
        resolve(false);
      }, timeoutMs);
      const sub = this.manager.onStateChange((newState) => {
        if (newState === State.PoweredOn) {
          clearTimeout(timer);
          sub.remove();
          resolve(true);
        }
      }, true);
    });
  }

  async startScan(): Promise<void> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      this.onError?.('Bluetooth permission was denied.');
      return;
    }
    const poweredOn = await this.waitForPoweredOn();
    if (!poweredOn) {
      this.onError?.('Bluetooth is off. Turn it on and try again.');
      return;
    }

    this.setState('scanning');
    const seen = new Set<string>();
    this.manager.startDeviceScan([HEART_RATE_SERVICE_UUID], { allowDuplicates: false }, (error, device) => {
      if (error) {
        this.onError?.(error.message);
        this.setState('disconnected');
        return;
      }
      if (device && !seen.has(device.id)) {
        seen.add(device.id);
        this.onDeviceFound?.({
          id: device.id,
          name: device.name ?? device.localName ?? 'Unknown device',
          rssi: device.rssi,
        });
      }
    });
  }

  stopScan(): void {
    this.manager.stopDeviceScan();
    if (this.state === 'scanning') this.setState('disconnected');
  }

  async connect(deviceId: string): Promise<void> {
    this.stopScan();
    this.setState('connecting');
    try {
      let device = await this.manager.connectToDevice(deviceId, { autoConnect: false });
      device = await device.discoverAllServicesAndCharacteristics();
      this.device = device;

      this.disconnectSub = this.manager.onDeviceDisconnected(deviceId, () => {
        this.cleanupAfterDisconnect();
      });

      this.monitorSub = device.monitorCharacteristicForService(
        HEART_RATE_SERVICE_UUID,
        HEART_RATE_MEASUREMENT_UUID,
        (error, characteristic) => {
          if (error) {
            this.onError?.(error.message);
            return;
          }
          if (characteristic?.value) {
            const sample = parseHeartRateMeasurement(characteristic.value);
            if (sample) this.onSample?.(sample);
          }
        }
      );

      this.setState('connected');
    } catch (err) {
      this.setState('disconnected');
      this.onError?.(err instanceof Error ? err.message : 'Failed to connect.');
      throw err;
    }
  }

  private cleanupAfterDisconnect() {
    this.monitorSub?.remove();
    this.monitorSub = null;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    this.device = null;
    this.setState('disconnected');
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      await this.manager.cancelDeviceConnection(this.device.id).catch(() => {});
    }
    this.cleanupAfterDisconnect();
  }

  destroy(): void {
    this.stopScan();
    this.monitorSub?.remove();
    this.disconnectSub?.remove();
    this.manager.destroy();
  }
}

// Parses the standard Heart Rate Measurement characteristic (0x2A37), per the
// Bluetooth SIG spec: flags byte, then an 8- or 16-bit HR value, then optional
// energy-expended, then zero or more 16-bit RR-interval fields (units of 1/1024s).
export function parseHeartRateMeasurement(base64Value: string): HeartRateSample | null {
  const bytes = base64.toByteArray(base64Value);
  if (bytes.length < 2) return null;

  const flags = bytes[0];
  const is16BitHr = (flags & 0x01) !== 0;
  const hasEnergyExpended = (flags & 0x08) !== 0;
  const hasRrIntervals = (flags & 0x10) !== 0;

  let offset = 1;
  let bpm: number;
  if (is16BitHr) {
    bpm = bytes[offset] | (bytes[offset + 1] << 8);
    offset += 2;
  } else {
    bpm = bytes[offset];
    offset += 1;
  }

  if (hasEnergyExpended) offset += 2;

  const rrIntervalsMs: number[] = [];
  if (hasRrIntervals) {
    while (offset + 1 < bytes.length) {
      const raw = bytes[offset] | (bytes[offset + 1] << 8);
      // Spec units: 1/1024 second per LSB.
      rrIntervalsMs.push((raw / 1024) * 1000);
      offset += 2;
    }
  }

  return { bpm, rrIntervalsMs, timestampMs: Date.now() };
}
