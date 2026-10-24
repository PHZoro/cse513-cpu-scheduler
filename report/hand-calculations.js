/*
 * Hand calculations for Workloads A and B (quantum 2), transcribed from
 * CSE513_Manual_Calculations.pdf. These were done before the simulator was
 * run on these workloads and are kept here exactly as calculated, so the
 * report can compare them with the simulator output.
 *
 * timeline: [process ID or 'idle', start, end]
 * rows:     process ID -> [first start, completion, turnaround, waiting, response]
 * averages: [turnaround, waiting, response]
 */
module.exports = [
  {
    workload: 'A',
    algorithm: 'FCFS',
    timeline: [['P1', 0, 8], ['P2', 8, 12], ['P3', 12, 14], ['P4', 14, 15]],
    rows: { P1: [0, 8, 8, 0, 0], P2: [8, 12, 11, 7, 7], P3: [12, 14, 12, 10, 10], P4: [14, 15, 11, 10, 10] },
    averages: [10.5, 6.75, 6.75],
    steps: [
      'Processes are served strictly in order of arrival: P1 (0), P2 (1), P3 (2), P4 (4).',
      't=0: only P1 has arrived, so it runs to completion at t=8.',
      't=8: P2, P3 and P4 are all waiting. P2 arrived first and runs 8–12; then P3 runs 12–14 and P4 runs 14–15.',
    ],
  },
  {
    workload: 'A',
    algorithm: 'SJF',
    timeline: [['P1', 0, 8], ['P4', 8, 9], ['P3', 9, 11], ['P2', 11, 15]],
    rows: { P1: [0, 8, 8, 0, 0], P2: [11, 15, 14, 10, 10], P3: [9, 11, 9, 7, 7], P4: [8, 9, 5, 4, 4] },
    averages: [9, 5.25, 5.25],
    steps: [
      't=0: P1 is the only ready process. SJF is non-preemptive, so P1 keeps the CPU until t=8 although shorter jobs arrive at t=1, 2 and 4.',
      't=8: ready bursts are P2=4, P3=2, P4=1. The shortest, P4, runs 8–9.',
      't=9: P3 (2) is shorter than P2 (4) and runs 9–11; P2 runs last, 11–15.',
    ],
  },
  {
    workload: 'A',
    algorithm: 'SRTF',
    timeline: [['P1', 0, 1], ['P2', 1, 2], ['P3', 2, 4], ['P4', 4, 5], ['P2', 5, 8], ['P1', 8, 15]],
    rows: { P1: [0, 15, 15, 7, 0], P2: [1, 8, 7, 3, 0], P3: [2, 4, 2, 0, 0], P4: [4, 5, 1, 0, 0] },
    averages: [6.25, 2.5, 0],
    steps: [
      't=0: P1 starts (remaining 8).',
      't=1: P2 arrives with 4, strictly less than P1\'s remaining 7, so P2 preempts P1.',
      't=2: P3 arrives with 2, strictly less than P2\'s remaining 3, so P3 preempts P2. P3 completes at t=4.',
      't=4: P4 arrives. Remaining times: P1=7, P2=3, P4=1. P4 runs 4–5.',
      't=5: P2 (3) is shorter than P1 (7) and runs 5–8. Then P1 runs its remaining 7 units, 8–15.',
    ],
  },
  {
    workload: 'A',
    algorithm: 'RR',
    timeline: [['P1', 0, 2], ['P2', 2, 4], ['P3', 4, 6], ['P1', 6, 8], ['P4', 8, 9], ['P2', 9, 11], ['P1', 11, 13], ['P1', 13, 15]],
    rows: { P1: [0, 15, 15, 7, 0], P2: [2, 11, 10, 6, 1], P3: [4, 6, 4, 2, 2], P4: [8, 9, 5, 4, 4] },
    averages: [8.5, 4.75, 1.75],
    steps: [
      't=0: queue [P1]. P1 runs 0–2 (remaining 6).',
      't=2: P2 joined the tail at t=1. P3 arrives exactly at the boundary and is enqueued before the preempted P1. Queue [P2, P3, P1]. P2 runs 2–4 (remaining 2).',
      't=4: P4 arrives exactly at the boundary and is enqueued before P2. Queue [P3, P1, P4, P2]. P3 runs 4–6 and completes.',
      't=6: queue [P1, P4, P2]. P1 runs 6–8 (remaining 4), then rejoins: [P4, P2, P1].',
      't=8: P4 runs 8–9 and completes. t=9: P2 runs 9–11 and completes.',
      't=11: only P1 is left. It receives two consecutive slices, 11–13 and 13–15, shown separately.',
    ],
  },
  {
    workload: 'B',
    algorithm: 'FCFS',
    timeline: [['idle', 0, 2], ['P1', 2, 5], ['P2', 5, 6], ['idle', 6, 8], ['P3', 8, 10], ['P4', 10, 11]],
    rows: { P1: [2, 5, 3, 0, 0], P2: [5, 6, 4, 3, 3], P3: [8, 10, 2, 0, 0], P4: [10, 11, 2, 1, 1] },
    averages: [2.75, 1, 1],
    steps: [
      't=0–2: no process has arrived, so the CPU is idle.',
      't=2: P1 and P2 arrive simultaneously. The tie is broken by input order, so P1 runs 2–5 and P2 runs 5–6.',
      't=6–8: no process is ready; idle until P3 arrives.',
      't=8: P3 runs 8–10. P4 arrived at t=9 and runs 10–11.',
    ],
  },
  {
    workload: 'B',
    algorithm: 'SJF',
    timeline: [['idle', 0, 2], ['P2', 2, 3], ['P1', 3, 6], ['idle', 6, 8], ['P3', 8, 10], ['P4', 10, 11]],
    rows: { P1: [3, 6, 4, 1, 1], P2: [2, 3, 1, 0, 0], P3: [8, 10, 2, 0, 0], P4: [10, 11, 2, 1, 1] },
    averages: [2.25, 0.5, 0.5],
    steps: [
      't=0–2: idle.',
      't=2: ready bursts P1=3 and P2=1. P2 is shorter and runs 2–3; then P1 runs 3–6.',
      't=6–8: idle.',
      't=8: only P3 is ready and runs 8–10 without interruption (non-preemptive). P4 runs 10–11.',
    ],
  },
  {
    workload: 'B',
    algorithm: 'SRTF',
    timeline: [['idle', 0, 2], ['P2', 2, 3], ['P1', 3, 6], ['idle', 6, 8], ['P3', 8, 10], ['P4', 10, 11]],
    rows: { P1: [3, 6, 4, 1, 1], P2: [2, 3, 1, 0, 0], P3: [8, 10, 2, 0, 0], P4: [10, 11, 2, 1, 1] },
    averages: [2.25, 0.5, 0.5],
    steps: [
      't=0–2: idle.',
      't=2: remaining times P1=3, P2=1. P2 runs 2–3; P1 runs 3–6 (no arrival in between).',
      't=6–8: idle. t=8: P3 starts (remaining 2).',
      't=9: P4 arrives with 1; P3 also has 1 remaining. Equal is not strictly shorter, so P3 keeps the CPU until t=10. P4 runs 10–11.',
    ],
  },
  {
    workload: 'B',
    algorithm: 'RR',
    timeline: [['idle', 0, 2], ['P1', 2, 4], ['P2', 4, 5], ['P1', 5, 6], ['idle', 6, 8], ['P3', 8, 10], ['P4', 10, 11]],
    rows: { P1: [2, 6, 4, 1, 0], P2: [4, 5, 3, 2, 2], P3: [8, 10, 2, 0, 0], P4: [10, 11, 2, 1, 1] },
    averages: [2.75, 1, 0.75],
    steps: [
      't=0–2: idle.',
      't=2: P1 and P2 arrive together and are enqueued in input order: [P1, P2]. P1 runs 2–4 (remaining 1) and rejoins: [P2, P1].',
      't=4: P2 runs 4–5 and completes. t=5: P1 runs its last unit, 5–6.',
      't=6–8: idle. t=8: P3 runs 8–10; P4 joins the queue at t=9. P3 finishes exactly at the end of its slice, so it does not rejoin. P4 runs 10–11.',
    ],
  },
];
