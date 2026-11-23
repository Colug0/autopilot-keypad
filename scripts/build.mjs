// Bundles the window and the background runtime, with the bus library, into public/.
import { build } from 'esbuild';

await build({
  entryPoints: { keypad: 'src/keypad.mjs', runtime: 'src/runtime.mjs' },
  outdir: 'public',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  legalComments: 'inline',
  logLevel: 'info'
});
