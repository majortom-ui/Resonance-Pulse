import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  useFonts as useCormorantFonts,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_600SemiBold_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { HeartRateMonitor } from './src/lib/ble';
import { colors } from './src/theme/theme';

export default function App() {
  const [fontsLoaded] = useCormorantFonts({
    CormorantGaramond_600SemiBold,
    CormorantGaramond_600SemiBold_Italic,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
  });
  const [connected, setConnected] = useState(false);
  const monitorRef = useRef<HeartRateMonitor | null>(null);
  if (!monitorRef.current) monitorRef.current = new HeartRateMonitor();

  useEffect(() => {
    const monitor = monitorRef.current;
    return () => {
      monitor?.destroy();
    };
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.calm} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {connected ? (
        <HomeScreen monitor={monitorRef.current} />
      ) : (
        <ConnectScreen monitor={monitorRef.current} onConnected={() => setConnected(true)} />
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
