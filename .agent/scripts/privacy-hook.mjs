#!/usr/bin/env node
/**
 * PostToolUse hook: run the privacy gate whenever the agent edits backend source.
 *
 * The point is WHERE the failure lands. Running the gate in CI catches the mistake at push
 * time, by which point the agent's context is gone and I have to re-explain the invariant.
 * Running it here puts the failure straight back into the agent's turn, so it corrects
 * itself immediately — the guardrail changes the output instead of just grading it.
 *
 * Reads the hook payload on stdin; stays silent for edits outside backend/src.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const file = payload?.tool_input?.file_path ?? '';
if (!/backend[\/]src[\/]/.test(file)) process.exit(0);

const result = spawnSync('npm', ['run', '--silent', 'verify:privacy'], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status === 0 ? 0 : 2); // exit 2 feeds stderr back to the agent
