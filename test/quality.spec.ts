import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const route of ['/', '/projects/anon4reid/', '/projects/wayfinder/', '/projects/app-factory/']) {
  test(`accessible direct route ${route}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(accessibility.violations.map(v => ({ id: v.id, description: v.description, nodes: v.nodes.map(node => node.target) }))).toEqual([]);
    expect(errors).toEqual([]);
    if (route === '/') {
      await page.locator('#station').screenshot({ path: info.outputPath('workstation.png') });
      await page.locator('.personal-mark').screenshot({ path: info.outputPath('badge.png') });
    } else await page.locator('#preview').screenshot({ path: info.outputPath('preview.png') });
  });
}

test('downloads and custom missing-page route are available', async ({ request, page }) => {
  for (const document of ['huraira-ali-cv.pdf','huraira-ali-certificates.pdf']) {
    const response = await request.get(`/downloads/${document}`);
    expect(response.status()).toBe(200);
    expect((await response.body()).subarray(0,5).toString()).toBe('%PDF-');
  }
  await page.goto('/not-a-real-coordinate/');
  await expect(page.getByRole('heading', { name: 'Signal not found.' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to the workstation' }).click();
  await expect(page.locator('#station')).toBeVisible();
});

test('small-screen navigation opens, closes on Escape, and exposes direct section links', async ({ page }) => {
  await page.setViewportSize({ width:390,height:844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded','false');
  await menu.click();
  await page.locator('#primary-nav').getByRole('link', { name:'Credentials',exact:true }).click();
  await expect(page).toHaveURL(/#credentials$/);
  await expect(menu).toHaveAttribute('aria-expanded','false');
});

test('case-study previews fit narrow screens and reduced-motion settings', async ({ page }, info) => {
  await page.setViewportSize({ width:320,height:900 });
  await page.emulateMedia({ reducedMotion:'reduce' });
  for (const route of ['/projects/anon4reid/','/projects/wayfinder/','/projects/app-factory/']) {
    await page.goto(route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.locator('#preview').screenshot({ path:info.outputPath(`${route.split('/')[2]}-mobile.png`) });
  }
});

test('workbench graphics stay clickable and badge stripes are centered', async ({ page }) => {
  for (const width of [320,768,1024,1440]) {
    await page.setViewportSize({ width,height:1000 });
    await page.goto('/');
    for (const id of ['pc','games','nature','cooking','sky','ai']) {
      const object = page.locator(`.artifact[data-channel="${id}"]`);
      await object.scrollIntoViewIfNeeded();
      const unobscured = await object.evaluate(element => {
        const rect = element.querySelector('.artifact-graphic')!.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      });
      expect(unobscured, `${id} covered at ${width}px`).toBe(true);
    }
  }
  const badge = await page.locator('#badge-stripes').evaluate(element => { const box = (element as unknown as SVGGraphicsElement).getBBox(); return { x:box.x+box.width/2, y:box.y+box.height/2 }; });
  expect(badge.x).toBeCloseTo(65,0); expect(badge.y).toBeCloseTo(65,0);
});
