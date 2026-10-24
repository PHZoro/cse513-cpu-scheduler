/*
 * Builds the assignment report (report/report.html and the PDF) from the
 * hand calculations, the simulator and the test results, so every simulator
 * value in the report comes from an actual run of src/scheduler.js.
 *
 * Usage:
 *   node report/build-report.js          run tests + mutation test, write HTML and PDF
 *   node report/build-report.js --fast   reuse the last mutation results
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { simulate } = require('../src/scheduler.js');
const { runTests } = require('../scripts/run-tests.js');
const HAND = require('./hand-calculations.js');
const STUDENT_CASES = require('../tests/student-cases.data.js');

const ROOT = path.resolve(__dirname, '..');
const OUT_HTML = path.join(__dirname, 'report.html');
const OUT_PDF = path.join(__dirname, 'CSE513-Assignment1-Report.pdf');
const MUTATION_CACHE = path.join(__dirname, 'mutation-results.json');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const WORKLOADS = {
  A: [['P1', 0, 8], ['P2', 1, 4], ['P3', 2, 2], ['P4', 4, 1]],
  B: [['P1', 2, 3], ['P2', 2, 1], ['P3', 8, 2], ['P4', 9, 1]],
};
const ALGORITHM_NAMES = {
  FCFS: 'First-Come, First-Served (FCFS)',
  SJF: 'Shortest Job First (SJF, non-preemptive)',
  SRTF: 'Shortest Remaining Time First (SRTF, preemptive)',
  RR: 'Round Robin (RR, quantum 2)',
};
const SHORT_NAMES = { FCFS: 'FCFS', SJF: 'SJF', SRTF: 'SRTF', RR: 'RR (q=2)' };
const COLORS = ['#2456c7', '#c2410c', '#15803d', '#7e22ce', '#b91c1c', '#0e7490', '#8a5a00', '#be185d'];

// ----------------------------------------------------------------- helpers

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v) => v.toFixed(2);
const toProcesses = (rows) => rows.map(([id, arrival, burst]) => ({ id, arrival, burst }));

const timelineText = (segments) =>
  segments.map((s) => `${s.type === 'idle' ? 'idle' : s.id} ${s.start}–${s.end}`).join(' | ');

const handSegments = (timeline) =>
  timeline.map(([id, start, end]) => (id === 'idle'
    ? { type: 'idle', id: null, start, end }
    : { type: 'run', id, start, end }));

const run = (rows, algorithm, quantum = 2) => simulate(toProcesses(rows), algorithm, { quantum });

function colorFor(rows) {
  const map = new Map(rows.map(([id], i) => [id, COLORS[i % COLORS.length]]));
  return (id) => map.get(id);
}

function gantt(segments, color) {
  const end = segments[segments.length - 1].end;
  const pct = (t) => `${((t / end) * 100).toFixed(3)}%`;
  const ticks = new Set([0]);
  const blocks = segments.map((s, i) => {
    ticks.add(s.start);
    ticks.add(s.end);
    const prev = segments[i - 1];
    const continues = s.type === 'run' && prev && prev.type === 'run' && prev.id === s.id && prev.end === s.start;
    const style = `left:${pct(s.start)};width:${pct(s.end - s.start)};${s.type === 'run' ? `background:${color(s.id)}` : ''}`;
    const slice = s.slice ? `<small>slice ${s.slice}</small>` : '';
    return `<div class="seg ${s.type}${continues ? ' cont' : ''}" style="${style}"><span>${s.type === 'idle' ? 'idle' : esc(s.id)}</span>${slice}</div>`;
  }).join('');
  const axis = [...ticks].sort((a, b) => a - b).map((t) => `<span style="left:${pct(t)}">${t}</span>`).join('');
  return `<div class="gantt"><div class="track">${blocks}</div><div class="axis">${axis}</div></div>`;
}

function inputTable(rows) {
  return `<table class="input"><thead><tr><th class="l">Process</th><th>Arrival time</th><th>CPU burst</th></tr></thead><tbody>${
    rows.map(([id, a, b]) => `<tr><td class="l">${esc(id)}</td><td>${a}</td><td>${b}</td></tr>`).join('')
  }</tbody></table>`;
}

function resultTable(result) {
  const body = result.rows.map((r) =>
    `<tr><td class="l">${esc(r.id)}</td><td>${r.arrival}</td><td>${r.burst}</td><td>${r.firstStart}</td><td>${r.completion}</td><td>${r.turnaround}</td><td>${r.waiting}</td><td>${r.response}</td></tr>`).join('');
  const a = result.averages;
  return `<table><thead><tr><th class="l">Process</th><th>Arrival</th><th>Burst</th><th>First start</th><th>Completion</th><th>Turnaround</th><th>Waiting</th><th>Response</th></tr></thead>
    <tbody>${body}</tbody><tfoot><tr><td class="l" colspan="5">Average</td><td>${fmt(a.turnaround)}</td><td>${fmt(a.waiting)}</td><td>${fmt(a.response)}</td></tr></tfoot></table>`;
}

const sum = (xs) => xs.reduce((s, x) => s + x, 0);

// ------------------------------------------------------- worked examples

function compareExample(hand) {
  const rows = WORKLOADS[hand.workload];
  const sim = run(rows, hand.algorithm);
  const simById = Object.fromEntries(sim.rows.map((r) => [r.id, [r.firstStart, r.completion, r.turnaround, r.waiting, r.response]]));
  const handTimeline = timelineText(handSegments(hand.timeline));
  const simTimeline = timelineText(sim.segments);
  const simAverages = [sim.averages.turnaround, sim.averages.waiting, sim.averages.response];

  const differences = [];
  if (handTimeline !== simTimeline) differences.push(`timeline (hand: ${handTimeline}; simulator: ${simTimeline})`);
  for (const [id] of rows) {
    hand.rows[id].forEach((v, i) => {
      if (v !== simById[id][i]) differences.push(`${id} ${['first start', 'completion', 'turnaround', 'waiting', 'response'][i]} (hand ${v}, simulator ${simById[id][i]})`);
    });
  }
  hand.averages.forEach((v, i) => {
    if (Math.abs(v - simAverages[i]) > 1e-9) differences.push(`average ${['turnaround', 'waiting', 'response'][i]} (hand ${fmt(v)}, simulator ${fmt(simAverages[i])})`);
  });

  // The hand values must also be internally consistent with the formulas.
  const arithmetic = [];
  for (const [id, arrival, burst] of rows) {
    const [st, ct, tat, wt, rt] = hand.rows[id];
    if (tat !== ct - arrival) arithmetic.push(`${id} turnaround`);
    if (wt !== tat - burst) arithmetic.push(`${id} waiting`);
    if (rt !== st - arrival) arithmetic.push(`${id} response`);
  }

  return { rows, sim, simById, simAverages, handTimeline, simTimeline, differences, arithmetic, values: rows.length * 5 + 3 };
}

function exampleSection(hand, number) {
  const c = compareExample(hand);
  const color = colorFor(c.rows);
  const equations = c.rows.map(([id, arrival, burst]) => {
    const [st, ct, tat, wt, rt] = hand.rows[id];
    return `<li>${id}: TAT = ${ct} − ${arrival} = ${tat}; &nbsp;WT = ${tat} − ${burst} = ${wt}; &nbsp;RT = ${st} − ${arrival} = ${rt}</li>`;
  }).join('');
  const column = (i) => c.rows.map(([id]) => hand.rows[id][i]);
  const averageLine = (label, i) => `Average ${label} = (${column(i).join(' + ')}) / ${c.rows.length} = ${sum(column(i))} / ${c.rows.length} = ${fmt(hand.averages[i - 2])}`;

  const comparisonRows = c.rows.map(([id]) => {
    const h = hand.rows[id];
    const s = c.simById[id];
    const same = h.every((v, i) => v === s[i]);
    return `<tr><td class="l">${id}</td>${h.map((v) => `<td>${v}</td>`).join('')}${s.map((v) => `<td class="sim">${v}</td>`).join('')}<td class="${same ? 'ok' : 'bad'}">${same ? '✓' : '✗'}</td></tr>`;
  }).join('');
  const avgSame = hand.averages.every((v, i) => Math.abs(v - c.simAverages[i]) < 1e-9);

  const verdict = c.differences.length === 0
    ? `<p class="verdict ok">No discrepancy. The timelines are identical segment by segment (${c.sim.segments.length} segments), and all ${c.values} metric values (5 per process and 3 averages) agree.${c.sim.violations.length === 0 ? ' The simulator\'s own property check also passed.' : ''}</p>`
    : `<p class="verdict bad">Discrepancies: ${c.differences.map(esc).join('; ')}.</p>`;

  return `
  <section class="example">
    <h3>Example ${number}: Workload ${hand.workload}, ${ALGORITHM_NAMES[hand.algorithm]}</h3>
    <h4>Input data</h4>
    ${inputTable(c.rows)}
    <h4>Hand calculation</h4>
    <ol class="steps">${hand.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="mono">Hand timeline: ${esc(c.handTimeline)}</p>
    <ul class="equations mono">${equations}</ul>
    <p class="mono">${averageLine('turnaround', 2)}<br>${averageLine('waiting', 3)}<br>${averageLine('response', 4)}</p>
    ${c.arithmetic.length ? `<p class="bad">Arithmetic check failed for: ${c.arithmetic.join(', ')}.</p>` : ''}
    <h4>Simulator output</h4>
    ${gantt(c.sim.segments, color)}
    <p class="mono">Simulator timeline: ${esc(c.simTimeline)}</p>
    <h4>Comparison</h4>
    <table class="compare">
      <thead>
        <tr><th class="l" rowspan="2">Process</th><th colspan="5">Hand calculation</th><th colspan="5" class="sim">Simulator</th><th rowspan="2">Match</th></tr>
        <tr><th>ST</th><th>CT</th><th>TAT</th><th>WT</th><th>RT</th><th class="sim">ST</th><th class="sim">CT</th><th class="sim">TAT</th><th class="sim">WT</th><th class="sim">RT</th></tr>
      </thead>
      <tbody>${comparisonRows}</tbody>
      <tfoot><tr><td class="l">Average</td><td></td><td></td>${hand.averages.map((v) => `<td>${fmt(v)}</td>`).join('')}<td class="sim"></td><td class="sim"></td>${c.simAverages.map((v) => `<td class="sim">${fmt(v)}</td>`).join('')}<td class="${avgSame ? 'ok' : 'bad'}">${avgSame ? '✓' : '✗'}</td></tr></tfoot>
    </table>
    ${verdict}
  </section>`;
}

// ---------------------------------------------------------- student tests

function studentCaseSection(c) {
  const color = colorFor(c.processes);
  const rows = Object.entries(c.expected).map(([algorithm, expected]) => {
    const result = run(c.processes, algorithm);
    const actual = timelineText(result.segments).replace(/–/g, '-');
    const round = (v) => Math.round(v * 100) / 100;
    const avgMatch = ['turnaround', 'waiting', 'response'].every((k) => round(result.averages[k]) === expected.averages[k]);
    const match = actual === expected.timeline && avgMatch && result.violations.length === 0;
    return { algorithm, expected, result, match };
  });
  const srtf = run(c.processes, 'SRTF');
  return `
  <section class="student-case">
    <h3>${esc(c.name)}</h3>
    <p><strong>What it checks.</strong> ${esc(c.checks)}</p>
    ${inputTable(c.processes)}
    <p><strong>Expected behavior (worked out by hand).</strong></p>
    <ul>${c.reasoning.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    <table class="expected">
      <thead><tr><th class="l">Algorithm</th><th class="l">Expected timeline</th><th>Avg. TAT</th><th>Avg. WT</th><th>Avg. RT</th><th>Simulator</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td class="l">${SHORT_NAMES[r.algorithm]}</td><td class="l mono">${esc(r.expected.timeline.replace(/(\d)-(\d)/g, '$1–$2'))}</td><td>${fmt(r.expected.averages.turnaround)}</td><td>${fmt(r.expected.averages.waiting)}</td><td>${fmt(r.expected.averages.response)}</td><td class="${r.match ? 'ok' : 'bad'}">${r.match ? '✓ matches' : '✗ differs'}</td></tr>`).join('')}</tbody>
    </table>
    <p class="caption">Simulator output for SRTF on this workload:</p>
    ${gantt(srtf.segments, color)}
    ${resultTable(srtf)}
  </section>`;
}

// ------------------------------------------------------------- test runs

// A cached result is only reused if every count is a real number.
const validMutationResults = (results) =>
  Array.isArray(results) && results.length > 0 &&
  results.every((m) => Number.isInteger(m.failed) && Number.isInteger(m.total));

function mutationResults(fast) {
  if (fast && fs.existsSync(MUTATION_CACHE)) {
    const cached = JSON.parse(fs.readFileSync(MUTATION_CACHE, 'utf8'));
    if (validMutationResults(cached)) return cached;
    console.log('Cached mutation results are incomplete; running the mutation test again.');
  }
  const out = spawnSync(process.execPath, [path.join(ROOT, 'scripts/mutate.js'), '--json'], { cwd: ROOT, encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`mutation test failed:\n${out.stderr}`);
  const results = JSON.parse(out.stdout);
  if (!validMutationResults(results)) throw new Error(`mutation test returned unreadable counts:\n${out.stdout}`);
  fs.writeFileSync(MUTATION_CACHE, out.stdout);
  return results;
}

// --------------------------------------------------------------- analysis

function quantumTable(rows) {
  const results = [1, 2, 4].map((q) => ({ q, r: run(rows, 'RR', q) }));
  const body = results.map(({ q, r }) =>
    `<tr><td class="l">q = ${q}</td><td>${fmt(r.averages.turnaround)}</td><td>${fmt(r.averages.waiting)}</td><td>${fmt(r.averages.response)}</td><td>${r.segments.filter((s) => s.type === 'run').length}</td><td class="l mono">${esc(timelineText(r.segments))}</td></tr>`).join('');
  return { results, html: `<table><thead><tr><th class="l">Quantum</th><th>Avg. TAT</th><th>Avg. WT</th><th>Avg. RT</th><th>Dispatches</th><th class="l">Timeline</th></tr></thead><tbody>${body}</tbody></table>` };
}

function perProcessQuantumTable(rows) {
  const qs = [1, 2, 4];
  const results = qs.map((q) => run(rows, 'RR', q));
  const body = rows.map(([id], i) =>
    `<tr><td class="l">${id}</td>${results.map((r) => `<td>${r.rows[i].waiting}</td>`).join('')}${results.map((r) => `<td>${r.rows[i].response}</td>`).join('')}${results.map((r) => `<td>${r.rows[i].completion}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr><th class="l" rowspan="2">Process</th><th colspan="3">Waiting</th><th colspan="3">Response</th><th colspan="3">Completion</th></tr>
    <tr>${[0, 1, 2].map(() => qs.map((q) => `<th>q=${q}</th>`).join('')).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

function algorithmAveragesTable(rows) {
  const results = Object.keys(SHORT_NAMES).map((a) => ({ a, r: run(rows, a) }));
  const best = (k) => Math.min(...results.map(({ r }) => r.averages[k]));
  const cell = (r, k) => `<td class="${Math.abs(r.averages[k] - best(k)) < 1e-9 ? 'best' : ''}">${fmt(r.averages[k])}</td>`;
  return `<table><thead><tr><th class="l">Algorithm</th><th>Avg. TAT</th><th>Avg. WT</th><th>Avg. RT</th></tr></thead><tbody>${
    results.map(({ a, r }) => `<tr><td class="l">${SHORT_NAMES[a]}</td>${cell(r, 'turnaround')}${cell(r, 'waiting')}${cell(r, 'response')}</tr>`).join('')
  }</tbody></table>`;
}

// ------------------------------------------------------------------- page

function build() {
  const fast = process.argv.includes('--fast');
  const tests = runTests(ROOT);
  const mutations = mutationResults(fast);
  const killed = mutations.filter((m) => m.failed > 0).length;

  const examples = HAND.map((h, i) => exampleSection(h, i + 1)).join('');
  const comparisons = HAND.map(compareExample);
  const allMatch = comparisons.every((c) => c.differences.length === 0 && c.arithmetic.length === 0);

  // Data used in the analysis answers.
  const qA = quantumTable(WORKLOADS.A);
  const qB = quantumTable(WORKLOADS.B);
  const sjfB = timelineText(run(WORKLOADS.B, 'SJF').segments);
  const srtfB = timelineText(run(WORKLOADS.B, 'SRTF').segments);
  if (sjfB !== srtfB) throw new Error('Expected SJF and SRTF to coincide on Workload B');
  const STARVE = [['L', 0, 4], ['S1', 0, 2], ['S2', 1, 2], ['S3', 3, 2], ['S4', 5, 2], ['S5', 7, 2], ['S6', 9, 2]];
  const starve = Object.fromEntries(['SJF', 'SRTF', 'FCFS', 'RR'].map((a) => [a, run(STARVE, a)]));
  const rrSource = fs.readFileSync(path.join(ROOT, 'src/scheduler.js'), 'utf8');
  const rrStart = rrSource.indexOf('      time += run;');
  const rrExcerpt = rrSource.slice(rrStart, rrSource.indexOf('      } else {', rrStart))
    .split('\n').filter((line) => !line.includes('log.push')).join('\n')
    .replace(/^ {6}/gm, '') + '}';

  const summaryRows = HAND.map((h, i) => {
    const c = comparisons[i];
    return `<tr><td class="l">${h.workload}</td><td class="l">${SHORT_NAMES[h.algorithm]}</td><td>${fmt(h.averages[0])} / ${fmt(h.averages[1])} / ${fmt(h.averages[2])}</td><td>${c.simAverages.map(fmt).join(' / ')}</td><td>${c.handTimeline === c.simTimeline ? 'identical' : 'different'}</td><td class="${c.differences.length ? 'bad' : 'ok'}">${c.values - c.differences.length} / ${c.values}</td></tr>`;
  }).join('');

  const mutationRows = mutations.map((m) =>
    `<tr><td class="l">${esc(m.name)}</td><td>${m.failed} of ${m.total}</td><td class="${m.failed > 0 ? 'ok' : 'bad'}">${m.failed > 0 ? 'detected' : 'not detected'}</td></tr>`).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CSE513 Assignment 1 Report</title>
<style>
  @page { size: A4; margin: 15mm 15mm 16mm 15mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 9.6pt; line-height: 1.45; color: #1d2330; margin: 0; }
  h1 { font-size: 19pt; margin: 0 0 6pt; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; padding-bottom: 2pt; border-bottom: 1.2pt solid #2456c7; break-after: avoid; }
  h2.page { break-before: page; margin-top: 0; }
  h3 { font-size: 11.5pt; margin: 12pt 0 4pt; break-after: avoid; color: #1b3f8f; }
  h4 { font-size: 9.8pt; margin: 8pt 0 3pt; break-after: avoid; }
  p { margin: 3pt 0 6pt; }
  a { color: #2456c7; }
  ul, ol { margin: 3pt 0 6pt; padding-left: 16pt; }
  li { margin: 1.5pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 4pt 0 8pt; font-size: 8.6pt; break-inside: avoid; }
  th, td { border: 0.6pt solid #cfd5df; padding: 2pt 4.5pt; text-align: right; vertical-align: top; }
  th { background: #eef1f6; font-weight: 600; }
  .l { text-align: left; }
  tfoot td { font-weight: 600; background: #f7f8fa; }
  table.input { width: auto; min-width: 45%; }
  .sim { background: #f0f5ff; }
  th.sim { background: #e1eaff; }
  td.best { background: #dfe9ff; font-weight: 600; }
  .ok { color: #1d6b35; font-weight: 600; }
  td.ok, td.bad { white-space: nowrap; }
  .bad { color: #a11a1a; font-weight: 600; }
  .verdict { padding: 4pt 8pt; border-radius: 3pt; background: #e8f5ec; }
  .verdict.bad { background: #fdecec; }
  .mono, code, pre { font-family: Menlo, Consolas, monospace; font-size: 8.2pt; }
  td.mono { font-size: 7.6pt; }
  pre { background: #f5f6f8; border: 0.6pt solid #dde1e8; padding: 6pt 8pt; white-space: pre-wrap; break-inside: avoid; margin: 4pt 0 8pt; }
  .equations { list-style: none; padding-left: 0; }
  .example { break-before: page; }
  .student-case { break-inside: avoid-page; }
  .caption { font-size: 8.6pt; color: #5b6475; margin-bottom: 0; }
  .note { font-size: 8.6pt; color: #5b6475; }
  .gantt { margin: 4pt 8pt 8pt; break-inside: avoid; }
  .gantt .track { position: relative; height: 25pt; }
  .gantt .seg { position: absolute; top: 0; bottom: 0; border: 0.6pt solid #fff; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 8pt; font-weight: 600; line-height: 1.1; overflow: hidden; }
  .gantt .seg small { font-size: 5.8pt; font-weight: 400; }
  .gantt .seg.idle { background: repeating-linear-gradient(45deg, #eceef2, #eceef2 3pt, #d3d7df 3pt, #d3d7df 6pt); color: #5b6475; font-weight: 400; }
  .gantt .seg.cont { border-left: 2pt solid #1d2330; }
  .gantt .axis { position: relative; height: 11pt; font-size: 7.4pt; color: #5b6475; }
  .gantt .axis span { position: absolute; top: 1pt; transform: translateX(-50%); }
  .toc { columns: 2; font-size: 9pt; margin: 4pt 0 0; }
  .qa h3 { margin-top: 14pt; }
</style>
</head>
<body>

<h1>CSE513 Assignment 1: CPU Scheduling Simulator</h1>

<p><strong>Contents.</strong></p>
<ol class="toc">
  <li>Overview</li>
  <li>Implementation</li>
  <li>Worked examples (Workloads A and B)</li>
  <li>Discrepancies and how they were resolved</li>
  <li>Additional test cases</li>
  <li>Verification of the required properties</li>
  <li>Analysis</li>
  <li>AI assistance</li>
</ol>

<h2>1. Overview</h2>
<p>The simulator is a static website (HTML, CSS and plain JavaScript, no backend) that schedules a user-defined set of processes on one CPU with FCFS, non-preemptive SJF, preemptive SRTF and Round Robin. The user can add, edit and remove processes, choose the algorithm and the RR quantum, load Workload A or B, and run the simulation. Each run shows:</p>
<ul>
  <li>a labeled Gantt chart with idle intervals and a time label at every boundary; in RR every quantum is a separate block labeled “slice <em>n</em>”, and consecutive slices of the same process are separated by a dark divider;</li>
  <li>a results table with arrival time, CPU burst, first start, completion, turnaround, waiting and response time, and the three averages;</li>
  <li>the result of an automatic check of the five model properties (Section 6);</li>
  <li>a step-by-step decision log explaining why each process was chosen;</li>
  <li>optionally, a side-by-side comparison of all four algorithms on the same input.</li>
</ul>
<p>Invalid input is rejected before scheduling, with one message per problem and the row it concerns: missing or duplicate process IDs, arrival times that are negative or not whole numbers, CPU bursts below 1, and a quantum below 1 or not a whole number.</p>
<p>The simulator can be run locally by opening <code>index.html</code> in a browser; the automated tests run with <code>npm test</code> (Node.js 18 or newer, no other dependencies). Details are in the README.</p>

<h2>2. Implementation</h2>
<p>All scheduling logic is in <code>src/scheduler.js</code>, which has no dependency on the web page. The website (<code>app.js</code>) and the tests use the same file. The core exposes three functions: <code>validate</code> (input checking), <code>simulate</code> (runs one algorithm and returns the timeline segments, the per-process metrics, the decision log and any property violations) and <code>verifySchedule</code> (checks a schedule against the model, independent of the algorithm that produced it).</p>
<p>A schedule is a list of segments <code>{type, id, start, end}</code>, where <code>type</code> is <code>run</code> or <code>idle</code> and the interval is half-open: a process running from 2 to 5 receives 3 units. Metrics are computed from the segments: the first segment of a process gives its first start time and the last gives its completion time.</p>
<p><strong>Tie-breaking.</strong> One comparison function is used by every algorithm: earlier arrival time first, then earlier position in the input list. The position is stored when the input is validated, so it never depends on the process ID.</p>
<p><strong>FCFS and SJF</strong> share one non-preemptive loop. Whenever the CPU is free, the ready set is every process that has arrived and not finished. If it is empty, an idle segment is added up to the next arrival. Otherwise the process with the smallest key (arrival time for FCFS, CPU burst for SJF) is chosen, ties are broken as above, and it runs to completion.</p>
<p><strong>SRTF</strong> is event-driven. A decision can only change at an arrival or a completion, so the running process is advanced to whichever comes first. At each decision point the ready process with the smallest remaining time is found; it replaces the running process only if its remaining time is strictly smaller. When the running process continues past an arrival, its segment is extended instead of being split, so the Gantt chart shows a preemption only where one actually happens.</p>
<p><strong>Round Robin</strong> keeps a FIFO queue and a list of processes that have not arrived yet, sorted by arrival time and input order. After each slice the code first admits every process that arrived during the slice or exactly at its end, and only then re-enqueues the unfinished process. This order implements the assignment's boundary rule:</p>
<pre>${esc(rrExcerpt)}</pre>
<p>Each RR slice is stored as its own segment with a slice number, which is how consecutive slices of the same process remain distinguishable in the chart.</p>

<h2>3. Worked examples (Workloads A and B)</h2>
<p>Each example shows the input data, the hand calculation (decision trace, timeline and metric arithmetic), the simulator output and a value-by-value comparison. The hand calculations were completed before the student saw any simulator output for these workloads. The simulator values in this report are not typed in: the report is generated by <code>report/build-report.js</code>, which runs <code>src/scheduler.js</code> on each workload and compares its output with the hand values automatically. Quantum 2 is used for RR. ST = first start, CT = completion, TAT = turnaround, WT = waiting, RT = response.</p>
<table class="input">
  <thead><tr><th class="l">Workload A</th><th>Arrival</th><th>Burst</th><th class="l">Workload B</th><th>Arrival</th><th>Burst</th></tr></thead>
  <tbody>${WORKLOADS.A.map((a, i) => { const b = WORKLOADS.B[i]; return `<tr><td class="l">${a[0]}</td><td>${a[1]}</td><td>${a[2]}</td><td class="l">${b[0]}</td><td>${b[1]}</td><td>${b[2]}</td></tr>`; }).join('')}</tbody>
</table>
${examples}

<h2 class="page">4. Discrepancies and how they were resolved</h2>
<table>
  <thead><tr><th class="l">Workload</th><th class="l">Algorithm</th><th>Hand averages (TAT / WT / RT)</th><th>Simulator averages</th><th>Timeline</th><th>Matching values</th></tr></thead>
  <tbody>${summaryRows}</tbody>
</table>
<p>${allMatch
    ? 'No discrepancies were found: all eight timelines are identical and every value agrees. The expected values for Workloads A and B in the automated tests were also derived by hand separately, and they agree with both.'
    : '<span class="bad">Some values differ; see the examples above.</span>'}</p>
<p>Because the outputs agree, this section records the decision points where a discrepancy was most likely and how each was settled by the rules in the assignment:</p>
<ul>
  <li><strong>Workload A, RR at t=2 and t=4.</strong> P3 arrives exactly when P1's first quantum ends, and P4 arrives exactly when P2's first quantum ends. The rule says that processes arriving at the boundary are enqueued <em>before</em> the preempted process. Reading the rule the other way gives a different schedule, traced by hand below:
    <table>
      <thead><tr><th class="l">Queue order at the boundary</th><th class="l">Timeline</th><th>Avg. TAT</th><th>Avg. WT</th><th>Avg. RT</th></tr></thead>
      <tbody>
        <tr><td class="l">Arrivals first (assignment rule)</td><td class="l mono">P1 0–2 | P2 2–4 | P3 4–6 | P1 6–8 | P4 8–9 | P2 9–11 | P1 11–13 | P1 13–15</td><td>8.50</td><td>4.75</td><td>1.75</td></tr>
        <tr><td class="l">Preempted process first (wrong)</td><td class="l mono">P1 0–2 | P2 2–4 | P1 4–6 | P3 6–8 | P2 8–10 | P4 10–11 | P1 11–13 | P1 13–15</td><td>9.25</td><td>5.50</td><td>2.75</td></tr>
      </tbody>
    </table>
    The wrong schedule still satisfies all five properties of Section 6, so the property check alone would not reveal it. It is only exposed by comparison with a correct expected result, which is why the hand calculations are needed.</li>
  <li><strong>Workload B, FCFS and RR at t=2.</strong> P1 and P2 arrive together. Arrival time does not separate them, so input order puts P1 first. In SJF and SRTF the burst decides instead, and P2 runs first.</li>
  <li><strong>Workload B, SRTF at t=9.</strong> P4 arrives needing 1 unit while P3 also has 1 unit left. The rule allows preemption only for a strictly shorter remaining time, so P3 continues. Preempting here would give P3 8–9 | P4 9–10 | P3 10–11: average turnaround and waiting would stay the same, but average response time would drop from 0.50 to 0.25, so this rule is visible in the results.</li>
</ul>

<h2 class="page">5. Additional test cases</h2>
<p>Three further workloads were designed to exercise behavior that Workloads A and B cover only partly. The expected results were calculated by hand first and are also encoded as automated tests in <code>tests/student-cases.data.js</code>, so the comparison does not rely on screenshots. Every expected timeline and average below was checked against the simulator when this report was generated.</p>
${STUDENT_CASES.map(studentCaseSection).join('')}

<h2 class="page">6. Verification of the required properties</h2>
<p>The function <code>verifySchedule</code> checks every schedule the website produces, and the result is shown under the results table. It checks the properties directly on the timeline segments, without knowing which algorithm produced them:</p>
<table>
  <thead><tr><th class="l">Property</th><th class="l">How it is checked</th></tr></thead>
  <tbody>
    <tr><td class="l">Every process receives exactly its CPU burst</td><td class="l">The lengths of all run segments of a process add up to its burst.</td></tr>
    <tr><td class="l">No process runs before its arrival</td><td class="l">No run segment of a process starts before its arrival time.</td></tr>
    <tr><td class="l">Processes do not overlap on the single CPU</td><td class="l">Segments are non-empty and each starts no earlier than the previous one ends.</td></tr>
    <tr><td class="l">Waiting and response times are nonnegative</td><td class="l">Completion − arrival − burst ≥ 0 and first start − arrival ≥ 0.</td></tr>
    <tr><td class="l">The CPU is never idle while a process is ready</td><td class="l">For every idle period (idle segment or gap), no process has arrived before it ends while still having work left.</td></tr>
  </tbody>
</table>
<p>The checker is itself tested: six deliberately broken schedules (too little CPU time, too much, running before arrival, overlap, idling while a process waits, a late start) are each rejected with the right message.</p>
<p><strong>Large-scale checks.</strong> The property tests generate 3,000 random workloads per algorithm (1–7 processes, arrivals 0–12, bursts 1–8, quantum 1–4; small ranges make simultaneous arrivals and ties frequent). Each schedule is compared unit by unit with a second, independent implementation in <code>tests/reference.js</code>, which advances time one unit at a time instead of jumping between events. For RR the times at which each slice starts are compared as well, which checks the quantum boundaries. Separately, the five properties are asserted on 3,000 workloads × 4 algorithms × quanta 1, 2 and 4 (36,000 schedules).</p>
<p><strong>Do the tests detect errors?</strong> A passing test suite is only meaningful if it fails for wrong code. <code>scripts/mutate.js</code> injects one plausible bug at a time into a copy of the scheduler and runs all tests against it:</p>
<table>
  <thead><tr><th class="l">Injected bug</th><th>Failing tests</th><th>Result</th></tr></thead>
  <tbody>${mutationRows}</tbody>
</table>
<p>${killed} of ${mutations.length} bugs are detected. The tie-breaking bug makes the RR loop non-terminating for some inputs, so the whole property-test file times out (it then counts as one failed file, so the total test count is lower).</p>
<p>The one undetected change (<code>&lt;</code> to <code>&lt;=</code> in the SRTF preemption test) turned out to be <em>equivalent</em>: it can never change a schedule. When the running process R was selected, every ready process X either had a strictly larger remaining time or an equal one with a later position in the tie order (otherwise X would have been selected). R's remaining time only decreases while it runs, and any later arrival has a later arrival time. So no waiting process can ever tie with R and also come before R in the tie order. The tie-breaking rule therefore already implies “keep the running process on a tie”, and no test can tell the two versions apart.</p>
<p>Current test suite result: <strong>${tests.pass} of ${tests.tests} tests pass</strong>${tests.fail ? ` <span class="bad">(${tests.fail} failing)</span>` : ''}.</p>

<h2 class="page">7. Analysis</h2>
<div class="qa">
<h3>Q1. Workload A: lowest average waiting and response time</h3>
${algorithmAveragesTable(WORKLOADS.A)}
<p><strong>SRTF gives both the lowest average waiting time (2.50) and the lowest average response time (0.00)</strong>, and also the lowest average turnaround (6.25).</p>
<p>The decisions behind this: at t=1 P2 (4) preempts P1 (7 left), at t=2 P3 (2) preempts P2 (3 left), and at t=4 P4 (1) is the shortest job and starts immediately. Every process gets the CPU at the exact moment it arrives, so every response time is 0. The short jobs then finish quickly, and almost all waiting is moved onto the longest job: P1 waits 7 units, P2 waits 3, and P3 and P4 wait 0. Running the shortest remaining work first minimizes the total waiting, because each unit of a long job executed early delays every job behind it.</p>
<p>The other algorithms are worse for specific reasons. FCFS suffers from the convoy effect: the 8-unit P1 arrives first and every other process waits behind it (average WT 6.75). Non-preemptive SJF cannot help at t=0 because only P1 has arrived; its gain comes only from reordering the jobs at t=8 (P4, P3, P2), giving 5.25. RR gives reasonable response (1.75) because nobody waits more than a few quanta for a first turn, but its waiting time (4.75) is higher than SRTF's because short jobs share the CPU with P1 and P2 instead of finishing first.</p>

<h3>Q2. Round robin with quantum 1, 2 and 4</h3>
<p><strong>Workload A</strong></p>
${qA.html}
${perProcessQuantumTable(WORKLOADS.A)}
<p><strong>Workload B</strong></p>
${qB.html}
<p>Response time improves as the quantum shrinks (Workload A: 3.75, 1.75 and 0.75 for q = 4, 2 and 1), because a newly arrived process waits for fewer and shorter slices before its first turn. Turnaround and waiting do not improve in the same way. In Workload A, q=1 and q=2 give exactly the same average waiting time (4.75); the smaller quantum only moves waiting between processes. P4 waits less (2 instead of 4), but P3 waits more (4 instead of 2). With q=2, P3 finishes in a single slice (4–6). With q=1 it gets one unit at 3–4 and then has to wait for P2, P1 and P4 again before finishing at 8. Splitting a short job into several slices can delay its completion.</p>
<p>A smaller quantum also means more dispatches: 15, 8 and 5 for q = 1, 2 and 4 in Workload A. This model assumes context switches take zero time. In a real system each switch costs time (saving and restoring state, cache and TLB effects), so the extra switches would increase turnaround and waiting. At the other extreme, a quantum at least as long as every burst turns RR into FCFS: in Workload B, q=4 produces exactly the FCFS schedule. A larger quantum lowers overhead but brings back the convoy effect (A, q=4: average WT 5.50). The quantum is therefore a trade-off between responsiveness and overhead, not a value that should simply be minimized.</p>

<h3>Q3. When do SJF and SRTF produce the same schedule?</h3>
<p>SRTF differs from SJF only when it preempts, and it preempts only when a process arrives whose burst is strictly shorter than the remaining time of the running process. <strong>If that never happens, the two schedules are identical.</strong> Without preemption, every waiting process still has its full burst left, so “shortest remaining time” and “shortest burst” select the same process whenever the CPU becomes free, with the same tie-breaking. Typical cases are: all processes arrive at the same time; processes arrive only while the CPU is idle; or every arriving process is at least as long as the remaining time of the running one.</p>
<p>Example: Workload B. The only arrival during a run is P4 at t=9, which needs 1 unit while P3 has exactly 1 left. Equal is not strictly shorter, so there is no preemption, and both algorithms give <span class="mono">${esc(sjfB)}</span> with averages 2.25 / 0.50 / 0.50. If P3 had a burst of 3 instead, it would still have 2 units left at t=9; P4's 1 unit would then be strictly shorter, SRTF would preempt P3, and the two schedules would differ. Test 2 in Section 5 is another example: the only arrival after t=0 (D at t=1) happens exactly when the CPU becomes free, so SRTF never has a chance to preempt and SJF and SRTF coincide.</p>

<h3>Q4. Why must a real operating system estimate future CPU bursts?</h3>
<p>The simulator is given every CPU burst as input, so it can compare exact lengths. A real operating system does not know how long a process will compute before its next I/O request or exit. That depends on the program's future behavior: its input data, the branches it takes and the user's actions. In general it cannot be determined in advance without running the program. Real processes also alternate many CPU bursts with I/O, while this model has one burst per process.</p>
<p>SJF-like schedulers therefore predict the next burst from past ones, usually with an exponential average τ<sub>n+1</sub> = α·t<sub>n</sub> + (1 − α)·τ<sub>n</sub>, where t<sub>n</sub> is the length of the burst just measured and 0 ≤ α ≤ 1 controls how strongly recent behavior counts. For example, with α = 0.5, an initial guess τ<sub>0</sub> = 10 and measured bursts 6, 4, 6, 4, the predictions are 8, 6, 6, 5. Predictions can be wrong, so a real SJF or SRTF only approximates the optimal schedule that this simulator computes exactly. General-purpose schedulers such as Linux CFS, and EEVDF since kernel 6.6, avoid burst prediction altogether and use fairness based on CPU time already received.</p>

<h3>Q5. Can starvation occur under SJF or SRTF?</h3>
<p><strong>Yes.</strong> Both always prefer the shortest job. If new jobs that are shorter than a long waiting job keep arriving, so that a shorter one is ready at every decision point, the long job is never selected. The workload below shows the effect with the simulator: a 4-unit job L arrives at t=0 together with a stream of 2-unit jobs.</p>
${inputTable(STARVE)}
<table>
  <thead><tr><th class="l">Algorithm</th><th class="l">Timeline</th><th>Waiting time of L</th></tr></thead>
  <tbody>${['SJF', 'SRTF', 'FCFS', 'RR'].map((a) => `<tr><td class="l">${SHORT_NAMES[a]}</td><td class="l mono">${esc(timelineText(starve[a].segments))}</td><td>${starve[a].rows[0].waiting}</td></tr>`).join('')}</tbody>
</table>
<p>Under SJF and SRTF, L waits ${starve.SJF.rows[0].waiting} units and runs only after the last short job, because at every decision point a 2-unit job is ready. If the stream never ended, L would never run. FCFS and RR do not have this problem: L waits ${starve.FCFS.rows[0].waiting} and ${starve.RR.rows[0].waiting} units.</p>
<p>The workloads in this assignment are finite. Every process arrives at a known time and the set of processes never grows, so once the last arrival has happened, the remaining jobs are simply run in some order and each one eventually completes. A long job can be delayed, but only by a bounded amount: at most the total work of the jobs that can overtake it. Starvation means <em>unbounded</em> waiting, which requires an unbounded stream of arrivals. That is realistic for an operating system that runs indefinitely, but impossible in a finite simulation. Real systems prevent it with aging, gradually raising the priority of a process the longer it waits.</p>

<h3>Q6. An implementation mistake and how a test exposed it</h3>
<p>The most error-prone line in the simulator is the RR boundary rule. The natural way to write the loop is “put the preempted process back, then add new arrivals”, which is the wrong order. To check that the tests protect against this, the mistake was reproduced in a copy of the code.</p>
<p>The first attempt was itself wrong. It moved <em>all</em> arrival handling after the re-enqueue, which also delayed P2, a process that had arrived at t=1, <em>during</em> P1's slice. The simulator then printed <span class="mono">P1 0–2 | P1 2–4 | P2 4–6 | …</span> for Workload A. This contradicted the hand trace: P2 had been in the queue since t=1, so under either reading of the boundary rule it must run at t=2. The comparison showed that the rule separates two cases: processes arriving <em>during</em> a slice are already in the queue, and only processes arriving <em>exactly at</em> the boundary need special ordering. After this was corrected, the boundary-only version produced the 9.25 / 5.50 / 2.75 schedule shown in Section 4, matching a hand trace of that reading.</p>
<p>The automated tests catch the real version of this mistake. Swapping the two statements in the RR loop (the first row of the mutation table) makes ${mutations[0].failed} of ${mutations[0].total} tests fail, including the hand-calculated Workload A and B RR tests, the dedicated boundary test (P1 with burst 4 and P2 arriving exactly at the first boundary, t=2) and the comparison with the reference implementation on random workloads.</p>
<p>Two smaller mistakes were found by inspecting the output rather than by automated tests. The decision log said “starts” for a process that was resuming after preemption. In the website, the first time label of the Gantt chart was clipped, and averages were printed inconsistently (“1” next to “0.50”). All three were corrected.</p>
</div>

<h2 class="page">8. AI assistance</h2>
<p><strong>Tools and purposes.</strong> Claude (model Claude Opus 5.5) was used through Claude Code in the Claude desktop app. It was used to implement the scheduling core, the web interface, the automated tests and the mutation-test script; to write the README; to explain and check the interpretation of the scheduling rules; and to draft the text of this report and the script that generates it from the simulator output.</p>
<p><strong>What was done without AI-generated answers.</strong> The hand calculations for Workloads A and B (Section 3) were done by the student before the simulator output for those workloads was seen. By agreement, the assistant did not reveal its own expected values or the simulator output for these workloads until the hand calculations were finished.</p>
<p><strong>How the generated code and explanations were checked.</strong></p>
<ul>
  <li>The hand calculations were compared value by value with the simulator for all eight examples; this comparison is automated in the report generator.</li>
  <li>The scheduler was compared with an independently written tick-by-tick reference implementation on 12,000 random workloads.</li>
  <li>Mutation testing checked that the tests actually fail for wrong code (Section 6). One surviving mutant was analyzed and shown to be equivalent rather than ignored.</li>
  <li>Expected results for the additional test cases were worked out by hand before running them.</li>
  <li>The website was tested manually in a browser at desktop and phone widths, in light and dark mode, including invalid input.</li>
  <li>The code was read and traced with the decision log, so that the scheduling decisions can be explained for an unfamiliar workload.</li>
</ul>
<p><strong>Suggestions corrected or rejected.</strong></p>
<ul>
  <li><strong>Mutation-test script reporting NaN (found by the student).</strong> When the student ran <code>node scripts/mutate.js</code> independently, it reported all seven mutants as NaN/NaN instead of failing-test counts. The cause was in the AI-generated code that read the test results: it only recognized Node's “spec” output format (summary lines such as <code>ℹ tests 53</code>), but depending on the Node version and on whether the output goes to a terminal, Node prints TAP instead (<code># tests 53</code>). The assistant's environment happened to produce the spec format, so the problem had not shown up there. The fix runs the tests with an explicit TAP reporter in a shared helper (<code>scripts/run-tests.js</code>) used by both the mutation script and the report generator. The helper stops with an error instead of printing NaN if the summary cannot be read, and the report generator refuses to reuse cached results with missing counts. The corrected script was run again with the output piped and with the spec format forced through the environment. Both runs gave exactly the counts shown in Section 6, so the reported results were unaffected, but the command itself had not been usable as delivered.</li>
  <li>The assistant's first version of the RR boundary-rule mutation was wrong (Q6): it also reordered processes that arrived during the slice. This was found because the output contradicted the hand trace, and it was corrected before the result was used in this report.</li>
  <li>The assistant's first decision-log text reported a resumed process as “starts”; the wording was corrected.</li>
  <li>Display issues introduced in the first version of the interface (a clipped time label and inconsistent number formatting) were found during browser testing and fixed.</li>
</ul>
<p class="note">This simulator models scheduling policies. It does not reproduce Ubuntu's actual scheduler.</p>

</body>
</html>`;

  fs.writeFileSync(OUT_HTML, html);
  console.log(`Tests: ${tests.pass}/${tests.tests} pass. Mutants detected: ${killed}/${mutations.length}. Hand vs simulator: ${allMatch ? 'all match' : 'DIFFERENCES'}.`);
  console.log(`Wrote ${path.relative(ROOT, OUT_HTML)}`);

  if (!fs.existsSync(CHROME)) {
    console.log('Google Chrome not found; open report.html and print it to PDF manually.');
    return;
  }
  const pdf = spawnSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw',
    `--print-to-pdf=${OUT_PDF}`, pathToFileURL(OUT_HTML).href,
  ], { encoding: 'utf8' });
  if (pdf.status !== 0 || !fs.existsSync(OUT_PDF)) throw new Error(`PDF export failed:\n${pdf.stderr}`);
  console.log(`Wrote ${path.relative(ROOT, OUT_PDF)}`);
}

build();
