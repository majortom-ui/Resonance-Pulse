import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { HeartRateMonitor } from '../lib/ble';
import { LungsPacer } from '../components/LungsPacer';
import { HrvWave } from '../components/HrvWave';
import { bestResult, SessionMode, useResonanceSession } from '../lib/session';
import { colors, fonts, radii, spacing } from '../theme/theme';

interface Props {
  monitor: HeartRateMonitor;
}

function fmtMinSec(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function HomeScreen({ monitor }: Props) {
  const [mode, setMode] = useState<SessionMode>('single');
  const { snapshot, start, stop, feedRr } = useResonanceSession();
  const feedRrRef = useRef(feedRr);
  feedRrRef.current = feedRr;

  useEffect(() => {
    monitor.onSample = (sample) => {
      for (const rr of sample.rrIntervalsMs) feedRrRef.current(rr);
    };
    return () => {
      monitor.onSample = null;
    };
  }, [monitor]);

  useEffect(() => {
    if (snapshot.status === 'idle' || snapshot.status === 'finished') {
      deactivateKeepAwake('resonance-session').catch(() => {});
    } else {
      activateKeepAwakeAsync('resonance-session').catch(() => {});
    }
  }, [snapshot.status]);

  const running = snapshot.status !== 'idle' && snapshot.status !== 'finished';
  const isCalibration = mode === 'calibration';
  const singleResult = mode === 'single' ? snapshot.results[0] : null;
  const best = isCalibration ? bestResult(snapshot.results) : null;

  const phasePct = Math.min(100, (snapshot.phaseElapsedMs / snapshot.phaseDurationMs) * 100);
  const overallPct = Math.min(100, (snapshot.totalElapsedMs / snapshot.totalDurationMs) * 100);

  let statusText = 'Tap start to begin your session.';
  if (snapshot.status === 'settling') statusText = 'Settling into this pace…';
  else if (snapshot.status === 'running') {
    statusText = snapshot.rrWindow.length >= 3 ? 'Reading your rhythm — breathe naturally…' : 'Finding your rhythm…';
  } else if (snapshot.status === 'finished') {
    statusText = isCalibration ? 'Calibration complete.' : 'Read complete.';
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.eyebrow}>
        <Text style={styles.eyebrowText}>RESONANCE PULSE · WHOOP HR BROADCAST</Text>
      </View>
      <Text style={styles.title}>
        Find your <Text style={styles.titleAccent}>resonance</Text>{'\n'}frequency.
      </Text>

      {!running && snapshot.status !== 'finished' ? (
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, mode === 'single' && styles.modeBtnActive]}
            onPress={() => setMode('single')}
          >
            <Text style={[styles.modeBtnText, mode === 'single' && styles.modeBtnTextActive]}>Quick pulse read</Text>
            <Text style={[styles.modeBtnSub, mode === 'single' && styles.modeBtnTextActive]}>45 seconds, one pace</Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === 'calibration' && styles.modeBtnActive]}
            onPress={() => setMode('calibration')}
          >
            <Text style={[styles.modeBtnText, mode === 'calibration' && styles.modeBtnTextActive]}>
              Find resonance frequency
            </Text>
            <Text style={[styles.modeBtnSub, mode === 'calibration' && styles.modeBtnTextActive]}>
              ~8 min, 5 paces compared
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.stage}>
        {isCalibration && running ? (
          <View style={styles.phaseRow}>
            <Text style={styles.phaseLabel}>
              Phase {snapshot.phaseIndex + 1} of {snapshot.totalPhases} · {snapshot.paceSec.toFixed(1)}s pace
            </Text>
            <Text style={styles.phaseOverall}>
              {fmtMinSec(snapshot.totalElapsedMs)} / {fmtMinSec(snapshot.totalDurationMs)}
            </Text>
          </View>
        ) : null}

        <LungsPacer paceSec={snapshot.paceSec} active={running} />

        <HrvWave rrIntervalsMs={snapshot.rrWindow} />

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${running ? phasePct : 0}%` }]} />
        </View>
        {isCalibration ? (
          <View style={[styles.progressTrack, styles.progressTrackOverall]}>
            <View style={[styles.progressFill, styles.progressFillOverall, { width: `${running ? overallPct : 0}%` }]} />
          </View>
        ) : null}

        <Text style={styles.statusLine}>{statusText}</Text>

        {!running && snapshot.status !== 'finished' ? (
          <Pressable style={styles.primaryBtn} onPress={() => start(mode)}>
            <Text style={styles.primaryBtnText}>{isCalibration ? 'Start calibration' : 'Start reading'}</Text>
          </Pressable>
        ) : null}
        {running ? (
          <Pressable style={styles.secondaryBtn} onPress={stop}>
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </Pressable>
        ) : null}
        {snapshot.status === 'finished' ? (
          <Pressable style={styles.secondaryBtn} onPress={stop}>
            <Text style={styles.secondaryBtnText}>Measure again</Text>
          </Pressable>
        ) : null}

        {snapshot.status === 'finished' && !isCalibration && singleResult ? (
          <View style={styles.resultGrid}>
            <View style={styles.resultCard}>
              <Text style={styles.resultVal}>{singleResult.avgBpm ?? '—'}</Text>
              <Text style={styles.resultLbl}>AVG BPM</Text>
            </View>
            <View style={styles.resultCard}>
              <Text style={styles.resultVal}>{singleResult.rmssd ?? '—'}</Text>
              <Text style={styles.resultLbl}>RMSSD · HRV (MS)</Text>
            </View>
          </View>
        ) : null}

        {snapshot.status === 'finished' && isCalibration ? (
          <View style={styles.calResults}>
            <View style={styles.calHeadline}>
              <Text style={styles.calBig}>{best ? `${best.paceSec.toFixed(1)}s` : '—'}</Text>
              <Text style={styles.calLbl}>YOUR RESONANCE FREQUENCY</Text>
            </View>
            {snapshot.results.map((r, i) => (
              <View key={i} style={[styles.calRow, r === best && styles.calRowBest]}>
                <Text style={styles.calPace}>{r.paceSec.toFixed(1)}s IN/OUT</Text>
                {r.rmssd === null ? (
                  <Text style={styles.calFailed}>too noisy</Text>
                ) : (
                  <Text style={[styles.calMetrics, r === best && styles.calMetricsBest]}>
                    {r.avgBpm} bpm · {r.rmssd}ms
                  </Text>
                )}
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <Text style={styles.disclaimer}>
        Wellness tool, not a medical device. Data comes from your Whoop's Bluetooth heart-rate broadcast and never
        leaves this device.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingTop: 56, paddingBottom: 48 },
  eyebrow: { marginBottom: spacing.sm },
  eyebrowText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.inkDim },
  title: { fontFamily: fonts.display, fontSize: 32, fontWeight: '600', color: colors.ink, lineHeight: 34 },
  titleAccent: { color: colors.pulse, fontStyle: 'italic' },
  modeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 14 },
  modeBtn: {
    flex: 1,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgPanel,
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  modeBtnText: { color: colors.inkDim, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  modeBtnSub: { color: colors.inkDim, fontSize: 10.5, marginTop: 2, textAlign: 'center' },
  modeBtnTextActive: { color: colors.bg },
  stage: {
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginTop: spacing.lg,
  },
  phaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  phaseLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.calm, fontWeight: '600' },
  phaseOverall: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkDim },
  progressTrack: { height: 3, backgroundColor: colors.line, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
  progressTrackOverall: { marginTop: 6 },
  progressFill: { height: '100%', backgroundColor: colors.pulse },
  progressFillOverall: { backgroundColor: colors.calm },
  statusLine: { textAlign: 'center', fontSize: 14, color: colors.inkDim, marginTop: 12, minHeight: 20 },
  primaryBtn: { marginTop: 18, paddingVertical: 15, borderRadius: radii.md, backgroundColor: colors.ink, alignItems: 'center' },
  primaryBtnText: { color: colors.bg, fontSize: 15, fontWeight: '600' },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.inkDim, fontSize: 14 },
  resultGrid: { flexDirection: 'row', gap: spacing.md, marginTop: 18 },
  resultCard: {
    flex: 1,
    backgroundColor: colors.bgPanelRaised,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: 14,
  },
  resultVal: { fontFamily: fonts.display, fontSize: 30, fontWeight: '600', color: colors.ink },
  resultLbl: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkDim, marginTop: 2 },
  calResults: { marginTop: 6 },
  calHeadline: {
    alignItems: 'center',
    backgroundColor: colors.bgPanelRaised,
    borderWidth: 1,
    borderColor: colors.calm,
    borderRadius: radii.lg,
    padding: 16,
    marginTop: 18,
    marginBottom: 14,
  },
  calBig: { fontFamily: fonts.display, fontSize: 36, fontWeight: '600', color: colors.calm },
  calLbl: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkDim, marginTop: 6 },
  calRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgPanelRaised,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  calRowBest: { borderColor: colors.calm, backgroundColor: 'rgba(79, 209, 197, 0.08)' },
  calPace: { fontFamily: fonts.display, fontSize: 16, fontWeight: '600', color: colors.ink },
  calMetrics: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkDim },
  calMetricsBest: { color: colors.calm },
  calFailed: { fontFamily: fonts.mono, fontSize: 11, color: colors.warn },
  disclaimer: { textAlign: 'center', fontSize: 11, color: colors.inkDim, marginTop: 26, lineHeight: 16, opacity: 0.75 },
});
