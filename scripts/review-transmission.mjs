import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { parse } from 'parse5';
import ts from 'typescript';

const bootKey = 'ha-transmission-boot';
const markers = ['ha-desk-light', 'data-filter-count', 'pipeline-scenario'];
const routes = ['/', '/projects/anon4reid/', '/projects/wayfinder/', '/projects/app-factory/', '/not-a-real-coordinate/'];
const widths = [320, 390, 768, 1024, 1440];
const channels = [['pc', 4200], ['games', 5600], ['nature', 7100], ['cooking', 8300], ['sky', 9700], ['ai', 11300]];
const sha = body => createHash('sha256').update(body).digest('hex');
const wait = ms => new Promise(done => setTimeout(done, ms));

export function briefIssues(brief) {
  const g = brief.geometry;
  return brief.open === null || g.overflow || g.overlap || !g.captionsClear || g.cls !== 0 ? [`Expanded brief open/geometry/CLS: ${brief.width}`] : [];
}

export function runtimeIssues(attribution, route) {
  const issues = [...attribution.issues];
  if (!attribution.scripts.length) issues.push(`Missing boot-key attribution: ${route}`);
  const bytes = attribution.modules.reduce((sum, module) => sum + module.bytes, 0);
  if (!Number.isSafeInteger(attribution.aggregateBytes) || attribution.aggregateBytes !== bytes ||
      attribution.modules.some(module => !Number.isSafeInteger(module.bytes) || module.bytes < 0)) issues.push(`Invalid runtime byte attribution: ${route}`);
  if (bytes >= 4000 || attribution.aggregateBytes >= 4000) issues.push(`Strict shipped payload >=4000 bytes: ${route} (${bytes})`);
  if (attribution.modules.some(module => module.coalesced.length)) issues.push(`Coalesced controllers: ${route}`);
  return [...new Set(issues)];
}

// Mandatory native acceptance fails closed; browser-paused callbacks alone prove nothing.
export function visibilityIssues(evidence) {
  const issues = [], require = (ok, message) => { if (!ok) issues.push(`Native visibility: ${message}`); };
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const snapshot = value => value && Number.isFinite(value.at) && typeof value.hidden === 'boolean' &&
    count(value.frames) && count(value.queued) && count(value.selected) && count(value.tearing) &&
    Array.isArray(value.values) && value.values.length === 6 && value.values.every(vector => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite)) &&
    Array.isArray(value.listeners) && Array.isArray(value.timers);
  const names = ['foreground', 'hidden', 'hiddenLater', 'returnedBeforeInput', 'resumed', 'settled'];
  const t = evidence?.telemetry, ambient = evidence?.ambient;
  if (!names.every(name => snapshot(evidence?.[name])) || !t || !ambient ||
      !['frames', 'visibility', 'cancels', 'inputs', 'timerEvents', 'tears', 'errors'].every(name => Array.isArray(t[name])) ||
      !t.frames.every(frame => Number.isFinite(frame.at) && Number.isFinite(frame.timestamp) && count(frame.nativeId) && count(frame.callbackId) && typeof frame.hidden === 'boolean') ||
      !t.visibility.every(event => Number.isFinite(event.at) && typeof event.hidden === 'boolean' && typeof event.trusted === 'boolean') ||
      !t.inputs.every(event => Number.isFinite(event.at) && typeof event.hidden === 'boolean' && typeof event.trusted === 'boolean') ||
      !t.timerEvents.every(event => Number.isFinite(event.at)) || !t.cancels.every(event => Number.isFinite(event.at)) ||
      !t.tears.every(event => Number.isFinite(event.at))) return ['Native visibility: incomplete evidence'];
  const { foreground, hidden, hiddenLater, returnedBeforeInput: returned, resumed, settled } = evidence;
  const zero = value => value.values.every(vector => vector.every(axis => axis === 0));
  const positive = value => value.values.some(vector => vector[0] > 0) && value.values.every(vector => vector[0] >= 0 && vector[0] <= 1 && Math.abs(vector[1]) <= 1 && Math.abs(vector[2]) <= 1);
  const listener = value => value.listeners.length === 1 && value.listeners[0]?.passive === true && value.listeners[0]?.capture === false;
  const stopped = value => value.queued === 0 && zero(value) && value.selected === 0 && value.tearing === 0;
  const hiddenEvent = t.visibility.find(event => event.hidden && event.at > foreground.at);
  const visibleEvent = hiddenEvent && t.visibility.find(event => !event.hidden && event.at > hiddenEvent.at);
  require(evidence.nativeDocumentVisibility === true, 'document visibility was overridden or native provenance is missing');
  require(evidence.window?.minimized?.windowState === 'minimized' && evidence.window?.restored?.windowState === 'normal', 'owned native window did not minimize/restore');
  require(t.errors.length === 0 && t.maxQueued === 1, 'errors or multiple pending callbacks');
  require(!foreground.hidden && foreground.frames > 0 && foreground.queued === 1 && listener(foreground) && positive(foreground), 'foreground must have active work, one passive listener and positive proximity');
  require(names.slice(1).every((name, index) => evidence[name].at > evidence[names[index]].at), 'phase observations are out of order');
  require(hidden.hidden && hiddenLater.hidden && hiddenLater.at - hidden.at >= 500, 'sustained native hidden phase was not observed');
  require(!returned.hidden && !resumed.hidden && !settled.hidden, 'visible return was not observed');
  require(hiddenEvent?.trusted === true && visibleEvent?.trusted === true && t.visibility.every(event => event.trusted) &&
    hiddenEvent.at <= hidden.at && visibleEvent.at > hiddenLater.at && visibleEvent.at <= returned.at, 'trusted native hidden/visible events are missing');
  require(hiddenEvent?.beforeQueued === 1 && hiddenEvent.pendingIds?.length === 1 && visibleEvent?.beforeQueued === 0 &&
    t.cancels.some(event => event.hidden === true && event.wasPending === true && event.id === hiddenEvent.pendingIds[0] && event.at >= hiddenEvent.at && event.at <= hidden.at) &&
    !t.frames.some(frame => frame.nativeId === hiddenEvent.pendingIds[0]), 'the actual pending native callback was not cancelled');
  for (const [name, value] of [['hidden', hidden], ['hidden later', hiddenLater]]) {
    require(stopped(value) && value.listeners.length === 0 && value.timers.length === 0, `${name} retained queue/listener/proximity/effects/timers`);
  }
  require(hiddenLater.frames === hidden.frames && returned.frames === hidden.frames && stopped(returned) && listener(returned), 'return replayed before fresh input');
  require(resumed.frames > returned.frames && resumed.queued === 1 && listener(resumed) && positive(resumed), 'fresh input did not resume one active stream');
  require(stopped(settled) && listener(settled) && settled.frames > resumed.frames && settled.frames === t.frames.length, 'fresh stream did not complete finite idle decay');
  require(names.every(name => evidence[name].frames === t.frames.filter(frame => frame.at <= evidence[name].at).length), 'snapshot counts disagree with raw callbacks');
  require(t.frames.length > 0 && new Set(t.frames.map(frame => frame.callbackId)).size === 1 && new Set(t.frames.map(frame => frame.nativeId)).size === t.frames.length &&
    t.frames.every((frame, index) => !frame.hidden && (!index || frame.timestamp - t.frames[index - 1].timestamp >= 1)), 'duplicate callback/native-frame stream or same-frame burst');
  if (hiddenEvent && visibleEvent) {
    require(!t.frames.some(frame => frame.at >= hiddenEvent.at && frame.at < visibleEvent.at), 'callback ran during native hidden phase');
    const inputs = t.inputs.filter(event => event.inBay && event.type === 'pointermove' && event.at >= visibleEvent.at && event.at <= settled.at);
    require(inputs.length === 1 && inputs[0].trusted === true && inputs[0].hidden === false && inputs[0].at > returned.at && inputs[0].at < resumed.at, 'a single fresh trusted input after idle return is required');
    if (inputs.length === 1) {
      const input = inputs[0], frames = t.frames.filter(frame => frame.at >= visibleEvent.at);
      require(frames.length >= 2 && frames[0].at >= input.at && frames[0].at <= resumed.at &&
        frames.at(-1).at >= input.at + 2400 && frames.at(-1).at <= input.at + 3000 && settled.at >= input.at + 2600, 'fresh callback stream replayed early or exceeded the bounded 2.5s idle lifetime');
    }
  }
  const oldTimers = foreground.timers.filter(timer => timer.kind === 'ambient'), newTimers = returned.timers.filter(timer => timer.kind === 'ambient');
  require(oldTimers.length === 1 && newTimers.length === 1, 'one old and one fresh ambient deadline are required');
  if (oldTimers.length === 1 && newTimers.length === 1 && hiddenEvent && visibleEvent) {
    const old = oldTimers[0], fresh = newTimers[0];
    require(hiddenLater.at >= old.due && t.timerEvents.some(event => event.action === 'clear' && event.id === old.id && event.hidden === true && event.at >= hiddenEvent.at && event.at <= hidden.at) &&
      !t.timerEvents.some(event => event.action === 'fire' && event.id === old.id && event.at >= hiddenEvent.at), 'old ambient deadline survived hiding');
    require(fresh.id !== old.id && fresh.at >= visibleEvent.at && fresh.at <= returned.at && fresh.delay >= 20000 && fresh.delay <= 34000 && fresh.due === fresh.at + fresh.delay &&
      resumed.timers.some(timer => timer.id === fresh.id && timer.due === fresh.due) && settled.timers.some(timer => timer.id === fresh.id && timer.due === fresh.due), 'return did not own a fresh 20s–34s ambient deadline');
    const starts = t.tears.filter(event => event.kind === 'ambient' && event.at >= hiddenEvent.at);
    const fires = t.timerEvents.filter(event => event.action === 'fire' && event.id === fresh.id);
    require(ambient.visibleAt === visibleEvent.at && ambient.quietAt >= visibleEvent.at + 19500 && ambient.quietAt < fresh.due &&
      ambient.quietStarts === 0 && !starts.some(event => event.at <= ambient.quietAt), 'fresh ambient quiet gap is incomplete or contains catch-up');
    require(starts.length === 1 && starts[0].hidden === false && ambient.firstAt === starts[0].at &&
      ambient.firstAt >= fresh.due && ambient.firstAt <= fresh.due + 500 && fires.length === 1 && fires[0].hidden === false &&
      fires[0].at >= fresh.due && fires[0].at <= ambient.firstAt, 'first fresh ambient tear did not follow its actual deadline');
  }
  return issues;
}

function importsIn(code) {
  const imports = [], unresolved = [];
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) imports.push(argument.text);
      else unresolved.push('unresolved dynamic import');
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile('runtime.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
  return { imports, unresolved };
}

// Attribute the scripts actually delivered by a document; inline code and dependencies count.
export async function attributeRuntime(html, documentURL, getCode) {
  const scripts = [], modules = new Map(), issues = [], cache = new Map();
  const nodes = [];
  const visit = node => { if (node.tagName === 'script') nodes.push(node); node.childNodes?.forEach(visit); };
  visit(parse(html));
  const load = async url => {
    if (!cache.has(url)) cache.set(url, Promise.resolve(getCode(url)).then(body => Buffer.from(body)));
    return cache.get(url);
  };
  async function count(id, body, delivery, url) {
    if (modules.has(id)) return;
    const code = body.toString('utf8'), dependencies = importsIn(code);
    modules.set(id, { id, url, delivery, bytes: body.length, gzipBytes: gzipSync(body).length, sha256: sha(body),
      coalesced: markers.filter(marker => code.includes(marker)), imports: dependencies.imports });
    for (const issue of dependencies.unresolved) issues.push(`${id}: ${issue}`);
    for (const specifier of dependencies.imports) {
      if (!/^(?:\.{1,2}\/|\/|https?:\/\/)/.test(specifier)) {
        issues.push(`${id}: unresolved bare import ${specifier}`); continue;
      }
      const dependencyURL = new URL(specifier, url).href;
      await count(dependencyURL, await load(dependencyURL), 'dependency', dependencyURL);
    }
  }
  for (const [index, node] of nodes.entries()) {
    const attrs = Object.fromEntries(node.attrs.map(attr => [attr.name, attr.value]));
    if (attrs.type && !['module', 'text/javascript', 'application/javascript'].includes(attrs.type)) continue;
    const url = attrs.src ? new URL(attrs.src, documentURL).href : documentURL;
    const body = attrs.src ? await load(url) : Buffer.from(node.childNodes.map(child => child.value || '').join(''));
    if (!body.includes(Buffer.from(bootKey))) continue;
    const delivery = attrs.src ? 'external' : 'inline', id = attrs.src ? url : `${documentURL}#inline-${index}`;
    scripts.push({ index, id, url, delivery, bytes: body.length, gzipBytes: gzipSync(body).length });
    await count(id, body, delivery, url);
  }
  return { scripts, modules: [...modules.values()], aggregateBytes: [...modules.values()].reduce((sum, item) => sum + item.bytes, 0), issues };
}

async function occupied(port) {
  return new Promise(done => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); done(true); });
    socket.once('error', () => { socket.destroy(); done(false); });
    socket.once('timeout', () => { socket.destroy(); done(false); });
  });
}

async function ownedPreview(root, out) {
  assert.equal(await occupied(4321), false, 'Port 4321 is occupied; refuse to reuse or stop an unowned preview.');
  await readFile(join(root, 'dist/index.html')); // Build is a prerequisite, never inferred from a server.
  const log = createWriteStream(join(out, 'preview.log'), { flags: 'wx' });
  const args = [join(root, 'node_modules/astro/bin/astro.mjs'), 'preview', '--host', '127.0.0.1', '--port', '4321'];
  // Cold CLI startup can consume the old 10s budget before Astro prints anything.
  const startupTimeoutMs = 60000, started = performance.now();
  const child = spawn(process.execPath, args,
    { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  let error; child.once('error', value => { error = value; });
  const stop = async () => {
    if (child.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      else child.kill('SIGTERM');
      await Promise.race([new Promise(done => child.once('close', done)), wait(5000)]);
    }
    await new Promise(done => log.end(done));
    return { pid: child.pid, stopped: child.exitCode !== null || child.signalCode !== null, port4321Clear: !await occupied(4321) };
  };
  try {
    while (performance.now() - started < startupTimeoutMs) {
      if (error) throw error;
      if (child.exitCode !== null) throw new Error(`Owned preview exited: ${child.exitCode}`);
      try {
        const remaining = Math.max(1, Math.ceil(startupTimeoutMs - (performance.now() - started)));
        const response = await fetch('http://127.0.0.1:4321/', { signal: AbortSignal.timeout(Math.min(1000, remaining)) });
        if (response.ok) return { child, stop, launch: { executable: process.execPath, args, startupTimeoutMs, readyMs: performance.now() - started } };
      } catch { /* Not ready yet; each request is bounded by the startup deadline. */ }
      await wait(Math.min(100, Math.max(0, startupTimeoutMs - (performance.now() - started))));
    }
    throw new Error(`Owned preview did not become ready within ${startupTimeoutMs}ms.`);
  } catch (error) { await stop(); throw error; }
}

// Instrument only callbacks requested by the boot-key runtime. CSS animation is not a JS callback.
function initializeReview() {
  const state = { cls: 0, capture: false, samples: [], callbackIds: [], visibility: [], tears: [], boot: [], errors: [] };
  window.__transmissionReview = state;
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) state.cls += entry.value;
  }).observe({ type: 'layout-shift', buffered: true });
  const sources = () => [...document.scripts].filter(script => script.textContent.includes('ha-transmission-boot')).map(script => script.src || location.href);
  const callbacks = new WeakMap(); let serial = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => {
    if (!callbacks.has(callback)) {
      const stack = new Error().stack || '';
      const ours = sources().some(source => stack.includes(source)) || stack.includes(window.__aliveURL || 'no-alive-url');
      callbacks.set(callback, { id: ++serial, ours });
    }
    const { id, ours } = callbacks.get(callback);
    return raf(time => {
      if (!state.capture || !ours) return callback(time);
      const start = performance.now();
      try { return callback(time); }
      finally { state.samples.push(performance.now() - start); state.callbackIds.push(id); }
    });
  };
  const visible = () => state.visibility.push({ at: performance.now(), hidden: document.hidden, state: document.visibilityState, samples: state.samples.length });
  document.addEventListener('visibilitychange', visible); visible();
  window.addEventListener('error', event => state.errors.push(event.message));
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes' && record.attributeName === 'data-tear') {
        state.tears.push({ at: performance.now(), kind: record.target.getAttribute('data-tear'), class: record.target.className });
      }
      for (const node of record.addedNodes) if (node instanceof Element && node.matches('[data-boot]')) state.boot.push({ at: performance.now(), action: 'mount' });
      for (const node of record.removedNodes) if (node instanceof Element && node.matches('[data-boot]')) state.boot.push({ at: performance.now(), action: 'remove' });
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tear'] });
}

async function decodeImages(page) {
  await page.locator('img').evaluateAll(async images => {
    images.forEach(image => { image.loading = 'eager'; });
    await Promise.all(images.map(image => image.decode()));
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

async function geometry(page) {
  return page.evaluate(() => {
    const plates = [...document.querySelectorAll('.artifact')].map(el => {
      const box = el.getBoundingClientRect(), graphic = el.querySelector('.artifact-graphic').getBoundingClientRect(), caption = el.querySelector('.artifact-caption').getBoundingClientRect();
      return { id: el.getAttribute('data-channel'), x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom,
        captionsClear: caption.top >= graphic.bottom - 1, captionColor: getComputedStyle(el.querySelector('.artifact-caption')).color };
    });
    const overlap = plates.some((a, index) => plates.slice(index + 1).some(b => Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1));
    return { overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, overlap,
      captionsClear: plates.every(plate => plate.captionsClear), plates, cls: window.__transmissionReview.cls };
  });
}

async function nodeTelemetry(page) {
  return page.locator('.artifact').evaluateAll(plates => plates.flatMap(plate => [...plate.querySelectorAll('[data-motion]')].map((node, index) => {
    const style = getComputedStyle(node), animation = node.getAnimations()[0], effect = animation?.effect;
    return { id: `${plate.getAttribute('data-channel')}/${index}`, class: node.getAttribute('class'), name: style.animationName,
      duration: style.animationDuration, delay: style.animationDelay, state: style.animationPlayState, timing: style.animationTimingFunction,
      origin: style.transformOrigin, box: style.transformBox, transform: style.transform, opacity: style.opacity, dash: style.strokeDashoffset,
      phase: plate.style.getPropertyValue('--phase'), react: style.getPropertyValue('--react').trim(),
      currentTime: animation?.currentTime, frames: effect?.getKeyframes() || [] };
  })));
}

function costSummary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samples: samples.length, maxMs: samples.length ? sorted.at(-1) : null,
    p95Ms: samples.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] : null };
}

async function pointerPath(page, steps = 240) {
  const box = await page.locator('.desk-surface').boundingBox(); assert.ok(box, 'Real bay geometry required.');
  for (let index = 0; index < steps; index++) {
    const angle = index / 18;
    await page.mouse.move(box.x + box.width / 2 + Math.cos(angle) * box.width * .35, box.y + box.height / 2 + Math.sin(angle) * box.height * .35);
    await page.waitForTimeout(16);
  }
}

async function browserTrace(page, out) {
  const session = await page.context().newCDPSession(page);
  const path = join(out, 'pointer-performance.trace.json');
  let result;
  await session.send('Tracing.start', { categories: 'devtools.timeline,v8.execute,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' });
  try { await pointerPath(page, 100); }
  finally {
    const complete = new Promise(done => session.once('Tracing.tracingComplete', done));
    await session.send('Tracing.end');
    const { stream } = await complete, chunks = [];
    for (;;) {
      const item = await session.send('IO.read', { handle: stream });
      chunks.push(Buffer.from(item.data, item.base64Encoded ? 'base64' : 'utf8'));
      if (item.eof) break;
    }
    await session.send('IO.close', { handle: stream }); await session.detach();
    const body = Buffer.concat(chunks); await writeFile(path, body, { flag: 'wx' });
    const events = JSON.parse(body).traceEvents;
    const summary = {};
    for (const name of ['FireAnimationFrame', 'FunctionCall', 'EventDispatch', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'CompositeLayers']) {
      const matches = events.filter(event => event.name === name && event.ph === 'X' && typeof event.dur === 'number');
      summary[name] = { count: matches.length, totalMs: matches.reduce((sum, event) => sum + event.dur / 1000, 0), maxMs: Math.max(0, ...matches.map(event => event.dur / 1000)) };
    }
    result = { path, bytes: body.length, events: events.length, summary,
      note: 'Separate traced run; inclusive event durations overlap and must not be summed as total page cost.' };
  }
  return result;
}

// Separate from solo costs: census native IDs, exact capture identity and lifecycle-owned timers.
function initializeNativeReview() {
  sessionStorage.setItem('ha-transmission-boot', '1');
  Math.random = () => 0; // Exercise the real minimum 20s ambient deadline, without a virtual clock.
  const state = { frames: [], visibility: [], cancels: [], inputs: [], timerEvents: [], tears: [], errors: [], maxQueued: 0 };
  window.__transmissionNative = state;
  const pending = new Set(), timers = new Map(), callbacks = new WeakMap(), listeners = [];
  const now = () => performance.now();
  const ours = () => {
    const stack = new Error().stack || '';
    return [...document.scripts].some(script => script.textContent.includes('ha-transmission-boot') && stack.includes(script.src || location.href));
  };
  const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
  let serial = 0;
  window.requestAnimationFrame = callback => {
    if (!callbacks.has(callback)) callbacks.set(callback, { id: ++serial, ours: ours() });
    const entry = callbacks.get(callback);
    if (!entry.ours) return raf(callback);
    let id;
    id = raf(timestamp => {
      pending.delete(id);
      state.frames.push({ nativeId: id, callbackId: entry.id, timestamp, at: now(), hidden: document.hidden });
      return callback(timestamp);
    });
    pending.add(id); state.maxQueued = Math.max(state.maxQueued, pending.size);
    return id;
  };
  window.cancelAnimationFrame = id => {
    state.cancels.push({ id, at: now(), hidden: document.hidden, wasPending: pending.delete(id) });
    return cancel(id);
  };
  const timeout = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
  window.setTimeout = (callback, delay, ...args) => {
    if (typeof callback !== 'function' || !ours()) return timeout(callback, delay, ...args);
    const at = now(), kind = delay >= 20000 && delay <= 34000 ? 'ambient' : 'effect';
    let id;
    id = timeout(() => {
      timers.delete(id); state.timerEvents.push({ action: 'fire', id, kind, at: now(), hidden: document.hidden });
      return callback.apply(window, args);
    }, delay);
    const timer = { id, kind, at, delay, due: at + delay };
    timers.set(id, timer); state.timerEvents.push({ action: 'set', ...timer, hidden: document.hidden });
    return id;
  };
  window.clearTimeout = id => {
    const timer = timers.get(id);
    if (timer) { timers.delete(id); state.timerEvents.push({ ...timer, action: 'clear', at: now(), hidden: document.hidden }); }
    return clear(id);
  };
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  const capture = options => typeof options === 'boolean' ? options : Boolean(options?.capture);
  const bayListener = (target, type) => target instanceof Element && target.matches('.desk-surface') && type === 'pointermove';
  EventTarget.prototype.addEventListener = function (type, callback, options) {
    if (bayListener(this, type) && !listeners.some(entry => entry.target === this && entry.type === type && entry.callback === callback && entry.capture === capture(options))) {
      listeners.push({ target: this, type, callback, capture: capture(options), passive: Boolean(options?.passive) });
    }
    return add.call(this, type, callback, options);
  };
  EventTarget.prototype.removeEventListener = function (type, callback, options) {
    const index = listeners.findIndex(entry => entry.target === this && entry.type === type && entry.callback === callback && entry.capture === capture(options));
    if (index !== -1) listeners.splice(index, 1);
    return remove.call(this, type, callback, options);
  };
  state.snapshot = () => ({ at: now(), hidden: document.hidden, frames: state.frames.length, queued: pending.size,
    values: [...document.querySelectorAll('.artifact')].map(plate => ['--prox', '--nx', '--ny'].map(key => Number(plate.style.getPropertyValue(key)))),
    listeners: listeners.map(({ passive, capture }) => ({ passive, capture })), timers: [...timers.values()],
    selected: document.querySelectorAll('.artifact[data-selected]').length, tearing: document.querySelectorAll('[data-tear]').length });
  add.call(document, 'visibilitychange', event => {
    const record = { at: now(), hidden: document.hidden, trusted: event.isTrusted, beforeQueued: pending.size, pendingIds: [...pending] };
    state.visibility.push(record); queueMicrotask(() => { record.after = state.snapshot(); });
  }, true);
  add.call(document, 'pointermove', event => state.inputs.push({ at: now(), hidden: document.hidden, trusted: event.isTrusted,
    type: event.type, clientX: event.clientX, clientY: event.clientY, movementX: event.movementX, movementY: event.movementY,
    inBay: event.target instanceof Element && Boolean(event.target.closest('.desk-surface')) }), { capture: true, passive: true });
  add.call(window, 'error', event => state.errors.push(event.message));
  new MutationObserver(records => {
    for (const record of records) {
      const kind = record.target.getAttribute('data-tear');
      if (kind) state.tears.push({ at: now(), kind, hidden: document.hidden });
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-tear'] });
}

// CDP pointer coordinates do not move Windows' physical cursor; restore can emit a real hover.
function nativeWindowAction(pid, action, cursor, windowState) {
  assert.ok(Number.isSafeInteger(pid) && pid > 0, 'Owned native PID required.');
  if (windowState) {
    assert.equal(windowState.pid, pid, 'The saved native window must belong to the owned PID.');
    assert.ok(Number.isSafeInteger(windowState.handle) && windowState.handle > 0 && typeof windowState.topmost === 'boolean', 'Saved native window state required.');
  }
  const operations = {
    minimize: '[NativeReviewDesktop]::SetCursorPos(1, 1) | Out-Null; [NativeReviewDesktop]::ShowWindowAsync($handle, 6) | Out-Null',
    restore: '[NativeReviewDesktop]::ShowWindowAsync($handle, 9) | Out-Null; [NativeReviewDesktop]::SetForegroundWindow($handle) | Out-Null',
    topmost: 'if (-not [NativeReviewDesktop]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 0, 0, 0x0013)) { throw "Owned HWND_TOPMOST failed" }',
    'topmost-restore': `if (-not [NativeReviewDesktop]::SetWindowPos($handle, [IntPtr](${windowState?.topmost ? -1 : -2}), 0, 0, 0, 0, 0x0013)) { throw "Owned topmost restoration failed" }`,
    cursor: `[NativeReviewDesktop]::SetCursorPos(${cursor?.X ?? 1}, ${cursor?.Y ?? 1}) | Out-Null`,
  };
  assert.ok(Object.hasOwn(operations, action), 'Known owned desktop action required.');
  const script = `$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativeReviewDesktop {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr handle, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr handle, int index);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr handle, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr handle);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint pid);
}
'@
$before = New-Object NativeReviewDesktop+Point
if (-not [NativeReviewDesktop]::GetCursorPos([ref]$before)) { throw 'Cannot read native cursor' }
$handle = [IntPtr]::Zero
[uint32]$owner = 0
${action === 'cursor' ? '' : `$handle = ${windowState ? `[IntPtr]${windowState.handle}` : `(Get-Process -Id ${pid}).MainWindowHandle`}
if ($handle -eq [IntPtr]::Zero) { throw 'Owned browser has no native window' }
[NativeReviewDesktop]::GetWindowThreadProcessId($handle, [ref]$owner) | Out-Null
if ($owner -ne ${pid}) { throw 'Native window PID ownership mismatch' }`}
$foregroundBefore = [NativeReviewDesktop]::GetForegroundWindow().ToInt64()
$topmostBefore = if ($handle -ne [IntPtr]::Zero) { [bool]([NativeReviewDesktop]::GetWindowLongPtr($handle, -20).ToInt64() -band 8) } else { $null }
${operations[action]}
Start-Sleep -Milliseconds 100
$after = New-Object NativeReviewDesktop+Point
if (-not [NativeReviewDesktop]::GetCursorPos([ref]$after)) { throw 'Cannot verify native cursor' }
$topmostAfter = if ($handle -ne [IntPtr]::Zero) { [bool]([NativeReviewDesktop]::GetWindowLongPtr($handle, -20).ToInt64() -band 8) } else { $null }
[pscustomobject]@{ pid = ${pid}; owner = $owner; handle = $handle.ToInt64(); foregroundBefore = $foregroundBefore; foreground = [NativeReviewDesktop]::GetForegroundWindow().ToInt64(); iconic = [NativeReviewDesktop]::IsIconic($handle); topmostBefore = $topmostBefore; topmostAfter = $topmostAfter; flags = ${action.startsWith('topmost') ? '19' : '$null'}; before = $before; cursor = $after } | ConvertTo-Json -Compress`;
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { windowsHide: true, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || 'Native desktop control failed.');
  return JSON.parse(result.stdout.trim());
}

async function ownedNativeBrowser(out) {
  const candidates = process.platform === 'win32' ? [
    join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env.PROGRAMFILES || 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'),
  ] : [chromium.executablePath()];
  let executable;
  for (const candidate of candidates) { try { await access(candidate); executable = candidate; break; } catch { /* Try the next installed location. */ } }
  assert.ok(executable, 'A native headed Chromium/Edge executable is required.');
  const profile = join(out, 'native-browser-profile'); await mkdir(profile);
  const args = [`--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--window-size=1440,1100', 'about:blank'];
  const log = createWriteStream(join(out, 'native-browser.log'), { flags: 'wx' });
  const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  let browser, launchError, port, originalCursor, originalTopmost;
  child.once('error', error => { launchError = error; });
  const desktop = process.platform === 'win32' ? (action, window) => {
    if (action === 'topmost') originalTopmost ??= { pid: window.pid, handle: window.handle, topmost: window.topmostAfter };
    const result = nativeWindowAction(child.pid, action, undefined, action === 'topmost' ? originalTopmost : undefined);
    originalCursor ??= result.before;
    return result;
  } : null;
  const stop = async () => {
    let topmost, topmostError;
    if (originalTopmost) {
      try { topmost = nativeWindowAction(child.pid, 'topmost-restore', undefined, originalTopmost); }
      catch (error) { topmostError = error.message; } // Closing the owned browser and restoring the cursor still run.
    }
    if (browser) {
      try { const session = await browser.newBrowserCDPSession(); await session.send('Browser.close'); } catch { /* Owned browser may have closed already. */ }
      await browser.close().catch(() => {});
    }
    if (child.exitCode === null && child.signalCode === null) {
      await Promise.race([new Promise(done => child.once('close', done)), wait(1500)]);
      if (child.exitCode === null && child.signalCode === null && child.pid) {
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
        else child.kill('SIGTERM');
        await Promise.race([new Promise(done => child.once('close', done)), wait(5000)]);
      }
    }
    await new Promise(done => log.end(done));
    const cursor = originalCursor && nativeWindowAction(child.pid, 'cursor', originalCursor);
    return { pid: child.pid, stopped: child.exitCode !== null || child.signalCode !== null, cdpPortClear: port ? !await occupied(port) : null,
      cursorRestored: cursor ? cursor.cursor.X === originalCursor.X && cursor.cursor.Y === originalCursor.Y : null,
      topmost, topmostError, topmostRestored: originalTopmost ? Boolean(topmost && topmost.topmostAfter === originalTopmost.topmost) : null };
  };
  try {
    let endpoint;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error(`Owned native browser exited: ${child.exitCode}`);
      try {
        const [value, path] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
        port = Number(value); assert.ok(port > 0 && path?.startsWith('/devtools/browser/'), 'Invalid owned CDP endpoint');
        endpoint = `ws://127.0.0.1:${port}${path}`; break;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await wait(100);
    }
    assert.ok(endpoint, 'Owned native browser did not publish its CDP endpoint.');
    // Focus emulation is session-scoped. Only noDefaults + the default context skips it.
    browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
    const context = browser.contexts()[0]; assert.ok(context, 'Native default context is required.');
    return { browser, context, stop, desktop, environment: { executable, args, pid: child.pid, endpoint, noDefaults: true, defaultContext: true, headed: true, version: browser.version() } };
  } catch (error) { await stop(); throw error; }
}

export async function realTabVisibility(base, out) {
  const result = { method: 'Owned raw headed browser over CDP with noDefaults/default context; native tab switch/minimize/restore and temporary PID-owned topmost, no visibility getter override',
    nativeDocumentVisibility: false, window: {}, ambient: null, telemetry: null, observed: false };
  const save = () => writeFile(join(out, 'visibility.json'), JSON.stringify(result, null, 2));
  let owned;
  const snap = page => page.evaluate(() => window.__transmissionNative.snapshot());
  const until = async (page, at) => wait(Math.max(0, at - await page.evaluate(() => performance.now())));
  try {
    owned = await ownedNativeBrowser(out); result.environment = owned.environment; await save();
    await owned.context.addInitScript(initializeNativeReview);
    const page = owned.context.pages()[0] || await owned.context.newPage();
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(base); await decodeImages(page); await page.locator('.desk-surface').scrollIntoViewIfNeeded();
    await page.bringToFront(); await page.mouse.move(1, 1); await wait(800);
    const session = await owned.context.newCDPSession(page), window = await session.send('Browser.getWindowForTarget');
    result.window.initial = window;
    const box = await page.locator('.artifact.pc').boundingBox(); assert.ok(box, 'Native foreground geometry required.');
    const point = () => page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await point(); await wait(250); result.foreground = await snap(page); await save();
    // A blank owned tab keeps this page natively hidden if the desktop restores the window early.
    const cover = await owned.context.newPage(); await cover.goto('about:blank'); await cover.bringToFront();
    const coverSession = await owned.context.newCDPSession(cover);
    result.window.cover = await coverSession.send('Browser.getWindowForTarget');
    assert.equal(result.window.cover.windowId, window.windowId, 'The cover tab must belong to the same owned native window.');
    await coverSession.detach();
    if (owned.desktop) result.window.nativeMinimize = owned.desktop('minimize');
    else await session.send('Browser.setWindowBounds', { windowId: window.windowId, bounds: { windowState: 'minimized' } });
    result.window.minimized = (await session.send('Browser.getWindowBounds', { windowId: window.windowId })).bounds;
    await wait(300); result.hidden = await snap(page); await save();
    // Reposition outside the bay while hidden: restoring an old hover cannot count as fresh input.
    await page.mouse.move(1, 1);
    const old = result.foreground.timers.find(timer => timer.kind === 'ambient');
    await until(page, Math.max(result.hidden.at + 800, (old?.due || result.hidden.at) + 100));
    result.hiddenLater = await snap(page); await save();
    if (owned.desktop) {
      result.window.nativeRestore = owned.desktop('restore');
      assert.equal(result.window.nativeRestore.foreground, result.window.nativeRestore.handle, 'The owned native window must actually regain foreground.');
      // Keep only this already PID-checked window above occluders until the fresh ambient deadline.
      // 0x0013 = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE; cleanup restores its original topmost state.
      result.window.topmost = owned.desktop('topmost', result.window.nativeRestore);
      await save();
      assert.equal(result.window.topmost.topmostAfter, true, 'The owned native window must actually become topmost.');
    }
    else await session.send('Browser.setWindowBounds', { windowId: window.windowId, bounds: { windowState: 'normal' } });
    result.window.restored = (await session.send('Browser.getWindowBounds', { windowId: window.windowId })).bounds;
    await page.bringToFront(); await wait(500); result.returnedBeforeInput = await snap(page); await save();
    await point(); await wait(350); result.resumed = await snap(page); await save();
    await wait(2500); result.settled = await snap(page); await save();
    const visibleAt = await page.evaluate(() => window.__transmissionNative.visibility.find(event => !event.hidden)?.at);
    const fresh = result.returnedBeforeInput.timers.find(timer => timer.kind === 'ambient');
    if (Number.isFinite(visibleAt) && fresh) {
      await until(page, visibleAt + 19500);
      const quiet = await page.evaluate(() => ({ at: performance.now(), starts: window.__transmissionNative.tears.filter(event => event.kind === 'ambient') }));
      result.ambient = { visibleAt, quietAt: quiet.at, quietStarts: quiet.starts.filter(event => event.at >= visibleAt).length, firstAt: null };
      await save(); await until(page, fresh.due + 400);
    }
    result.telemetry = await page.evaluate(() => { const { snapshot, ...state } = window.__transmissionNative; return state; });
    result.nativeDocumentVisibility = await page.evaluate(() => !Object.hasOwn(document, 'hidden') && !Object.hasOwn(document, 'visibilityState'));
    if (result.ambient) result.ambient.firstAt = result.telemetry.tears.find(event => event.kind === 'ambient' && event.at >= visibleAt)?.at ?? null;
    result.issues = visibilityIssues(result); result.observed = result.issues.length === 0;
    await session.detach();
  } catch (error) {
    result.error = { message: error.message, stack: error.stack };
    result.issues = [...visibilityIssues(result), `Native visibility runner: ${error.message}`];
  } finally {
    if (owned) {
      result.cleanup = await owned.stop();
      if (result.cleanup.topmostRestored === false) {
        result.error ??= { message: result.cleanup.topmostError || 'Owned native topmost state was not restored.' };
        result.issues = [...visibilityIssues(result), `Native visibility runner: ${result.error.message}`]; result.observed = false;
      }
    }
    await save();
  }
  return result;
}

async function recordMotion(browser, base, out, save) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'no-preference',
    recordVideo: { dir: out, size: { width: 1440, height: 1050 } } });
  await context.addInitScript(initializeReview);
  await context.addInitScript(key => sessionStorage.setItem(key, '1'), bootKey);
  const page = await context.newPage(), video = page.video();
  const result = { kind: 'ambient-and-six-channel', startedAt: new Date().toISOString(), segments: [], telemetry: [] };
  try {
    await page.goto(base); await decodeImages(page); await page.locator('.desk-surface').scrollIntoViewIfNeeded(); await page.mouse.move(1, 1);
    const start = Date.now(); result.ambientStartedAt = start;
    result.telemetry.push({ label: 'ambient-start', nodes: await nodeTelemetry(page) }); await save(result);
    await page.waitForTimeout(14000);
    result.telemetry.push({ label: 'ambient-14s', nodes: await nodeTelemetry(page) }); await save(result);
    await page.waitForTimeout(Math.max(0, 50000 - (Date.now() - start)));
    result.ambientDurationMs = Date.now() - start;
    result.telemetry.push({ label: 'ambient-50s', nodes: await nodeTelemetry(page) }); await save(result);
    for (const [id, beat] of channels) {
      await page.locator(`.channel-key[data-channel="${id}"]`).click();
      const box = await page.locator(`.artifact.${id}`).boundingBox();
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
      const selectedAt = Date.now();
      const nodes = (await nodeTelemetry(page)).filter(node => node.id.startsWith(`${id}/`));
      await page.waitForTimeout(beat + 1500);
      const returned = await page.locator(`.artifact.${id}`).evaluate(el => ({ selected: el.hasAttribute('data-selected'), react: Number(getComputedStyle(el).getPropertyValue('--react')) }));
      result.segments.push({ id, beatMs: beat, elapsedMs: Date.now() - selectedAt, selectedNodes: nodes, returned }); await save(result);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(2000);
    result.telemetry.push({ label: 'reduced-end', nodes: await nodeTelemetry(page) });
    result.state = await page.evaluate(() => window.__transmissionReview);
  } finally {
    await context.close(); result.path = await video.path(); result.finishedAt = new Date().toISOString(); await save(result);
  }
  return result;
}

async function recordBoot(browser, base, out, save) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'no-preference',
    recordVideo: { dir: out, size: { width: 1440, height: 1050 } } });
  await context.addInitScript(initializeReview);
  const page = await context.newPage(), video = page.video(), result = { kind: 'fresh-session-boot', startedAt: new Date().toISOString() };
  try {
    await page.goto(base); await page.waitForTimeout(4500);
    result.state = await page.evaluate(() => window.__transmissionReview);
    result.remaining = await page.locator('[data-boot],.artifact[data-booting]').count();
  } finally { await context.close(); result.path = await video.path(); result.finishedAt = new Date().toISOString(); await save(result); }
  return result;
}

export async function review(options = {}) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const out = join(root, '.superpowers/transmission-review', new Date().toISOString().replace(/[:.]/g, '-'));
  await readFile(join(root, 'package.json')); await mkdir(out, { recursive: true });
  const report = { status: 'in-progress', startedAt: new Date().toISOString(), root, out, base: options.base || 'http://127.0.0.1:4321',
    environment: { node: process.version, platform: process.platform, browser: null, headed: Boolean(options.headed) },
    sourceBytes: (await readFile(join(root, 'src/scripts/alive.ts'))).length, sourceSha256: sha(await readFile(join(root, 'src/scripts/alive.ts'))),
    screenshots: [], briefs: [], runtime: [], pointer: null, trace: null, visibility: null, videos: [], issues: [], reviewLimits: [] };
  const save = async () => { await writeFile(join(out, 'measurements.json'), JSON.stringify(report, null, 2)); };
  const issue = value => { if (!report.issues.includes(value)) report.issues.push(value); };
  await save(); console.log(`EVIDENCE: ${out}`);
  let preview, browser;
  try {
    if (!options.base) { preview = await ownedPreview(root, out); report.preview = { owned: true, pid: preview.child.pid, ...preview.launch }; await save(); }
    else report.preview = { owned: false, note: 'SITE_URL supplied; no process ownership or termination claimed.' };
    if (!options.visibilityOnly) {
      browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: !options.headed });
      report.environment.browser = browser.version(); await save();
      for (const width of widths) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
        await context.addInitScript(initializeReview);
        const page = await context.newPage();
        try {
          for (const route of routes) {
            const response = await page.goto(new URL(route, report.base).href); await decodeImages(page);
            const name = route === '/' ? 'home' : route.startsWith('/projects/') ? route.split('/')[2] : '404';
            const measured = await geometry(page), path = join(out, `${name}-${width}-reduced.png`);
            await page.screenshot({ path, fullPage: true });
            report.screenshots.push({ route, width, status: response.status(), path, ...measured });
            const expected = name === '404' ? 404 : 200;
            if (response.status() !== expected || measured.overflow || measured.overlap || !measured.captionsClear || measured.cls !== 0) issue(`Layout/CLS/status: ${route} at ${width}`);
            if (width === widths[0]) {
              const attribution = await attributeRuntime(await response.text(), response.url(), async url => {
                const fetched = await context.request.get(url); assert.ok(fetched.ok(), `Runtime response ${fetched.status()}: ${url}`); return fetched.body();
              });
              report.runtime.push({ route, ...attribution });
              runtimeIssues(attribution, route).forEach(issue);
            }
            if (route === '/') {
              await page.locator('#project-nasa-kepler summary').click(); await decodeImages(page);
              const path = join(out, `expanded-brief-${width}.png`);
              await page.locator('#project-nasa-kepler').screenshot({ path });
              const brief = { width, path, open: await page.locator('#project-nasa-kepler').getAttribute('open'), geometry: await geometry(page) };
              report.briefs.push(brief); briefIssues(brief).forEach(issue);
            }
            await save(); console.log(`LAYOUT: ${name} ${width}, CLS ${measured.cls}`);
          }
        } finally { await context.close(); }
      }
      const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'no-preference' });
      await context.addInitScript(initializeReview);
      await context.addInitScript(key => sessionStorage.setItem(key, '1'), bootKey);
      const page = await context.newPage();
      try {
        await page.goto(report.base); await decodeImages(page); await page.locator('.desk-surface').scrollIntoViewIfNeeded();
        const external = report.runtime[0].scripts.find(script => script.delivery === 'external');
        if (external) await page.evaluate(url => { window.__aliveURL = url; }, external.url);
        report.motionNodes = await nodeTelemetry(page);
        if (report.motionNodes.length !== 29 || new Set(report.motionNodes.map(node => node.id)).size !== 29) issue('Unique per-node motion telemetry contract');
        await page.evaluate(() => { const state = window.__transmissionReview; state.samples = []; state.callbackIds = []; state.capture = true; });
        await pointerPath(page);
        const state = await page.evaluate(() => { window.__transmissionReview.capture = false; return window.__transmissionReview; });
        report.pointer = { ...costSummary(state.samples), cls: state.cls, callbackIds: [...new Set(state.callbackIds)], rawSamples: state.samples,
          note: 'Solo untraced callback run; six plates, native mouse movement, performance.now, boot-key stack attribution.' };
        if (state.samples.length < 60 || report.pointer.maxMs >= 2 || state.cls !== 0 || report.pointer.callbackIds.length !== 1) issue('Pointer callback/CLS budget');
        await save(); console.log(`POINTER: ${report.pointer.samples} samples, max ${report.pointer.maxMs}ms, p95 ${report.pointer.p95Ms}ms`);
        report.trace = await browserTrace(page, out); await save();
      } finally { await context.close(); }
      if (options.record) {
        const checkpoint = async value => {
          const index = report.videos.findIndex(video => video.kind === value.kind);
          if (index < 0) report.videos.push(value); else report.videos[index] = value;
          await save();
        };
        await recordMotion(browser, report.base, out, checkpoint);
        await recordBoot(browser, report.base, out, checkpoint);
      } else report.reviewLimits.push('Recordings not requested; run --record for ambient/six-channel and fresh-session boot videos.');
      await browser.close(); browser = null;
    } else report.reviewLimits.push('Scoped native visibility run; layout, solo callback timing, trace and recordings are not rerun.');
    report.visibility = await realTabVisibility(report.base, out);
    visibilityIssues(report.visibility).forEach(issue);
    if (report.visibility.error) issue(`Native visibility runner: ${report.visibility.error.message}`);
    await save();
    report.reviewLimits.push('Visual observations and recorded-frame review must be added by a reviewer; geometry booleans are not visual approval.');
    report.status = report.issues.length ? 'measured-with-issues' : 'measured';
  } catch (error) {
    report.status = 'interrupted'; report.error = { message: error.message, stack: error.stack }; issue(`Runner error: ${error.message}`);
  } finally {
    if (browser) await browser.close();
    if (preview) report.cleanup = await preview.stop();
    report.finishedAt = new Date().toISOString(); await save();
  }
  console.log(JSON.stringify({ status: report.status, out, sourceBytes: report.sourceBytes,
    shippedBytes: report.runtime.map(route => ({ route: route.route, bytes: route.aggregateBytes })),
    screenshots: report.screenshots.length, briefs: report.briefs.length, pointer: report.pointer && costSummary(report.pointer.rawSamples),
    trace: report.trace?.path, videos: report.videos.map(video => video.path), issues: report.issues, reviewLimits: report.reviewLimits, cleanup: report.cleanup }, null, 2));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await review({ base: process.env.SITE_URL, record: process.argv.includes('--record'), headed: process.argv.includes('--headed'), visibilityOnly: process.argv.includes('--visibility-only') });
  if (report.issues.length) process.exitCode = 1;
}
