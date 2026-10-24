// Required Workloads A and B (quantum 2 for RR).
// Expected timelines and metrics were calculated by hand, independently of the simulator.
const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate } = require('../src/scheduler.js');
const { workload, timeline } = require('./helpers.js');

const A = workload([['P1', 0, 8], ['P2', 1, 4], ['P3', 2, 2], ['P4', 4, 1]]);
const B = workload([['P1', 2, 3], ['P2', 2, 1], ['P3', 8, 2], ['P4', 9, 1]]);

// [firstStart, completion, turnaround, waiting, response] per process, in input order.
const EXPECTED = [
  {
    name: 'A', w: A, algorithm: 'FCFS',
    timeline: 'P1 0-8 | P2 8-12 | P3 12-14 | P4 14-15',
    rows: [[0, 8, 8, 0, 0], [8, 12, 11, 7, 7], [12, 14, 12, 10, 10], [14, 15, 11, 10, 10]],
    averages: { turnaround: 10.5, waiting: 6.75, response: 6.75 },
  },
  {
    name: 'A', w: A, algorithm: 'SJF',
    timeline: 'P1 0-8 | P4 8-9 | P3 9-11 | P2 11-15',
    rows: [[0, 8, 8, 0, 0], [11, 15, 14, 10, 10], [9, 11, 9, 7, 7], [8, 9, 5, 4, 4]],
    averages: { turnaround: 9, waiting: 5.25, response: 5.25 },
  },
  {
    name: 'A', w: A, algorithm: 'SRTF',
    timeline: 'P1 0-1 | P2 1-2 | P3 2-4 | P4 4-5 | P2 5-8 | P1 8-15',
    rows: [[0, 15, 15, 7, 0], [1, 8, 7, 3, 0], [2, 4, 2, 0, 0], [4, 5, 1, 0, 0]],
    averages: { turnaround: 6.25, waiting: 2.5, response: 0 },
  },
  {
    name: 'A', w: A, algorithm: 'RR',
    timeline: 'P1 0-2 | P2 2-4 | P3 4-6 | P1 6-8 | P4 8-9 | P2 9-11 | P1 11-13 | P1 13-15',
    rows: [[0, 15, 15, 7, 0], [2, 11, 10, 6, 1], [4, 6, 4, 2, 2], [8, 9, 5, 4, 4]],
    averages: { turnaround: 8.5, waiting: 4.75, response: 1.75 },
  },
  {
    name: 'B', w: B, algorithm: 'FCFS',
    timeline: 'idle 0-2 | P1 2-5 | P2 5-6 | idle 6-8 | P3 8-10 | P4 10-11',
    rows: [[2, 5, 3, 0, 0], [5, 6, 4, 3, 3], [8, 10, 2, 0, 0], [10, 11, 2, 1, 1]],
    averages: { turnaround: 2.75, waiting: 1, response: 1 },
  },
  {
    name: 'B', w: B, algorithm: 'SJF',
    timeline: 'idle 0-2 | P2 2-3 | P1 3-6 | idle 6-8 | P3 8-10 | P4 10-11',
    rows: [[3, 6, 4, 1, 1], [2, 3, 1, 0, 0], [8, 10, 2, 0, 0], [10, 11, 2, 1, 1]],
    averages: { turnaround: 2.25, waiting: 0.5, response: 0.5 },
  },
  {
    name: 'B', w: B, algorithm: 'SRTF',
    timeline: 'idle 0-2 | P2 2-3 | P1 3-6 | idle 6-8 | P3 8-10 | P4 10-11',
    rows: [[3, 6, 4, 1, 1], [2, 3, 1, 0, 0], [8, 10, 2, 0, 0], [10, 11, 2, 1, 1]],
    averages: { turnaround: 2.25, waiting: 0.5, response: 0.5 },
  },
  {
    name: 'B', w: B, algorithm: 'RR',
    timeline: 'idle 0-2 | P1 2-4 | P2 4-5 | P1 5-6 | idle 6-8 | P3 8-10 | P4 10-11',
    rows: [[2, 6, 4, 1, 0], [4, 5, 3, 2, 2], [8, 10, 2, 0, 0], [10, 11, 2, 1, 1]],
    averages: { turnaround: 2.75, waiting: 1, response: 0.75 },
  },
];

for (const c of EXPECTED) {
  test(`Workload ${c.name}, ${c.algorithm}`, () => {
    const result = simulate(c.w, c.algorithm, { quantum: 2 });
    assert.equal(timeline(result), c.timeline);
    assert.deepEqual(
      result.rows.map((r) => [r.firstStart, r.completion, r.turnaround, r.waiting, r.response]),
      c.rows,
    );
    assert.deepEqual(result.averages, c.averages);
    assert.deepEqual(result.violations, []);
  });
}
