// 全站内联 JS 语法扫描：抽取每个无 src 的 <script> 块做 new Function 语法校验（ESM）
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const files = ['index.html', 'review.html', 'graph.html', 'graph3d.html', 'docs/demo-page.html',
  ...fs.readdirSync('kp').filter(f => f.endsWith('.html')).map(f => 'kp/' + f)];
let bad = 0, checked = 0;
for (const f of files) {
  const t = fs.readFileSync(path.join(root, f), 'utf8');
  const re = /<script(?![^>]*\bsrc=)(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(t))) {
    const code = m[1].trim();
    if (!code) continue;
    i++; checked++;
    try { new Function(code); }
    catch (e) { bad++; console.log(`[SYNTAX] ${f} block#${i}: ${e.message}`); }
  }
  if ((t.match(/<script/g) || []).length !== (t.match(/<\/script>/g) || []).length) { bad++; console.log(`[PAIR] ${f}`); }
}
console.log(`内联脚本块 ${checked} 个，语法错误 ${bad} 个`);
process.exit(bad ? 1 : 0);
