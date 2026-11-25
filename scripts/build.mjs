import { build } from 'esbuild';
import fs from 'node:fs';
fs.mkdirSync('web/dist', { recursive: true });
fs.copyFileSync('web/public/index.html', 'web/dist/index.html');
await build({
  entryPoints: ['web/src/main.js'], bundle: true, format: 'iife', target: 'es2020', outfile: 'web/dist/main.js', minify: false,
  define: { __BACKEND_URL__: JSON.stringify(process.env.BACKEND_URL || '') },
});
console.log('built web/dist', process.env.BACKEND_URL ? `backend=${process.env.BACKEND_URL}` : '(same-origin backend)');
