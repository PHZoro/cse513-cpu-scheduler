/*
 * Independent reference scheduler used only by the tests.
 *
 * It is deliberately written differently from src/scheduler.js: it advances
 * one time unit per step and decides who owns each unit, instead of jumping
 * between events. If both implementations agree on many random workloads,
 * a shared mistake is much less likely.
 *
 * Returns { ticks, dispatches }:
 *   ticks[t]   - ID of the process running in [t, t+1), or null when idle
 *   dispatches - times at which a process was given the CPU (for RR these are
 *                the quantum boundaries, including consecutive slices)
 */
function referenceSchedule(processes, algorithm, quantum) {
  const n = processes.length;
  const left = processes.map((p) => p.burst);
  const ticks = [];
  const dispatches = [];
  const queue = [];
  let current = -1;
  let sliceUsed = 0;

  // true when process i should be chosen over process j for the given key
  const before = (i, j, key) => {
    if (key(i) !== key(j)) return key(i) < key(j);
    if (processes[i].arrival !== processes[j].arrival) return processes[i].arrival < processes[j].arrival;
    return i < j;
  };
  const bestReady = (t, key) => {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (processes[i].arrival <= t && left[i] > 0 && (best === -1 || before(i, best, key))) best = i;
    }
    return best;
  };

  for (let t = 0; left.some((x) => x > 0); t++) {
    if (algorithm === 'RR') {
      for (let i = 0; i < n; i++) if (processes[i].arrival === t) queue.push(i);
      if (current !== -1 && (left[current] === 0 || sliceUsed === quantum)) {
        if (left[current] > 0) queue.push(current);
        current = -1;
      }
      if (current === -1 && queue.length > 0) {
        current = queue.shift();
        sliceUsed = 0;
        dispatches.push(t);
      }
    } else {
      if (current !== -1 && left[current] === 0) current = -1;
      if (algorithm === 'SRTF') {
        const best = bestReady(t, (i) => left[i]);
        if (best !== -1 && (current === -1 || left[best] < left[current])) {
          current = best;
          dispatches.push(t);
        }
      } else if (current === -1) {
        const key = algorithm === 'FCFS' ? (i) => processes[i].arrival : (i) => processes[i].burst;
        current = bestReady(t, key);
        if (current !== -1) dispatches.push(t);
      }
    }

    if (current === -1) {
      ticks.push(null);
    } else {
      ticks.push(processes[current].id);
      left[current]--;
      sliceUsed++;
    }
  }
  return { ticks, dispatches };
}

module.exports = { referenceSchedule };
