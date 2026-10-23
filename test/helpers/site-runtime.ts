import { createHash } from 'node:crypto';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { Page } from '@playwright/test';

// Match delivered code, including Astro's inline optimization, rather than a guessed filename.
export async function interceptSiteRuntime(page: Page, mode: 'suppress' | 'delay') {
  const records: { delivery: string; url: string; bytes: number; sha256: string; coalesced: string[] }[] = [];
  const matches = (code: string) => code.includes('primary-nav') && code.includes('data-filter-count');
  const record = (body: string, delivery: string, url: string) => records.push({ delivery, url,
    bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex'),
    coalesced: ['ha-transmission-boot', 'ha-desk-light', 'pipeline-scenario'].filter(marker => body.includes(marker)) });
  const delayed = (body: string) => `await new Promise(resolve => { window.__releaseSiteRuntime = resolve; });\n${body}`;
  await page.route('**/*', async route => {
    const request = route.request();
    if (!['document', 'script'].includes(request.resourceType())) { await route.continue(); return; }
    const response = await route.fetch(), code = await response.text();
    if (request.resourceType() === 'script') {
      if (!matches(code)) { await route.fulfill({ response }); return; }
      record(code, 'external', request.url());
      if (mode === 'suppress') await route.abort('failed');
      else await route.fulfill({ response, body: delayed(code) });
      return;
    }
    const edits: { start: number; end: number; replacement: string }[] = [];
    const visit = (node: DefaultTreeAdapterMap['node']) => {
      if ('tagName' in node && node.tagName === 'script' && !node.attrs.some(attr => attr.name === 'src')) {
        const body = node.childNodes.map(child => 'value' in child ? child.value : '').join('');
        if (matches(body)) {
          if (!node.attrs.some(attr => attr.name === 'type' && attr.value === 'module')) throw new Error('Site entry must be a real module');
          record(body, 'inline', request.url());
          const location = node.sourceCodeLocation!;
          edits.push(mode === 'suppress' ? { start: location.startOffset, end: location.endOffset, replacement: '' }
            : { start: location.startTag!.endOffset, end: location.endTag!.startOffset, replacement: delayed(body) });
        }
      }
      if ('childNodes' in node) node.childNodes.forEach(visit);
    };
    visit(parse(code, { sourceCodeLocationInfo: true }));
    let html = code;
    for (const edit of edits.sort((a, b) => b.start - a.start)) html = html.slice(0, edit.start) + edit.replacement + html.slice(edit.end);
    await route.fulfill({ response, body: html });
  });
  return records;
}

export type NavEvidenceWindow = typeof window & {
  __releaseSiteRuntime?: () => void;
  __navEvidence: { supported: boolean; cls: number; shifts: { value: number; recent: boolean; at: number }[] };
};

export async function observeLayout(page: Page) {
  await page.addInitScript(() => {
    const evidence = { supported: PerformanceObserver.supportedEntryTypes.includes('layout-shift'), cls: 0,
      shifts: [] as { value: number; recent: boolean; at: number }[] };
    (window as NavEvidenceWindow).__navEvidence = evidence;
    if (evidence.supported) new PerformanceObserver(list => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        evidence.shifts.push({ value: entry.value, recent: entry.hadRecentInput, at: entry.startTime });
        if (!entry.hadRecentInput) evidence.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

export async function settledPaint(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  });
}
