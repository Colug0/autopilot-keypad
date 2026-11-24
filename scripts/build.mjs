// Bundles the plotter window, the background runtime and the webapp into public/.
import { build } from 'esbuild';

await build({
  entryPoints: { keypad: 'src/keypad.mjs', runtime: 'src/runtime.mjs', app: 'src/app.mjs' },
  outdir: 'public',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  legalComments: 'inline',
  logLevel: 'info'
});
