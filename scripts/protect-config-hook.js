#!/usr/bin/env node
// PreToolUse hook: block edits to config files without explicit approval
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const file = data.tool_input?.file_path || data.tool_input?.path || '';

    const protectedFiles = [
      'biome.json',
      'tsconfig.json',
      'tsconfig.main.json',
      '.claude/settings.local.json'
    ];

    const isProtected = protectedFiles.some((p) => file.replace(/\\/g, '/').endsWith(p));

    if (isProtected) {
      const result = {
        decision: 'block',
        reason: `BLOCKED: ${file} is a protected config file. Fix the code instead of changing config. If you truly need to modify this file, ask the user first.`
      };
      process.stdout.write(JSON.stringify(result));
    }
  } catch (_) {
    process.exit(0);
  }
});
