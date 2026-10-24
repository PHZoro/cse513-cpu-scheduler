// Property and differential tests on many random workloads.
const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate, verifySchedule } = require('../src/scheduler.js');
const { referenceSchedule } = require('./reference.js');
const { workload, toTicks } = require('./helpers.js');

// Seeded generator (mulberry32) so every failure can be reproduced.
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomWorkload(next) {
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const count = int(1, 7);
  const rows = [];
  for (let i = 0; i < count; i++) {
    // A small arrival range makes simultaneous arrivals and ties common.
    rows.push([`P${i + 1}`, int(0, 12), int(1, 8)]);
  }
  return workload(rows);
}

const CASES = 3000;
const ALGORITHMS = ['FCFS', 'SJF', 'SRTF', 'RR'];

for (const algorithm of ALGORITHMS) {
  test(`${algorithm}: matches the tick-by-tick reference on ${CASES} random workloads`, () => {
    const next = random(513 + algorithm.length);
    for (let c = 0; c < CASES; c++) {
      const w = randomWorkload(next);
      const quantum = 1 + Math.floor(next() * 4);
      const label = `${algorithm} q=${quantum} ${JSON.stringify(w)}`;

      const result = simulate(w, algorithm, { quantum });
      const expected = referenceSchedule(w, algorithm, quantum);

      assert.deepEqual(toTicks(result.segments), expected.ticks, label);
      // Every run segment starts at a dispatch, so for RR this also checks
      // that quantum boundaries are kept between consecutive slices.
      assert.deepEqual(
        result.segments.filter((s) => s.type === 'run').map((s) => s.start),
        expected.dispatches,
        label,
      );
      assert.deepEqual(result.violations, [], label);
    }
  });
}

test('the five required properties hold for every algorithm and quantum', () => {
  const next = random(2026);
  for (let c = 0; c < CASES; c++) {
    const w = randomWorkload(next);
    for (const algorithm of ALGORITHMS) {
      for (const quantum of [1, 2, 4]) {
        const result = simulate(w, algorithm, { quantum });
        const label = `${algorithm} q=${quantum} ${JSON.stringify(w)}`;
        for (const row of result.rows) {
          const p = w.find((x) => x.id === row.id);
          const cpu = result.segments
            .filter((s) => s.id === row.id)
            .reduce((sum, s) => sum + s.end - s.start, 0);
          assert.equal(cpu, p.burst, `exact burst: ${label}`);
          assert.ok(row.firstStart >= p.arrival, `no run before arrival: ${label}`);
          assert.ok(row.waiting >= 0 && row.response >= 0, `nonnegative times: ${label}`);
        }
        for (let i = 1; i < result.segments.length; i++) {
          assert.ok(result.segments[i].start >= result.segments[i - 1].end, `no overlap: ${label}`);
        }
        for (const idle of result.segments.filter((s) => s.type === 'idle')) {
          const waiting = result.rows.filter((r) => r.arrival < idle.end && r.completion > idle.start);
          assert.deepEqual(waiting, [], `idle while a process is ready: ${label}`);
        }
      }
    }
  }
});

// The verifier must also reject wrong schedules, otherwise "no violations" proves nothing.
test('verifySchedule detects each kind of broken schedule', () => {
  const p = [
    { id: 'P1', arrival: 0, burst: 2, index: 0 },
    { id: 'P2', arrival: 3, burst: 1, index: 1 },
  ];
  const run = (id, start, end) => ({ type: 'run', id, start, end });
  const idle = (start, end) => ({ type: 'idle', id: null, start, end });

  assert.deepEqual(verifySchedule(p, [run('P1', 0, 2), idle(2, 3), run('P2', 3, 4)]), []);

  const cases = [
    [[run('P1', 0, 1), idle(1, 3), run('P2', 3, 4)], /received 1 unit/],
    [[run('P1', 0, 3), run('P2', 3, 4)], /received 3 unit/],
    [[run('P1', 0, 2), run('P2', 2, 3)], /runs before its arrival/],
    [[run('P1', 0, 2), idle(2, 3), run('P2', 2, 3)], /overlap/],
    [[run('P1', 0, 1), idle(1, 2), run('P1', 2, 3), run('P2', 3, 4)], /idle at t=1 while P1 is ready/],
    [[run('P1', 1, 3), run('P2', 3, 4)], /idle at t=0 while P1 is ready/],
  ];
  for (const [segments, message] of cases) {
    const problems = verifySchedule(p, segments);
    assert.ok(problems.some((m) => message.test(m)), `${message}: got ${JSON.stringify(problems)}`);
  }
});
