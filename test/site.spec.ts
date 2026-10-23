import { test, expect } from '@playwright/test';

test('workbench objects and keys select the same personal channel', async ({ page }) => {
  await page.goto('/');
  await page.locator('.artifact[data-channel="games"]').click();
  await expect(page.locator('#channel-title')).toContainText('Games');
  await expect(page.locator('.channel-key[data-channel="games"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.channel-key[data-channel="sky"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#channel-title')).toContainText('Space');
  await expect(page.locator('.artifact[data-channel="sky"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Show introduction' }).click();
  await expect(page.locator('#console-copy')).toContainText('I study AI');
});

test('lighting persists and still works if local storage is unavailable', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Lower desk lighting' }).click();
  await page.reload();
  await expect(page.locator('#station')).toHaveAttribute('data-light', 'low');
  await page.getByRole('button', { name: 'Raise desk lighting' }).click();
  const isolated = await context.newPage();
  await isolated.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked'); } }); });
  await isolated.goto('/');
  await isolated.getByRole('button', { name: 'Lower desk lighting' }).click();
  await expect(isolated.locator('#station')).toHaveAttribute('data-light', 'low');
});

test('project filters narrow real content and reset without hiding the personal page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Computer vision', exact: true }).click();
  await expect(page.locator('[data-project]:visible')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Same curiosity. Different pursuits.' })).toBeVisible();
  await page.getByRole('button', { name: 'All projects', exact: true }).click();
  await expect(page.locator('[data-project]:visible')).toHaveCount(7);
});

test('copy failure keeps commands visible and explains the fallback', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true }); });
  await page.goto('/projects/wayfinder/');
  await page.locator('[data-copy]').first().click();
  await expect(page.locator('[data-copy-status]').first()).toContainText('Select and copy');
  await expect(page.locator('.run-guide pre').first()).toContainText('git clone');
});

test('a personal-interest link reveals a project hidden by a previous filter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Computer vision', exact: true }).click();
  await page.locator('#interest-sky summary').click();
  await page.getByRole('link', { name: 'Explore the Kepler project' }).click();
  await expect(page.locator('#project-nasa-kepler')).toBeVisible();
  await expect(page.locator('#project-nasa-kepler')).toHaveAttribute('open', '');
  // The destination hash is already set. Re-filtering must not break a second visit.
  await page.getByRole('button', { name: 'Computer vision', exact: true }).click();
  await page.getByRole('link', { name: 'Explore the Kepler project' }).click();
  await expect(page.locator('#project-nasa-kepler')).toBeVisible();
});

test('copy success puts executable commands on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/projects/wayfinder/');
  await page.locator('[data-copy]').first().click();
  await expect(page.locator('[data-copy-status]').first()).toContainText('Copied to clipboard');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  // Windows clipboard APIs use CRLF; command content must survive either newline convention.
  expect(clipboard.split(/\r?\n/).slice(0, 3)).toEqual(['git clone https://github.com/C6Sucrose/Wayfinder.git', 'cd Wayfinder', 'npm ci']);
});

test('ANON explorer changes recorded metrics and the sample image', async ({ page }) => {
  await page.goto('/projects/anon4reid/');
  await page.getByLabel('Anonymization method').selectOption('rad');
  await expect(page.locator('#anon-map')).toContainText('0.15');
  await expect(page.locator('#anon-leakage')).toContainText('0.15');
  await expect(page.locator('#anon-image')).toHaveAttribute('src', '/images/anon/rad.png');
  await page.getByLabel('Anonymization method').selectOption('blur');
  await expect(page.locator('#anon-map')).toContainText('69.76');
  await expect(page.locator('#anon-leakage')).toContainText('88.66');
});

test('authority illustration honors forbidden and low-confidence precedence', async ({ page }) => {
  await page.goto('/projects/wayfinder/');
  await page.getByLabel('Action is forbidden').check();
  await expect(page.locator('#authority-decision')).toHaveText('Refuse');
  await page.getByLabel('Reading confidence').selectOption('low');
  await page.getByLabel('Low-confidence policy').selectOption('escalate');
  await expect(page.locator('#authority-decision')).toHaveText('Refuse');
  await page.getByLabel('Action is forbidden').uncheck();
  await expect(page.locator('#authority-decision')).toHaveText('Escalate');
});

test('pipeline stops at quarantine and reset gives a fresh run', async ({ page }) => {
  await page.goto('/projects/app-factory/');
  await page.getByLabel('Walkthrough scenario').selectOption('fail');
  for (let step = 0; step < 5; step++) await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.locator('#pipeline-status')).toContainText('Quarantined');
  await expect(page.getByRole('button', { name: 'Next step' })).toBeDisabled();
  await page.getByRole('button', { name: 'Reset walkthrough' }).click();
  await page.getByLabel('Walkthrough scenario').selectOption('success');
  for (let step = 0; step < 6; step++) await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.locator('#pipeline-status')).toContainText('Release candidate ready');
});

test('content remains available with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(process.env.SITE_URL || 'http://127.0.0.1:4321');
  await expect(page.locator('[data-project]:visible')).toHaveCount(7);
  await page.locator('#project-nasa-kepler summary').click();
  await expect(page.locator('#project-nasa-kepler')).toContainText('87.74%');
  await expect(page.locator('#interests')).toContainText('Gardening');
  await context.close();
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`readable artwork and no horizontal overflow at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    const geometry = await page.evaluate(() => {
      const artifacts = [...document.querySelectorAll('.artifact')].map(element => {
        const graphic = element.querySelector('.artifact-graphic')!.getBoundingClientRect();
        const caption = element.querySelector('.artifact-caption')!.getBoundingClientRect();
        return { clear: caption.top >= graphic.bottom - 1, id: element.getAttribute('data-channel') };
      });
      const labelBounds = [...document.querySelectorAll<SVGSVGElement>('.artifact svg')].map(svg => {
        const vb = svg.viewBox.baseVal;
        const labels = [...svg.querySelectorAll<SVGGraphicsElement>('text')];
        const fits = labels.every(text => {
          const b = text.getBBox();
          const matrix = svg.getScreenCTM()!.inverse().multiply(text.getScreenCTM()!);
          return [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
            .map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix))
            .every(p => p.x >= vb.x - .5 && p.y >= vb.y - .5 && p.x <= vb.x + vb.width + .5 && p.y <= vb.y + vb.height + .5);
        });
        return { id: svg.closest('[data-channel]')!.getAttribute('data-channel'), count: labels.length, fits };
      });
      return { overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, artifacts, labelBounds };
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.artifacts.every(artifact => artifact.clear), JSON.stringify(geometry.artifacts)).toBe(true);
    expect(geometry.labelBounds).toHaveLength(6);
    expect(geometry.labelBounds.every(item => item.count > 0 && item.fits), JSON.stringify(geometry.labelBounds)).toBe(true);
    await page.screenshot({ path: info.outputPath(`home-${width}.png`), fullPage: true });
  });
}
