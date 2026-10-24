/*
 * Runs the test suite in a directory and returns { tests, pass, fail, failing }.
 *
 * Node's default test reporter depends on the Node version and on whether the
 * output is a terminal ("spec" or "TAP"), so the reporter is fixed to TAP,
 * whose format is stable since Node 18. Throws if the summary cannot be read,
 * instead of returning NaN.
 */
const { spawnSync } = require('node:child_process');

function runTests(cwd, extraArgs = []) {
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...extraArgs], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  const output = `${run.stdout}\n${run.stderr}`;

  // The summary lines are written unindented at the end of the TAP stream.
  const count = (name) => {
    const match = output.match(new RegExp(`^# ${name} (\\d+)$`, 'm'));
    if (!match) throw new Error(`Could not read "# ${name}" from the test output:\n${output.slice(-2000)}`);
    return Number(match[1]);
  };

  // "not ok 3 - name" lines; entries named after a test file are file-level failures
  // (for example a crash or timeout) and are reported by their file name.
  const failing = [...output.matchAll(/^\s*not ok \d+ - (.+?)\s*$/gm)].map((m) => m[1].replace(/\s+#.*$/, ''));

  return { tests: count('tests'), pass: count('pass'), fail: count('fail'), failing: [...new Set(failing)] };
}

module.exports = { runTests };
