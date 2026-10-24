/*
 * CPU scheduling core: input validation, the four scheduling policies,
 * per-process metrics and a schedule verifier.
 *
 * Model: one CPU, one CPU burst per process, no I/O, zero-cost context
 * switches, integer times. An interval [start, end) gives end - start units
 * of CPU time.
 *
 * Runs in the browser (window.Scheduler) and in Node (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Scheduler = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ALGORITHMS = {
    FCFS: 'First-Come, First-Served',
    SJF: 'Shortest Job First (non-preemptive)',
    SRTF: 'Shortest Remaining Time First (preemptive)',
    RR: 'Round Robin',
  };

  // ---------------------------------------------------------------- validation

  function readInteger(value, label, min, errors) {
    const text = value === undefined || value === null ? '' : String(value).trim();
    if (text === '') {
      errors.push(`${label} is required.`);
      return null;
    }
    if (!/^[+-]?\d+$/.test(text)) {
      errors.push(`${label} must be a whole number, but "${text}" was entered.`);
      return null;
    }
    const number = Number(text);
    if (!Number.isSafeInteger(number)) {
      errors.push(`${label} is too large.`);
      return null;
    }
    if (number < min) {
      const rule = min === 0 ? '0 or greater' : `at least ${min}`;
      errors.push(`${label} must be ${rule}, but ${number} was entered.`);
      return null;
    }
    return number;
  }

  /**
   * Checks raw input (form strings or numbers) and returns
   * { errors, processes, quantum }. `processes` is normalized to
   * { id, arrival, burst, index } and is empty when there are errors.
   * `index` is the position in the input list, used for tie-breaking.
   */
  function validate(processes, options = {}) {
    const errors = [];
    const { algorithm } = options;

    if (algorithm !== undefined && !ALGORITHMS[algorithm]) {
      errors.push(`Unknown algorithm "${algorithm}". Choose one of: ${Object.keys(ALGORITHMS).join(', ')}.`);
    }

    if (!Array.isArray(processes) || processes.length === 0) {
      errors.push('Add at least one process.');
      return { errors, processes: [], quantum: null };
    }

    const normalized = [];
    const firstRowById = new Map();
    processes.forEach((raw, index) => {
      const id = String(raw.id ?? '').trim();
      const row = id ? `Row ${index + 1} (${id})` : `Row ${index + 1}`;

      if (id === '') {
        errors.push(`${row}: process ID is required.`);
      } else if (firstRowById.has(id)) {
        errors.push(`${row}: process ID "${id}" is already used in row ${firstRowById.get(id) + 1}. IDs must be unique.`);
      } else {
        firstRowById.set(id, index);
      }

      const arrival = readInteger(raw.arrival, `${row}: arrival time`, 0, errors);
      const burst = readInteger(raw.burst, `${row}: CPU burst`, 1, errors);
      normalized.push({ id, arrival, burst, index });
    });

    let quantum = null;
    if (algorithm === 'RR') {
      quantum = readInteger(options.quantum, 'Time quantum', 1, errors);
    }

    return { errors, processes: errors.length ? [] : normalized, quantum };
  }

  // ------------------------------------------------------------------ helpers

  // Tie-break rule: earlier arrival first, then earlier position in the input list.
  function tieBreak(a, b) {
    return a.arrival - b.arrival || a.index - b.index;
  }

  // Returns the candidate with the smallest key; ties are resolved by tieBreak.
  function pickMin(candidates, key) {
    let best = null;
    for (const p of candidates) {
      if (best === null) {
        best = p;
        continue;
      }
      const diff = key(p) - key(best);
      if (diff < 0 || (diff === 0 && tieBreak(p, best) < 0)) best = p;
    }
    return best;
  }

  function listIds(processes, value) {
    return processes.map((p) => (value ? `${p.id}(${value(p)})` : p.id)).join(', ');
  }

  // Idle from `time` until the earliest arrival among `waiting`. Returns the new time.
  function addIdle(segments, log, time, waiting) {
    const next = Math.min(...waiting.map((p) => p.arrival));
    segments.push({ type: 'idle', id: null, start: time, end: next });
    log.push({ time, text: `No process is ready, so the CPU is idle until t=${next}.` });
    return next;
  }

  // ------------------------------------------------------------------ policies

  // FCFS and SJF: when the CPU is free, pick by `key` and run to completion.
  function runNonPreemptive(processes, key, keyName) {
    const segments = [];
    const log = [];
    const unfinished = processes.slice();
    let time = 0;

    while (unfinished.length > 0) {
      const ready = unfinished.filter((p) => p.arrival <= time);
      if (ready.length === 0) {
        time = addIdle(segments, log, time, unfinished);
        continue;
      }

      const chosen = pickMin(ready, key);
      log.push({
        time,
        text: `Ready (${keyName}): ${listIds(ready, key)}. ${chosen.id} runs to completion at t=${time + chosen.burst}.`,
      });
      segments.push({ type: 'run', id: chosen.id, start: time, end: time + chosen.burst });
      time += chosen.burst;
      unfinished.splice(unfinished.indexOf(chosen), 1);
    }
    return { segments, log };
  }

  // SRTF: decisions are taken at time 0, at every arrival and at every completion.
  function runSrtf(processes) {
    const segments = [];
    const log = [];
    const left = new Map(processes.map((p) => [p, p.burst]));
    const remaining = (p) => left.get(p);
    const unfinished = processes.slice();
    let current = null;
    let time = 0;

    while (unfinished.length > 0) {
      const ready = unfinished.filter((p) => p.arrival <= time);
      if (ready.length === 0) {
        time = addIdle(segments, log, time, unfinished);
        continue;
      }

      const best = pickMin(ready, remaining);
      let next = best;
      if (current !== null && best !== current) {
        if (remaining(best) < remaining(current)) {
          log.push({ time, text: `${best.id} has ${remaining(best)} left, strictly less than ${current.id}'s ${remaining(current)}, so ${best.id} preempts ${current.id}.` });
        } else {
          next = current;
          log.push({ time, text: `Ready (remaining time): ${listIds(ready, remaining)}. No job is strictly shorter than ${current.id}, so it keeps running.` });
        }
      } else if (current === null) {
        const verb = remaining(best) < best.burst ? 'resumes' : 'starts';
        log.push({ time, text: `Ready (remaining time): ${listIds(ready, remaining)}. ${best.id} ${verb}.` });
      }

      // Run until the process finishes or the next arrival forces a new decision.
      const futureArrivals = unfinished.filter((p) => p.arrival > time).map((p) => p.arrival);
      const end = Math.min(time + remaining(next), ...futureArrivals);

      const last = segments[segments.length - 1];
      if (last && last.type === 'run' && last.id === next.id && last.end === time) {
        last.end = end; // same process continues without interruption
      } else {
        segments.push({ type: 'run', id: next.id, start: time, end });
      }

      left.set(next, remaining(next) - (end - time));
      time = end;
      if (remaining(next) === 0) {
        unfinished.splice(unfinished.indexOf(next), 1);
        log.push({ time, text: `${next.id} completes.` });
        current = null;
      } else {
        current = next;
      }
    }
    return { segments, log };
  }

  // Round robin with a FIFO ready queue.
  function runRoundRobin(processes, quantum) {
    const segments = [];
    const log = [];
    const notArrived = processes.slice().sort(tieBreak);
    const left = new Map(processes.map((p) => [p, p.burst]));
    const sliceCount = new Map(processes.map((p) => [p, 0]));
    const queue = [];
    let time = 0;

    // Moves every process that has arrived by `time` to the tail, in arrival order.
    const admitArrivals = () => {
      while (notArrived.length > 0 && notArrived[0].arrival <= time) {
        queue.push(notArrived.shift());
      }
    };

    admitArrivals();
    while (queue.length > 0 || notArrived.length > 0) {
      if (queue.length === 0) {
        time = addIdle(segments, log, time, notArrived);
        admitArrivals();
        continue;
      }

      const p = queue.shift();
      const run = Math.min(quantum, left.get(p));
      sliceCount.set(p, sliceCount.get(p) + 1);
      segments.push({ type: 'run', id: p.id, start: time, end: time + run, slice: sliceCount.get(p) });
      log.push({ time, text: `${p.id} takes slice ${sliceCount.get(p)} from the queue head and runs ${run} unit(s).` });

      time += run;
      left.set(p, left.get(p) - run);

      // Processes arriving during the slice or exactly at its end join first;
      // only then does the unfinished process go back to the tail.
      admitArrivals();
      if (left.get(p) > 0) {
        queue.push(p);
        log.push({ time, text: `${p.id} has ${left.get(p)} left and rejoins the tail. Queue: [${listIds(queue)}].` });
      } else {
        log.push({ time, text: `${p.id} completes. Queue: [${listIds(queue)}].` });
      }
    }
    return { segments, log };
  }

  // ------------------------------------------------------------------ metrics

  function computeMetrics(processes, segments) {
    const rows = processes.map((p) => {
      const runs = segments.filter((s) => s.type === 'run' && s.id === p.id);
      const firstStart = runs[0].start;
      const completion = runs[runs.length - 1].end;
      const turnaround = completion - p.arrival;
      return {
        id: p.id,
        arrival: p.arrival,
        burst: p.burst,
        firstStart,
        completion,
        turnaround,
        waiting: turnaround - p.burst,
        response: firstStart - p.arrival,
      };
    });
    const average = (field) => rows.reduce((sum, r) => sum + r[field], 0) / rows.length;
    return {
      rows,
      averages: {
        turnaround: average('turnaround'),
        waiting: average('waiting'),
        response: average('response'),
      },
    };
  }

  /**
   * Runs one algorithm. Throws an Error with an `errors` array on invalid input.
   * Returns { algorithm, quantum, processes, segments, rows, averages, log, violations }.
   */
  function simulate(rawProcesses, algorithm, options = {}) {
    const checked = validate(rawProcesses, { algorithm, quantum: options.quantum });
    if (checked.errors.length > 0) {
      const error = new Error(checked.errors.join('\n'));
      error.errors = checked.errors;
      throw error;
    }

    const { processes, quantum } = checked;
    let schedule;
    if (algorithm === 'FCFS') schedule = runNonPreemptive(processes, (p) => p.arrival, 'arrival time');
    else if (algorithm === 'SJF') schedule = runNonPreemptive(processes, (p) => p.burst, 'CPU burst');
    else if (algorithm === 'SRTF') schedule = runSrtf(processes);
    else schedule = runRoundRobin(processes, quantum);

    const { rows, averages } = computeMetrics(processes, schedule.segments);
    return {
      algorithm,
      quantum,
      processes,
      segments: schedule.segments,
      rows,
      averages,
      log: schedule.log,
      violations: verifySchedule(processes, schedule.segments),
    };
  }

  // ------------------------------------------------------------- verification

  /**
   * Checks the model properties on any schedule, independent of the policy
   * that produced it. Returns a list of violations (empty when all hold).
   */
  function verifySchedule(processes, segments) {
    const problems = [];
    const runsOf = (p) => segments.filter((s) => s.type === 'run' && s.id === p.id);

    // Processes do not overlap on the single CPU (and segments have positive length).
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (!(s.end > s.start)) problems.push(`Segment ${i + 1} [${s.start}, ${s.end}) is empty or reversed.`);
      if (i > 0 && s.start < segments[i - 1].end) {
        problems.push(`Segment ${i + 1} starts at ${s.start}, before the previous segment ends at ${segments[i - 1].end} (overlap).`);
      }
    }

    // Work done by `p` in [0, t).
    const workBefore = (p, t) =>
      runsOf(p).reduce((sum, s) => sum + Math.max(0, Math.min(s.end, t) - s.start), 0);

    for (const p of processes) {
      const runs = runsOf(p);
      const total = runs.reduce((sum, s) => sum + (s.end - s.start), 0);
      if (total !== p.burst) problems.push(`${p.id} received ${total} unit(s) of CPU time instead of its burst ${p.burst}.`);
      if (runs.some((s) => s.start < p.arrival)) problems.push(`${p.id} runs before its arrival at t=${p.arrival}.`);
      if (runs.length > 0) {
        const completion = runs[runs.length - 1].end;
        if (completion - p.arrival - p.burst < 0) problems.push(`${p.id} has a negative waiting time.`);
        if (runs[0].start - p.arrival < 0) problems.push(`${p.id} has a negative response time.`);
      }
    }

    // The CPU is never idle while a process is ready. Idle means an idle
    // segment or an unrecorded gap; during it no one runs, so a process that
    // has arrived before the idle period ends and still has work is waiting.
    const idlePeriods = [];
    let cursor = 0;
    for (const s of segments) {
      if (s.start > cursor) idlePeriods.push([cursor, s.start]);
      if (s.type === 'idle') idlePeriods.push([s.start, s.end]);
      cursor = Math.max(cursor, s.end);
    }
    for (const [start, end] of idlePeriods) {
      for (const p of processes) {
        const from = Math.max(start, p.arrival);
        if (from < end && workBefore(p, from) < p.burst) {
          problems.push(`CPU is idle at t=${from} while ${p.id} is ready.`);
        }
      }
    }

    return problems;
  }

  return { ALGORITHMS, validate, simulate, verifySchedule };
});
