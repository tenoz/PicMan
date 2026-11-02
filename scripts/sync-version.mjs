/**
 * sync-version.mjs
 * 以 package.json 为准，将版本号同步到项目内各文件中。
 *
 * 用法：
 *   node scripts/sync-version.mjs         # 同步所有文件
 *   node scripts/sync-version.mjs --check # 只检查不一致，不修改（CI/hook 用）
 *
 * 同步文件：
 *   - src-tauri/tauri.conf.json  → package.version
 *   - src-tauri/Cargo.toml       → [package].version
 *   - src/constants.ts           → APP_INFO.version (加 'v' 前缀)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const isCheck = process.argv.includes('--check');

// 读取来源版本号
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const srcVersion = pkg.version;           // e.g. "1.2.1"
const displayVersion = `v${srcVersion}`;  // e.g. "v1.2.1"

// 定义同步目标
const targets = [
  {
    name: 'src-tauri/tauri.conf.json',
    path: join(root, 'src-tauri', 'tauri.conf.json'),
    read() {
      const conf = JSON.parse(readFileSync(this.path, 'utf8'));
      return conf.package?.version;
    },
    write() {
      const raw = readFileSync(this.path, 'utf8');
      const conf = JSON.parse(raw);
      conf.package.version = srcVersion;
      writeFileSync(this.path, JSON.stringify(conf, null, 2) + '\n');
    },
  },
  {
    name: 'src-tauri/Cargo.toml',
    path: join(root, 'src-tauri', 'Cargo.toml'),
    read() {
      const raw = readFileSync(this.path, 'utf8');
      const m = raw.match(/^version\s*=\s*"([^"]+)"/m);
      return m?.[1];
    },
    write() {
      const raw = readFileSync(this.path, 'utf8');
      const updated = raw.replace(/^(version\s*=\s*)".*?"/m, `$1"${srcVersion}"`);
      writeFileSync(this.path, updated);
    },
  },
  {
    name: 'src/constants.ts',
    path: join(root, 'src', 'constants.ts'),
    read() {
      const raw = readFileSync(this.path, 'utf8');
      const m = raw.match(/version:\s*'([^']+)'/);
      return m?.[1];
    },
    write() {
      const raw = readFileSync(this.path, 'utf8');
      const updated = raw.replace(/(version:\s*)'[^']*'/, `$1'${displayVersion}'`);
      writeFileSync(this.path, updated);
    },
  },
];

// 执行
const mismatches = [];
for (const t of targets) {
  const current = t.read();
  const expected = t.name === 'src/constants.ts' ? displayVersion : srcVersion;

  if (current === expected) {
    console.log(`  ✓ ${t.name}: ${current}`);
  } else {
    mismatches.push(t);
    if (isCheck) {
      console.error(`  ✗ ${t.name}: got "${current}", expected "${expected}"`);
    } else {
      t.write();
      console.log(`  ~ ${t.name}: "${current}" → "${expected}"`);
    }
  }
}

if (isCheck && mismatches.length > 0) {
  console.error(`\n版本号不一致（${mismatches.length} 处），请运行 node scripts/sync-version.mjs 同步。`);
  process.exit(1);
}

if (!isCheck) {
  if (mismatches.length === 0) {
    console.log(`\n所有文件版本一致: ${displayVersion}`);
  } else {
    console.log(`\n已同步 ${mismatches.length} 个文件到 ${displayVersion}`);
  }
}
