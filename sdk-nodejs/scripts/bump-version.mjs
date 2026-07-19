#!/usr/bin/env node

/**
 * 升级 @picora/sdk 版本号并打印发布检查单。
 *
 * 用法:
 *   pnpm version:bump patch         # 0.3.0 → 0.3.1
 *   pnpm version:bump minor         # 0.3.0 → 0.4.0
 *   pnpm version:bump major         # 0.3.0 → 1.0.0
 *   pnpm version:bump 0.5.0         # 直接指定 x.y.z(也接受 x.y.z-beta.1)
 *
 * 同步更新的文件(两处必须一致,否则 src/__tests__/version.test.ts 报红):
 *   - package.json      的 `version` 字段
 *   - src/version.ts    的 `SDK_VERSION` 常量(User-Agent 上报 + 运行时导出的单一来源)
 *
 * 本脚本只改版本号,不构建 / 不测试 —— 质量门禁由 `prepublishOnly`
 * (typecheck + test)在 `npm publish` 时执行。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pkgPath = resolve(root, 'package.json');
const versionTsPath = resolve(root, 'src/version.ts');

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default: return type; // 显式版本字符串
  }
}

function validateVersion(version) {
  if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    console.error(`无效版本号:"${version}"。期望格式 x.y.z 或 x.y.z-beta.1`);
    process.exit(1);
  }
}

// ── 主流程 ─────────────────────────────────────────────────────────────

const input = process.argv[2];
if (!input) {
  console.error('用法: bump-version.mjs <patch|minor|major|x.y.z>');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const current = pkg.version;
const next = bumpVersion(current, input);
validateVersion(next);

if (current === next) {
  console.error(`版本已是 ${next} —— 无需变更。`);
  process.exit(1);
}

console.log(`升级 @picora/sdk: ${current} → ${next}\n`);

// 1. package.json(2 空格缩进 + 结尾换行,与 npm/pnpm 约定一致)
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('  ✓ package.json');

// 2. src/version.ts 的 SDK_VERSION 常量(单一来源,与 package.json 对账)
const versionTs = readFileSync(versionTsPath, 'utf-8');
const replaced = versionTs.replace(
  /export const SDK_VERSION = '[^']*'/,
  `export const SDK_VERSION = '${next}'`,
);
if (replaced === versionTs) {
  console.error('  ✗ 未能在 src/version.ts 中定位 SDK_VERSION 常量,请手动检查');
  process.exit(1);
}
writeFileSync(versionTsPath, replaced);
console.log('  ✓ src/version.ts\n');

console.log(`版本已更新为 ${next}。发布步骤:`);
console.log(`  git add package.json src/version.ts && git commit -m "chore: release v${next}"`);
console.log(`  git tag v${next}`);
console.log(`  git push origin main --tags     # 推 tag → 触发 CI OIDC 发布(正常路径)`);
console.log(`  # —— 若 OIDC 未配好,本地兜底(会提示输 OTP;本地不加 --provenance):`);
console.log(`  #   pnpm test && npm publish --access public`);
console.log(``);
console.log(`下游消费者采用本 SDK 后,记得同步升级其依赖:`);
console.log(`  picora-center / folia 等 → package.json  "@picora/sdk": "^${next}"`);
