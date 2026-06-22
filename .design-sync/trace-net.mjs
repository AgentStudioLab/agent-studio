// 追踪某个预览 html 在 headless chromium 里发起的网络请求，定位 networkidle 不收敛的来源。
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(resolve(REPO, '.ds-sync', 'package.json'));
const { chromium } = req('playwright');

const rel = process.argv[2] || 'components/layouts/AppShell/AppShell.html';
const OUT = resolve(REPO, 'ds-bundle');

// 极简静态服务器，服务 ds-bundle/
const mime = (p) => p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream';
const server = createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const fp = resolve(OUT, '.' + u);
  if (existsSync(fp) && !fp.endsWith('/')) { rs.writeHead(200, { 'content-type': mime(fp) }); rs.end(readFileSync(fp)); }
  else { rs.writeHead(404); rs.end('nf'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
const pending = new Map();
const failedUrls = new Map();
page.on('request', (r) => pending.set(r.url(), Date.now()));
page.on('requestfinished', (r) => pending.delete(r.url()));
page.on('requestfailed', (r) => { pending.delete(r.url()); const u = r.url().slice(0, 90); failedUrls.set(u, (failedUrls.get(u) || 0) + 1); });
const consoleErrs = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => consoleErrs.push('PAGEERR: ' + String(e).slice(0, 160)));

try {
  await page.goto(`http://127.0.0.1:${port}/${rel}`, { waitUntil: 'load', timeout: 20000 });
} catch (e) { console.log('goto(load) err:', String(e).split('\n')[0]); }
await page.waitForTimeout(6000); // 让背景请求暴露
console.log('\n=== 仍 pending 的请求（networkidle 杀手）===');
for (const [u, t] of pending) console.log(`  ${((Date.now() - t) / 1000).toFixed(1)}s  ${u.slice(0, 110)}`);
console.log('\n=== 失败请求 URL（次数）===');
for (const [u, n] of [...failedUrls].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}×  ${u}`);
console.log('\n=== console / page 错误 ===');
for (const e of consoleErrs.slice(0, 12)) console.log('  ' + e);
const txt = (await page.evaluate(() => document.body.innerText || '').catch(() => '')).slice(0, 200);
console.log('\n=== body 文本前 200 字 ===\n', txt.replace(/\n+/g, ' '));
await browser.close();
server.close();
