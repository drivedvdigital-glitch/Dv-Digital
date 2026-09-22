#!/usr/bin/env node
// medir-ao-vivo.mjs — measure a LIVE storefront page's rendering cost from inside the sandbox.
//
// Chromium cannot open external HTTPS here (the egress proxy re-terminates TLS and Chromium
// does not trust that CA), but curl can. So every browser request is intercepted with
// page.route('**/*') and answered with a body fetched on the Node side through curl, which
// honors HTTPS_PROXY and the CA bundle. TLS verification is never disabled.
//
// Usage: node medir-ao-vivo.mjs <url> [--sem-cache] [--saida <dir>]
//   --sem-cache   ignore the on-disk body cache (still writes to it)
//   --saida DIR   where to write trace-*.json and resultado-*.json (default: ./saida-ao-vivo)
// Playwright is not a dependency of the workspace (its install downloads a
// browser); the tool asks for it and says how to get it.
let playwright;
try {
  playwright = (await import(process.env.DVFLY_PLAYWRIGHT || 'playwright')).default;
} catch {
  console.error('Precisa do Playwright: npm i -g playwright && npx playwright install chromium (ou DVFLY_PLAYWRIGHT=caminho/para/playwright/index.js)');
  process.exit(2);
}
const { chromium } = playwright;
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
// The Chromium to drive: the one Playwright installed, unless told otherwise.
const CHROME = process.env.DVFLY_CHROMIUM || undefined;
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const SLOW4G = { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }; // bytes/s
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing',
  'disabled-by-default-devtools.timeline.stack']; // .stack adds JS stack traces to Layout/FunctionCall
const DROP_RES = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'alt-svc']);
const DROP_REQ = new Set(['host', 'connection', 'content-length', 'accept-encoding']);
const SCRIPT_NAMES = new Set(['EvaluateScript', 'FunctionCall', 'TimerFire', 'EventDispatch', 'FireAnimationFrame',
  'XHRReadyStateChange', 'XHRLoad', 'v8.callFunction', 'RunMicrotasks', 'v8.compile']);
const run = promisify(execFile);

// ---------- args ----------
const argv = process.argv.slice(2);
const url = argv.find((a) => !a.startsWith('--'));
if (!url) { console.error('uso: node medir-ao-vivo.mjs <url> [--sem-cache] [--saida <dir>]'); process.exit(2); }
const useCache = !argv.includes('--sem-cache');
const outDir = argv.includes('--saida') ? argv[argv.indexOf('--saida') + 1] : path.join(process.cwd(), 'saida-ao-vivo');
// Cached bodies live outside the repository: they are megabytes of other
// people's pages and must never be committed.
const cacheDir = path.join(os.tmpdir(), 'dvfly-medir-ao-vivo');
fs.mkdirSync(outDir, { recursive: true }); fs.mkdirSync(cacheDir, { recursive: true });

// ---------- transport: curl through the proxy, cached on disk by hash(method + url) ----------
async function fetchViaCurl(request) {
  const u = request.url(), method = request.method();
  const key = createHash('sha1').update(method + ' ' + u).digest('hex');
  const bodyFile = path.join(cacheDir, key + '.body'), metaFile = path.join(cacheDir, key + '.json');
  if (useCache && method === 'GET' && fs.existsSync(metaFile) && fs.existsSync(bodyFile))
    return { ...JSON.parse(fs.readFileSync(metaFile, 'utf8')), body: fs.readFileSync(bodyFile), cached: true };
  const headersFile = path.join(cacheDir, key + '.h');
  const args = ['-sS', '--compressed', '--max-time', '60', '-X', method, '-D', headersFile, '-o', bodyFile, '-w', '%{http_code} %{size_download}'];
  for (const [k, v] of Object.entries(await request.allHeaders())) if (!k.startsWith(':') && !DROP_REQ.has(k)) args.push('-H', `${k}: ${v}`);
  const post = request.postDataBuffer();
  if (post) { fs.writeFileSync(bodyFile + '.post', post); args.push('--data-binary', '@' + bodyFile + '.post'); }
  let out;
  try { ({ stdout: out } = await run('curl', [...args, u], { maxBuffer: 1 << 20 })); }
  catch (e) { return { status: 404, headers: {}, body: Buffer.alloc(0), wire: 0, error: String(e.stderr || e.message).trim() }; }
  const [status, wire] = out.trim().split(' ').map(Number);
  // curl -D writes one block per hop (proxy CONNECT, 103 Early Hints, final): keep the last one.
  const block = fs.readFileSync(headersFile, 'utf8').split(/\r?\n\r?\n/).filter((b) => /^HTTP\//.test(b)).pop() || '';
  const headers = {};
  for (const line of block.split(/\r?\n/).slice(1)) {
    const i = line.indexOf(':'); if (i < 1) continue;
    const k = line.slice(0, i).trim().toLowerCase(); if (!DROP_RES.has(k)) headers[k] = line.slice(i + 1).trim();
  }
  const meta = { status, headers, wire };
  if (method === 'GET' && (status < 400 || status === 404)) fs.writeFileSync(metaFile, JSON.stringify(meta)); // never cache 429/5xx
  return { ...meta, body: fs.readFileSync(bodyFile), cached: false };
}

// ---------- in-page observers (installed before any page script runs) ----------
const OBSERVE = `(() => {
  const m = window.__dvm = { paint: {}, lcp: [], shifts: [], longtasks: [] };
  const desc = (el) => !el || !el.tagName ? '(nó sem tag)' : el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')
    + ((el.currentSrc || el.src) ? ' src=…' + String(el.currentSrc || el.src).slice(-70) : '');
  const obs = (type, fn) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch {} };
  obs('paint', (e) => { m.paint[e.name] = e.startTime; });
  obs('largest-contentful-paint', (e) => m.lcp.push({ t: e.startTime, size: e.size, el: desc(e.element), url: e.url }));
  obs('layout-shift', (e) => { if (!e.hadRecentInput) m.shifts.push({ t: e.startTime, v: e.value, els: (e.sources || []).map((s) => desc(s.node)) }); });
  obs('longtask', (e) => m.longtasks.push({ t: e.startTime, d: e.duration }));
})();`;

const COLLECT = `(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  return { ...window.__dvm,
    preconnects: [...document.querySelectorAll('link[rel~="preconnect"]')].map((l) => l.href + (l.crossOrigin != null ? ' (crossorigin)' : '')),
    nav: { requestStart: nav.requestStart, responseStart: nav.responseStart, responseEnd: nav.responseEnd,
      dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, encodedBodySize: nav.encodedBodySize } };
})()`;

// ---------- trace analysis (mirrors what DevTools/PageSpeed derive from the same events) ----------
function analyseTrace(events) {
  const mains = new Set(events.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}/${e.tid}`));
  const counts = {};
  for (const e of events) { const k = `${e.pid}/${e.tid}`; if (mains.has(k) && e.ph === 'X') counts[k] = (counts[k] || 0) + 1; }
  const main = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]; // busiest renderer main thread = the page
  const evs = [], open = [];
  for (const e of events.filter((e) => `${e.pid}/${e.tid}` === main).sort((a, b) => a.ts - b.ts)) {
    if (e.ph === 'X') evs.push({ name: e.name, ts: e.ts, dur: e.dur || 0, args: e.args || {} });
    else if (e.ph === 'B') open.push({ name: e.name, ts: e.ts, args: e.args || {} });
    else if (e.ph === 'E') { // close the innermost open event of the same name
      let i = open.length - 1; while (i >= 0 && open[i].name !== e.name) i--;
      if (i >= 0) { const o = open.splice(i, 1)[0]; evs.push({ ...o, dur: e.ts - o.ts, args: { ...o.args, ...(e.args || {}) } }); }
    }
  }
  evs.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const stack = []; // nesting → parent links and self time (DevTools "self time")
  for (const e of evs) {
    while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts) stack.pop();
    e.parent = stack[stack.length - 1] || null; e.self = e.dur;
    if (e.parent) e.parent.self -= e.dur;
    stack.push(e);
  }
  const ms = (us) => Math.round(us / 100) / 10;
  const sum = (names, field) => ms(evs.filter((e) => names.includes(e.name)).reduce((s, e) => s + e[field], 0));
  const scriptOf = (e) => { for (let p = e; p; p = p.parent) if (p.args?.data?.url) return p.args.data.url; return '(inline/desconhecido)'; };
  const top = evs.filter((e) => e.name === 'EvaluateScript' || e.name === 'FunctionCall').sort((a, b) => b.dur - a.dur).slice(0, 10)
    .map((e) => ({ name: e.name, ms: ms(e.dur), selfMs: ms(e.self), url: e.args.data?.url || scriptOf(e),
      fn: e.args.data?.functionName || '', line: e.args.data?.lineNumber }));
  const layouts = evs.filter((e) => e.name === 'Layout');
  const forced = layouts.filter((e) => e.args.beginData?.stackTrace?.length);
  const inScript = layouts.filter((e) => { for (let p = e.parent; p; p = p.parent) if (SCRIPT_NAMES.has(p.name)) return true; return false; });
  const origins = {};
  for (const l of inScript) {
    const f = l.args.beginData?.stackTrace?.[0];
    const k = f ? `${f.url || '(inline)'}:${f.lineNumber}${f.functionName ? ' ' + f.functionName + '()' : ''}` : scriptOf(l);
    origins[k] = origins[k] || { count: 0, ms: 0 }; origins[k].count++; origins[k].ms += ms(l.dur);
  }
  return {
    mainThreadMs: ms(evs.filter((e) => !e.parent).reduce((s, e) => s + e.dur, 0)),
    selfMs: { EvaluateScript: sum(['EvaluateScript'], 'self'), FunctionCall: sum(['FunctionCall'], 'self'),
      'UpdateLayoutTree+Layout': sum(['UpdateLayoutTree', 'Layout'], 'self'), Paint: sum(['Paint'], 'self'), ParseHTML: sum(['ParseHTML'], 'self') },
    top, layouts: { total: layouts.length, withStackTrace: forced.length, nestedInScript: inScript.length,
      origins: Object.entries(origins).sort((a, b) => b[1].ms - a[1].ms).slice(0, 10).map(([k, v]) => ({ origin: k, ...v })) },
  };
}

// ---------- drive the browser ----------
const t0 = Date.now();
const byOrigin = {};
let docWire = 0, simulateLink = false, linkFreeAt = 0;
// Fallback when CDP throttling does not reach fulfilled responses: model one shared slow-4G link.
// Downloads queue behind each other at 1.6 Mbps (compressed bytes) and each answer pays 150 ms RTT.
async function throttle(bytes) {
  const now = Date.now(), start = Math.max(now, linkFreeAt);
  linkFreeAt = start + bytes / SLOW4G.downloadThroughput * 1000;
  await new Promise((r) => setTimeout(r, linkFreeAt + SLOW4G.latency - now));
}
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
  userAgent: UA, locale: 'pt-BR', serviceWorkers: 'block' });
const page = await context.newPage();
await page.addInitScript(OBSERVE);
await page.route('**/*', async (route) => {
  const r = await fetchViaCurl(route.request());
  const s = byOrigin[new URL(route.request().url()).origin] ||= { requests: 0, wire: 0, body: 0, cached: 0, failed: 0 };
  s.requests++; s.wire += r.wire; s.body += r.body.length; if (r.cached) s.cached++; if (r.error) s.failed++;
  if (route.request().resourceType() === 'document' && !docWire) docWire = r.wire;
  if (simulateLink) await throttle(r.wire);
  await route.fulfill({ status: r.status, headers: r.headers, body: r.body }).catch(() => {});
});
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, ...SLOW4G });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
// Honesty check: does Network.emulateNetworkConditions reach responses fulfilled by page.route?
// Serve 200 KB straight from memory (no curl) and time it from inside the page: ≥ 1150 ms if throttled.
const PROBE = 'https://dvfly-probe.invalid/200kb', PROBE_BYTES = 200_000;
await page.route(PROBE, (route) => route.fulfill({ status: 200, body: Buffer.alloc(PROBE_BYTES, 1),
  headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' } }));
await page.goto('about:blank');
const probeMs = await page.evaluate(async (u) => { const t = performance.now(); await (await fetch(u)).arrayBuffer(); return performance.now() - t; }, PROBE);
const probeMinMs = SLOW4G.latency + PROBE_BYTES / SLOW4G.downloadThroughput * 1000;
const throttled = probeMs >= probeMinMs * 0.7;
simulateLink = !throttled;
const events = [];
cdp.on('Tracing.dataCollected', (e) => { for (const ev of e.value) events.push(ev); });
await cdp.send('Tracing.start', { traceConfig: { includedCategories: CATS }, transferMode: 'ReportEvents' });
const nav = await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(3000); // let late LCP/CLS/longtask entries land
const m = await page.evaluate(COLLECT);
const traceDone = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.end'); await traceDone;
await browser.close();

// ---------- derive numbers ----------
const stamp = new Date().toISOString().replace(/[:.]/g, '-'), host = new URL(url).hostname;
const traceFile = path.join(outDir, `trace-${host}-${stamp}.json`);
fs.writeFileSync(traceFile, JSON.stringify({ traceEvents: events }));
const trace = analyseTrace(events);
const lcp = m.lcp[m.lcp.length - 1];
// CLS = largest "session window" (shifts < 1 s apart, window ≤ 5 s), as web-vitals defines it
let cls = 0, win = 0, winStart = 0, prev = -1e9;
for (const s of m.shifts) { if (s.t - prev > 1000 || s.t - winStart > 5000) { win = 0; winStart = s.t; } win += s.v; prev = s.t; cls = Math.max(cls, win); }
const shifters = {};
for (const s of m.shifts) for (const el of s.els) shifters[el] = (shifters[el] || 0) + s.v / Math.max(1, s.els.length);
const topShifters = Object.entries(shifters).sort((a, b) => b[1] - a[1]).slice(0, 3);
const totals = Object.values(byOrigin).reduce((a, s) => ({ requests: a.requests + s.requests, wire: a.wire + s.wire, body: a.body + s.body, cached: a.cached + s.cached, failed: a.failed + s.failed }), { requests: 0, wire: 0, body: 0, cached: 0, failed: 0 });
const kb = (b) => (b / 1024).toFixed(1) + ' KB';
const f = (x) => x == null ? '—' : Math.round(x) + ' ms';

// ---------- print ----------
const L = [];
L.push(`== medir-ao-vivo · ${url}`, `documento: HTTP ${nav?.status()} · ${kb(docWire)} na rede · load em ${f(m.nav.load)} · DCL ${f(m.nav.dcl)} · corrida ${((Date.now() - t0) / 1000).toFixed(1)} s`);
L.push(`emulação: 412×915 @2.625 · UA móvel · CPU 4× (CDP) · rede slow 4G via CDP → ${throttled ? 'APLICADA às respostas fulfilled' : 'NÃO chega às respostas fulfilled → SIMULADA no route (fila única a 1,6 Mbps sobre bytes comprimidos + 150 ms por resposta)'} (sonda de 200 KB da memória: ${f(probeMs)} observados × ${f(probeMinMs)} mínimo se estrangulada)`);
L.push(`transporte: ${totals.requests} requisições via curl+proxy, ${totals.cached} do cache em disco, ${totals.failed} falharam (→ 404)`);
L.push('', '-- Pintura', `FCP ${f(m.paint['first-contentful-paint'])} · FP ${f(m.paint['first-paint'])}`,
  `LCP ${f(lcp?.t)} · elemento: ${lcp?.el ?? '—'}${lcp?.url ? ' · url=…' + lcp.url.slice(-70) : ''} · ${m.lcp.length} candidato(s)`);
L.push('', `-- CLS ${cls.toFixed(4)} (soma bruta ${m.shifts.reduce((s, x) => s + x.v, 0).toFixed(4)}, ${m.shifts.length} deslocamentos)`);
for (const [el, v] of topShifters) L.push(`  ${v.toFixed(4)}  ${el}`);
L.push('', `-- Long tasks: ${m.longtasks.length} · total ${f(m.longtasks.reduce((s, x) => s + x.d, 0))} · maior ${f(Math.max(0, ...m.longtasks.map((x) => x.d)))}`);
L.push('', `-- Trace (${events.length} eventos → ${traceFile})`, `thread principal ocupada: ${trace.mainThreadMs} ms`);
for (const [k, v] of Object.entries(trace.selfMs)) L.push(`  ${k.padEnd(24)} ${String(v).padStart(8)} ms (self)`);
L.push('  top 10 EvaluateScript/FunctionCall por duração (inclusiva / self):');
for (const t of trace.top) L.push(`  ${String(t.ms).padStart(7)} / ${String(t.selfMs).padStart(6)} ms  ${t.name.padEnd(14)} ${t.url}${t.fn ? ' ' + t.fn + '()' : ''}${t.line != null ? ':' + t.line : ''}`);
L.push('', `-- Layouts: ${trace.layouts.total} · com stackTrace (forçados por JS): ${trace.layouts.withStackTrace} · aninhados em script: ${trace.layouts.nestedInScript}`);
for (const o of trace.layouts.origins) L.push(`  ${String(o.count).padStart(4)}× ${String(o.ms.toFixed(1)).padStart(7)} ms  ${o.origin}`);
L.push('', `-- <link rel=preconnect> no DOM após o load (${m.preconnects.length}):`, ...m.preconnects.map((p) => '  ' + p));
const linkHdr = nav?.headers()['link'] || '';
if (/preconnect/.test(linkHdr)) L.push(`  (cabeçalho Link do documento também traz preconnect: ${linkHdr.split(',').filter((x) => /preconnect/.test(x)).length})`);
L.push('', `-- Requisições por origem (${totals.requests} · ${kb(totals.wire)} na rede · ${kb(totals.body)} descomprimidos):`);
for (const [o, s] of Object.entries(byOrigin).sort((a, b) => b[1].wire - a[1].wire))
  L.push(`  ${String(s.requests).padStart(4)}  ${kb(s.wire).padStart(11)}  ${kb(s.body).padStart(11)}  ${o}${s.failed ? `  (${s.failed} falha)` : ''}`);
console.log(L.join('\n'));
const resultFile = path.join(outDir, `resultado-${host}-${stamp}.json`);
fs.writeFileSync(resultFile, JSON.stringify({ url, throttled, fcp: m.paint['first-contentful-paint'], lcp, cls, shifts: m.shifts, longtasks: m.longtasks, trace, preconnects: m.preconnects, byOrigin, nav: m.nav }, null, 1));
console.log(`\nresultado: ${resultFile}`);
