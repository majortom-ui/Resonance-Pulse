import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polygon, Polyline } from 'react-native-svg';
import { colors, fonts } from '../theme/theme';
import { computeCoherence } from '../lib/hrv';

const WIDTH = 320;
const HEIGHT = 76;

interface Props {
  rrIntervalsMs: number[];
}

const COHERENCE_LABEL: Record<string, string> = {
  reading: 'reading…',
  low: 'low',
  building: 'building',
  high: 'high',
};

// Ported from web-prototype/index.html's drawHrvTrend(): a rolling chart of
// instantaneous BPM per beat. This was the most engaging part of the web
// prototype — seeing your own coherence build in real time — so it stays
// front and center here, now fed by clean Whoop RR-intervals instead of
// noisy camera-derived ones.
export function HrvWave({ rrIntervalsMs }: Props) {
  const coherence = computeCoherence(rrIntervalsMs);
  const window = rrIntervalsMs.slice(-24);
  const bpmSeries = window.map((rr) => 60000 / rr);

  let points = '';
  let fillPoints = '';
  if (bpmSeries.length >= 2) {
    const minB = Math.min(...bpmSeries);
    const maxB = Math.max(...bpmSeries);
    const range = Math.max(maxB - minB, 4);
    const stepX = WIDTH / Math.max(bpmSeries.length - 1, 1);
    const coords = bpmSeries.map((bpm, i) => {
      const x = i * stepX;
      const y = HEIGHT - ((bpm - minB) / range) * (HEIGHT * 0.75) - HEIGHT * 0.12;
      return [x, y];
    });
    points = coords.map(([x, y]) => `${x},${y}`).join(' ');
    fillPoints = `${points} ${WIDTH},${HEIGHT} 0,${HEIGHT}`;
  }

  return (
    <View style={styles.panel}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>YOUR HRV WAVE</Text>
        <Text style={styles.score}>{COHERENCE_LABEL[coherence.level]}</Text>
      </View>
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={styles.chart}>
        {fillPoints ? <Polygon points={fillPoints} fill={colors.calm} fillOpacity={0.13} /> : null}
        {points ? (
          <Polyline points={points} fill="none" stroke={colors.calm} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <Line x1={0} y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} stroke={colors.line} strokeWidth={1} />
        )}
      </Svg>
      <Text style={styles.sub}>{coherence.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 16,
    backgroundColor: colors.bgPanelRaised,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.inkDim },
  score: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.calm },
  chart: { marginTop: 8 },
  sub: { fontSize: 11, color: colors.inkDim, textAlign: 'center', marginTop: 4 },
});
