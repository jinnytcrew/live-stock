#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
const root = process.cwd();
const errors = [], warnings = [];
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const ok = (msg) => console.log('PASS  ' + msg);
const fail = (msg) => errors.push(msg);
let manifest;
try { manifest = JSON.parse(read('manifest.webmanifest')); ok('manifest.webmanifest JSON syntax'); }
catch (e) { fail('manifest JSON parse failed: ' + e.message); }
if (manifest) {
  if (!(manifest.name || manifest.short_name)) fail('manifest needs name or short_name'); else ok('app name present');
  if (!manifest.start_url) fail('start_url missing'); else ok('start_url present');
  if (!['standalone','fullscreen','minimal-ui'].includes(manifest.display)) fail('display must be standalone/fullscreen/minimal-ui'); else ok('display mode installable');
  if (manifest.prefer_related_applications === true) fail('prefer_related_applications must not be true'); else ok('not redirecting install to related app');
  const required = ['192x192','512x512'];
  for (const size of required) {
    const found = (manifest.icons || []).find(i => String(i.sizes || '').split(/\s+/).includes(size) && (!i.purpose || String(i.purpose).split(/\s+/).includes('any')));
    if (!found) { fail('required normal icon missing: ' + size); continue; }
    const src = new URL(found.src, 'https://example.invalid/');
    const file = decodeURIComponent(src.pathname).replace(/^\//,'');
    if (!exists(file)) { fail(`manifest icon file missing for ${size}: ${file}`); continue; }
    const bytes=fs.readFileSync(path.join(root,file));
    if (bytes.length < 24 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') { fail('not a valid PNG: ' + file); continue; }
    const w=bytes.readUInt32BE(16), h=bytes.readUInt32BE(20);
    if (`${w}x${h}` !== size) fail(`PNG dimension mismatch ${file}: ${w}x${h}; expected ${size}`); else ok(`${size} PNG exists and dimensions match (${file})`);
  }
  const mask=(manifest.icons||[]).find(i => String(i.purpose||'').split(/\s+/).includes('maskable'));
  if (!mask) warnings.push('maskable icon not declared');
  else { const p=decodeURIComponent(new URL(mask.src,'https://example.invalid/').pathname).replace(/^\//,''); if(!exists(p)) fail('maskable icon file missing: '+p); else ok('maskable icon file exists'); }
}
const html=read('index.html');
if (!/<link\s+rel=["']manifest["']\s+href=["']\/manifest\.webmanifest["']/.test(html)) fail('index.html does not link to root manifest'); else ok('HTML manifest link matches fixed root URL');
for (const file of ['icon-192.png','icon-512.png','icon-maskable-512.png','favicon.png']) {
  if (!exists(file)) fail('legacy compatibility image missing: '+file); else ok('legacy compatibility image present: '+file);
}
const sw=read('sw.js');
if (!/addEventListener\s*\(\s*['"]fetch['"]/.test(sw)) warnings.push('service worker has no fetch event listener; some Chromium variants may not surface install prompt'); else ok('service-worker fetch handler present (network-only strategy)');
const app=read('app.js');
if (!/async function pwaRegisterSW\s*\(/.test(app) || !/pwaRegisterSW\(\)\.catch/.test(app)) fail('service worker is not registered automatically at startup'); else ok('service worker registration is independent from push notification opt-in');
const worker=read('_worker.js');
const appVer=(worker.match(/var APP_VER\s*=\s*['"]([^'"]+)/)||[])[1];
const info=(read('version-info.js').match(/version:\s*['"]([^'"]+)/)||[])[1];
if (appVer !== info) fail(`Worker/version-info mismatch: ${appVer} vs ${info}`); else ok('Worker and UI versions match: '+info);
if (manifest) for (const icon of (manifest.icons||[])) if (!worker.includes(icon.src)) fail('Worker-generated manifest icon differs from static manifest: '+icon.src);
if (manifest && !errors.length) ok('Worker-generated manifest icon paths match the static manifest');
for (const match of html.matchAll(/(?:href|src)=["'](\/[^"']+\.png)(?:\?[^"']*)?["']/g)) {
  const file=decodeURIComponent(match[1].split('?')[0]).replace(/^\//,'');
  if (!exists(file)) fail('HTML icon reference points to a missing file: '+file);
}
const ignore=read('.assetsignore');
if (!/^manifest\.webmanifest\s*$/m.test(ignore)) warnings.push('manifest.webmanifest is still static; worker-generated cache-controlled manifest may not run'); else ok('manifest excluded from static assets so Worker-generated current version is served');
for (const msg of warnings) console.log('WARN  '+msg);
for (const msg of errors) console.error('FAIL  '+msg);
if (errors.length) { console.error(`PWA QA FAILED: ${errors.length} error(s), ${warnings.length} warning(s)`); process.exit(1); }
console.log(`PWA QA PASSED${warnings.length ? ` with ${warnings.length} warning(s)` : ''}`);
