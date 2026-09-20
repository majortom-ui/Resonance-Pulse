import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { DiscoveredDevice, HeartRateMonitor } from '../lib/ble';
import { colors, fonts, radii, spacing } from '../theme/theme';

interface Props {
  monitor: HeartRateMonitor;
  onConnected: () => void;
}

export function ConnectScreen({ monitor, onConnected }: Props) {
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const devicesRef = useRef<DiscoveredDevice[]>([]);

  useEffect(() => {
    monitor.onDeviceFound = (device) => {
      if (devicesRef.current.some((d) => d.id === device.id)) return;
      devicesRef.current = [...devicesRef.current, device];
      setDevices(devicesRef.current);
    };
    monitor.onError = (message) => {
      setError(message);
      setScanning(false);
      setConnectingId(null);
    };
    monitor.onConnectionStateChange = (state) => {
      setScanning(state === 'scanning');
      if (state === 'connected') onConnected();
    };
    startScan();
    return () => {
      monitor.stopScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startScan() {
    setError(null);
    devicesRef.current = [];
    setDevices([]);
    monitor.startScan();
  }

  async function connect(device: DiscoveredDevice) {
    setConnectingId(device.id);
    setError(null);
    try {
      await monitor.connect(device.id);
    } catch {
      setConnectingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.eyebrow}>
        <Text style={styles.eyebrowText}>RESONANCE PULSE · WHOOP HR BROADCAST</Text>
      </View>
      <Text style={styles.title}>
        Connect your <Text style={styles.titleAccent}>Whoop</Text>
      </Text>
      <Text style={styles.sub}>
        In the Whoop app, go to Device Settings and turn on{'\n'}
        <Text style={styles.bold}>HR Broadcast</Text>, then find it below.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.listWrap}>
        {scanning && devices.length === 0 ? (
          <View style={styles.scanningRow}>
            <ActivityIndicator color={colors.calm} />
            <Text style={styles.scanningText}>Scanning for nearby heart-rate broadcasts…</Text>
          </View>
        ) : null}
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.deviceRow}
              disabled={connectingId !== null}
              onPress={() => connect(item)}
            >
              <View>
                <Text style={styles.deviceName}>{item.name}</Text>
                <Text style={styles.deviceId}>{item.id}</Text>
              </View>
              {connectingId === item.id ? (
                <ActivityIndicator color={colors.calm} />
              ) : (
                <Text style={styles.connectLabel}>Connect</Text>
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            !scanning ? <Text style={styles.emptyText}>No devices found yet.</Text> : null
          }
        />
      </View>

      <Pressable style={styles.rescanBtn} onPress={startScan} disabled={scanning}>
        <Text style={styles.rescanText}>{scanning ? 'Scanning…' : 'Scan again'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, paddingTop: 56 },
  eyebrow: { marginBottom: spacing.sm },
  eyebrowText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.inkDim },
  title: { fontFamily: fonts.display, fontSize: 32, fontWeight: '600', color: colors.ink },
  titleAccent: { color: colors.pulse, fontStyle: 'italic' },
  sub: { color: colors.inkDim, fontSize: 14.5, lineHeight: 21, marginTop: spacing.sm, maxWidth: 340 },
  bold: { color: colors.ink, fontWeight: '600' },
  error: { color: colors.warn, marginTop: spacing.md, fontSize: 13 },
  listWrap: { flex: 1, marginTop: spacing.xl },
  scanningRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  scanningText: { color: colors.inkDim, fontSize: 13, marginLeft: spacing.sm },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  deviceName: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  deviceId: { color: colors.inkDim, fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
  connectLabel: { color: colors.calm, fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1 },
  emptyText: { color: colors.inkDim, fontSize: 13, textAlign: 'center', marginTop: spacing.xl },
  rescanBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  rescanText: { color: colors.inkDim, fontSize: 14, fontFamily: fonts.mono },
});
