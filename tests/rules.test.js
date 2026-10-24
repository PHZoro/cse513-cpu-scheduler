// One small workload per scheduling rule in the assignment, with the expected
// timeline worked out by hand in the comment above each assertion.
const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate } = require('../src/scheduler.js');
const { workload, timeline } = require('./helpers.js');

test('FCFS: simultaneous arrivals are served in input order', () => {
  // P1 and P2 both arrive at 0; P1 is listed first.
  const w = workload([['P1', 0, 3], ['P2', 0, 2]]);
  assert.equal(timeline(simulate(w, 'FCFS')), 'P1 0-3 | P2 3-5');
});

test('FCFS: earlier arrival wins over input position', () => {
  // P2 is listed second but arrives first.
  const w = workload([['P1', 1, 2], ['P2', 0, 2]]);
  assert.equal(timeline(simulate(w, 'FCFS')), 'P2 0-2 | P1 2-4');
});

test('SJF: equal bursts are broken by earlier arrival, then input order', () => {
  // At t=5, P2 and P3 both have burst 2. P3 arrived earlier (t=1), so it goes first.
  const w = workload([['P1', 0, 5], ['P2', 2, 2], ['P3', 1, 2]]);
  assert.equal(timeline(simulate(w, 'SJF')), 'P1 0-5 | P3 5-7 | P2 7-9');

  // Same burst and same arrival: input order decides.
  const same = workload([['A', 0, 4], ['B', 1, 2], ['C', 1, 2]]);
  assert.equal(timeline(simulate(same, 'SJF')), 'A 0-4 | B 4-6 | C 6-8');
});

test('SJF: a shorter job arriving later does not interrupt the running job', () => {
  const w = workload([['P1', 0, 6], ['P2', 1, 1]]);
  assert.equal(timeline(simulate(w, 'SJF')), 'P1 0-6 | P2 6-7');
});

test('SRTF: a strictly shorter remaining time preempts', () => {
  // At t=1, P1 has 5 left and P2 needs 2, so P2 preempts.
  const w = workload([['P1', 0, 6], ['P2', 1, 2]]);
  assert.equal(timeline(simulate(w, 'SRTF')), 'P1 0-1 | P2 1-3 | P1 3-8');
});

test('SRTF: an equal remaining time does not preempt', () => {
  // At t=1, P1 has 2 left and P2 needs 2: tie, so P1 keeps running.
  const w = workload([['P1', 0, 3], ['P2', 1, 2]]);
  assert.equal(timeline(simulate(w, 'SRTF')), 'P1 0-3 | P2 3-5');
});

test('SRTF: an arrival that does not preempt does not split the running segment', () => {
  // P2 arrives at 2 with 5 units, P1 has 2 left: P1 continues as one segment.
  const w = workload([['P1', 0, 4], ['P2', 2, 5]]);
  const result = simulate(w, 'SRTF');
  assert.equal(timeline(result), 'P1 0-4 | P2 4-9');
});

test('SRTF: after a completion, ties are broken by earlier arrival', () => {
  // At t=1, P2 (burst 1) preempts P1, which has 2 left. P2 finishes at 2.
  // P3 also arrived at 2 with 2 units: tie with P1, and P1 arrived earlier.
  const w = workload([['P1', 0, 3], ['P2', 1, 1], ['P3', 2, 2]]);
  assert.equal(timeline(simulate(w, 'SRTF')), 'P1 0-1 | P2 1-2 | P1 2-4 | P3 4-6');
});

test('RR: a process arriving exactly at a quantum boundary is queued before the preempted one', () => {
  // q=2. P1 runs 0-2. P2 arrives at 2, joins first; then P1 rejoins behind it.
  const w = workload([['P1', 0, 4], ['P2', 2, 2]]);
  assert.equal(timeline(simulate(w, 'RR', { quantum: 2 })), 'P1 0-2 | P2 2-4 | P1 4-6');
});

test('RR: arrivals during a slice join in arrival order, ahead of the preempted process', () => {
  // q=2. During P1's slice P2 arrives at 1 and P3 at 2. Queue at t=2: P2, P3, P1.
  const w = workload([['P1', 0, 3], ['P2', 1, 1], ['P3', 2, 1]]);
  assert.equal(timeline(simulate(w, 'RR', { quantum: 2 })), 'P1 0-2 | P2 2-3 | P3 3-4 | P1 4-5');
});

test('RR: consecutive slices of the same process stay separate segments', () => {
  const w = workload([['P1', 0, 5]]);
  const result = simulate(w, 'RR', { quantum: 2 });
  assert.equal(timeline(result), 'P1 0-2 | P1 2-4 | P1 4-5');
  assert.deepEqual(result.segments.map((s) => s.slice), [1, 2, 3]);
});

test('RR: a process that finishes early gives up the CPU and never rejoins', () => {
  // q=3. P1 needs 1 unit, so it releases the CPU at 1.
  const w = workload([['P1', 0, 1], ['P2', 0, 4]]);
  assert.equal(timeline(simulate(w, 'RR', { quantum: 3 })), 'P1 0-1 | P2 1-4 | P2 4-5');
});

test('Idle intervals are shown at the start and between processes', () => {
  const w = workload([['P1', 2, 1], ['P2', 5, 2]]);
  for (const algorithm of ['FCFS', 'SJF', 'SRTF', 'RR']) {
    const result = simulate(w, algorithm, { quantum: 2 });
    assert.equal(timeline(result), 'idle 0-2 | P1 2-3 | idle 3-5 | P2 5-7', algorithm);
  }
});

test('Metrics follow the formulas in the assignment', () => {
  // SRTF: P1 0-1, P2 1-3, P1 3-8.
  const result = simulate(workload([['P1', 0, 6], ['P2', 1, 2]]), 'SRTF');
  assert.deepEqual(result.rows, [
    { id: 'P1', arrival: 0, burst: 6, firstStart: 0, completion: 8, turnaround: 8, waiting: 2, response: 0 },
    { id: 'P2', arrival: 1, burst: 2, firstStart: 1, completion: 3, turnaround: 2, waiting: 0, response: 0 },
  ]);
  assert.deepEqual(result.averages, { turnaround: 5, waiting: 1, response: 0 });
});

test('Results keep the input order of processes', () => {
  const result = simulate(workload([['Z', 3, 1], ['A', 0, 1]]), 'FCFS');
  assert.deepEqual(result.rows.map((r) => r.id), ['Z', 'A']);
});
