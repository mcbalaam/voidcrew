import { describe, expect, test } from 'bun:test';

import {
  isChartTile,
  visibleCourseSegments,
  wrappedDelta,
} from '../interfaces/Helm/geometry';

describe('bounded helm coordinates', () => {
  test('clicks and drift stop at every barrier instead of wrapping', () => {
    for (let tile = 2; tile < 51; tile++) {
      expect(isChartTile(tile, 2, 51)).toBe(true);
      expect(isChartTile(50, tile, 51)).toBe(true);
      for (const outside of [-150, 0, 1, 51, 52, 200]) {
        expect(isChartTile(outside, tile, 51)).toBe(false);
        expect(isChartTile(tile, outside, 51)).toBe(false);
      }
    }
  });

  test('actual contact distances still account for looping space', () => {
    expect(wrappedDelta(50 - 2, 49)).toBe(-1);
    expect(wrappedDelta(2 - 50, 49)).toBe(1);
    expect(wrappedDelta(15 - 10, 49)).toBe(5);
  });
});

describe('autopilot route overlay', () => {
  test('shows the planned detour instead of a straight line to the destination', () => {
    const course: [number, number][] = [
      [11, 26],
      [12, 26],
      [13, 25],
    ];
    expect(visibleCourseSegments([10, 25], course, [12, 25], 5)).toEqual([
      { from: [10, 25], to: [11, 26], step: 0 },
      { from: [11, 26], to: [12, 26], step: 1 },
      { from: [12, 26], to: [13, 25], step: 2 },
    ]);
    expect(course).toEqual([
      [11, 26],
      [12, 26],
      [13, 25],
    ]);
  });

  test('breaks at every barrier and corner, then resumes on the arrival side', () => {
    for (const [from, to] of [
      [
        [50, 25],
        [2, 25],
      ],
      [
        [25, 50],
        [25, 2],
      ],
      [
        [50, 50],
        [2, 2],
      ],
      [
        [50, 2],
        [2, 50],
      ],
      [
        [2, 25],
        [50, 25],
      ],
      [
        [25, 2],
        [25, 50],
      ],
      [
        [2, 2],
        [50, 50],
      ],
      [
        [2, 50],
        [50, 2],
      ],
    ] as [number, number][][]) {
      const before: [number, number] = [
        from[0] + Math.sign(26 - from[0]),
        from[1] + Math.sign(26 - from[1]),
      ];
      const after: [number, number] = [
        to[0] + Math.sign(26 - to[0]),
        to[1] + Math.sign(26 - to[1]),
      ];
      expect(
        visibleCourseSegments(before, [from, to, after], [26, 26], 26),
      ).toEqual([
        { from: before, to: from, step: 0 },
        { from: to, to: after, step: 2 },
      ]);
      expect(visibleCourseSegments(from, [to], from, 3)).toEqual([]);
    }
  });

  test('keeps a detour longer than half the map continuous without shortcutting it', () => {
    const course: [number, number][] = Array.from({ length: 35 }, (_, i) => [
      i + 3,
      25,
    ]);
    const segments = visibleCourseSegments([2, 25], course, [26, 26], 24);
    expect(segments).toHaveLength(35);
    segments.forEach(({ from, to }, step) => {
      expect(from).toEqual([step + 2, 25]);
      expect(to).toEqual([step + 3, 25]);
    });
  });

  test('drops distant edges, reached nodes and cleared courses', () => {
    expect(visibleCourseSegments([10, 10], [[11, 10]], [30, 30], 3)).toEqual(
      [],
    );
    expect(
      visibleCourseSegments(
        [10, 10],
        [
          [10, 10],
          [11, 10],
        ],
        [10, 10],
        3,
      ),
    ).toEqual([{ from: [10, 10], to: [11, 10], step: 1 }]);
    expect(visibleCourseSegments([10, 10], [], [10, 10], 3)).toEqual([]);
    expect(visibleCourseSegments([10, 10], [[11, 10]], [59, 59], 3)).toEqual(
      [],
    );
  });
});
