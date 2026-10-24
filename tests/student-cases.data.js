/*
 * The three additional workloads required by the assignment (section 5),
 * shared by tests/student-cases.test.js and the report generator.
 * Expected results (quantum 2 for RR) were calculated by hand before running
 * the simulator. Averages are rounded to two decimals.
 */
module.exports = [
  {
    name: 'Test 1: CPU idle time',
    checks: 'The CPU is idle before the first arrival and again between bursts, and the scheduler resumes exactly when the next process arrives. In SRTF and RR it also checks that the process arriving at t=8 is handled correctly right after an idle gap.',
    processes: [['P1', 2, 2], ['P2', 7, 3], ['P3', 8, 1]],
    expected: {
      FCFS: { timeline: 'idle 0-2 | P1 2-4 | idle 4-7 | P2 7-10 | P3 10-11', averages: { turnaround: 2.67, waiting: 0.67, response: 0.67 } },
      SJF: { timeline: 'idle 0-2 | P1 2-4 | idle 4-7 | P2 7-10 | P3 10-11', averages: { turnaround: 2.67, waiting: 0.67, response: 0.67 } },
      SRTF: { timeline: 'idle 0-2 | P1 2-4 | idle 4-7 | P2 7-8 | P3 8-9 | P2 9-11', averages: { turnaround: 2.33, waiting: 0.33, response: 0 } },
      RR: { timeline: 'idle 0-2 | P1 2-4 | idle 4-7 | P2 7-9 | P3 9-10 | P2 10-11', averages: { turnaround: 2.67, waiting: 0.67, response: 0.33 } },
    },
    reasoning: [
      'Nothing has arrived before t=2, so every algorithm starts with idle 0–2. P1 finishes at t=4 and P2 does not arrive until t=7, so idle 4–7 follows.',
      'FCFS and SJF: P2 runs 7–10 without interruption; P3 (arrived at 8) runs 10–11.',
      'SRTF: at t=8 P3 needs 1 unit while P2 still has 2, so P3 preempts (8–9) and P2 finishes 9–11.',
      'RR: P2 runs its first slice 7–9; P3 joined the queue at t=8, so it runs 9–10 before P2\'s last unit 10–11.',
    ],
  },
  {
    name: 'Test 2: simultaneous arrivals and ties',
    checks: 'Three processes arrive together at t=0 and three processes have the same burst (3). It checks both tie-breaking levels: earlier arrival first, then earlier position in the input list.',
    processes: [['A', 0, 3], ['B', 0, 3], ['C', 0, 1], ['D', 1, 3]],
    expected: {
      FCFS: { timeline: 'A 0-3 | B 3-6 | C 6-7 | D 7-10', averages: { turnaround: 6.25, waiting: 3.75, response: 3.75 } },
      SJF: { timeline: 'C 0-1 | A 1-4 | B 4-7 | D 7-10', averages: { turnaround: 5.25, waiting: 2.75, response: 2.75 } },
      SRTF: { timeline: 'C 0-1 | A 1-4 | B 4-7 | D 7-10', averages: { turnaround: 5.25, waiting: 2.75, response: 2.75 } },
      RR: { timeline: 'A 0-2 | B 2-4 | C 4-5 | D 5-7 | A 7-8 | B 8-9 | D 9-10', averages: { turnaround: 7.75, waiting: 5.25, response: 2.5 } },
    },
    reasoning: [
      'FCFS: A, B and C all arrive at 0, so input order decides: A, B, C, then D.',
      'SJF and SRTF: C (burst 1) runs first. At t=1, A, B and D all need 3 units. A and B arrived earlier than D, and A is listed before B, so the order is A, B, D. No later arrival can preempt, so SRTF gives the same schedule.',
      'RR: the queue at t=0 is [A, B, C] in input order. D arrives at t=1, during A\'s slice, so it is ahead of A when A is re-enqueued at t=2.',
    ],
  },
  {
    name: 'Test 3: SRTF preemption',
    checks: 'SRTF must preempt when a strictly shorter job arrives (P2 at t=1), must not preempt on an equal remaining time (P3 at t=2 needs 2 and P2 has 2 left), and must pick the shortest job after a completion (P4 at t=4).',
    processes: [['P1', 0, 6], ['P2', 1, 3], ['P3', 2, 2], ['P4', 4, 1]],
    expected: {
      FCFS: { timeline: 'P1 0-6 | P2 6-9 | P3 9-11 | P4 11-12', averages: { turnaround: 7.75, waiting: 4.75, response: 4.75 } },
      SJF: { timeline: 'P1 0-6 | P4 6-7 | P3 7-9 | P2 9-12', averages: { turnaround: 6.75, waiting: 3.75, response: 3.75 } },
      SRTF: { timeline: 'P1 0-1 | P2 1-4 | P4 4-5 | P3 5-7 | P1 7-12', averages: { turnaround: 5.25, waiting: 2.25, response: 0.75 } },
      RR: { timeline: 'P1 0-2 | P2 2-4 | P3 4-6 | P1 6-8 | P4 8-9 | P2 9-10 | P1 10-12', averages: { turnaround: 7.5, waiting: 4.5, response: 1.75 } },
    },
    reasoning: [
      'SRTF t=1: P2 needs 3 and P1 has 5 left, so P2 preempts P1.',
      'SRTF t=2: P3 needs 2 and P2 has 2 left. Equal is not strictly shorter, so P2 keeps running and finishes at t=4.',
      'SRTF t=4: remaining P1=5, P3=2, P4=1, so P4 runs 4–5, then P3 5–7, then P1 7–12.',
      'The other three algorithms are included to show how the same workload behaves without preemption (FCFS, SJF) and with time slicing (RR).',
    ],
  },
];
