/*
 * User interface: process table, run controls, Gantt chart, results table,
 * correctness checks and the decision log. All scheduling work is done by
 * src/scheduler.js; this file only collects input and displays results.
 */
(function () {
  'use strict';

  const { ALGORITHMS, simulate } = window.Scheduler;

  const WORKLOADS = {
    A: [['P1', 0, 8], ['P2', 1, 4], ['P3', 2, 2], ['P4', 4, 1]],
    B: [['P1', 2, 3], ['P2', 2, 1], ['P3', 8, 2], ['P4', 9, 1]],
  };

  // Dark enough for white labels in both color schemes.
  const COLORS = ['#2456c7', '#c2410c', '#15803d', '#7e22ce', '#b91c1c', '#0e7490', '#8a5a00', '#be185d'];

  const PROPERTIES = [
    'Every process receives exactly its CPU burst.',
    'No process runs before its arrival.',
    'Processes do not overlap on the single CPU.',
    'Waiting and response times are nonnegative.',
    'The CPU is never idle while a process is ready.',
  ];

  const $ = (id) => document.getElementById(id);

  // Values are kept as typed (strings) and validated by Scheduler.validate on run.
  let processes = [];
  let lastResult = null;

  // Small DOM builder. Text is always inserted as text, never as HTML.
  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'style') Object.assign(node.style, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
      if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : String(child));
    }
    return node;
  }

  // Averages always use two decimals so a column lines up (1.00 next to 0.75).
  const format = (value) => value.toFixed(2);

  const describeSegments = (segments) =>
    segments.map((s) => `${s.type === 'idle' ? 'idle' : s.id} ${s.start}–${s.end}`).join(' | ');

  const colorMap = (result) => new Map(result.processes.map((p, i) => [p.id, COLORS[i % COLORS.length]]));

  const algorithmName = (result) =>
    ALGORITHMS[result.algorithm] + (result.algorithm === 'RR' ? `, quantum ${result.quantum}` : '');

  // ------------------------------------------------------------ process table

  function renderProcesses() {
    const input = (p, key, label) =>
      h('input', {
        type: 'text',
        value: String(p[key]),
        inputmode: key === 'id' ? 'text' : 'numeric',
        'aria-label': label,
        oninput: (event) => { p[key] = event.target.value; },
      });

    $('process-rows').replaceChildren(...processes.map((p, i) =>
      h('tr', {},
        h('td', {}, i + 1),
        h('td', {}, input(p, 'id', `Process ID, row ${i + 1}`)),
        h('td', {}, input(p, 'arrival', `Arrival time, row ${i + 1}`)),
        h('td', {}, input(p, 'burst', `CPU burst, row ${i + 1}`)),
        h('td', {}, h('button', {
          type: 'button',
          class: 'remove',
          'aria-label': `Remove row ${i + 1}`,
          title: 'Remove this process',
          onclick: () => { processes.splice(i, 1); renderProcesses(); markStale(); },
        }, '✕')),
      )));
    $('empty-hint').hidden = processes.length > 0;
  }

  function loadWorkload(name) {
    processes = WORKLOADS[name].map(([id, arrival, burst]) => ({ id, arrival: String(arrival), burst: String(burst) }));
    $('quantum').value = '2';
    renderProcesses();
    showErrors([]);
    markStale();
  }

  function addProcess() {
    const used = new Set(processes.map((p) => String(p.id).trim()));
    let n = processes.length + 1;
    while (used.has(`P${n}`)) n++;
    processes.push({ id: `P${n}`, arrival: '0', burst: '1' });
    renderProcesses();
    markStale();
    $('process-rows').lastElementChild.querySelector('input').focus();
  }

  // ------------------------------------------------------------------ running

  function settings() {
    return { algorithm: $('algorithm').value, quantum: $('quantum').value };
  }

  function showErrors(errors) {
    const box = $('errors');
    box.hidden = errors.length === 0;
    box.replaceChildren(...(errors.length === 0 ? [] : [
      h('strong', {}, 'The input cannot be simulated:'),
      h('ul', {}, errors.map((e) => h('li', {}, e))),
    ]));
  }

  // Returns the simulation result, or null after showing the validation errors.
  function trySimulate(algorithm, quantum) {
    try {
      return simulate(processes, algorithm, { quantum });
    } catch (error) {
      if (!error.errors) throw error;
      showErrors(error.errors);
      return null;
    }
  }

  function runSelected() {
    const { algorithm, quantum } = settings();
    const result = trySimulate(algorithm, quantum);
    if (!result) return;
    showErrors([]);
    renderResult(result);
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function compareAll() {
    const { quantum } = settings();
    const results = [];
    for (const algorithm of Object.keys(ALGORITHMS)) {
      const result = trySimulate(algorithm, quantum);
      if (!result) return;
      results.push(result);
    }
    showErrors([]);
    renderComparison(results);
    $('comparison').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function markStale() {
    if (!$('results').hidden) $('stale').hidden = false;
    if (!$('comparison').hidden) $('stale-comparison').hidden = false;
  }

  // ------------------------------------------------------------------ results

  function renderResult(result) {
    lastResult = result;
    $('results').hidden = false;
    $('stale').hidden = true;

    const end = result.segments[result.segments.length - 1].end;
    $('run-summary').textContent = `${algorithmName(result)} · ${result.processes.length} process(es) · all work finishes at t=${end}`;

    const colorOf = colorMap(result);
    renderGantt(result, colorOf);
    $('timeline-text').textContent = `Timeline: ${describeSegments(result.segments)}`;

    $('result-rows').replaceChildren(...result.rows.map((r) =>
      h('tr', {},
        h('td', {}, h('span', { class: 'swatch', style: { color: colorOf.get(r.id) } }, '■ '), r.id),
        h('td', {}, r.arrival),
        h('td', {}, r.burst),
        h('td', {}, r.firstStart),
        h('td', {}, r.completion),
        h('td', {}, r.turnaround),
        h('td', {}, r.waiting),
        h('td', {}, r.response),
      )));
    $('result-averages').replaceChildren(h('tr', {},
      h('td', { colspan: '5' }, 'Average'),
      h('td', {}, format(result.averages.turnaround)),
      h('td', {}, format(result.averages.waiting)),
      h('td', {}, format(result.averages.response)),
    ));

    $('checks').replaceChildren(result.violations.length === 0
      ? h('div', { class: 'checks-ok' },
        h('strong', {}, '✓ All properties verified for this schedule:'),
        h('ul', {}, PROPERTIES.map((p) => h('li', {}, p))))
      : h('div', { class: 'checks-bad' },
        h('strong', {}, '✗ This schedule violates the model:'),
        h('ul', {}, result.violations.map((v) => h('li', {}, v)))));

    $('decision-log').replaceChildren(...result.log.map((entry) =>
      h('li', {}, h('span', { class: 'time' }, `t=${entry.time}`), entry.text)));
  }

  function renderGantt(result, colorOf) {
    const gantt = $('gantt');
    const { segments } = result;
    const end = segments[segments.length - 1].end;

    // Fit the chart to the available width, but keep every time unit readable.
    const available = Math.max(gantt.clientWidth - 24, 240);
    const unit = Math.min(80, Math.max(28, available / end));
    const px = (t) => `${t * unit}px`;

    const track = h('div', { class: 'gantt-track', style: { width: px(end) } });
    const boundaries = new Set([0]);
    segments.forEach((s, i) => {
      boundaries.add(s.start);
      boundaries.add(s.end);
      const previous = segments[i - 1];
      // Consecutive RR slices of one process get a visible divider at the quantum boundary.
      const continues = s.type === 'run' && previous && previous.type === 'run' &&
        previous.id === s.id && previous.end === s.start;
      const title = s.type === 'idle'
        ? `CPU idle from ${s.start} to ${s.end}`
        : `${s.id} runs from ${s.start} to ${s.end} (${s.end - s.start} unit(s))${s.slice ? `, slice ${s.slice}` : ''}`;
      track.append(h('div', {
        class: `gantt-seg ${s.type === 'idle' ? 'idle' : 'run'}${continues ? ' continues' : ''}`,
        title,
        style: {
          left: px(s.start),
          width: px(s.end - s.start),
          background: s.type === 'idle' ? '' : colorOf.get(s.id),
        },
      },
      h('span', {}, s.type === 'idle' ? 'idle' : s.id),
      s.slice ? h('small', {}, `slice ${s.slice}`) : null));
    });

    const axis = h('div', { class: 'gantt-axis', style: { width: px(end) } },
      [...boundaries].sort((a, b) => a - b).map((t) => h('span', { class: 'gantt-tick', style: { left: px(t) } }, t)));

    gantt.setAttribute('aria-label', `Gantt chart: ${describeSegments(segments)}`);
    gantt.replaceChildren(track, axis);
  }

  function renderComparison(results) {
    $('comparison').hidden = false;
    $('stale-comparison').hidden = true;

    const fields = ['turnaround', 'waiting', 'response'];
    const best = Object.fromEntries(fields.map((f) => [f, Math.min(...results.map((r) => r.averages[f]))]));
    const isBest = (value, field) => Math.abs(value - best[field]) < 1e-9;

    $('comparison-rows').replaceChildren(...results.map((result) =>
      h('tr', {},
        h('td', {}, algorithmName(result)),
        fields.map((f) => h('td', { class: isBest(result.averages[f], f) ? 'best' : '' }, format(result.averages[f]))),
        h('td', { class: 'schedule-cell' },
          describeSegments(result.segments), ' ',
          h('button', {
            type: 'button',
            class: 'link',
            onclick: () => { $('algorithm').value = result.algorithm; runSelected(); },
          }, 'Details')),
      )));
  }

  // --------------------------------------------------------------------- init

  for (const [key, name] of Object.entries(ALGORITHMS)) {
    $('algorithm').append(h('option', { value: key }, name));
  }

  $('sim-form').addEventListener('submit', (event) => {
    event.preventDefault();
    runSelected();
  });
  $('sim-form').addEventListener('input', markStale);
  $('compare').addEventListener('click', compareAll);
  $('add-process').addEventListener('click', addProcess);
  $('load-a').addEventListener('click', () => loadWorkload('A'));
  $('load-b').addEventListener('click', () => loadWorkload('B'));
  $('clear-all').addEventListener('click', () => {
    processes = [];
    renderProcesses();
    markStale();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (lastResult && !$('results').hidden) renderGantt(lastResult, colorMap(lastResult));
    }, 150);
  });

  loadWorkload('A');
})();
