// Small helpers shared by the test files.

// Builds processes from compact rows: [['P1', 0, 8], ['P2', 1, 4], ...]
function workload(rows) {
  return rows.map(([id, arrival, burst]) => ({ id, arrival, burst }));
}

// Renders a schedule as "P1 0-2 | idle 2-3 | ..." for readable assertions.
function timeline(result) {
  return result.segments
    .map((s) => `${s.type === 'idle' ? 'idle' : s.id} ${s.start}-${s.end}`)
    .join(' | ');
}

// Expands segments to one entry per time unit (process ID or null for idle).
function toTicks(segments) {
  const ticks = [];
  for (const s of segments) {
    while (ticks.length < s.start) ticks.push(null);
    for (let t = s.start; t < s.end; t++) ticks[t] = s.type === 'idle' ? null : s.id;
  }
  return ticks;
}

module.exports = { workload, timeline, toTicks };
