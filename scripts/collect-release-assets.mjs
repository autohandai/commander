#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

if (process.argv.length < 4) {
  console.error('Usage: node collect-release-assets.mjs <sourceDir> <targetDir>');
  process.exit(1);
}

const sourceDir = path.resolve(process.argv[2]);
const targetDir = path.resolve(process.argv[3]);

const allowedExtensions = new Set([
  '.dmg',
  '.pkg',
  '.zip',
  '.tar.gz',
  '.AppImage',
  '.deb',
  '.rpm',
  '.msi',
  '.exe'
]);

function hasAllowedExtension(file) {
  if (file.endsWith('.tar.gz')) return true;
  const ext = path.extname(file);
  return allowedExtensions.has(ext);
}

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath);
      continue;
    }
    if (!hasAllowedExtension(entry.name)) continue;
    const destName = path.basename(fullPath);
    const destPath = path.join(targetDir, destName);
    fs.copyFileSync(fullPath, destPath);
  }
}

fs.mkdirSync(targetDir, { recursive: true });
collectFiles(sourceDir);
