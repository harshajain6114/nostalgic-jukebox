/**
 * NTP-style clock sync.
 *   t0 = client send time, t1 = server receive time,
 *   t2 = server send time, t3 = client receive time.
 *   offset = ((t1 - t0) + (t2 - t3)) / 2
 *   rtt    = (t3 - t0) - (t2 - t1)
 */
export interface TimeSample { t0: number; t1: number; t2: number; t3: number; }
export interface OffsetSample { offset: number; rtt: number; }

export function sampleFromExchange(ex: TimeSample): OffsetSample {
  const offset = (ex.t1 - ex.t0 + (ex.t2 - ex.t3)) / 2;
  const rtt = ex.t3 - ex.t0 - (ex.t2 - ex.t1);
  return { offset, rtt };
}

export function estimateOffset(samples: OffsetSample[]): number {
  if (samples.length === 0) return 0;
  const minRtt = Math.min(...samples.map((s) => s.rtt));
  const threshold = minRtt * 1.2;
  const best = samples.filter((s) => s.rtt <= threshold);
  const pool = best.length > 0 ? best : samples;
  return pool.reduce((sum, s) => sum + s.offset, 0) / pool.length;
}

export function elapsedAt(startedAt: number, now: number, trackDurationMs?: number): number {
  const elapsed = now - startedAt;
  if (elapsed < 0) return 0;
  if (trackDurationMs !== undefined) return Math.min(elapsed, trackDurationMs);
  return elapsed;
}
