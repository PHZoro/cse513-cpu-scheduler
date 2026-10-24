/*
 * Mutation test: injects one deliberate bug at a time into a temporary copy of
 * src/scheduler.js and runs the full test suite against it. A useful test
 * suite should fail for every mutant that changes behavior.
 *
 * Usage: node scripts/mutate.js [--json]
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runTests } = require('./run-tests.js');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/scheduler.js'), 'utf8');

const MUTANTS = [
  {
    name: 'RR re-enqueues the preempted process before admitting arrivals',
    from: 'admitArrivals();\n      if (left.get(p) > 0) {\n        queue.push(p);',
    to: 'if (left.get(p) > 0) {\n        queue.push(p);\n        admitArrivals();',
  },
  {
    name: 'SRTF also preempts on an equal remaining time (< becomes <=)',
    from: 'if (remaining(best) < remaining(current))',
    to: 'if (remaining(best) <= remaining(current))',
  },
  {
    name: 'Tie-breaking ignores arrival time (input order only)',
    from: 'return a.arrival - b.arrival || a.index - b.index;',
    to: 'return a.index - b.index;',
  },
  {
    name: 'SJF selects by arrival time instead of CPU burst',
    from: "(p) => p.burst, 'CPU burst'",
    to: "(p) => p.arrival, 'CPU burst'",
  },
  {
    name: 'Waiting time computed as completion - burst',
    from: 'waiting: turnaround - p.burst',
    to: 'waiting: completion - p.burst',
  },
  {
    name: 'SRTF ignores arrivals while a process runs (never preempts)',
    from: 'const end = Math.min(time + remaining(next), ...futureArrivals);',
    to: 'const end = time + remaining(next);',
  },
  {
    name: 'RR merges consecutive slices of the same process',
    from: "segments.push({ type: 'run', id: p.id, start: time, end: time + run, slice: sliceCount.get(p) });",
    to: "{ const last = segments[segments.length - 1]; if (last && last.id === p.id && last.end === time) last.end = time + run; else segments.push({ type: 'run', id: p.id, start: time, end: time + run, slice: sliceCount.get(p) }); }",
  },
];

const results = [];
for (const mutant of MUTANTS) {
  if (!source.includes(mutant.from)) throw new Error(`Mutation not applicable: ${mutant.name}`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-mutant-'));
  fs.cpSync(path.join(root, 'src'), path.join(dir, 'src'), { recursive: true });
  fs.cpSync(path.join(root, 'tests'), path.join(dir, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/scheduler.js'), source.replace(mutant.from, mutant.to));

  try {
    // The timeout stops mutants that make the scheduler loop forever.
    const run = runTests(dir, ['--test-timeout=20000']);
    results.push({ name: mutant.name, failed: run.fail, total: run.tests, failing: run.failing });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    console.log(`${r.failed > 0 ? 'KILLED  ' : 'SURVIVED'} ${r.failed}/${r.total} failing  ${r.name}`);
    for (const name of r.failing) console.log(`           - ${name}`);
  }
}
