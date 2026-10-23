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
  const mark = await page.locator('.personal-mark [data-mark-stripe]').evaluate(element => {
    const stripe = element as SVGGraphicsElement, svg = stripe.ownerSVGElement!;
    const b = stripe.getBBox(), vb = svg.viewBox.baseVal;
    const point = new DOMPoint(b.x+b.width/2,b.y+b.height/2)
      .matrixTransform(svg.getScreenCTM()!.inverse().multiply(stripe.getScreenCTM()!));
    return { width:b.width, dx:(point.x-vb.x-vb.width/2)/vb.width, dy:(point.y-vb.y-vb.height/2)/vb.height };
  });
  expect(mark.width).toBeGreaterThan(0);
  expect(Math.abs(mark.dx)).toBeLessThan(.01);
  expect(Math.abs(mark.dy)).toBeLessThan(.01);
});

test('custom 404 has an accessible transmission shell', async ({ page }) => {
  const response = await page.goto('/not-a-real-coordinate/');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Signal not found.' })).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
