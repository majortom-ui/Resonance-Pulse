import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Ellipse, G, Line, Path } from 'react-native-svg';
import { colors, fonts } from '../theme/theme';

const MIN_SCALE = 0.82;
const MAX_SCALE = 1.0;

interface Props {
  paceSec: number;
  active: boolean;
}

type Phase = 'inhale' | 'exhale';

// Ported from web-prototype/index.html: lungs fill on inhale (scale 0.82 -> 1.0)
// and empty on exhale, with a 1-to-N countdown synced to the same phase so
// nobody has to count silently in their head. The faint dashed outline
// represents max capacity; the filled shape never reaches it, reinforcing
// moderate (not maximal) breathing depth.
export function LungsPacer({ paceSec, active }: Props) {
  const scale = useRef(new Animated.Value(MIN_SCALE)).current;
  const [count, setCount] = useState<number | null>(null);
  const [label, setLabel] = useState('Get ready');

  useEffect(() => {
    if (!active) {
      scale.stopAnimation();
      scale.setValue(MIN_SCALE);
      setLabel('Get ready');
      setCount(null);
      return;
    }

    let cancelled = false;
    let phaseTimer: ReturnType<typeof setTimeout> | null = null;
    let countTimer: ReturnType<typeof setInterval> | null = null;
    const totalSec = Math.max(1, Math.round(paceSec));

    function runCountdown(direction: 'up' | 'down') {
      if (countTimer) clearInterval(countTimer);
      let n = direction === 'up' ? 1 : totalSec;
      setCount(n);
      countTimer = setInterval(() => {
        n = direction === 'up' ? n + 1 : n - 1;
        if ((direction === 'up' && n > totalSec) || (direction === 'down' && n < 1)) {
          if (countTimer) clearInterval(countTimer);
          return;
        }
        setCount(n);
      }, 1000);
    }

    function tick(currentPhase: Phase) {
      if (cancelled) return;
      setLabel(currentPhase === 'inhale' ? 'Breathe in' : 'Breathe out');
      runCountdown(currentPhase === 'inhale' ? 'up' : 'down');
      Animated.timing(scale, {
        toValue: currentPhase === 'inhale' ? MAX_SCALE : MIN_SCALE,
        duration: paceSec * 1000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
      phaseTimer = setTimeout(() => tick(currentPhase === 'inhale' ? 'exhale' : 'inhale'), paceSec * 1000);
    }

    tick('inhale');

    return () => {
      cancelled = true;
      if (phaseTimer) clearTimeout(phaseTimer);
      if (countTimer) clearInterval(countTimer);
      scale.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paceSec, active]);

  return (
    <View style={styles.wrap}>
      <View style={styles.svgStack}>
        <Svg width={150} height={110} viewBox="0 0 220 190" style={StyleSheet.absoluteFill}>
          <Line x1={110} y1={8} x2={110} y2={48} stroke={colors.inkDim} strokeWidth={4} strokeLinecap="round" opacity={0.4} />
          <Path
            d="M110 40 L82 62 M110 40 L138 62"
            stroke={colors.inkDim}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            opacity={0.4}
          />
          <G opacity={0.22}>
            <Ellipse cx={68} cy={120} rx={58} ry={78} fill="none" stroke={colors.inkDim} strokeWidth={2} strokeDasharray="5 6" />
            <Ellipse cx={152} cy={120} rx={58} ry={78} fill="none" stroke={colors.inkDim} strokeWidth={2} strokeDasharray="5 6" />
          </G>
        </Svg>
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ scale }], transformOrigin: '50% 63%' }]}
        >
          <Svg width={150} height={110} viewBox="0 0 220 190">
            <Ellipse cx={68} cy={120} rx={44} ry={60} fill={colors.calm} />
            <Ellipse cx={152} cy={120} rx={44} ry={60} fill={colors.calm} />
          </Svg>
        </Animated.View>
      </View>
      <Text style={styles.count}>{count ?? '—'}</Text>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.sub}>
        {paceSec.toFixed(1)}s IN · {paceSec.toFixed(1)}s OUT
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  svgStack: { width: 150, height: 110 },
  count: {
    fontFamily: fonts.display,
    fontSize: 46,
    fontWeight: '600',
    color: colors.ink,
    marginTop: 4,
  },
  label: {
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '600',
    color: colors.ink,
    marginTop: 8,
  },
  sub: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.inkDim,
    letterSpacing: 1,
    marginTop: 2,
  },
});
