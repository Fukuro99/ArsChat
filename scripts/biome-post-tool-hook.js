#!/usr/bin/env node
// PostToolUse hook: auto-fix with Biome after file edits, inject remaining diagnostics
const { execSync } = require('child_process');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const file = data.tool_input?.file_path || data.tool_input?.path || '';

    if (!file || !/\.(ts|tsx|js|jsx)$/.test(file)) {
      process.exit(0);
    }

    // Auto-fix
    try {
      execSync(`npx biome check --write "${file}"`, { stdio: 'pipe', timeout: 10000 });
    } catch (_) {
      // biome check --write exits non-zero when there are remaining diagnostics
    }

    // Collect remaining diagnostics
    let diag = '';
    try {
      execSync(`npx biome check "${file}"`, { stdio: 'pipe', timeout: 10000 });
    } catch (e) {
      diag = (e.stdout || '').toString().slice(0, 2000);
    }

    if (diag) {
      const result = {
        hookSpecificOutput: {
          additionalContext: `[Biome] Remaining issues in ${file}:\n${diag}`
        }
      };
      process.stdout.write(JSON.stringify(result));
    }
  } catch (_) {
    process.exit(0);
  }
});
