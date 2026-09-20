// Ported from web-prototype/index.html (computeCleanStats). The artifact-correction
// approach — reject a beat if it jumps >20% from the immediately preceding one — is
// standard sequential outlier rejection and carries over unchanged; only the input
// (clean RR-intervals from Whoop's BLE broadcast instead of camera-derived IBIs)
// changed with the sensor pivot.
export interface CleanStats {
  avgBpm: number;
  rmssd: number;
  rejectedCount: number;
  beatCount: number;
}

const MIN_BEATS_FOR_STATS = 6;
const OUTLIER_PCT_THRESHOLD = 0.2;

export function computeCleanStats(rrIntervalsMs: number[]): CleanStats | null {
  if (rrIntervalsMs.length < MIN_BEATS_FOR_STATS) return null;

  const cleanRr: number[] = [rrIntervalsMs[0]];
  let reference = rrIntervalsMs[0];
  for (let i = 1; i < rrIntervalsMs.length; i++) {
    const pctChange = Math.abs(rrIntervalsMs[i] - reference) / reference;
    if (pctChange <= OUTLIER_PCT_THRESHOLD) {
      cleanRr.push(rrIntervalsMs[i]);
      reference = rrIntervalsMs[i];
    }
  }

  const rejectedCount = rrIntervalsMs.length - cleanRr.length;
  if (cleanRr.length < MIN_BEATS_FOR_STATS) return null;

  const avgRr = cleanRr.reduce((a, b) => a + b, 0) / cleanRr.length;
  const avgBpm = Math.round(60000 / avgRr);

  let sumSqDiff = 0;
  for (let i = 1; i < cleanRr.length; i++) {
    const diff = cleanRr[i] - cleanRr[i - 1];
    sumSqDiff += diff * diff;
  }
  const rmssd = Math.round(Math.sqrt(sumSqDiff / (cleanRr.length - 1)));

  return { avgBpm, rmssd, rejectedCount, beatCount: rrIntervalsMs.length };
}

export type CoherenceLevel = 'reading' | 'low' | 'building' | 'high';

export interface Coherence {
  level: CoherenceLevel;
  message: string;
}

// Same thresholds as the prototype's updateCoherence(): looks at the spread of
// instantaneous BPM across the last dozen beats as a live proxy for oscillation size.
export function computeCoherence(rrIntervalsMs: number[]): Coherence {
  const window = rrIntervalsMs.slice(-12);
  if (window.length < 5) {
    return { level: 'reading', message: 'Reading your rhythm…' };
  }
  const bpmSeries = window.map((rr) => 60000 / rr);
  const amp = Math.max(...bpmSeries) - Math.min(...bpmSeries);
  if (amp > 14) {
    return { level: 'high', message: 'Big, rhythmic swings — this pace is working well for you' };
  }
  if (amp > 6) {
    return { level: 'building', message: 'Getting there — stay steady and see if it grows' };
  }
  return { level: 'low', message: 'Flat so far — try a slightly different pace next round' };
}
