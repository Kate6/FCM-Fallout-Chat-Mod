// Dependency-free unit-test entrypoint.
//
// The repo's Jest config targets compiled `tests/**/*.test.js`; these TypeScript
// unit tests instead use Node's built-in `node:test` runner via tsx. Node 20's
// `--test` flag doesn't expand `**` globs or discover `.ts`, so this runner finds
// and imports every `*.test.ts` under `src/` (recursively). `node:test`
// auto-executes registered tests and sets a non-zero exit code on failure.
//
// Run with: npm run test:unit
import { readdirSync } from 'node:fs';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';

const root = path.join(process.cwd(), 'src');
const files = (readdirSync(root, { recursive: true }) as string[])
  .filter((f) => typeof f === 'string' && f.endsWith('.test.ts'))
  .map((f) => path.join(root, f));

if (files.length === 0) {
  console.error('No *.test.ts files found under src/');
  process.exit(1);
}

// Run each TypeScript suite in a child process. forceExit is deliberate: unit
// fixtures can open Redis/Prisma handles through default dependencies, and a
// completed test run must not hang waiting for those test-only handles.
run({ files, isolation: 'process', execArgv: ['--import', 'tsx'], forceExit: true })
  .compose(spec())
  .pipe(process.stdout);
