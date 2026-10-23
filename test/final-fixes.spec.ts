import { test, expect, type Locator } from '@playwright/test';
import { interceptSiteRuntime, observeLayout, settledPaint, type NavEvidenceWindow } from './helpers/site-runtime';

const labels = ['The work', 'The person', 'Interests', 'Credentials', 'CV ↗', 'Make contact ↗'];
const hrefs = ['/#work', '/#about', '/#interests', '/#credentials', '/downloads/huraira-ali-cv.pdf', '/#contact'];
const specimens = [
  ['pc', '01', 'Custom PCs & troubleshooting'], ['games', '02', 'Games & modding'],
  ['nature', '03', 'Gardening & nature'], ['cooking', '04', 'Cooking'],
  ['sky', '05', 'Space & the night sky'], ['ai', '06', 'Robotics & AI'],
] as const;

async function rect(target: Locator) {
  return target.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
}

async function navLinks(nav: Locator) {
  await expect(nav.getByRole('link')).toHaveText(labels);
  expect(await nav.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(hrefs);
  for (const link of await nav.getByRole('link').all()) {
    await link.focus(); await expect(link).toBeFocused();
    expect(await link.evaluate(element => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }), 'Conventional navigation link has an unobscured hit target').toBe(true);
  }
}

for (const width of [320, 390]) {
  for (const route of ['/', '/projects/wayfinder/']) {
    // Catches the generic .js marker hiding both navigation and Menu after a partial module failure.
    test(`WR-I1 real site-runtime failure leaves native navigation at ${width}px on ${route}`, async ({ page, context }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(() => sessionStorage.setItem('ha-transmission-boot', '1'));
      const suppressed = await interceptSiteRuntime(page, 'suppress');
      await page.goto(route);
      expect(suppressed, 'Exactly one actual site module is suppressed').toHaveLength(1);
      expect(suppressed[0].coalesced, 'Suppression must leave unrelated controllers alive').toEqual([]);
      await info.attach('site-runtime-suppression.json', { body: JSON.stringify(suppressed, null, 2), contentType: 'application/json' });
      await expect(page.locator('html')).toHaveClass(/\bjs\b/);
      await expect(page.locator('#primary-nav')).not.toHaveAttribute('data-open');
      await expect(page.locator('.menu-toggle')).toBeHidden();
      await page.getByRole('button', { name: 'Turn transmission effects off', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-transmission', 'off');
      await page.getByRole('button', { name: 'Turn transmission effects on', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-transmission', 'on');

      const fallback = page.locator('.menu-fallback'), menu = fallback.locator('summary');
      await expect(menu, 'A functioning native Menu survives the missing controller').toBeVisible();
      expect(await fallback.evaluate(element => element instanceof HTMLDetailsElement)).toBe(true);
      await expect(fallback).not.toHaveAttribute('open');
      await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true })).toHaveCount(0);
      // Playwright's synthetic role map omits native summary; Chromium's real AX tree exposes its disclosure control.
      const ax = await context.newCDPSession(page);
      const nativeMenu = async () => {
        const { nodes } = await ax.send('Accessibility.getFullAXTree');
        return nodes.filter(node => !node.ignored && String(node.name?.value).trim().toUpperCase() === 'MENU' && ['DisclosureTriangle', 'button'].includes(node.role?.value));
      };
      const closedAX = await nativeMenu(); expect(closedAX).toHaveLength(1);
      expect(closedAX[0].properties?.find(property => property.name === 'focusable')?.value.value).toBe(true);
      expect(closedAX[0].properties?.find(property => property.name === 'expanded')?.value.value).toBe(false);
      await menu.focus(); await page.keyboard.press('Enter');
      await expect(fallback).toHaveAttribute('open', '');
      const openedAX = await nativeMenu(); expect(openedAX).toHaveLength(1);
      expect(openedAX[0].properties?.find(property => property.name === 'expanded')?.value.value).toBe(true);
      await info.attach('native-menu-AX.json', { body: JSON.stringify({ closedAX, openedAX }, null, 2), contentType: 'application/json' });
      await ax.detach();
      const nav = fallback.getByRole('navigation', { name: 'Primary navigation', exact: true });
      await navLinks(nav);
      await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true })).toHaveCount(1);
      await page.locator('.site-header').screenshot({ path: info.outputPath(`fallback-${width}.png`), animations: 'disabled' });
      await page.screenshot({ path: info.outputPath(`fallback-open-${width}.png`), animations: 'disabled' });

      // Real Ctrl-click follows unchanged conventional anchors while preserving the failed parent document.
      for (const [name, hash, selector] of [['Credentials', '#credentials', '#credentials'], ['Make contact ↗', '#contact', '#contact']]) {
        const [destination] = await Promise.all([context.waitForEvent('page'), nav.getByRole('link', { name, exact: true }).click({ modifiers: ['Control'] })]);
        await destination.waitForLoadState();
        expect(new URL(destination.url()).hash).toBe(hash);
        await expect(destination.locator(selector)).toBeVisible();
        await destination.close();
      }
      // Edge's native PDF viewer owns this network request outside Playwright's request stream.
      const [cvTab] = await Promise.all([context.waitForEvent('page'), nav.getByRole('link', { name: 'CV ↗', exact: true }).click({ modifiers: ['Control'] })]);
      await expect(cvTab).toHaveURL(new URL(hrefs[4], page.url()).href);
      const cv = await page.request.get(hrefs[4]);
      expect(cv.status()).toBe(200); expect((await cv.body()).subarray(0, 5).toString()).toBe('%PDF-');
      await info.attach('fallback-cv-navigation.json', { body: JSON.stringify({ url: cvTab.url(), status: cv.status(), bytes: (await cv.body()).length }), contentType: 'application/json' });
      for (const destination of context.pages()) if (destination !== page) await destination.close();
      expect(suppressed).toHaveLength(1);
      expect(await page.locator('[id]').evaluateAll(elements => new Set(elements.map(element => element.id)).size === elements.length)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
}

for (const width of [320, 390, 768, 1024, 1440]) {
  // Catches a fallback-to-controller footprint change, initial nav-flow collapse, and delayed-load flash/CLS.
  test(`WR-I1 normal and delayed site initialization preserve header geometry and CLS 0 at ${width}px`, async ({ browser, baseURL }, info) => {
    const evidence = [];
    for (const route of ['/', '/projects/wayfinder/']) {
      let normal: Awaited<ReturnType<typeof rect>> | undefined;
      for (const mode of ['normal', 'delayed'] as const) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'no-preference' });
        try {
          const page = await context.newPage(); await observeLayout(page);
          const deliveries = mode === 'delayed' ? await interceptSiteRuntime(page, 'delay') : [];
          await page.goto(new URL(route, baseURL!).href, { waitUntil: mode === 'delayed' ? 'commit' : 'load' });
          let before: Awaited<ReturnType<typeof rect>> | undefined, slotBefore: Awaited<ReturnType<typeof rect>> | undefined,
            openedHeader: Awaited<ReturnType<typeof rect>> | undefined;
          if (mode === 'delayed') {
            await expect.poll(() => page.evaluate(() => typeof (window as NavEvidenceWindow).__releaseSiteRuntime)).toBe('function');
            expect(deliveries).toHaveLength(1); expect(deliveries[0].coalesced).toEqual([]);
            await expect(page.locator('#primary-nav')).not.toHaveAttribute('data-open');
            await expect(page.locator('[data-transmission-toggle]')).toBeVisible();
            if (width <= 900) {
              await expect(page.locator('.menu-fallback > summary')).toBeVisible();
              await expect(page.locator('.menu-toggle')).toBeHidden();
              await expect(page.locator('.menu-fallback')).not.toHaveAttribute('open');
              await expect(page.locator('#primary-nav')).toBeHidden();
              slotBefore = await rect(page.locator('.menu-fallback > summary'));
            } else await expect(page.locator('#primary-nav')).toBeVisible();
            await settledPaint(page); before = await rect(page.locator('.site-header'));
            // A quiet >500ms real delay keeps release outside recent-input CLS exclusions.
            await page.waitForTimeout(650);
            await page.locator('.site-header').screenshot({ path: info.outputPath(`${route === '/' ? 'home' : 'case'}-${mode}-pre-${width}.png`), animations: 'allow' });
            if (width <= 900) {
              await page.locator('.menu-fallback > summary').click();
              await expect(page.locator('.menu-fallback')).toHaveAttribute('open', '');
              openedHeader = await rect(page.locator('.site-header')); expect(openedHeader).toEqual(before);
              await page.waitForTimeout(650); // Release after the opening input's CLS exclusion expires.
              await page.screenshot({ path: info.outputPath(`${route === '/' ? 'home' : 'case'}-delayed-open-${width}.png`), animations: 'allow' });
            }
            await page.evaluate(() => (window as NavEvidenceWindow).__releaseSiteRuntime!());
            await page.waitForLoadState('load');
          }
          await expect(page.locator('#primary-nav')).toHaveAttribute('data-open', width <= 900 ? 'false' : 'true');
          await expect(page.locator('.menu-fallback')).toBeHidden();
          await settledPaint(page); await page.waitForTimeout(150);
          const after = await rect(page.locator('.site-header'));
          if (mode === 'normal') normal = after;
          else { expect(after).toEqual(before); expect(after).toEqual(normal); }
          const slotAfter = width <= 900 ? await rect(page.locator('.menu-toggle')) : null;
          if (slotBefore) expect(slotAfter).toEqual(slotBefore);
          const layout = await page.evaluate(() => (window as NavEvidenceWindow).__navEvidence);
          expect(layout.supported).toBe(true); expect(layout.cls, JSON.stringify(layout.shifts)).toBe(0);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          await page.locator('.site-header').screenshot({ path: info.outputPath(`${route === '/' ? 'home' : 'case'}-${mode}-${width}.png`), animations: 'allow' });
          evidence.push({ route, mode, width, before, openedHeader, after, slotBefore, slotAfter, layout, deliveries });
          if (width <= 900) {
            const menu = page.getByRole('button', { name: 'Menu', exact: true });
            await expect(menu).toHaveCount(1); await menu.click();
            await expect(menu).toHaveAttribute('aria-expanded', 'true');
            await page.keyboard.press('Escape');
            await expect(menu).toHaveAttribute('aria-expanded', 'false'); await expect(menu).toBeFocused();
          }
        } finally { await context.close(); }
      }
    }
    await info.attach(`header-cls-${width}.json`, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  });
}

for (const width of [320, 390]) {
  test(`WR-I1 no-JS mobile header retains conventional primary links at ${width}px`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 1000 } });
    try {
      const page = await context.newPage(); await page.goto(baseURL!);
      await expect(page.locator('html')).not.toHaveClass(/\bjs\b/);
      await expect(page.locator('.menu-fallback')).toBeHidden(); await expect(page.locator('.menu-toggle')).toBeHidden();
      const nav = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
      await expect(nav).toHaveCount(1); await navLinks(nav);
      await nav.getByRole('link', { name: 'Credentials', exact: true }).click(); await expect(page).toHaveURL(/#credentials$/);
    } finally { await context.close(); }
  });
}

for (const width of [390, 1440]) {
  // Catches the important reset-layer reservation leaking into print before site initialization.
  test(`WR-M2 pre-init hidden filters reserve screen space but zero print space at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const deliveries = await interceptSiteRuntime(page, 'delay');
    await page.goto('/', { waitUntil: 'commit' });
    await expect.poll(() => page.evaluate(() => typeof (window as NavEvidenceWindow).__releaseSiteRuntime)).toBe('function');
    expect(deliveries).toHaveLength(1);
    const filters = page.locator('[data-filters]'); await expect(filters).toHaveJSProperty('hidden', true);
    const sample = () => filters.evaluate(element => {
      const style = getComputedStyle(element);
      return { hidden: (element as HTMLElement).hidden, height: element.getBoundingClientRect().height,
        display: style.display, visibility: style.visibility, marginTop: style.marginTop, marginBottom: style.marginBottom };
    });
    const screen = await sample(); expect(screen.height).toBeGreaterThan(0);
    expect(screen.display).toBe('flex'); expect(screen.visibility).toBe('hidden');
    expect([screen.marginTop, screen.marginBottom]).toEqual(['22px', '22px']);
    await page.emulateMedia({ media: 'print' });
    const preinitPrint = await sample();
    await info.attach('filter-preinit-print.json', { body: JSON.stringify({ screen, preinitPrint, deliveries }, null, 2), contentType: 'application/json' });
    expect(preinitPrint).toMatchObject({ hidden: true, height: 0, display: 'none', marginTop: '0px', marginBottom: '0px' });
    await page.evaluate(() => (window as NavEvidenceWindow).__releaseSiteRuntime!());
    await expect(filters).toHaveJSProperty('hidden', false);
    const initializedPrint = await sample();
    expect(initializedPrint).toMatchObject({ hidden: false, height: 0, display: 'none', marginTop: '0px', marginBottom: '0px' });
    await page.emulateMedia({ media: 'screen' });
    const initializedScreen = await sample(); expect(initializedScreen.height).toBe(screen.height);
    expect(initializedScreen.visibility).toBe('visible');
    expect([initializedScreen.marginTop, initializedScreen.marginBottom]).toEqual(['22px', '22px']);
    await info.attach('filter-screen-print.json', { body: JSON.stringify({ screen, preinitPrint, initializedPrint, initializedScreen }, null, 2), contentType: 'application/json' });
  });
}

test('WR-M1 print heading chains keep with following blocks without pinning long sections', async ({ page }, info) => {
  await page.goto('/projects/wayfinder/'); await page.emulateMedia({ media: 'print' });
  // Preserve the complete, unmodified case PDF for actual page-by-page inspection.
  await page.pdf({ path: info.outputPath('wayfinder-final-fix-print.pdf'), format: 'A4', printBackground: false });
  const chains = await page.locator('.spec-plate, h1, h2, h3, h4').evaluateAll(elements => elements.map(element => ({
    tag: element.tagName, text: element.textContent?.trim(), breakAfter: getComputedStyle(element).breakAfter,
    breakInside: getComputedStyle(element).breakInside,
  })));
  await info.attach('print-heading-chains.json', { body: JSON.stringify(chains, null, 2), contentType: 'application/json' });
  for (const chain of chains) { expect(chain.breakAfter, chain.text).toBe('avoid'); expect(chain.breakInside, chain.text).toBe('avoid'); }
  for (const section of await page.locator('#story, #review, #run, #evidence').all()) await expect(section).toHaveCSS('break-inside', 'auto');
  // The case has h2 prose; exercise h3 with the same real heading in the public prose scope.
  await page.locator('#story h2').first().evaluate(element => {
    const subheading = document.createElement('h3'); subheading.textContent = element.textContent; element.after(subheading);
  });
  await expect(page.locator('#story h3')).toHaveCSS('break-after', 'avoid');
  await expect(page.locator('#story h3')).toHaveCSS('break-inside', 'avoid');
});

for (const width of [320, 390]) {
  // Catches isolated word fragments despite a technically non-overflowing cell, and lost click/focus geometry.
  test(`WR-M3 caption words remain intact in independent clickable cells at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
    const evidence = [];
    for (const [id, number, title] of specimens) {
      const object = page.locator(`.artifact.${id}`), caption = object.locator('.artifact-caption'), label = caption.locator('span');
      await expect(label).toHaveText(title); await expect(caption.locator('b')).toHaveText(number);
      await expect(object).toHaveAccessibleName(`Select ${title.toLowerCase()}`);
      const geometry = await caption.evaluate(element => {
        const box = element.getBoundingClientRect(), label = element.querySelector('span')!, number = element.querySelector('b')!;
        const labelBox = label.getBoundingClientRect(), numberBox = number.getBoundingClientRect(), text = label.firstChild!;
        const words = [...label.textContent!.matchAll(/\S+/g)].map(match => {
          const range = document.createRange(); range.setStart(text, match.index!); range.setEnd(text, match.index! + match[0].length);
          return { word: match[0], lines: [...range.getClientRects()].map(rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })) };
        });
        return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom,
          labelX: labelBox.x, labelWidth: labelBox.width, labelTop: labelBox.top, numberBottom: numberBox.bottom,
          graphicBottom: element.previousElementSibling!.getBoundingClientRect().bottom,
          labelFont: parseFloat(getComputedStyle(label).fontSize), numberFont: parseFloat(getComputedStyle(number).fontSize),
          opacity: getComputedStyle(element).opacity, words };
      });
      evidence.push({ id, ...geometry });
      await info.attach(`caption-${id}-${width}.json`, { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
      expect(geometry.labelFont).toBeGreaterThanOrEqual(10); expect(geometry.numberFont).toBeGreaterThanOrEqual(10);
      expect(geometry.opacity).toBe('1'); expect(geometry.y).toBeGreaterThanOrEqual(geometry.graphicBottom - 1);
      for (const word of geometry.words) {
        expect(word.lines, `${width}px ${id}: ${word.word} must not split into fragments`).toHaveLength(1);
        expect(word.lines[0].x).toBeGreaterThanOrEqual(geometry.x);
        expect(word.lines[0].x + word.lines[0].width).toBeLessThanOrEqual(geometry.right + .5);
      }
      if (width <= 360) {
        expect(geometry.numberBottom).toBeLessThanOrEqual(geometry.labelTop);
        expect(geometry.labelWidth).toBeGreaterThanOrEqual(geometry.width - 14);
      }
      await object.scrollIntoViewIfNeeded();
      expect(await caption.evaluate(element => {
        const box = element.getBoundingClientRect();
        return element.closest('button')!.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      })).toBe(true);
      await label.click(); await expect(object).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(`.channel-key[data-channel="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#channel-link')).toHaveAttribute('href', `#interest-${id}`);
      await page.keyboard.press('Tab'); await object.focus(); await expect(object).toBeFocused();
      await expect(object).toHaveCSS('outline-width', '3px'); await expect(object).toHaveCSS('outline-offset', '5px');
      await expect(object).toHaveCSS('outline-color', 'rgb(194, 222, 94)');
      await caption.locator('b').click(); await expect(object).toHaveAttribute('aria-pressed', 'true');
    }
    const boxes = await page.locator('.artifact-caption').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
    }));
    expect(boxes.some((a, index) => boxes.slice(index + 1).some(b => Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.locator('.desk-surface').screenshot({ path: info.outputPath(`artwork-caption-${width}.png`), animations: 'disabled' });
    await page.locator('.artifact.pc').screenshot({ path: info.outputPath(`pc-caption-${width}.png`), animations: 'disabled' });
    await info.attach(`caption-geometry-${width}.json`, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  });
}
