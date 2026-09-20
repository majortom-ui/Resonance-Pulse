import { useCallback, useEffect, useRef, useState } from 'react';
import { computeCleanStats } from './hrv';

// Ported from web-prototype/index.html's startSingle/startCalibration/runCalPhase
// state machine. The camera-frame sampling loop (requestAnimationFrame + peak
// detection) is gone — RR-intervals now arrive directly from the Whoop BLE
// broadcast via feedRr() — but the phase timing, settle period, and per-phase
// stats computation are unchanged.
export type SessionMode = 'single' | 'calibration';

export const SINGLE_SESSION_MS = 45000;
export const CAL_PHASE_MS = 90000;
export const SETTLE_MS = 3000;
export const CAL_PACES_SEC = [5.0, 6.0, 7.0, 8.0, 9.0];
const RR_WINDOW_SIZE = 30;

export interface PhaseResult {
  paceSec: number;
  avgBpm: number | null;
  rmssd: number | null;
  rejectedCount: number;
  beatCount: number;
}

export type SessionStatus = 'idle' | 'settling' | 'running' | 'finished';

export interface SessionSnapshot {
  status: SessionStatus;
  mode: SessionMode;
  phaseIndex: number;
  totalPhases: number;
  paceSec: number;
  phaseElapsedMs: number;
  phaseDurationMs: number;
  totalElapsedMs: number;
  totalDurationMs: number;
  liveBpm: number | null;
  rrWindow: number[];
  results: PhaseResult[];
}

const IDLE_SNAPSHOT: SessionSnapshot = {
  status: 'idle',
  mode: 'single',
  phaseIndex: 0,
  totalPhases: 1,
  paceSec: 6.0,
  phaseElapsedMs: 0,
  phaseDurationMs: SINGLE_SESSION_MS,
  totalElapsedMs: 0,
  totalDurationMs: SINGLE_SESSION_MS,
  liveBpm: null,
  rrWindow: [],
  results: [],
};

function phasesForMode(mode: SessionMode): number[] {
  return mode === 'calibration' ? CAL_PACES_SEC : [6.0];
}

function phaseDurationForMode(mode: SessionMode): number {
  return mode === 'calibration' ? CAL_PHASE_MS : SINGLE_SESSION_MS;
}

export function useResonanceSession() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(IDLE_SNAPSHOT);

  const modeRef = useRef<SessionMode>('single');
  const phaseIndexRef = useRef(0);
  const phaseStartRef = useRef(0);
  const sessionStartRef = useRef(0);
  const rrIntervalsRef = useRef<number[]>([]);
  const resultsRef = useRef<PhaseResult[]>([]);
  const runningRef = useRef(false);
  const tickHandle = useRef<ReturnType<typeof setInterval> | null>(null);

  const publish = useCallback((status: SessionStatus) => {
    const mode = modeRef.current;
    const paces = phasesForMode(mode);
    const phaseDuration = phaseDurationForMode(mode);
    const now = Date.now();
    const phaseElapsed = runningRef.current ? now - phaseStartRef.current : 0;
    const totalElapsed = runningRef.current ? now - sessionStartRef.current : 0;

    setSnapshot({
      status,
      mode,
      phaseIndex: phaseIndexRef.current,
      totalPhases: paces.length,
      paceSec: paces[phaseIndexRef.current] ?? paces[0],
      phaseElapsedMs: Math.min(phaseElapsed, phaseDuration),
      phaseDurationMs: phaseDuration,
      totalElapsedMs: totalElapsed,
      totalDurationMs: phaseDuration * paces.length,
      liveBpm: liveBpmFromRr(rrIntervalsRef.current),
      rrWindow: rrIntervalsRef.current.slice(-RR_WINDOW_SIZE),
      results: [...resultsRef.current],
    });
  }, []);

  const finishPhase = useCallback(() => {
    const mode = modeRef.current;
    const paces = phasesForMode(mode);
    const paceSec = paces[phaseIndexRef.current];
    const stats = computeCleanStats(rrIntervalsRef.current);

    resultsRef.current.push({
      paceSec,
      avgBpm: stats?.avgBpm ?? null,
      rmssd: stats?.rmssd ?? null,
      rejectedCount: stats?.rejectedCount ?? 0,
      beatCount: rrIntervalsRef.current.length,
    });

    const nextIndex = phaseIndexRef.current + 1;
    if (nextIndex >= paces.length) {
      runningRef.current = false;
      if (tickHandle.current) clearInterval(tickHandle.current);
      publish('finished');
      return;
    }

    phaseIndexRef.current = nextIndex;
    rrIntervalsRef.current = [];
    phaseStartRef.current = Date.now();
    publish('settling');
  }, [publish]);

  const tick = useCallback(() => {
    if (!runningRef.current) return;
    const phaseDuration = phaseDurationForMode(modeRef.current);
    const elapsed = Date.now() - phaseStartRef.current;
    if (elapsed >= phaseDuration) {
      finishPhase();
      return;
    }
    publish(elapsed < SETTLE_MS ? 'settling' : 'running');
  }, [finishPhase, publish]);

  const start = useCallback(
    (mode: SessionMode) => {
      modeRef.current = mode;
      phaseIndexRef.current = 0;
      rrIntervalsRef.current = [];
      resultsRef.current = [];
      const now = Date.now();
      phaseStartRef.current = now;
      sessionStartRef.current = now;
      runningRef.current = true;

      if (tickHandle.current) clearInterval(tickHandle.current);
      tickHandle.current = setInterval(tick, 150);
      publish('settling');
    },
    [publish, tick]
  );

  const stop = useCallback(() => {
    runningRef.current = false;
    if (tickHandle.current) clearInterval(tickHandle.current);
    tickHandle.current = null;
    setSnapshot(IDLE_SNAPSHOT);
  }, []);

  const feedRr = useCallback(
    (rrMs: number) => {
      if (!runningRef.current) return;
      const elapsed = Date.now() - phaseStartRef.current;
      // Ignore beats during the settle window while grip/signal stabilizes,
      // mirroring the prototype's CALIBRATION_SETTLE_MS behavior.
      if (elapsed < SETTLE_MS) return;
      rrIntervalsRef.current.push(rrMs);
      publish(runningRef.current ? 'running' : 'finished');
    },
    [publish]
  );

  useEffect(() => {
    return () => {
      if (tickHandle.current) clearInterval(tickHandle.current);
    };
  }, []);

  return { snapshot, start, stop, feedRr };
}

function liveBpmFromRr(rrIntervalsMs: number[]): number | null {
  if (rrIntervalsMs.length === 0) return null;
  return Math.round(60000 / rrIntervalsMs[rrIntervalsMs.length - 1]);
}

export function bestResult(results: PhaseResult[]): PhaseResult | null {
  const valid = results.filter((r) => r.rmssd !== null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => ((b.rmssd as number) > (a.rmssd as number) ? b : a));
}
