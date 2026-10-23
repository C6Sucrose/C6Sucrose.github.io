import { test, expect, type Locator } from '@playwright/test';

const palette = {
  hull: '#0C1214', 'hull-raised': '#141C1F', 'hull-line': '#263437',
  bone: '#E9E4D6', 'bone-dim': '#C9C3B2', ink: '#16191A', 'ink-dim': '#4E5250',
  core: '#FF2A4F', 'core-plate': '#B3122B', trim: '#C2DE5E',
  bleed: '#38D0D8', peach: '#F2A07B',
};
const pairs = [
  ['bone', 'hull', 7, 14.86], ['bone-dim', 'hull', 7, 10.73],
  ['bone-dim', 'hull-raised', 7, 9.82], ['ink', 'bone', 7, 13.92],
  ['ink-dim', 'bone', 4.5, 6.25], ['core', 'hull', 4.5, 5.12],
  ['core-plate', 'bone', 4.5, 5.44], ['trim', 'hull', 3, 12.50],
  ['bleed', 'hull', 3, 10.05], ['peach', 'hull', 3, 9.07],
] as const;

function luminance(hex: string) {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Invalid CSS color: ${hex}`);
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
test('transmission palette meets every declared contrast contract', async ({ page }) => {
  await page.goto('/');
  const colors = await page.evaluate(names => Object.fromEntries(names.map(name =>
    [name, getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()]
  )), Object.keys(palette));
  for (const [name, hex] of Object.entries(palette)) expect(colors[name].toUpperCase()).toBe(hex);
  for (const [fg, bg, minimum, rounded] of pairs) {
    const ratio = contrast(colors[fg], colors[bg]);
    expect(ratio, `${fg} / ${bg}`).toBeGreaterThanOrEqual(minimum);
    expect(Number(ratio.toFixed(2))).toBe(rounded);
  }
  expect(contrast(colors.core, colors.bone)).toBeLessThan(3);
});

function cssHex(color: string) {
  const channels = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color);
  if (!channels) throw new Error(`Expected an opaque rendered color, received ${color}`);
  return '#' + channels.slice(1).map(channel => Number(channel).toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function renderedColors(target: Locator, outline = false) {
  await expect(target).toBeVisible();
  return target.evaluate((element, isOutline) => {
    const style = getComputedStyle(element);
    // An offset outline sits on the surrounding surface, not the control's fill.
    let surface: Element | null = isOutline ? element.parentElement : element;
    while (surface && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement;
    if (!surface) throw new Error('No painted background found for the contrast sample');
    return {
      foreground: isOutline ? style.outlineColor : style.color,
      background: getComputedStyle(surface).backgroundColor,
      scheme: style.colorScheme,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
    };
  }, outline);
}

async function expectReadable(target: Locator, paper = false) {
  const colors = await renderedColors(target);
  const fg = cssHex(colors.foreground), bg = cssHex(colors.background);
  expect(contrast(fg, bg), `${target}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  if (paper) {
    expect(bg, `${target}: printed surface`).toBe('#FFFFFF');
    expect(colors.scheme, `${target}: printed color scheme`).toBe('light');
  }
}

async function expectReadableFocus(target: Locator) {
  await target.page().keyboard.press('Tab');
  await target.focus();
  await expect(target).toBeFocused();
  expect(await target.evaluate(element => element.matches(':focus-visible'))).toBe(true);
  const colors = await renderedColors(target, true);
  expect(colors.outlineStyle).toBe('solid');
  expect(colors.outlineWidth).toBe('3px');
  expect(colors.outlineOffset).toBe('5px');
  const fg = cssHex(colors.foreground), bg = cssHex(colors.background);
  expect(contrast(fg, bg), `${target}: focus ${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
}

for (const width of [320, 1440]) {
  test(`rendered homepage surfaces and control states stay readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    for (const selector of [
      '.library h2', '.library .accent', '.library .spec-title', '.project-title .note',
      '.project-summary', '.filter-count', '#interests h2', '#interests .accent',
      '#interests .spec-title', '.personal-intro > p', '.academic-note strong',
      '.academic-note > p', '.academic-note .note', '[aria-labelledby="feedback-title"] h2', '[aria-labelledby="feedback-title"] .accent',
      '[aria-labelledby="feedback-title"] .spec-title', '[aria-labelledby="feedback-title"] blockquote', '[aria-labelledby="feedback-title"] figcaption', '[aria-labelledby="feedback-title"] .bone-content > .note',
      '.station .plate', '.lamp-switch',
    ]) await expectReadable(page.locator(selector).first());
    for (const label of await page.locator('.file-id small, .file-id strong').all()) await expectReadable(label);

    const filter = page.getByRole('button', { name: 'Computer vision', exact: true });
    await expectReadable(filter);
    await filter.hover();
    await expectReadable(filter);
    await expectReadableFocus(filter);
    await filter.click();
    await expectReadable(filter);
    await expectReadableFocus(filter);

    const interest = page.locator('#interest-sky summary');
    await expectReadableFocus(interest);
    await interest.click();
    await expectReadable(page.locator('#interest-sky p').first());
    const link = page.locator('#interest-sky a');
    await expectReadable(link);
    await link.hover();
    await expectReadable(link);
    await expectReadableFocus(link);

    for (const selector of ['.lamp-switch', '.channel-key', '.artifact']) {
      await expectReadableFocus(page.locator(selector).first());
    }
    await page.getByRole('button', { name: 'Lower desk lighting' }).click();
    await expectReadableFocus(page.locator('.artifact').first());
    await expectReadableFocus(page.locator('.channel-key').first());
  });
}

for (const id of ['anon4reid', 'wayfinder', 'app-factory']) {
  test(`rendered ${id} preview states keep text and focus readable`, async ({ page }) => {
    await page.goto(`/projects/${id}/`);
    for (const selector of [
      '.diagram li b', '.diagram li small', '#preview h2', '#preview .eyebrow',
      '#preview .note', '#preview label', '.run-guide .requirements', '.code-block code',
      '.run-guide .note', '.copy-row button',
    ]) await expectReadable(page.locator(selector).first());
    const select = page.locator('#preview select').first();
    await expectReadable(select);
    await expectReadableFocus(select);
    await expectReadableFocus(page.locator('.copy-row button').first());

    if (id === 'anon4reid') {
      for (const method of ['blur', 'rad']) {
        await select.selectOption(method);
        await expectReadable(page.locator('.selected-result th'));
        await expectReadable(page.locator('.selected-result td').first());
        await expectReadable(page.locator('#anon-note'));
      }
      await expectReadableFocus(page.locator('.table-scroll'));
    } else if (id === 'wayfinder') {
      await expectReadable(page.locator('#action-amount'));
      await expectReadableFocus(page.locator('#action-amount'));
      for (const checked of [false, true]) {
        await page.getByLabel('Action is forbidden').setChecked(checked);
        await expectReadable(page.locator('.decision .eyebrow'));
        await expectReadable(page.locator('#authority-decision'));
        await expectReadable(page.locator('#authority-reason'));
      }
    } else {
      const next = page.getByRole('button', { name: 'Next step' });
      await expectReadable(next);
      await next.hover();
      await expectReadable(next);
      await expectReadableFocus(next);
      await next.click();
      await expectReadable(page.locator('#pipeline-status'));
      await expectReadable(page.locator('#pipeline-detail'));
      await expectReadable(page.locator('#pipeline-stages [data-state=current] small'));
      await expectReadable(page.locator('#pipeline-log'));
    }
  });
}

for (const route of ['/', '/projects/anon4reid/', '/projects/wayfinder/', '/projects/app-factory/']) {
  test(`print keeps qualifications and explicit colors legible on white at ${route}`, async ({ page }, info) => {
    await page.goto(route);
    // The existing change handler marks a result row only after a method is selected.
    if (route.includes('anon4reid')) await page.getByLabel('Anonymization method').selectOption('rad');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.skip-link')).toBeHidden();
    const selectors = route === '/' ? [
      '#journey .bone-content > .note', '.stats-note', '.academic-note .note', '[aria-labelledby="feedback-title"] .bone-content > .note',
      '#interests .spec-title', '#interests .accent', '.cert-list .issuer', '.project-title .note',
      '.library .accent', '.contact-links .button.primary',
    ] : [
      '#review > .note', '#evidence .bone-content > .note', '.case-meta', '.case-meta strong',
      '.case-aside .note', '.run-guide .note', '.code-block code', '#preview .note',
      '.diagram li b', '.diagram li small', '.case-header .button.primary',
    ];
    if (route.includes('anon4reid')) selectors.push('.selected-result td');
    if (route.includes('wayfinder')) selectors.push('#authority-reason');
    if (route.includes('app-factory')) selectors.push('#pipeline-log', '#pipeline-detail');
    for (const selector of selectors) await expectReadable(page.locator(selector).first(), true);
    if (route === '/projects/wayfinder/') {
      await page.pdf({ path: info.outputPath('wayfinder-print.pdf'), format: 'A4', printBackground: false });
      await page.locator('#evidence').screenshot({ path: info.outputPath('wayfinder-print-evidence.png') });
    }
  });
}

test('print resets a nested hull surface including direct bone token consumers', async ({ page }) => {
  await page.goto('/');
  // Exercise the public surface contract on real content inside an existing light panel.
  const scope = page.locator('#interests .personal-intro > .hull-surface');
  await page.locator('#interests .bone-heading .wrap').evaluate(element => {
    // The opener moved to a heading slot; put its real content back on bone for this regression.
    document.querySelector('#interests .personal-intro')!.prepend(element);
    element.classList.add('hull-surface');
    element.querySelector<HTMLElement>('h2')!.style.color = 'var(--bone)';
    element.querySelector<HTMLElement>('.spec-title')!.style.color = 'var(--bone-dim)';
    element.querySelector<HTMLElement>('.accent')!.style.color = 'var(--core)';
  });
  for (const selector of ['h2', '.spec-title', '.accent']) {
    await expectReadable(scope.locator(selector).first());
  }
  await page.emulateMedia({ media: 'print' });
  for (const selector of ['h2', '.spec-title', '.accent']) {
    await expectReadable(scope.locator(selector).first(), true);
  }
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`printed prose and its focused links use the bone contract at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#about');
    const about = page.locator('#about');
    await expect(about).toHaveClass(/bone-plate/);
    await expect(about).toHaveCSS('background-color', 'rgb(233, 228, 214)');
    await expect(about).toHaveCSS('color-scheme', 'light');
    await expect(about.locator('.prose p').first()).toHaveCSS('color', 'rgb(22, 25, 26)');
    await expect(about).toHaveAttribute('aria-labelledby', 'about-title');
    await expect(about.getByRole('heading', { level: 2 })).toHaveCount(1);
    await expect(about.locator('.hull-stripe')).toHaveAttribute('aria-hidden', 'true');
    const heading = about.locator('.bone-heading.hull-surface');
    await expect(heading).toHaveCSS('background-color', 'rgb(12, 18, 20)');
    await expect(heading).toHaveCSS('color-scheme', 'dark');
    await expect(heading.locator('.accent')).toHaveCSS('color', 'rgb(255, 42, 79)');
    await expect(about.locator('.spec-plate dt')).toHaveText(['Operator', 'Location', 'Availability']);
    await expect(about.getByText('Looking for working-student or internship opportunities in AI engineering & MLOps.', { exact: true })).toHaveCount(1);
    const copy = about.locator('h2, .accent, .spec-title, dt, dd, .prose p, .stats strong, .stats span, .stats-note');
    for (const target of await copy.all()) await expectReadable(target);
    expect(await about.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(width);
    const texture = await about.evaluate(element => {
      const style = getComputedStyle(element, '::before');
      return { pointerEvents: style.pointerEvents, zIndex: style.zIndex };
    });
    expect(texture.pointerEvents).toBe('none');
    expect(Number(texture.zIndex)).toBeLessThan(0);

    // Capture the shipped About content before adding test-only controls.
    await about.screenshot({ path: info.outputPath(`about-${width}.png`), animations: 'disabled' });

    // About's supplied copy has no links. Exercise the public CSS contract in its real scopes.
    for (const [selector, accent, focus] of [
      ['.bone-content', 'rgb(179, 18, 43)', 'rgb(179, 18, 43)'],
      ['.bone-heading .wrap', 'rgb(255, 42, 79)', 'rgb(194, 222, 94)'],
    ]) {
      const scope = about.locator(selector);
      await scope.evaluate(element => {
        const prose = document.createElement('p');
        prose.className = 'prose';
        const link = document.createElement('a');
        link.href = '#about-title';
        link.textContent = 'Surface-contract link';
        const button = document.createElement('a');
        button.href = '#about-title';
        button.className = 'button primary';
        button.textContent = 'Surface-contract action';
        prose.append(link, document.createTextNode(' '), button);
        element.append(prose);
      });
      const link = scope.getByRole('link', { name: 'Surface-contract link', exact: true });
      await expect(link).toHaveCSS('color', accent);
      await expectReadable(link);
      await link.hover();
      await expect(link).toHaveCSS('color', focus);
      await expectReadable(link);
      await expectReadableFocus(link);
      await expect(link).toHaveCSS('outline-color', focus);
      await link.click();
      await expect(page).toHaveURL(/#about-title$/);
      const button = scope.getByRole('link', { name: 'Surface-contract action', exact: true });
      await expectReadable(button);
      await button.hover();
      await expect(button).toHaveCSS('background-color', focus);
      await expectReadable(button);
      await expectReadableFocus(button);
      await expect(button).toHaveCSS('outline-color', focus);
    }

    await page.emulateMedia({ media: 'print' });
    for (const target of await copy.all()) await expectReadable(target, true);
    for (const link of await about.getByRole('link').all()) await expectReadable(link, true);
  });
}

test('spec plates keep their own tone on opposite surfaces and on white paper', async ({ page }) => {
  await page.goto('/#about');
  const about = page.locator('#about');
  const hull = about.locator('.spec-plate--hull');
  await expect(hull).toBeVisible();
  // Reuse the rendered component to exercise both public tone modifiers in opposite scopes.
  await hull.evaluate(element => {
    const bone = element.cloneNode(true) as HTMLElement;
    bone.classList.replace('spec-plate--hull', 'spec-plate--bone');
    element.replaceWith(bone);
    document.querySelector('#about .bone-content')!.prepend(element);
  });
  const bone = about.locator('.spec-plate--bone');
  for (const [plate, background, foreground, secondary, scheme] of [
    [hull, 'rgb(12, 18, 20)', 'rgb(233, 228, 214)', 'rgb(201, 195, 178)', 'dark'],
    [bone, 'rgb(233, 228, 214)', 'rgb(22, 25, 26)', 'rgb(78, 82, 80)', 'light'],
  ] as const) {
    await expect(plate).toHaveCSS('background-color', background);
    await expect(plate).toHaveCSS('color-scheme', scheme);
    await expect(plate.locator('dd').first()).toHaveCSS('color', foreground);
    await expect(plate.locator('dt').first()).toHaveCSS('color', secondary);
    for (const target of await plate.locator('.spec-title, dt, dd').all()) await expectReadable(target);
    await expect(plate.locator('.spec-corners')).toHaveAttribute('aria-hidden', 'true');
    for (const target of [plate, plate.locator('.spec-corners')]) {
      for (const pseudo of ['::before', '::after']) {
        expect(await target.evaluate((element, name) => getComputedStyle(element, name).pointerEvents, pseudo)).toBe('none');
      }
    }
  }
  await page.emulateMedia({ media: 'print' });
  for (const target of await about.locator('.spec-title, dt, dd').all()) await expectReadable(target, true);
});

test('all profile prose is printed and bone focus rings retain contrast', async ({ page }) => {
  await page.goto('/');
  for (const selector of ['#about', '#journey', '#interests', '#credentials', '[aria-labelledby="feedback-title"]', '#contact']) {
    await expect(page.locator(selector)).toHaveClass(/bone-plate/);
  }
  const link = page.locator('#contact .email-link');
  await link.focus();
  await expect(link).toHaveCSS('outline-color', 'rgb(179, 18, 43)');
  await expect(link).toHaveCSS('outline-width', '3px');
  await expect(link).toHaveCSS('outline-offset', '5px');
  const headerLink = page.locator('.wordmark');
  await headerLink.focus();
  await expect(headerLink).toHaveCSS('outline-color', 'rgb(194, 222, 94)');
});

for (const width of [320, 1440]) {
  test(`profile heading scopes and native disclosures keep readable body and focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    for (const [selector, titleId, opener] of [
      ['#journey', 'journey-title', 'Personnel file / experience & education'],
      ['#interests', 'personal-title', 'Beyond the work / six other channels'],
      ['#credentials', 'credentials-title', 'Equipment inventory / skills & credentials'],
      ['[aria-labelledby="feedback-title"]', 'feedback-title', 'Incoming transmission / client feedback'],
      ['#contact', 'contact-title', 'Open channel / say hello'],
    ]) {
      const section = page.locator(selector);
      await expect(section).toHaveAttribute('aria-labelledby', titleId);
      await expect(section.getByRole('heading', { level: 2 })).toHaveCount(1);
      await expect(section.locator('.bone-heading .spec-title')).toHaveText(opener);
      await expect(section.locator('.spec-plate dl')).toHaveCount(0);
      await expect(section.locator('.bone-heading')).toHaveCSS('background-color', 'rgb(12, 18, 20)');
      await expect(section.locator('.bone-heading .accent')).toHaveCSS('color', 'rgb(255, 42, 79)');
      await expect(section.locator('.bone-content')).toHaveCSS('color', 'rgb(22, 25, 26)');
      await expect(section.locator('.bone-content .wrap')).toHaveCount(0);
      for (const copy of await section.locator('.bone-heading h2, .bone-heading .spec-title, .bone-heading p, .bone-heading .accent').all()) await expectReadable(copy);
    }
    for (const id of ['pc', 'games', 'nature', 'cooking', 'sky', 'ai']) {
      const details = page.locator(`#interest-${id}`);
      const summary = details.locator('summary');
      await expectReadableFocus(summary);
      await expect(summary).toHaveCSS('outline-color', 'rgb(179, 18, 43)');
      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      await expect(details.locator('p').first()).toBeVisible();
    }
    const copy = page.locator('#journey .bone-content p, #journey .timeline-column > h3, #interests .bone-content p, #interests summary, #credentials .bone-content p, #credentials .cert-list li > *, [aria-labelledby="feedback-title"] blockquote, [aria-labelledby="feedback-title"] figcaption, [aria-labelledby="feedback-title"] .bone-content .note, #contact .bone-content p, #contact .bone-content h3');
    for (const target of await copy.all()) if (await target.isVisible()) await expectReadable(target);
    for (const selector of ['#journey .bone-content .note a', '#credentials .text-link', '#contact .email-link', '#contact .document-requests a', '#contact .button.primary']) {
      const link = page.locator(selector).first();
      await expectReadable(link);
      await link.hover();
      await expectReadable(link);
      await expectReadableFocus(link);
      await expect(link).toHaveCSS('outline-color', 'rgb(179, 18, 43)');
    }
    await expect(page.locator('#contact .document-requests .eyebrow')).toHaveText('Supporting documents');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.emulateMedia({ media: 'print' });
    for (const target of await copy.all()) if (await target.isVisible()) await expectReadable(target, true);
    for (const target of await page.locator('.bone-heading h2, .bone-heading .spec-title, .bone-heading .accent').all()) await expectReadable(target, true);
  });
}

test('masthead opener is a readable hull spec plate', async ({ page }) => {
  await page.goto('/');
  const plate = page.locator('.masthead .spec-plate');
  await expect(plate.locator('.spec-title')).toHaveText('Builder / tinkerer / occasional stargazer');
  await expect(plate.locator('dl')).toHaveCount(0);
  await expect(plate).toHaveCSS('background-color', 'rgb(12, 18, 20)');
  await expectReadable(plate.locator('.spec-title'));
  await expectReadable(page.locator('.masthead > p'));
});

test('project rack keeps category labels on hull and only expanded prose on bone', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const work = page.locator('#work');
  await expect(work.locator('.spec-title')).toHaveText('Technical library / selected work');
  await expect(work.locator('[data-project]')).toHaveCount(7);
  expect(await work.locator('[data-project]').evaluateAll(records => records.map(record => record.id))).toEqual([
    'project-anon4reid', 'project-wayfinder', 'project-app-factory', 'project-triage-ai',
    'project-nasa-kepler', 'project-ocular-health', 'project-legacy-zero',
  ]);
  await expect(work.locator('.project-category')).toHaveText([
    'COMPUTER VISION / EVALUATION', 'AI / AGENTIC SYSTEMS', 'ML / ENGINEERING TOOLING',
    'AI / AGENTIC SYSTEMS', 'ML / ENGINEERING TOOLING', 'COMPUTER VISION / EVALUATION', 'AI / AGENTIC SYSTEMS',
  ]);
  await expect(work).toHaveCSS('background-color', 'rgb(12, 18, 20)');
  for (const label of await work.locator('.project-category').all()) {
    await expect(label).toHaveCSS('color', 'rgb(255, 42, 79)');
    // Chromium serializes a computed zero as "normal"; both remove inherited mono tracking.
    await expect(label).toHaveCSS('letter-spacing', /^(normal|0px)$/);
    await expectReadable(label);
  }
  // The decorative outer scheduler hook owns the shadow; paint now lives on its clipped face.
  for (const file of await work.locator('.file-id-face').all()) {
    await expect(file).toHaveCSS('background-color', 'rgb(20, 28, 31)');
    await expect(file).toHaveCSS('border-radius', '0px');
    await expect(file).toHaveCSS('border-top-color', 'rgb(201, 195, 178)');
  }
  for (const details of await work.locator('details[data-project]').all()) {
    const summary = details.locator('summary');
    await expectReadableFocus(summary);
    await expect(summary).toHaveCSS('outline-color', 'rgb(194, 222, 94)');
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    const prose = details.locator('.compact-prose.bone-plate');
    await expect(prose).toHaveCSS('background-color', 'rgb(233, 228, 214)');
    await expect(prose).toHaveCSS('color-scheme', 'light');
    await expect(prose.locator('.prose p').first()).toHaveCSS('color', 'rgb(22, 25, 26)');
    await expect(prose.locator('.stack, .button, .review-grid, .run-guide')).toHaveCount(0);
    expect(await details.locator('.project-body').evaluate(body => [...body.children].map(element => element.className))).toEqual([
      'bone-plate compact-prose', 'stack', 'button', 'review-grid', 'note',
    ]);
    for (const target of await details.locator('.prose p, .stack, .review-list p, .run-guide .requirements, .run-guide .note, .project-body > .note').all()) await expectReadable(target);
    const source = details.locator('.project-body > .button');
    await expectReadableFocus(source);
    await expect(source).toHaveCSS('outline-color', 'rgb(194, 222, 94)');
  }
  const fullLink = work.locator('article .project-title a').first();
  await fullLink.hover();
  await expect(fullLink).toHaveCSS('color', 'rgb(194, 222, 94)');
  await expectReadable(fullLink);
  await work.screenshot({ path: info.outputPath('rack-expanded-390.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.emulateMedia({ media: 'print' });
  for (const target of await work.locator('.project-category, .compact-prose .prose p, .project-body > .note').all()) await expectReadable(target, true);
});

test('narrow file plates keep label glyphs clear of the core marker', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    for (const file of await page.locator('.file-id').all()) {
      const geometry = await file.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const face = element.querySelector('.file-id-face')!;
        const border = parseFloat(getComputedStyle(face).borderRightWidth);
        const marker = getComputedStyle(face, '::after');
        const markerLeft = rect.right - border - parseFloat(marker.right) - parseFloat(marker.width);
        return [...element.querySelectorAll('small, strong')].map(label => {
          const range = document.createRange();
          range.selectNodeContents(label);
          return { label: label.textContent, right: range.getBoundingClientRect().right, markerLeft };
        });
      });
      for (const { label, right, markerLeft } of geometry) {
        expect(right, `${width}px ${label}: marker must leave a clear gap after the glyphs`).toBeLessThanOrEqual(markerLeft - 1);
      }
    }
  }
});

for (const id of ['anon4reid', 'wayfinder', 'app-factory']) {
  test(`case story is printed and preview is dark: ${id}`, async ({ page }) => {
    await page.goto(`/projects/${id}/`);
    await expect(page.locator('#story')).toHaveCSS('color', 'rgb(22, 25, 26)');
    await expect(page.locator('#story').locator('xpath=ancestor::*[contains(@class,"bone-plate")][1]'))
      .toHaveCSS('background-color', 'rgb(233, 228, 214)');
    await expect(page.locator('#preview')).toHaveCSS('background-color', 'rgb(20, 28, 31)');
    const link = page.locator('#story a').first();
    if (await link.count()) await expect(link).toHaveCSS('color', 'rgb(179, 18, 43)');
  });
}

for (const width of [320, 1440]) {
  for (const [id, number] of [['anon4reid', '01'], ['wayfinder', '02'], ['app-factory', '03']]) {
    test(`case editorial surfaces and instrument focus stay readable: ${id} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/projects/${id}/`);
      const story = page.locator('#story').locator('xpath=ancestor::*[contains(@class,"bone-plate")][1]');
      await expect(story).toHaveCSS('background-color', 'rgb(233, 228, 214)');
      await expect(story.locator('.bone-content .wrap')).toHaveCount(0);
      await expect(story.locator('.hull-stripe')).toHaveAttribute('aria-hidden', 'true');
      const evidence = page.locator('#evidence');
      await expect(evidence).toHaveClass(/bone-plate/);
      await expect(evidence).toHaveAttribute('aria-labelledby', 'evidence-title');
      await expect(evidence).toHaveCSS('background-color', 'rgb(233, 228, 214)');
      await expect(evidence.locator('.bone-content .wrap')).toHaveCount(0);
      await expect(evidence.locator('.spec-plate--bone .spec-title')).toHaveText('Source notes / evidence & context');
      await expect(evidence.locator('.spec-plate dl')).toHaveCount(0);
      await expect(page.locator('.case-header')).toHaveCSS('background-color', 'rgb(12, 18, 20)');
      await expect(page.locator('.case-numeral')).toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator('.case-numeral')).toHaveText(number);
      await expect(page.locator('.case-header .spec-plate dt')).toHaveText(['File', 'Revision']);
      await expect(page.locator('.case-header .spec-plate dd').first()).toHaveText(number);
      await expect(page.locator('#review .spec-title')).toHaveText('Review route / a guided code tour');
      await expect(page.locator('#run .spec-title')).toHaveText('Local setup / the practical route');
      await expect(page.locator('#preview')).toHaveCSS('border-radius', '0px');
      if (id !== 'anon4reid') {
        await expect(page.locator('.decision .eyebrow')).toHaveCSS('font-size', '11px');
        await expect(page.locator('.decision .eyebrow')).toHaveCSS('font-family', /Cascadia Mono/);
      }
      for (const target of await page.locator('.case-header h1, .case-numeral, .case-header .summary, .case-meta strong, .case-meta span, .spec-title, .spec-plate dt, .spec-plate dd, #story h2, #story p, #story li, .case-aside h2, .case-aside .big-number, .case-aside .note, .case-aside .stack, #review h2, #review > .note, .review-list code, .review-list p, #run h2, .run-guide h4, .run-guide .requirements, .code-block pre, .run-guide .note, #evidence h2, #evidence .evidence-list p, #evidence .note').all()) await expectReadable(target);
      for (const selector of ['.case-header .button.primary', '.case-aside a', '#evidence .evidence-list a', '#evidence .case-links .button', '#preview select', '.copy-row button']) {
        const target = page.locator(selector).first();
        await expectReadable(target);
        await target.hover();
        await expectReadable(target);
        await expectReadableFocus(target);
        const bone = selector.startsWith('.case-aside') || selector.startsWith('#evidence');
        await expect(target).toHaveCSS('outline-color', bone ? 'rgb(179, 18, 43)' : 'rgb(194, 222, 94)');
        expect(await target.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return rect.left >= 8 && rect.right <= document.documentElement.clientWidth - 8 && element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
        })).toBe(true);
      }
      for (const control of await page.locator('#preview select, #preview input[type=number], .copy-row button').all()) {
        await expect(control).toHaveCSS('background-color', 'rgb(12, 18, 20)');
        await expect(control).toHaveCSS('border-top-color', 'rgb(201, 195, 178)');
      }
      await expect(page.locator('.code-block').first()).toHaveCSS('border-left-color', 'rgb(194, 222, 94)');
      if (id === 'anon4reid') {
        await expect(page.locator('#anon-map-bar')).toHaveCSS('background-color', 'rgb(194, 222, 94)');
        await expect(page.locator('#anon-leak-bar')).toHaveCSS('background-color', 'rgb(255, 42, 79)');
      } else if (id === 'app-factory') {
        await page.getByRole('button', { name: 'Next step' }).click();
        await expect(page.locator('#pipeline-stages [data-state=done]').first()).toHaveCSS('border-top-color', 'rgb(194, 222, 94)');
        await expect(page.locator('#pipeline-stages [data-state=current]').first()).toHaveCSS('border-top-color', 'rgb(255, 42, 79)');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.emulateMedia({ media: 'print' });
      for (const target of await page.locator('.case-numeral, .spec-title, .spec-plate dt, .spec-plate dd, #story p, .case-aside h2, .case-aside .stack, #evidence .evidence-list a, #evidence .note').all()) await expectReadable(target, true);
    });
  }

  test(`missing-coordinate shell and focused recovery links stay readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const response = await page.goto('/not-a-real-coordinate/');
    expect(response?.status()).toBe(404);
    const shell = page.locator('.missing-page');
    await expect(shell.locator('.spec-title')).toHaveText('Navigation report / 404');
    await expect(shell.locator('.spec-plate dl')).toHaveCount(0);
    await expect(shell.locator('.case-numeral')).toHaveAttribute('aria-hidden', 'true');
    await expect(shell.locator('.case-numeral')).toHaveText('404');
    for (const target of await shell.locator('h1, .accent, .case-numeral, .spec-title, p').all()) await expectReadable(target);
    for (const link of await shell.getByRole('link').all()) {
      await expectReadable(link);
      await link.hover();
      await expectReadable(link);
      await expectReadableFocus(link);
      await expect(link).toHaveCSS('outline-color', 'rgb(194, 222, 94)');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.emulateMedia({ media: 'print' });
    for (const target of await shell.locator('h1, .accent, .case-numeral, .spec-title, p, a').all()) await expectReadable(target, true);
  });
}

// Whole-review palette contract: AA alone must not permit core-colored mono labels on hull.
async function expectHullMonoLabel(target: Locator) {
  const colors = await renderedColors(target);
  expect(cssHex(colors.foreground), `${target}: mono label foreground`).toBe('#C9C3B2');
  expect(cssHex(colors.background), `${target}: opaque hull backplate`).toBe('#0C1214');
  expect(colors.scheme).toBe('dark');
  expect(contrast(cssHex(colors.foreground), cssHex(colors.background))).toBeGreaterThanOrEqual(10.7);
  await expect(target).toHaveCSS('font-family', /Cascadia Mono.*Consolas/);
  await expect(target).toHaveCSS('text-transform', 'uppercase');
  const size = await target.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(size).toBeGreaterThanOrEqual(10); expect(size).toBeLessThanOrEqual(11);
}

for (const id of ['anon4reid', 'wayfinder', 'app-factory']) {
  test(`WR-I2 case metadata obeys rendered hull mono tokens: ${id}`, async ({ page }, info) => {
    await page.goto(`/projects/${id}/`);
    await expectHullMonoLabel(page.locator('.case-meta strong'));
    await page.locator('.case-meta').screenshot({ path: info.outputPath(`metadata-${id}.png`), animations: 'disabled' });
  });
}

test('WR-I2 expanded compact review headings obey rendered hull mono tokens', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 }); await page.goto('/');
  for (const details of await page.locator('details[data-project]').all()) {
    await details.locator('summary').click(); await expect(details).toHaveAttribute('open', '');
    for (const heading of await details.locator('.review-grid h4').all()) await expectHullMonoLabel(heading);
  }
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.locator('#project-nasa-kepler .review-grid').screenshot({ path: info.outputPath('expanded-review-labels-390.png'), animations: 'disabled' });
});

for (const width of [320, 1440]) {
  test(`WR-I2 selected caption numbers obey rendered hull mono tokens at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
    for (const id of ['pc', 'games', 'nature', 'cooking', 'sky', 'ai']) {
      const object = page.locator(`.artifact.${id}`); await object.locator('.artifact-caption span').click();
      await expect(object).toHaveAttribute('aria-pressed', 'true');
      await expectHullMonoLabel(object.locator('.artifact-caption b'));
      await expect(object.locator('.artifact-caption')).toHaveCSS('color', 'rgb(201, 195, 178)');
      await expect(object.locator('.artifact-caption')).toHaveCSS('opacity', '1');
    }
    await page.locator('.artifact.pc .artifact-caption span').click();
    await page.locator('.artifact.pc').screenshot({ path: info.outputPath(`selected-caption-${width}.png`), animations: 'disabled' });
  });
}
