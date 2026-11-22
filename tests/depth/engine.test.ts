import { describe, it, expect } from 'vitest';
import { wrap, depthOf, lineLayout, exitLayout, placeOf, stepSpring } from '@/lib/depth/engine';

describe('wrap / depthOf', () => {
  it('wraps into [0, n)', () => {
    expect(wrap(4, 3)).toBe(1);
    expect(wrap(-1, 3)).toBe(2);
    expect(wrap(0, 3)).toBe(0);
    expect(wrap(-0.25, 3)).toBeCloseTo(2.75);
  });
  it('depth is wrap(i - p, n)', () => {
    expect(depthOf(0, 0, 3)).toBe(0);
    expect(depthOf(2, 1, 3)).toBe(1);
    expect(depthOf(0, 1, 3)).toBe(2);
    expect(depthOf(1, 0.5, 3)).toBeCloseTo(0.5);
  });
});

describe('lineLayout (phone classic)', () => {
  it('front slot', () => {
    expect(lineLayout(0, 400)).toEqual({ x: 120, bottom: 22, scale: 1, opacity: 1, blur: 0, z: 1000 });
  });
  it('second slot', () => {
    const l = lineLayout(1, 400);
    expect(l.x).toBeCloseTo(248);
    expect(l.bottom).toBeCloseTo(44);
    expect(l.scale).toBeCloseTo(0.76);
    expect(l.opacity).toBeCloseTo(0.87);
    expect(l.blur).toBeCloseTo(0.9);
    expect(l.z).toBe(990);
  });
  it('fades past d - 1 and caps the blur', () => {
    expect(lineLayout(3.5, 400).opacity).toBeCloseTo(0.305);
    expect(lineLayout(5, 400).opacity).toBe(0);
    expect(lineLayout(5, 400).blur).toBe(3.2);
  });
});

describe('placeOf / exitLayout', () => {
  it('keeps the line for depths up to n - 1', () => {
    expect(placeOf(0, 3)).toEqual({ kind: 'line', k: 0 });
    expect(placeOf(2, 3)).toEqual({ kind: 'line', k: 2 });
  });
  it('walks the front item out past the camera, then back in from behind', () => {
    // p just left 0: Look 0 is at depth 2.9 -> exiting.
    const out = placeOf(2.9, 3);
    expect(out.kind).toBe('exit');
    // Late in the move it re-enters from two places further back than its goal (n - 1).
    const back = placeOf(2.1, 3);
    expect(back).toEqual({ kind: 'line', k: expect.closeTo(2.2, 5) });
  });
  it('exit pose grows and fades', () => {
    const e = exitLayout(1, 400);
    expect(e.scale).toBeCloseTo(1.14);
    expect(e.opacity).toBe(0);
    expect(e.z).toBe(1100);
    expect(exitLayout(0, 400).opacity).toBe(1);
  });
});

describe('stepSpring', () => {
  it('settles from 0 to 1 within 2 s of 1/60 s steps without overshooting', () => {
    let s = { cur: 0, vel: 0 };
    let max = 0;
    let frames = 0;
    while (frames < 120 && !(s.cur === 1 && s.vel === 0)) {
      s = stepSpring(s.cur, s.vel, 1, 1 / 60);
      max = Math.max(max, s.cur);
      frames++;
    }
    expect(s).toEqual({ cur: 1, vel: 0 });
    expect(frames).toBeLessThanOrEqual(120);
    expect(max).toBeLessThanOrEqual(1.0005);
  });
  it('snaps when already there', () => {
    expect(stepSpring(0.9999, 0.0001, 1, 1 / 60)).toEqual({ cur: 1, vel: 0 });
  });
});
