#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const buildId = process.env.COMMANDER_BUILD_ID || 'dev';

function loadJson(fp) {
  const text = fs.readFileSync(fp, 'utf8');
  return JSON.parse(text);
}

function writeJson(fp, data) {
  const text = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(fp, text);
}

function stripBuild(v) {
  return (v || '').split('+')[0] || '0.1.0';
}

const tauriPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml');
const packagePath = path.join(root, 'package.json');

const tauriConfig = loadJson(tauriPath);
const baseVersion = stripBuild(tauriConfig.version);
const buildVersion = `${baseVersion}+build.${buildId}`;

tauriConfig.version = buildVersion;
writeJson(tauriPath, tauriConfig);

const cargoText = fs.readFileSync(cargoPath, 'utf8');
const cargoUpdated = cargoText.replace(/version = "[^"]+"/, `version = "${buildVersion}"`);
fs.writeFileSync(cargoPath, cargoUpdated);

if (fs.existsSync(packagePath)) {
  const pkg = loadJson(packagePath);
  pkg.version = buildVersion;
  writeJson(packagePath, pkg);
}

process.stdout.write(buildVersion);
