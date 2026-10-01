// 生成 css/fonts.css：从 Google Fonts 下载只含所需字符的子集，以 base64 内嵌进 CSS，
// 网站运行时不依赖外部字体服务，也不用改构建和发布脚本。
// 改了大厅标题或大类名字以后重新跑：node scripts/fonts.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 &\'.,-';
// 标题"Kube 游乐场"和 7 个大类的中文名
const CJK = '游乐场容器调度工作负载网络存储安全';

// as：网站里用的字体名。同名的几个 @font-face 按 unicode-range 拼在一起：字母走 Fredoka，汉字走站酷快乐体
const FONTS = [
  { as: 'KG Display', family: 'Fredoka', weight: 600, text: LATIN },
  { as: 'KG Display', family: 'ZCOOL KuaiLe', weight: 400, use: 600, text: CJK },
  { as: 'KG Rounded', family: 'Nunito', weight: 600, text: LATIN },
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
let out = '/* 由 scripts/fonts.mjs 生成，不要手改。字体：Fredoka、Nunito、ZCOOL KuaiLe（SIL Open Font License 1.1） */\n';
for (const f of FONTS) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family)}:wght@${f.weight}&text=${encodeURIComponent(f.text)}`;
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  const src = css.match(/src: url\((.+?)\) format\('woff2'\)/);
  if (!src) throw new Error(`${f.family}: 没拿到 woff2\n${css}`);
  const range = (css.match(/unicode-range: (.+?);/) || [])[1];
  const font = Buffer.from(await (await fetch(src[1], { headers: { 'User-Agent': UA } })).arrayBuffer());
  out += `@font-face {\n  font-family: '${f.as}';\n  font-weight: ${f.use || f.weight};\n  font-display: swap;\n  src: url(data:font/woff2;base64,${font.toString('base64')}) format('woff2');\n${range ? `  unicode-range: ${range};\n` : ''}}\n`;
  console.log(`${f.family} → ${f.as}: ${(font.length / 1024).toFixed(1)} KB`);
}
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'css', 'fonts.css'), out);
console.log('css/fonts.css 已生成');
