import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../server/assets/', import.meta.url);
await mkdir(output, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL('./dashboard-chart-entry.jsx', import.meta.url))],
  outfile: fileURLToPath(new URL('dashboard-chart-runtime.js', output)),
  bundle: true, minify: true, format: 'iife', platform: 'browser',
  target: ['es2020'], define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'inline',
  banner: { js: '/* GSPEC standalone charts: React + react-chartjs-2. Rebuild with npm run build:dashboard-charts. */' },
});
console.log('Standalone react-chartjs-2 runtime built.');
