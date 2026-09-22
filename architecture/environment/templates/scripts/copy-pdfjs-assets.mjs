import { cp, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// PDF.js fetches these files by name at runtime: Vite's hashed JS assets alone
// cannot resolve Korean CID fonts or the optional image decoders.
const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'node_modules/pdfjs-dist');
const { version } = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error('Unexpected PDF.js asset version.');
const destination = resolve(root, 'public/pdfjs', version);
await mkdir(destination, { recursive: true });
for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await cp(resolve(source, folder), resolve(destination, folder), { recursive: true });
}
await cp(resolve(source, 'LICENSE'), resolve(destination, 'LICENSE'));
console.log(`PDF.js ${version}: local CMaps, standard fonts, and image decoders prepared.`);
