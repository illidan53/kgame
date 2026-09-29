// 生成可部署的 dist/：JS / CSS 文件名带内容哈希（可以长缓存），index.html 改为引用带哈希的文件。
// 用法：node scripts/build.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

let html = readFileSync(join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[\w.-]+\.(?:js|css))"/g)].map((m) => m[1]);
if (!refs.length) throw new Error('index.html 里没有找到 js/ 或 css/ 引用');

for (const ref of new Set(refs)) {
  const buf = readFileSync(join(root, ref));
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 10);
  const ext = extname(ref);
  const out = `assets/${basename(ref, ext)}.${hash}${ext}`;
  writeFileSync(join(dist, out), buf);
  html = html.replaceAll(`"${ref}"`, `"${out}"`);
  console.log(`${ref} → ${out}`);
}
writeFileSync(join(dist, 'index.html'), html);
console.log('dist/ 已生成');
