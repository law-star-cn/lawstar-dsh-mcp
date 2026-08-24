/**
 * npm pack 白名单校验：确保发布包只包含预期文件，防止 dev/test 目录等被带进发布包。
 * 参考：qcc-mcp-legal-oauth（CI 校验脚本）。用法：node scripts/verify-pack.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// 只允许这些顶层条目出现在 npm 包内（files 声明 + 必然存在的元文件）
const allowedFiles = new Set([
  ...(pkg.files ?? []),
  'package.json',
  'LICENSE',
  'README.md',
]);

// 列出 npm pack 会包含的文件（dry-run）
const stdout = execSync('npm pack --dry-run --json', { encoding: 'utf8' });
const [report] = JSON.parse(stdout);
const included = new Set((report.files ?? []).map((f) => f.path));

const offenders = [...included].filter(
  (p) => p !== 'package.json' && ![...allowedFiles].some((a) => p === a || p.startsWith(`${a}/`)),
);

if (offenders.length > 0) {
  console.error('❌ 以下文件不应被发布（请检查 package.json exports/files 与 .npmignore）：');
  for (const f of offenders) console.error(`   - ${f}`);
  process.exit(1);
}
console.log(`✅ verify-pack 通过：发布包含 ${included.size} 个文件，均在白名单内。`);