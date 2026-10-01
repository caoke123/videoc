#!/usr/bin/env node
// Installs the Jianying draft writer used by "导出剪映草稿" into tools/jianying-exporter/ (git-ignored):
// a pinned clone of github.com/luoluoluo22/jianying-editor-skill (MIT) and an isolated Python 3.12 venv with its
// requirements. Safe to re-run; nothing outside tools/jianying-exporter/ is touched.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/luoluoluo22/jianying-editor-skill.git';
const COMMIT = '32c56928ded4f9e2c2b80e099dc7abb793d2c30b';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.env.JIANYING_EXPORTER_DIR || join(root, 'tools', 'jianying-exporter');
const repo = join(base, 'repo');
const venv = join(base, 'venv');
const python = join(venv, process.platform === 'win32' ? join('Scripts', 'python.exe') : join('bin', 'python'));

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    console.error(`失败：${command} ${args.join(' ')}`);
    process.exit(result.status || 1);
  }
}

mkdirSync(base, { recursive: true });
if (!existsSync(join(repo, '.git'))) run('git', ['clone', '--quiet', REPO, repo]);
run('git', ['-C', repo, 'fetch', '--quiet', 'origin']);
run('git', ['-C', repo, 'checkout', '--quiet', COMMIT]);
if (!existsSync(python)) {
  const [command, args] = process.platform === 'win32' ? ['py', ['-3.12', '-m', 'venv', venv]] : ['python3.12', ['-m', 'venv', venv]];
  run(command, args);
}
run(python, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '-r', join(repo, 'requirements.txt')]);
console.log(`\n剪映导出组件已安装：${base}`);
