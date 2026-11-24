/**
 * Shared depth engine (spec §7.3). Pure functions: a float position `p` springs toward a target, each item
 * gets a depth `wrap(i - p, n)`, and a layout turns depth into a pose. The renderer applies the pose with
 * transform, filter and opacity only. Values: design references/try-the-look-runway-ring.md §7.5, phone
 * "classic" (a diagonal line).
 */

export type Pose = { x: number; bottom: number; scale: number; opacity: number; blur: number; z: number };

/** Phone classic constants. */
export const LINE = { ax: 0.3, ay: 22, sx: 0.32, sy: 22, sr: 0.76, ex: 0.55, d: 4 } as const;
export const SPRING_K = 95;
export const SPRING_C = 2 * Math.sqrt(SPRING_K);
const SUB_STEPS = 3;
const SNAP = 0.0005;
/** Largest exit amount (the walk past the camera). */
const EXIT_MAX = 1.4;

/** x wrapped into [0, n). */
export function wrap(x: number, n: number): number {
  if (n <= 0) return 0;
  const r = ((x % n) + n) % n;
  return r === n ? 0 : r;
}

/** Place in line of item i when the carousel sits at p (0 = front). */
export function depthOf(i: number, p: number, n: number): number {
  return wrap(i - p, n);
}

/** Pose on the diagonal line at place k (k = 0 front). */
export function lineLayout(k: number, width: number): Pose {
  const { ax, ay, sx, sy, sr, d } = LINE;
  return {
    x: width * (ax + sx * k),
    bottom: ay + sy * k,
    scale: sr ** k,
    opacity: k <= d - 1 ? 1 - 0.13 * k : Math.max(0, 0.61 * (d - k)),
    blur: Math.min(0.9 * k, 3.2),
    z: 1000 - Math.round(10 * k),
  };
}

/** Exit pose (e >= 0): the front item walks out past the camera to the left, growing and fading. */
export function exitLayout(e: number, width: number): Pose {
  const { ax, ay, ex } = LINE;
  return {
    x: width * (ax - ex * e),
    bottom: ay - 22 * e,
    scale: 1 + 0.14 * e,
    opacity: Math.max(0, 1 - 1.05 * e),
    blur: 4 * Math.min(e, 1),
    z: 1100,
  };
}

export type Place = { kind: 'line'; k: number } | { kind: 'exit'; e: number };

/**
 * Where an item at `depth` stands. Depths in (n - 1, n) are the wrap between front and back: for the
 * first half the item walks out past the camera, for the second it re-enters from two places behind its
 * slot at the back (off-screen on a phone), so it never pops. Same path in both directions.
 */
export function placeOf(depth: number, n: number): Place {
  const back = n - 1;
  if (depth <= back) return { kind: 'line', k: depth };
  const u = 1 - (depth - back); // 0 = still at the front, 1 = arrived at the back
  if (u < 0.5) return { kind: 'exit', e: Math.min(2 * u * EXIT_MAX, EXIT_MAX) };
  return { kind: 'line', k: back + 2 * (1 - u) };
}

/** Pose for an item at `depth` among n. */
export function poseOf(depth: number, n: number, width: number): Pose {
  const place = placeOf(depth, n);
  return place.kind === 'line' ? lineLayout(place.k, width) : exitLayout(place.e, width);
}

/** Critically damped spring step (K = 95, C = 2√K, 3 sub-steps); snaps when close and slow. */
export function stepSpring(cur: number, vel: number, target: number, dtSec: number): { cur: number; vel: number } {
  const h = Math.max(0, dtSec) / SUB_STEPS;
  for (let i = 0; i < SUB_STEPS; i++) {
    const a = SPRING_K * (target - cur) - SPRING_C * vel;
    vel += a * h;
    cur += vel * h;
  }
  if (Math.abs(target - cur) <= SNAP && Math.abs(vel) <= SNAP) return { cur: target, vel: 0 };
  return { cur, vel };
}
