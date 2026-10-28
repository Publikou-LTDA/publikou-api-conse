// Gera dist/ para o deploy: copia os arquivos estáticos e escreve config.js a partir das envs.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const FILES = ['index.html', 'console.html', 'app.css', 'app.js'];
const apiUrl = (process.env.PUBLIKOU_API_URL || '').trim().replace(/\/+$/, '');

if (!apiUrl) {
  console.error('PUBLIKOU_API_URL não definida. Configure em Vercel > Settings > Environment Variables.');
  process.exit(1);
}

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const f of FILES) cpSync(f, `dist/${f}`);
writeFileSync('dist/config.js', `window.PUBLIKOU_CONFIG = ${JSON.stringify({ apiUrl })};\n`);
console.log(`dist/ gerado (API: ${apiUrl})`);
