# Resonance Pulse

A mobile app that finds your personal resonance breathing frequency (the paced
breathing rate that maximizes your HRV oscillation) and guides you through
resonance-breathing practice with live biofeedback, using your Whoop band's
Bluetooth heart-rate broadcast as the sensor.

The original browser-based prototype (phone-camera PPG) lives in
[`web-prototype/`](./web-prototype) for reference. It proved the concept but
wasn't accurate enough for real HRV measurement — see the project brief for
details. This app replaces that sensor with your Whoop's standard Bluetooth
Heart Rate Service broadcast, which includes real per-beat RR-intervals.

## Requirements on your end

- A Whoop band, with **HR Broadcast** turned on: Whoop app → **Device
  Settings** → **HR Broadcast**.
- An [Expo account](https://expo.dev/signup) (free) — needed to run cloud
  builds, since `react-native-ble-plx` is a native module and won't run in
  Expo Go.
- No Mac required — builds run on Expo's servers (EAS Build) and install via
  TestFlight.

## Project structure

```
App.tsx                  App entry: loads fonts, switches Connect ↔ Home
src/theme/theme.ts        Colors, fonts, spacing (ported from the web prototype's CSS)
src/lib/ble.ts             BLE scanning/connect + Heart Rate Measurement (0x2A37) parsing
src/lib/hrv.ts             RMSSD + sequential artifact correction (ported from the prototype)
src/lib/session.ts         Session/calibration phase state machine (React hook)
src/components/LungsPacer.tsx   Breathing animation + synced countdown
src/components/HrvWave.tsx      Live rolling HRV chart
src/screens/ConnectScreen.tsx   BLE device scan/connect UI
src/screens/HomeScreen.tsx      Mode select, pacer, results, calibration results
```

## Running a build (no Mac needed)

1. Install the EAS CLI and log in:
   ```
   npm install -g eas-cli
   eas login
   ```
2. From the project root, link it to your Expo account (first time only):
   ```
   eas init
   ```
3. Build a development client (installs like a real app, lets you reload JS
   changes without rebuilding — this is what you'll iterate against day to
   day):
   ```
   eas build --profile development --platform ios
   ```
   EAS will email/link you the build. Install it via the link (internal
   distribution) or TestFlight once you also run `eas submit`.
4. Start the dev server and open it from the installed dev-client app:
   ```
   npx expo start --dev-client
   ```
5. When ready for a TestFlight build for real device testing outside your
   dev loop:
   ```
   eas build --profile production --platform ios
   eas submit --platform ios --latest
   ```

`eas.json` already has `development`, `preview`, and `production` profiles
configured, plus the `react-native-ble-plx` config plugin wired into
`app.json` (adds the required iOS Bluetooth usage strings and Android 12+
`BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` permissions automatically on build).

## Local checks

```
npm install
npx tsc --noEmit      # typecheck
npx expo export       # verify the JS bundle builds cleanly
```

These don't require a device — they're useful for a fast sanity check before
kicking off a cloud build.

## Status

- [x] Expo project scaffolded, TypeScript, builds cleanly (`tsc` + `expo
      export` both pass)
- [x] `react-native-ble-plx` integrated with EAS config plugin
- [x] Heart Rate Service (0x180D) scanning, connect, and Heart Rate
      Measurement (0x2A37) parsing, including RR-intervals
- [x] RMSSD + sequential artifact correction ported from the web prototype
- [x] Calibration state machine (5 paces × 90s) and quick single-read mode
      (45s)
- [x] UI: dark theme, lungs breathing pacer with synced countdown, live HRV
      wave, results / calibration-ranking screens
- [ ] Validated against a real Whoop HR Broadcast on-device (needs an actual
      EAS build + physical device + Whoop — not possible in this sandbox)
- [ ] TestFlight distribution confirmed end-to-end
