# CPU Scheduling Simulator (CSE513 Assignment 1)

A browser-based simulator for four CPU scheduling policies on a single CPU:

- First-Come, First-Served (FCFS)
- Shortest Job First (SJF), non-preemptive
- Shortest Remaining Time First (SRTF), preemptive
- Round Robin (RR) with a configurable time quantum

For a list of processes (ID, arrival time, CPU burst) it draws a labeled Gantt
chart with idle intervals, a per-process results table (first start,
completion, turnaround, waiting and response time) and the averages. Every run
is also checked against the model properties, and a step-by-step decision log
explains why each process was chosen.

## Running locally

No installation, build step or server is required.

1. Download or clone this folder.
2. Open `index.html` in a modern browser (Chrome, Edge, Firefox or Safari).

Alternatively, serve the folder with any static server, for example:

```bash
python3 -m http.server 8000
```

and open <http://localhost:8000>.

## Running the tests

The tests need [Node.js](https://nodejs.org/) 18 or newer and no other
dependencies.

```bash
npm test
```

(or `node --test` without npm). The suite contains:

| File | What it checks |
|---|---|
| `tests/rules.test.js` | One small hand-checked workload per scheduling rule (tie-breaking, SRTF equal-remaining rule, RR queue order at quantum boundaries, idle intervals, metric formulas). |
| `tests/workloads.test.js` | Workloads A and B from the assignment with all four algorithms, against hand-calculated results. |
| `tests/student-cases.test.js` | The three additional test workloads (idle time, ties, SRTF preemption). |
| `tests/validation.test.js` | Rejection of invalid input with clear messages. |
| `tests/properties.test.js` | 3000 random workloads per algorithm compared with an independent tick-by-tick reference implementation (`tests/reference.js`), and the five required properties checked on every schedule. |

To check that the tests really detect wrong code, `node scripts/mutate.js`
injects seven plausible bugs into a temporary copy of the scheduler, one at a
time, and reports which ones make the test suite fail.

## Project structure

```
index.html          page structure
styles.css          layout and colors (light and dark mode)
app.js              user interface: form, Gantt chart, tables, comparison
src/scheduler.js    scheduling core: validation, the four policies, metrics, verifier
tests/              automated tests (Node's built-in test runner)
scripts/mutate.js   mutation test for the test suite
scripts/run-tests.js  runs the test suite and reads its results (used by the scripts above)
report/             report generator and the hand calculations it compares against
```

The report is generated from the simulator's real output with
`node report/build-report.js` (it uses Google Chrome to print the PDF).

`src/scheduler.js` has no dependency on the page, so the same code is used by
the website and by the tests.

## Scheduling rules implemented

- **FCFS:** the earliest-arriving ready process runs to completion.
- **SJF:** whenever the CPU becomes free, the ready process with the shortest CPU burst runs to completion.
- **SRTF:** the ready process with the shortest remaining time runs. A running process is preempted only by a strictly shorter remaining time; on equal remaining time it keeps running.
- **Ties:** earlier arrival first, then earlier position in the input list.
- **RR:** FIFO ready queue; arrivals join the tail. At a quantum boundary, processes arriving at that exact time are enqueued before the preempted process. A finished process never rejoins.
- When no process is ready, the CPU is shown as idle until the next arrival.
- A process running from time 2 to time 5 receives 3 units of CPU time.

## Limitations

- The model is deliberately simple: one CPU, one CPU burst per process, no I/O, zero-cost context switches and integer times. It models scheduling policies and does not reproduce a real operating system scheduler (for example Linux CFS/EEVDF).
- Burst lengths are known exactly in advance; a real system would have to estimate them.
- Inputs are not saved: reloading the page restores the example workload.
- Very long timelines (hundreds of time units) are drawn at a minimum width per unit and must be scrolled horizontally.
