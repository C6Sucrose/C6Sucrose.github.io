import test from 'node:test';
import assert from 'node:assert/strict';
import { attributeRuntime, briefIssues } from '../scripts/review-transmission.mjs';
import * as reviewer from '../scripts/review-transmission.mjs';

// A filename-based reviewer misses inline delivery; character length undercounts UTF-8.
test('reviewer attributes actual inline boot-key bytes and ignores unrelated scripts', async () => {
  const html = '<script>/*unrelated*/</script><script type="module">/*ha-transmission-boot*/\n"é";</script>';
  const result = await attributeRuntime(html, 'http://local/', async () => { throw new Error('No external script'); });
  assert.equal(result.scripts.length, 1);
  assert.equal(result.scripts[0].delivery, 'inline');
  assert.equal(result.scripts[0].bytes, 30);
  assert.equal(result.aggregateBytes, 30);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(reviewer.runtimeIssues(result, '/'), []);
});

// Moving behavior into a shared dependency must increase the counted delivered payload.
test('reviewer counts imported dependencies and identifies coalesced controllers', async () => {
  const bodies = new Map([
    ['http://local/_astro/runtime.js', '/*ha-transmission-boot*/import"./shared.js";'],
    ['http://local/_astro/shared.js', '/*ha-desk-light*/'],
  ]);
  const result = await attributeRuntime('<script type="module" src="/_astro/runtime.js"></script>', 'http://local/',
    async url => Buffer.from(bodies.get(url) ?? ''));
  assert.equal(result.scripts[0].delivery, 'external');
  assert.equal(result.scripts[0].bytes, 44);
  assert.equal(result.aggregateBytes, 61);
  assert.equal(result.modules.length, 2);
  assert.deepEqual(result.modules[1].coalesced, ['ha-desk-light']);
  assert.match(reviewer.runtimeIssues(result, '/')[0], /coalesced/i);
});

// Duplicate inline scripts really deliver two bodies; a module URL is fetched once.
test('reviewer counts mixed delivery without assuming one external filename', async () => {
  const html = '<script>/*ha-transmission-boot*/</script><script src="/runtime.js"></script><script src="/runtime.js"></script>';
  const result = await attributeRuntime(html, 'http://local/', async () => Buffer.from('/*ha-transmission-boot*/'));
  assert.equal(result.scripts.length, 3);
  assert.deepEqual(result.scripts.map(script => script.delivery), ['inline', 'external', 'external']);
  assert.equal(result.modules.length, 2);
  assert.equal(result.aggregateBytes, 48);
  assert.deepEqual(reviewer.runtimeIssues(result, '/'), []);
});

// A computed dynamic import cannot be silently treated as zero dependency bytes.
test('reviewer reports unresolved dynamic dependencies instead of hiding their size', async () => {
  const result = await attributeRuntime('<script>/*ha-transmission-boot*/import(window.runtimePath)</script>', 'http://local/',
    async () => Buffer.alloc(0));
  assert.equal(result.scripts.length, 1);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0], /unresolved.*import/i);
  assert.deepEqual(reviewer.runtimeIssues(result, '/'), result.issues);
});

// A saved screenshot is not success when its disclosure is closed or the expanded layout moved.
test('reviewer gates expanded-brief open state, overflow and CLS', () => {
  const clean = { width: 320, open: '', geometry: { overflow: false, overlap: false, captionsClear: true, cls: 0 } };
  assert.deepEqual(briefIssues(clean), []);
  assert.equal(briefIssues({ ...clean, open: null }).length, 1);
  assert.equal(briefIssues({ ...clean, geometry: { ...clean.geometry, overflow: true } }).length, 1);
  assert.equal(briefIssues({ ...clean, geometry: { ...clean.geometry, cls: .01 } }).length, 1);
  assert.equal(briefIssues({ ...clean, geometry: { ...clean.geometry, captionsClear: false } }).length, 1);
  assert.equal(briefIssues({ ...clean, geometry: { ...clean.geometry, overlap: true } }).length, 1);
});

// Reject a combined 4000-byte delivery even though every individual element is under budget.
test('reviewer gates actual inline plus external aggregate at the strict boundary', async () => {
  const body = '/*ha-transmission-boot*/'.padEnd(2000, ' ');
  const html = `<script>${body}</script><script src="/runtime.js"></script>`;
  const result = await attributeRuntime(html, 'http://local/', async () => Buffer.from(body));
  assert.equal(result.aggregateBytes, 4000);
  assert.ok(result.scripts.every(script => script.bytes < 4000));
  assert.equal(reviewer.runtimeIssues(result, '/').length, 1);
  const below = await attributeRuntime(html, 'http://local/', async () => Buffer.from(body.slice(0, -1)));
  assert.equal(below.aggregateBytes, 3999);
  assert.deepEqual(reviewer.runtimeIssues(below, '/'), []);
  assert.ok(reviewer.runtimeIssues({ ...below, aggregateBytes: NaN }, '/').length > 0);
  assert.ok(reviewer.runtimeIssues({ ...below, aggregateBytes: 1 }, '/').length > 0, 'A forged total cannot hide counted modules.');
  const missing = await attributeRuntime('<script>/*unrelated*/</script>', 'http://local/', async () => Buffer.alloc(0));
  assert.match(reviewer.runtimeIssues(missing, '/')[0], /missing/i);
});

// Browser-paused leaked work and pre-input replay satisfied the old observed predicate.
test('reviewer rejects native-paused cancellation leaks and pre-input replay', () => {
  const zero = Array.from({ length: 6 }, () => [0, 0, 0]);
  const active = [[.5, .1, .1], ...zero.slice(1)];
  const ambient = { id: 7, kind: 'ambient', at: 100, delay: 20000, due: 20100 };
  const fresh = { id: 8, kind: 'ambient', at: 21200, delay: 20000, due: 41200 };
  const listener = { passive: true, capture: false };
  const stopped = { at: 200, hidden: true, frames: 5, queued: 0, values: zero, listeners: [], timers: [], selected: 0, tearing: 0 };
  // One foreground stream, one cancelled native ID, then a single fresh input and finite idle decay.
  const frames = [
    ...Array.from({ length: 5 }, (_, index) => ({ nativeId: index + 20, callbackId: 1, timestamp: 64 + index * 16, at: 64.1 + index * 16, hidden: false })),
    ...Array.from({ length: 157 }, (_, index) => ({ nativeId: index + 26, callbackId: 1, timestamp: 21466 + index * 16, at: 21466.1 + index * 16, hidden: false })),
  ];
  const clean = {
    nativeDocumentVisibility: true, window: { minimized: { windowState: 'minimized' }, restored: { windowState: 'normal' } },
    foreground: { ...stopped, at: 150, hidden: false, queued: 1, values: active, listeners: [listener], timers: [ambient] },
    hidden: stopped, hiddenLater: { ...stopped, at: 21100 },
    returnedBeforeInput: { ...stopped, at: 21400, hidden: false, listeners: [listener], timers: [fresh] },
    resumed: { ...stopped, at: 21800, hidden: false, frames: 26, queued: 1, values: active, listeners: [listener], timers: [fresh] },
    settled: { ...stopped, at: 24200, hidden: false, frames: 162, listeners: [listener], timers: [fresh] },
    ambient: { visibleAt: 21200, quietAt: 40700, firstAt: 41200, quietStarts: 0 },
    telemetry: { maxQueued: 1, errors: [],
      inputs: [{ at: 50, type: 'pointermove', hidden: false, trusted: true, inBay: true }, { at: 21450, type: 'pointermove', hidden: false, trusted: true, inBay: true }],
      visibility: [{ at: 200, hidden: true, trusted: true, beforeQueued: 1, pendingIds: [25] }, { at: 21200, hidden: false, trusted: true, beforeQueued: 0, pendingIds: [] }],
      cancels: [{ at: 200, hidden: true, id: 25, wasPending: true }],
      timerEvents: [{ action: 'clear', id: 7, at: 200, hidden: true }, { action: 'fire', id: 8, at: 41200, hidden: false }],
      tears: [{ at: 41200, kind: 'ambient', hidden: false }], frames },
  };
  assert.deepEqual(reviewer.visibilityIssues(clean), []);
  const leaks = [
    ['missing native evidence', data => { data.nativeDocumentVisibility = false; }],
    ['bringToFront without minimizing', data => { data.window.minimized.windowState = 'normal'; }],
    ['missing visibility events', data => { data.telemetry.visibility = []; }],
    ['synthetic hidden event', data => { data.telemetry.visibility[0].trusted = false; }],
    ['inactive foreground queue', data => { data.foreground.queued = 0; }],
    ['absent foreground listener', data => { data.foreground.listeners = []; }],
    ['zero foreground proximity', data => { data.foreground.values = zero; }],
    ['browser-paused cancellation leak', data => { data.telemetry.cancels = []; }],
    ['cancel of an unrelated ID', data => { data.telemetry.cancels[0].id = 99; }],
    ['cancel of nonpending work', data => { data.telemetry.cancels[0].wasPending = false; }],
    ['hidden queue leak', data => { data.hidden.queued = 1; }],
    ['hidden listener leak', data => { data.hidden.listeners = [listener]; }],
    ['hidden proximity leak', data => { data.hidden.values = active; }],
    ['late hidden queue leak', data => { data.hiddenLater.queued = 1; }],
    ['hidden selection leak', data => { data.hidden.selected = 1; }],
    ['hidden tear leak', data => { data.hidden.tearing = 1; }],
    ['uncleared ambient timer', data => { data.hidden.timers = [ambient]; }],
    ['ambient timer only browser-paused', data => { data.telemetry.timerEvents = data.telemetry.timerEvents.filter(event => event.action !== 'clear'); }],
    ['pre-input frame replay', data => { data.returnedBeforeInput.frames = 6; }],
    ['pre-input queued replay', data => { data.returnedBeforeInput.queued = 1; }],
    ['pre-input proximity replay', data => { data.returnedBeforeInput.values = active; }],
    ['unfresh input on return', data => { data.telemetry.inputs.push({ at: 21300, type: 'pointermove', hidden: false, trusted: true, inBay: true }); }],
    ['absent fresh input', data => { data.telemetry.inputs.pop(); }],
    ['synthetic fresh input', data => { data.telemetry.inputs[1].trusted = false; }],
    ['resumed queue leak', data => { data.resumed.queued = 2; }],
    ['duplicate bounded stream', data => { data.telemetry.maxQueued = 2; }],
    ['multiple callback identities', data => { data.telemetry.frames[6].callbackId = 2; }],
    ['duplicate native frame ID', data => { data.telemetry.frames[6].nativeId = 26; }],
    ['cancelled native ID replayed after fresh input', data => { data.telemetry.frames[5].nativeId = 25; }],
    ['same-native-frame burst', data => { data.telemetry.frames[6].timestamp = data.telemetry.frames[5].timestamp; }],
    ['callback during hidden phase', data => { data.telemetry.frames[5].hidden = true; }],
    ['settled queue leak', data => { data.settled.queued = 1; }],
    ['settled proximity leak', data => { data.settled.values = active; }],
    ['callback restarted after idle settlement', data => { data.telemetry.frames.push({ nativeId: 1000, callbackId: 1, timestamp: 24300, at: 24300.1, hidden: false }); }],
    ['wrong listener capture', data => { data.resumed.listeners[0].capture = true; }],
    ['nonpassive return listener', data => { data.returnedBeforeInput.listeners[0].passive = false; }],
    ['stale ambient deadline', data => { data.returnedBeforeInput.timers = [ambient]; }],
    ['early ambient catch-up', data => { data.ambient.firstAt = 21300; }],
    ['ambient during quiet gap', data => { data.ambient.quietStarts = 1; }],
    ['old ambient fires on return', data => { data.telemetry.timerEvents.push({ action: 'fire', id: 7, at: 21200, hidden: false }); }],
    ['ambient starts without fresh timer firing', data => { data.telemetry.timerEvents = data.telemetry.timerEvents.filter(event => event.action !== 'fire'); }],
    ['short ambient quiet observation', data => { data.ambient.quietAt = 21400; }],
    ['native probe error', data => { data.telemetry.errors.push('Native probe failed'); }],
    ['incomplete snapshot', data => { delete data.hiddenLater.values; }],
  ];
  for (const [name, mutate] of leaks) {
    const data = structuredClone(clean); mutate(data);
    assert.ok(reviewer.visibilityIssues(data).length > 0, name);
  }
  assert.ok(reviewer.visibilityIssues(null).length > 0, 'Missing evidence must fail closed.');
});
