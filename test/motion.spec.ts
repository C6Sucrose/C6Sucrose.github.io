import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { parse, type DefaultTreeAdapterMap } from 'parse5';

const ids = ['pc', 'games', 'nature', 'cooking', 'sky', 'ai'] as const;
const beatMs = { pc: 4200, games: 5600, nature: 7100, cooking: 8300, sky: 9700, ai: 11300 };
test.use({ reducedMotion: 'no-preference' });

async function motionFrame(page: Page) {
  return page.locator('.artifact [data-motion]').evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    const list = (value: string) => value.split(',').map(part => part.trim());
    return { class: node.getAttribute('class'), canonical: style.getPropertyValue('--anim').trim(),
      name: list(style.animationName), state: list(style.animationPlayState),
      duration: list(style.animationDuration), delay: list(style.animationDelay),
      iterations: list(style.animationIterationCount), fill: list(style.animationFillMode), transform: style.transform,
      opacity: style.opacity, dash: style.strokeDashoffset };
  }));
}

function expectFrozen(frame: Awaited<ReturnType<typeof motionFrame>>) {
  expect(frame).toHaveLength(29);
  for (const node of frame) {
    expect(node.name, node.class!).toEqual([node.canonical, node.canonical, node.canonical]);
    expect(node.canonical.endsWith('-still'), node.class!).toBe(false);
    expect(node.state, node.class!).toEqual(['paused', 'paused', 'paused']);
    expect(node.iterations, node.class!).toEqual(['0', 'infinite', '0']);
    expect(node.fill, node.class!).toEqual(['none', 'none', 'none']);
    expect(node.duration[0], node.class!).toBe('0s');
    expect(parseFloat(node.duration[1]), node.class!).toBeGreaterThan(0);
    expect(node.duration[2], node.class!).toBe('0s');
    expect(node.delay[0], node.class!).toBe('0s');
    expect(parseFloat(node.delay[1]), node.class!).toBeLessThan(0);
    expect(node.delay[2], node.class!).toBe('0s');
  }
}

// Catches animation:none fallback, missing negative freeze delays, and a moving still frame.
test('reduced motion freezes every plate at a composed non-default frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const id of ids) {
    const probe = page.locator(`.artifact.${id} [data-pose-probe]`);
    await expect(probe).toHaveCount(1);
    const pose = await probe.evaluate(node => {
      const style = getComputedStyle(node);
      const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
      return { names: style.animationName.split(',').map(name => name.trim()),
        states: style.animationPlayState.split(',').map(state => state.trim()), identity: matrix.isIdentity };
    });
    expect(pose.names.every(name => name !== 'none'), id).toBe(true);
    expect(pose.states.every(state => state === 'paused'), id).toBe(true);
    expect(pose.identity, id).toBe(false);
  }
  const before = await motionFrame(page);
  expectFrozen(before);
  await page.waitForTimeout(150); // A real still-frame stability sample; no completion timer guess.
  expect(await motionFrame(page)).toEqual(before);
  await expect(page.locator('[data-boot]')).toHaveCount(0);
  await expect(page.locator('.is-tearing')).toHaveCount(0);
});

// Catches the effects-off selector losing names/poses or leaking phase, offsets, or speed into stills.
test('effects-off restores the same composed poses as reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const reduced = await motionFrame(page);
  expectFrozen(reduced);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const movingProbe = page.locator('.ai-arm');
  await expect(movingProbe).toHaveCSS('animation-play-state', 'running');
  await expect.poll(() => movingProbe.evaluate(node => Number(node.getAnimations()[0]?.currentTime)),
    { message: 'The live timeline advances before effects are switched off' }).toBeGreaterThan(50);
  await page.evaluate(() => {
    document.documentElement.dataset.transmission = 'off';
    document.querySelectorAll<HTMLElement>('.artifact').forEach(node => {
      node.style.setProperty('--react', '1.8');
      node.style.setProperty('--phase', '-17s');
      node.style.setProperty('--prox', '1');
      node.style.setProperty('--nx', '1');
      node.style.setProperty('--ny', '-1');
    });
  });
  expect(await motionFrame(page)).toEqual(reduced);
  await page.waitForTimeout(150);
  expect(await motionFrame(page)).toEqual(reduced);
  const input = await page.locator('.artifact').evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return ['--prox', '--nx', '--ny'].map(property => style.getPropertyValue(property).trim());
  }));
  expect(input).toEqual(ids.map(() => ['0', '0', '0']));
  await page.evaluate(() => {
    document.documentElement.dataset.transmission = 'on';
    document.querySelectorAll<HTMLElement>('.artifact').forEach(node => node.removeAttribute('style'));
  });
  await expect(movingProbe).toHaveCSS('animation-play-state', 'running');
  await expect.poll(() => movingProbe.evaluate(node => Number(node.getAnimations()[0]?.currentTime))).toBeGreaterThan(50);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await motionFrame(page)).toEqual(reduced);
  await page.waitForTimeout(150);
  expect(await motionFrame(page)).toEqual(reduced);
  await expect(page.locator('[data-boot]')).toHaveCount(0);
  await expect(page.locator('.is-tearing')).toHaveCount(0);
});

// Catches carrier-order/reset regressions on the second and later elapsed live entry.
test('repeated elapsed live entries restore exact canonical composed frames', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const cold = await motionFrame(page);
  expectFrozen(cold);
  const probe = page.locator('.ai-arm');
  for (let round = 0; round < 4; round++) {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => { document.documentElement.dataset.transmission = 'on'; });
    await expect(probe).toHaveCSS('animation-play-state', 'running');
    const time = await probe.evaluate(node => Number(node.getAnimations()[0].currentTime));
    await expect.poll(() => probe.evaluate(node => Number(node.getAnimations()[0].currentTime))).toBeGreaterThan(time + 70);
    await page.evaluate(() => { document.documentElement.dataset.transmission = 'off'; });
    const off = await motionFrame(page);
    expectFrozen(off);
    expect(off).toEqual(cold);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await motionFrame(page)).toEqual(cold);
    await page.evaluate(() => { document.documentElement.dataset.transmission = 'on'; });
    expect(await motionFrame(page)).toEqual(cold);
    await page.waitForTimeout(150);
    expect(await motionFrame(page)).toEqual(cold);
  }
});

// Catches CSS being gated on JS, or nominally running names with unmoving artwork.
test('CSS artwork runs when page JavaScript is unavailable', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'no-preference' });
  try {
    const page = await context.newPage();
    await page.goto(baseURL!);
    for (const id of ids) {
      const node = page.locator(`.artifact.${id} [data-pose-probe]`);
      await expect(node).toHaveCSS('animation-play-state', 'running');
      expect(await node.evaluate(el => getComputedStyle(el).animationName), id).not.toBe('none');
      const before = await node.evaluate(el => getComputedStyle(el).transform);
      await expect.poll(() => node.evaluate(el => getComputedStyle(el).transform), { message: `${id} advances without page JS` }).not.toBe(before);
    }
    await expect(page.locator('[data-boot]')).toHaveCount(0);
    await expect(page.locator('[data-project]:visible')).toHaveCount(7);
    await expect(page.getByRole('navigation', { name: 'Interest index' })).toBeVisible();
  } finally {
    await context.close();
  }
});

// Catches inherited descendant animations, a shared rule overriding individual pivots/timing,
// animated labels/plates, and unsupported animated layout/filter properties.
test('only explicit motion nodes animate with independent cadence and support timing', async ({ page }) => {
  await page.goto('/');
  const tracks = await page.locator('.artifact').evaluateAll(plates => plates.map(plate => {
    const style = getComputedStyle(plate);
    const nodes = [...plate.querySelectorAll('[data-motion]')].map(node => {
      const s = getComputedStyle(node);
      const animations = node.getAnimations();
      return { class: node.getAttribute('class'), name: s.animationName, canonical: s.getPropertyValue('--anim').trim(), duration: s.animationDuration,
        timing: s.animationTimingFunction, box: s.transformBox, origin: s.transformOrigin,
        declared: ['--anim', '--dur', '--freeze'].map(property => s.getPropertyValue(property).trim()),
        frames: animations.flatMap(animation => (animation.effect as KeyframeEffect).getKeyframes()) };
    });
    const accidental = [...plate.querySelectorAll('*:not([data-motion])')]
      .filter(node => getComputedStyle(node).animationName !== 'none').map(node => node.getAttribute('class') || node.tagName);
    return { id: plate.getAttribute('data-channel'), beat: style.getPropertyValue('--beat').trim(), nodes, accidental };
  }));
  const beats: Record<string, string> = { pc: '4.2s', games: '5.6s', nature: '7.1s', cooking: '8.3s', sky: '9.7s', ai: '11.3s' };
  for (const plate of tracks) {
    expect(plate.beat, plate.id!).toBe(beats[plate.id!]);
    expect(plate.accidental, plate.id!).toEqual([]);
    for (const node of plate.nodes) {
      expect(node.name, node.class!).not.toBe('none');
      expect(node.name, node.class!).toBe(node.canonical);
      expect(node.declared.every(Boolean), node.class!).toBe(true);
      expect(node.frames.length, node.class!).toBeGreaterThan(1);
      const properties = node.frames.flatMap(frame => Object.keys(frame))
        .filter(property => !['offset', 'computedOffset', 'easing', 'composite'].includes(property));
      expect(properties.every(property => ['transform', 'opacity', 'strokeDashoffset'].includes(property)), node.class!).toBe(true);
    }
  }
  for (const [selector, duration, timing, origin] of [
    ['.pc-fan-a', '1.4s', 'linear', '97px 201px'],
    ['.pc-fan-b', '1.7s', 'linear', '171px 192px'],
    ['.games-stick', '5.6s', 'ease-in-out', '55px 132px'],
    ['.sky-iris', '9.7s', 'ease-in-out', '155px 128px'],
    ['.ai-arm', '11.3s', 'ease-in-out', '70px 119px'],
    ['.ai-focus', '22.6s', 'linear', '213px 75px'],
  ]) {
    const node = page.locator(selector);
    await expect(node).toHaveCSS('animation-duration', duration);
    await expect(node).toHaveCSS('animation-timing-function', timing);
    await expect(node).toHaveCSS('transform-box', 'view-box');
    await expect(node).toHaveCSS('transform-origin', origin);
  }
  await expect(page.locator('.nature-drop')).toHaveCSS('animation-duration', '14s');
  await expect(page.locator('.sky-satellite')).toHaveCSS('animation-duration', '47s');
  await expect(page.locator('.games-cursor')).toHaveCSS('animation-timing-function', 'steps(1)');
  await expect(page.locator('.pc-led')).toHaveCSS('animation-timing-function', 'steps(1)');
  await expect(page.locator('.ai-focus')).toHaveCSS('animation-name', 'spin');
  await expect(page.locator('.ai-scan')).toHaveCSS('animation-name', 'optic-scan');
  const stationary = page.locator('.artifact, .artifact-graphic, .artifact-caption, .artifact-caption b, .artifact-caption span, .artifact svg, .artifact svg text, .screen h1, .screen h1 span, .screen .cursor');
  const sample = () => stationary.evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node), box = node.getBoundingClientRect();
    const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
    return { tag: node.tagName, class: node.getAttribute('class'), name: style.animationName, transform: style.transform, translate: style.translate,
      identity: matrix.isIdentity,
      x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  const before = await sample();
  expect(before.every(node => node.name === 'none' && node.identity && node.translate === 'none'),
    JSON.stringify(before.filter(node => node.name !== 'none' || !node.identity || node.translate !== 'none'))).toBe(true);
  await page.waitForTimeout(150);
  expect(await sample()).toEqual(before);
});

// Task 15: catches inherited/wrong gesture bindings, accelerated fixed supports,
// flattened local timing, centre-pivot organic motion and lost per-node staggering.
test('canonical motion tracks retain organic pivots, staggering and fixed supports under reaction', async ({ page }, info) => {
  await pauseClock(page); await page.goto('/');
  const tracks = [
    ['.pc-iris', 'iris', 4.2, 'ease-in-out', 'react', 0],
    ['.pc-fan-a', 'spin', 1.4, 'linear', 'fan', 0],
    ['.pc-fan-b', 'spin', 1.7, 'linear', 'fan', 0],
    ['.pc-led', 'led-cluster', 4.2, 'steps(1)', 'fixed', 0],
    ['.pc-heat', 'heat', 4.2, 'ease-in-out', 'react', 0],
    ['.games-scan', 'handheld-scan', 5.6, 'linear', 'react', 0],
    ['.games-cursor', 'cursor-blink', 1.1, 'steps(1)', 'fixed', 0],
    ['.games-stick', 'stick-idle', 5.6, 'ease-in-out', 'react', 0],
    ['.leaf-a', 'leaf-sway', 7.1, 'ease-in-out', 'react', 0],
    ['.leaf-b', 'leaf-sway', 7.1, 'ease-in-out', 'react', -1.2],
    ['.leaf-c', 'leaf-sway', 7.1, 'ease-in-out', 'react', -2.8],
    ['.nature-droop', 'leaf-droop', 9, 'ease-in-out', 'react', 0],
    ['.nature-drop', 'droplet', 14, 'ease-in-out', 'fixed', 0],
    ['.steam-a', 'steam', 8.3, 'ease-in-out', 'react', 0],
    ['.steam-b', 'steam', 8.3, 'ease-in-out', 'react', -2.4],
    ['.steam-c', 'steam', 8.3, 'ease-in-out', 'react', -5.2],
    ['.broth', 'ripple', 8.3, 'ease-in-out', 'react', 0],
    ['.cooking-lamp', 'lamp', 8.3, 'ease-in-out', 'fixed', 0],
    ['.sky-star', 'twinkle', 9.7, 'ease-in-out', 'react', 0],
    ['.sky-iris', 'aperture', 9.7, 'ease-in-out', 'react', 0],
    ['.sky-satellite', 'satellite', 47, 'linear', 'fixed', 0],
    ['.ai-arm', 'reach', 11.3, 'ease-in-out', 'react', 0],
    ['.ai-focus', 'spin', 22.6, 'linear', 'react', 0],
    ['.ai-scan', 'optic-scan', 11.3, 'ease-in-out', 'react', 0],
  ] as const;
  const pivots: Record<string, number[]> = { '.pc-fan-a': [97, 201], '.pc-fan-b': [171, 192],
    '.games-stick': [55, 132], '.sky-iris': [155, 128], '.ai-arm': [70, 119], '.ai-focus': [213, 75] };
  const read = () => page.evaluate(selectors => selectors.flatMap(selector =>
    [...document.querySelectorAll<SVGGraphicsElement>(selector)].map((node, index) => {
      const s = getComputedStyle(node), plate = node.closest<HTMLElement>('.artifact')!, box = node.getBBox();
      return { selector, index, plate: plate.dataset.channel!, name: s.animationName, state: s.animationPlayState,
        duration: parseFloat(s.animationDuration), timing: s.animationTimingFunction, delay: parseFloat(s.animationDelay),
        phase: parseFloat(plate.style.getPropertyValue('--phase')), star: Number(s.getPropertyValue('--star')),
        box: s.transformBox, origin: s.transformOrigin.split(' ').map(parseFloat), width: box.width, height: box.height,
        effects: node.getAnimations().map(animation => ({ name: (animation as CSSAnimation).animationName,
          duration: Number(animation.effect!.getComputedTiming().duration) / 1000 })) };
    })), tracks.map(([selector]) => selector));
  const verify = (rows: Awaited<ReturnType<typeof read>>, reacted = false) => {
    for (const [selector, name, seconds, timing, speed, offset] of tracks) {
      const nodes = rows.filter(row => row.selector === selector);
      expect(nodes, selector).toHaveLength(selector === '.sky-star' ? 6 : 1);
      for (const row of nodes) {
        const label = `${row.plate}/${selector}/${row.index}`;
        const duration = seconds / (reacted && speed !== 'fixed' ? 1.6 * (speed === 'fan' ? 2.2 : 1) : 1);
        expect(row.name, label).toBe(name); expect(row.state, label).toBe('running');
        expect(row.timing, label).toBe(timing); expect(row.duration, label).toBeCloseTo(duration, 5);
        expect(row.effects, label).toHaveLength(1); expect(row.effects[0].name, label).toBe(name);
        expect(row.effects[0].duration, label).toBeCloseTo(duration, 5);
        if (selector === '.sky-star') expect(row.star, label).toBe(row.index);
        expect(row.delay, label).toBeCloseTo(row.phase + (selector === '.sky-star' ? -1.31 * row.index : offset), 4);
        expect(row.box, label).toBe(pivots[selector] ? 'view-box' : 'fill-box');
        const organic = selector.startsWith('.leaf-') ? [.5, 1] : selector === '.nature-droop' ? [1, .7] : [.5, .5];
        const origin = pivots[selector] ?? [row.width * organic[0], row.height * organic[1]];
        for (let axis = 0; axis < 2; axis++) expect(row.origin[axis], `${label} pivot ${axis}`).toBeCloseTo(origin[axis], 3);
      }
    }
  };
  const baseline = await read(); expect(baseline).toHaveLength(29); verify(baseline);
  const reacted = [];
  for (const id of ids) {
    await page.locator(`.channel-key[data-channel="${id}"]`).evaluate(el => (el as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await expect(page.locator(`.artifact.${id}`)).toHaveAttribute('data-selected', 'true');
    await page.locator(`.artifact.${id}`).evaluate(el => (el as HTMLElement).style.setProperty('--prox', '1'));
    expect(await page.locator(`.artifact.${id}`).evaluate(el => Number(getComputedStyle(el).getPropertyValue('--react')))).toBe(1.6);
    reacted.push(...(await read()).filter(row => row.plate === id));
  }
  expect(reacted).toHaveLength(29); verify(reacted, true);
  await info.attach('canonical-tracks.json', { body: JSON.stringify({ baseline, reacted }, null, 2), contentType: 'application/json' });
});

// Catches phases outside the authored cycle and an opacity cadence that only
// meets the flash limit at nominal speed. Cyclic gaps include the iteration seam.
test('phase offsets stay bounded and opacity pulses stay below 3Hz at maximum reaction', async ({ page }, info) => {
  await page.addInitScript(() => {
    const fractions = [0, .2, .4, .6, .8, 1 - Number.EPSILON]; let index = 0;
    Math.random = () => fractions[index++ % fractions.length];
  });
  await pauseClock(page); await page.goto('/');
  const phases = () => page.locator('.artifact').evaluateAll(nodes => nodes.map(node => ({
    id: node.getAttribute('data-channel')!, beat: parseFloat(getComputedStyle(node).getPropertyValue('--beat')),
    phase: parseFloat((node as HTMLElement).style.getPropertyValue('--phase')),
  })));
  const initial = await phases(); expect(initial.map(row => row.id)).toEqual(ids);
  for (const [index, row] of initial.entries()) {
    expect(row.phase, row.id).toBeGreaterThanOrEqual(-row.beat); expect(row.phase, row.id).toBeLessThanOrEqual(0);
    expect(row.phase / row.beat, row.id).toBeCloseTo(-index / 5, 10);
  }
  const pc = page.locator('.artifact.pc'); await pc.scrollIntoViewIfNeeded();
  const box = (await pc.boundingBox())!; await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
  await page.clock.runFor(500); expect((await pointerValues(page))[0][0]).toBeGreaterThan(.2);
  expect(await phases()).toEqual(initial); // One-time phase initialization survives actual frame input.
  const measured = await page.locator('.artifact').evaluateAll(plates => {
    plates.forEach(plate => {
      (plate as HTMLElement).dataset.selected = 'true'; (plate as HTMLElement).style.setProperty('--prox', '1');
    });
    return plates.flatMap(plate => [...plate.querySelectorAll('[data-motion]')].map((node, index) => {
      const s = getComputedStyle(node), animation = node.getAnimations()[0], effect = animation?.effect as KeyframeEffect | null;
      const frames = effect?.getKeyframes() ?? [], opacity = frames.filter(frame => frame.opacity !== undefined);
      const rises = opacity.filter((frame, i) => Number(frame.opacity) > Number(opacity[(i + opacity.length - 1) % opacity.length].opacity))
        .map(frame => frame.computedOffset!);
      const duration = Number(effect?.getComputedTiming().duration);
      const gaps = rises.map((offset, i) => (rises[(i + 1) % rises.length] - offset + (i === rises.length - 1 ? 1 : 0)) * duration);
      return { id: `${plate.getAttribute('data-channel')}/${index}`, name: (animation as CSSAnimation)?.animationName,
        react: Number(s.getPropertyValue('--react')), duration, opacityFrames: opacity.length, pulses: rises.length,
        minimumGap: gaps.length ? Math.min(...gaps) : null,
        properties: [...new Set(frames.flatMap(frame => Object.keys(frame)))].filter(key => !['offset', 'computedOffset', 'easing', 'composite'].includes(key)) };
    }));
  });
  expect(measured).toHaveLength(29);
  const pulses = measured.filter(row => row.opacityFrames > 0); expect(pulses).toHaveLength(17);
  for (const row of measured) {
    expect(row.react, row.id).toBe(1.6); expect(row.duration, row.id).toBeGreaterThan(0);
    expect(row.properties.length, row.id).toBeGreaterThan(0);
    expect(row.properties.every(key => ['transform', 'opacity', 'strokeDashoffset'].includes(key)), row.id).toBe(true);
  }
  await info.attach('phase-pulse-contract.json', { body: JSON.stringify({ initial, measured }, null, 2), contentType: 'application/json' });
  for (const row of pulses) {
    expect(row.pulses, `${row.id}/${row.name}`).toBeGreaterThan(0);
    expect(row.minimumGap, `${row.id}/${row.name}`).toBeGreaterThanOrEqual(1000 / 3);
  }
});

// Catches lost persistence, a cosmetic-only toggle, and coupling to the separate lamp preference.
test('transmission toggles persist and freeze the art', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('[data-transmission-toggle]');
  await page.getByRole('button', { name: 'Turn transmission effects off', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-transmission', 'off');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle.locator('[data-transmission-label]')).toHaveText('OFF');
  const frozen = await motionFrame(page);
  expectFrozen(frozen);
  await expect(page.locator('#station')).toHaveAttribute('data-light', 'high');
  await page.getByRole('button', { name: 'Lower desk lighting', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-transmission', 'off');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-transmission', 'off');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#station')).toHaveAttribute('data-light', 'low');
  expect(await motionFrame(page)).toEqual(frozen);
  await page.getByRole('button', { name: 'Turn transmission effects on', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-transmission', 'on');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle.locator('[data-transmission-label]')).toHaveText('ON');
  for (const id of ids) {
    await expect(page.locator(`.artifact.${id} [data-pose-probe]`)).toHaveCSS('animation-play-state', 'running');
  }
  await expect(page.locator('#station')).toHaveAttribute('data-light', 'low');
  await page.getByRole('button', { name: 'Raise desk lighting', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-transmission', 'on');
  expect(await page.evaluate(() => localStorage.getItem('ha-transmission'))).toBe('on');
});

// Catches an unguarded storage access and a stale control after an external root-state change.
test('blocked preference storage still allows this-visit toggling', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', {
    get() { throw new Error('blocked'); },
  }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn transmission effects off', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-transmission', 'off');
  expectFrozen(await motionFrame(page));
  await page.getByRole('button', { name: 'Turn transmission effects on', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-transmission', 'on');
  await page.evaluate(() => { document.documentElement.dataset.transmission = 'off'; });
  await expect(page.locator('[data-transmission-toggle]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Turn transmission effects on', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

// Catches a bay-only early return, duplicate mounts, or preferences discarded on a new route.
test('global transmission works on case studies and 404 without a bay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let on = true;
  for (const route of ['/projects/anon4reid/', '/projects/wayfinder/', '/projects/app-factory/', '/not-a-real-coordinate/']) {
    await page.goto(route);
    await expect(page.locator('.desk-surface')).toHaveCount(0);
    const toggle = page.locator('[data-transmission-toggle]');
    await expect(toggle).toHaveCount(1);
    await expect(page.locator('[data-transmission-field][aria-hidden="true"]')).toHaveCount(1);
    await expect(page.locator('[data-boot-host]')).toBeEmpty();
    await expect(toggle).toHaveAttribute('aria-pressed', String(on));
    await toggle.click();
    on = !on;
    await expect(toggle).toHaveAttribute('aria-pressed', String(on));
    await expect(page.locator('html')).toHaveAttribute('data-transmission', on ? 'on' : 'off');
  }
  expect(errors).toEqual([]);
});

async function pauseClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-21T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-21T12:01:00Z'));
}

async function selectionFrame(page: Page) {
  return page.locator('.artifact').evaluateAll(plates => {
    const bay = document.querySelector('.desk-surface')!.getBoundingClientRect();
    return plates.map(plate => [plate, plate.querySelector('.artifact-caption')!].map(node => {
      const style = getComputedStyle(node), box = node.getBoundingClientRect();
      return { x: Number((box.x - bay.x).toFixed(3)), y: Number((box.y - bay.y).toFixed(3)),
        width: box.width, height: box.height, opacity: style.opacity, transform: style.transform, translate: style.translate };
    }));
  });
}

// Task 14: observable deadlines/paint, using the real shared runtime and controls.
test.describe('ambient scheduler', () => {
  test.beforeEach(async ({ page }) => {
    // Only scheduler tests fix randomness; artwork/presentation tests keep the real source.
    await page.addInitScript(() => { Math.random = () => 0; });
    await pauseClock(page);
  });

  // Catches absent/early scheduling, an interval from tear completion, a second pseudo-band,
  // oversized targets and a lifetime stretched beyond the existing 200ms tear.
  test('ambient tears wait 20 seconds, stay small and use one band at a time', async ({ page }, info) => {
    await page.goto('/');
    await page.clock.runFor(19999); await expect(page.locator('.is-tearing')).toHaveCount(0);
    await page.clock.runFor(1);
    const target = page.locator('[data-tear="ambient"]'); await expect(target).toHaveCount(1);
    const band = await target.evaluate(el => {
      const rect = el.getBoundingClientRect(), s = getComputedStyle(el, '::before');
      return { target: el.className, visible: rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0,
        area: parseFloat(s.width) * parseFloat(s.height), viewport: innerWidth * innerHeight,
        pointer: s.pointerEvents, duration: s.animationDuration, after: getComputedStyle(el, '::after').content };
    });
    expect(band.target).toContain('screen-head'); expect(band.visible).toBe(true);
    expect(band.area).toBeGreaterThan(0); expect(band.area / band.viewport).toBeLessThanOrEqual(.12);
    expect(band.pointer).toBe('none'); expect(band.duration).toBe('0.2s'); expect(band.after).toBe('none');
    await page.clock.runFor(199); await expect(target).toHaveCount(1);
    await page.clock.runFor(1); await expect(page.locator('.is-tearing')).toHaveCount(0);
    await page.clock.runFor(19799); await expect(page.locator('.is-tearing')).toHaveCount(0);
    await page.clock.runFor(1); await expect(target).toHaveCount(1);
    await info.attach('ambient-band.json', { body: JSON.stringify(band, null, 2), contentType: 'application/json' });
  });

  // Catches losing the 14s random range or sampling the deadline just once for the visit.
  test('ambient deadlines also reach 34 seconds and resample after each attempt', async ({ page }) => {
    await page.goto('/');
    await page.clock.runFor(20200);
    await page.evaluate(() => { Math.random = () => 1 - Number.EPSILON; });
    await page.clock.runFor(19800); await expect(page.locator('[data-tear="ambient"]')).toHaveCount(1);
    await page.clock.runFor(33999); await expect(page.locator('.is-tearing')).toHaveCount(0);
    await page.clock.runFor(1); await expect(page.locator('[data-tear="ambient"]')).toHaveCount(1);
  });

  // Catches viewport-only checks selecting a filtered/zero-size/offscreen file,
  // selecting printed body text or accumulating skipped events for a later burst.
  test('ambient scheduling selects visible decorative files and skips when only bone is visible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Computer vision', exact: true }).click();
    await page.locator('#project-ocular-health').scrollIntoViewIfNeeded();
    await page.clock.runFor(20000);
    const target = page.locator('[data-tear="ambient"]'); await expect(target).toHaveCount(1);
    expect(await target.evaluate(el => ({ file: el.matches('.file-id'), visible: el.getBoundingClientRect().height > 0,
      hidden: !!el.closest('[hidden]'), bone: !!el.closest('.bone-content'), decorative: el.getAttribute('aria-hidden') })))
      .toEqual({ file: true, visible: true, hidden: false, bone: false, decorative: 'true' });
    await page.clock.runFor(200);
    await page.locator('#credentials .bone-content').evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + scrollY + 30));
    expect(await page.locator('.screen-head,.file-id,.case-numeral').evaluateAll(nodes => nodes.some(el => {
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    }))).toBe(false);
    await page.clock.runFor(39800); await expect(page.locator('.is-tearing')).toHaveCount(0);
    await page.locator('.file-id').first().scrollIntoViewIfNeeded();
    await page.clock.runFor(19999); await expect(page.locator('.is-tearing')).toHaveCount(0);
    await page.clock.runFor(1); await expect(target).toHaveCount(1);
  });

  for (const route of ['/projects/wayfinder/', '/not-a-real-coordinate/']) {
    // Catches a homepage-only scheduler and a full-width/oversized case numeral band.
    test(`ambient targets a bounded case numeral on ${route}`, async ({ page }) => {
      await page.goto(route); await page.clock.runFor(20000);
      const target = page.locator('.case-numeral[data-tear="ambient"]'); await expect(target).toHaveCount(1);
      const band = await target.evaluate(el => {
        const s = getComputedStyle(el, '::before'); return { width: parseFloat(s.width), height: parseFloat(s.height), viewport: innerWidth * innerHeight };
      });
      expect(band.width).toBeGreaterThan(0); expect(band.width).toBeLessThan(400);
      expect(band.height).toBeLessThanOrEqual(32); expect(band.width * band.height / band.viewport).toBeLessThanOrEqual(.12);
    });
  }

  // Catches separate concurrent tear owners, queued retries after gate rejection, or treating
  // user feedback as a 20s ambient event instead of the independent 200ms/334ms contract.
  test('ambient and selection share the tear gate without delaying real channel feedback', async ({ page }) => {
    await page.goto('/');
    const activate = async (channel: string) => {
      await page.locator(`.channel-key[data-channel="${channel}"]`).evaluate(el => (el as HTMLElement).focus({ preventScroll: true }));
      await page.keyboard.press('Enter');
    };
    await page.clock.runFor(19900); await activate('pc');
    await expect(page.locator('[data-tear="selection"]')).toHaveCount(1);
    await page.clock.runFor(100); await expect(page.locator('[data-tear="ambient"]')).toHaveCount(0);
    await expect(page.locator('[data-tear="selection"]')).toHaveCount(1);
    await page.clock.runFor(100); await expect(page.locator('.is-tearing')).toHaveCount(0);
    await page.clock.runFor(19900); await expect(page.locator('[data-tear="ambient"]')).toHaveCount(1);
    await activate('sky');
    await expect(page.locator('#channel-title')).toContainText('Space');
    await expect(page.locator('.artifact.sky')).toHaveAttribute('data-selected', 'true');
    await expect(page.locator('[data-tear="ambient"]')).toHaveCount(1); await expect(page.locator('.is-tearing')).toHaveCount(1);
    await page.clock.runFor(200); await activate('nature');
    await expect(page.locator('#channel-title')).toContainText('Gardening'); await expect(page.locator('.is-tearing')).toHaveCount(0);
    await page.clock.runFor(134); await activate('pc');
    await expect(page.locator('[data-tear="selection"]')).toHaveCount(1);
  });

  for (const mode of ['effects-off', 'reduced-motion', 'hidden'] as const) {
    // Catches stale callbacks, active bands on suppression, a queued catch-up and duplicate
    // deadlines after state changes. The long disabled interval crosses multiple missed events.
    test(`ambient suppression cancels active work and starts a fresh gap for ${mode}`, async ({ page }) => {
      await page.goto('/'); await page.clock.runFor(20000); await expect(page.locator('[data-tear="ambient"]')).toHaveCount(1);
      if (mode === 'effects-off') await page.locator('[data-transmission-toggle]').click();
      else if (mode === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
      else await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect(page.locator('.is-tearing,[data-tear]')).toHaveCount(0);
      await page.clock.runFor(100000); await expect(page.locator('.is-tearing')).toHaveCount(0);
      if (mode === 'effects-off') await page.locator('[data-transmission-toggle]').click();
      else if (mode === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'no-preference' });
      else await page.evaluate(() => { Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange')); });
      await page.clock.runFor(19999); await expect(page.locator('.is-tearing')).toHaveCount(0);
      await page.clock.runFor(1); await expect(page.locator('[data-tear="ambient"]')).toHaveCount(1);
      await page.clock.runFor(200); await expect(page.locator('.is-tearing')).toHaveCount(0);
      await page.clock.runFor(19799); await expect(page.locator('.is-tearing')).toHaveCount(0);
      await page.clock.runFor(1); await expect(page.locator('[data-tear="ambient"]')).toHaveCount(1);
    });
  }

  // Catches a scheduled ::before band hidden behind the newly positioned clipped face.
  // Compare real interior paint at two frames, excluding the exterior/cut-corner escape area.
  test('ambient file bands paint across the face at all five widths', async ({ page }, info) => {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto('/');
      await page.locator('.file-id').first().scrollIntoViewIfNeeded(); await page.mouse.move(1, 1);
      await page.clock.runFor(20000);
      const target = page.locator('.file-id[data-tear="ambient"]'); await expect(target).toHaveCount(1);
      const box = (await target.boundingBox())!;
      const clip = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width) + 1, height: Math.ceil(box.height) + 1 };
      const frame = async (time: number) => {
        await target.evaluate((el, currentTime) => {
          getComputedStyle(el, '::before').animationName;
          const animation = el.getAnimations({ subtree: true }).find(item => item instanceof CSSAnimation && item.animationName === 'ambient-tear')!;
          animation.pause(); animation.currentTime = currentTime;
        }, time);
        return page.screenshot({ clip, animations: 'allow' });
      };
      const zero = await frame(0), active = await frame(60);
      const before = await sharp(zero).removeAlpha().raw().toBuffer();
      const after = await sharp(active).removeAlpha().raw().toBuffer();
      const row = Math.floor(box.y - clip.y) + (width <= 600 ? 24 : 27);
      const column = Math.floor(box.x - clip.x) + 12;
      const interior = Array.from({ length: 3 }, (_, y) => Array.from({ length: 12 }, (_, x) => {
        const index = ((row + y) * clip.width + column + x) * 3;
        return after[index] - before[index];
      })).flat();
      await info.attach(`ambient-file-zero-${width}.png`, { body: zero, contentType: 'image/png' });
      await info.attach(`ambient-file-active-${width}.png`, { body: active, contentType: 'image/png' });
      await info.attach(`ambient-file-interior-${width}.json`, { body: JSON.stringify({ interiorRedDelta: interior }, null, 2), contentType: 'application/json' });
      expect(Math.max(...interior), `${width}: the ambient band must visibly paint inside the file face`).toBeGreaterThanOrEqual(8);
    }
  });
});

// Catches placing grain above content, texturing printed descendants, missing local/off
// removal, non-static filters and red text sitting on a patterned background instead of hull.
test('textures stay beneath dark surfaces with solid red backplates and turn off completely', async ({ page }) => {
  await page.goto('/');
  const texture = page.locator('.desk-surface');
  for (const surface of await page.locator('.site-header,.site-footer,.masthead,.desk-surface,#screen,.bone-heading,.project-record').all()) {
    await expect(surface).toHaveAttribute('data-signal-surface', '');
    const layer = await surface.evaluate(el => {
      const s = getComputedStyle(el, '::after'); return { content: s.content, image: s.backgroundImage,
        pointer: s.pointerEvents, z: s.zIndex, animation: s.animationName, isolation: getComputedStyle(el).isolation };
    });
    expect(layer.content).toBe('""'); expect(layer.image).toContain('data:image/svg+xml');
    expect(layer.image).toContain('repeating-linear-gradient'); expect(layer.image).toContain('radial-gradient');
    expect(layer.pointer).toBe('none'); expect(layer.z).toBe('-1'); expect(layer.animation).toBe('none'); expect(layer.isolation).toBe('isolate');
  }
  await expect(page.locator('[data-transmission-field]')).toHaveCSS('z-index', '-1');
  const bone = await page.locator('#about .bone-content').evaluate(el => ({
    after: getComputedStyle(el, '::after').backgroundImage, root: getComputedStyle(el.closest('.bone-plate')!).backgroundColor,
    marked: !!el.closest('[data-signal-surface]') }));
  expect(bone).toEqual({ after: 'none', root: 'rgb(233, 228, 214)', marked: false });
  await expect(page.locator('[data-signal-surface] .bone-content[data-signal-surface],.prose[data-signal-surface],.artifact-caption[data-signal-surface]')).toHaveCount(0);
  await expect(page.locator('.project-category').first()).toHaveCSS('background-color', 'rgb(12, 18, 20)');
  await expect(page.locator('#channel-title')).toHaveCSS('background-color', 'rgb(12, 18, 20)');
  expect(await page.locator('#screen').evaluate(el => getComputedStyle(el, '::after').backgroundImage)).toContain('rgba(56, 208, 216, 0.04)');
  await page.getByRole('button', { name: 'Turn transmission effects off', exact: true }).click();
  expect(await texture.evaluate(el => getComputedStyle(el, '::after').backgroundImage)).toBe('none');
  for (const layer of await page.locator('[data-signal-surface]').all()) expect(await layer.evaluate(el => getComputedStyle(el, '::after').backgroundImage)).toBe('none');
  await expect(page.locator('[data-transmission-field]')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.is-tearing')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  for (const layer of await page.locator('[data-signal-surface]').all()) expect(await layer.evaluate(el => getComputedStyle(el, '::after').display)).toBe('none');
});

for (const route of ['/projects/anon4reid/', '/projects/wayfinder/', '/projects/app-factory/', '/not-a-real-coordinate/']) {
  // Catches accidentally texturing story/evidence copy or altering/losing the preview's IDs.
  test(`textures scope the direct route dark shell and instruments on ${route}`, async ({ page }) => {
    await page.goto(route);
    const shell = page.locator(route.startsWith('/projects/') ? '.case-header' : '.missing-page');
    await expect(shell).toHaveAttribute('data-signal-surface', '');
    expect(await shell.evaluate(el => getComputedStyle(el, '::after').backgroundImage)).toContain('data:image/svg+xml');
    if (route.startsWith('/projects/')) {
      await expect(page.locator('.case-instruments.hull-surface')).toHaveAttribute('data-signal-surface', '');
      await expect(page.locator('.case-instruments #preview')).toHaveCount(1);
      await expect(page.locator('.case-meta strong')).toHaveCSS('background-color', 'rgb(12, 18, 20)');
      expect(await page.locator('#story').evaluate(el => ({ marked: !!el.closest('[data-signal-surface]'), image: getComputedStyle(el, '::after').backgroundImage })))
        .toEqual({ marked: false, image: 'none' });
    }
  });
}

// Catches global/always-on text splitting, focus-only splitting, persistence after off/reduce,
// and a coarse/touch hover matching the fine-input decorative rule.
test('chroma is hover-only on decorative file numerals and obeys off and reduced motion', async ({ page }) => {
  await page.goto('/');
  const numeral = page.locator('.file-id strong').first(), label = page.locator('.file-id small').first();
  await expect(numeral).toHaveCSS('text-shadow', 'none');
  await page.locator('.project-record').first().hover();
  await expect(numeral).toHaveCSS('text-shadow', 'rgb(56, 208, 216) -1px 0px 0px, rgb(242, 160, 123) 1px 0px 0px');
  await expect(label).toHaveCSS('text-shadow', 'none'); await expect(page.locator('.project-title h3').first()).toHaveCSS('text-shadow', 'none');
  await page.mouse.move(1, 1); await page.locator('.project-title a').first().focus(); await expect(numeral).toHaveCSS('text-shadow', 'none');
  await page.locator('[data-transmission-toggle]').click(); await page.locator('.project-record').first().hover(); await expect(numeral).toHaveCSS('text-shadow', 'none');
  await page.locator('[data-transmission-toggle]').click(); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.project-record').first().hover(); await expect(numeral).toHaveCSS('text-shadow', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto('/projects/wayfinder/');
  const caseNumber = page.locator('.case-numeral'); await expect(caseNumber).toHaveCSS('text-shadow', 'none');
  await caseNumber.hover(); await expect(caseNumber).toHaveCSS('text-shadow', 'rgb(56, 208, 216) -1px 0px 0px, rgb(242, 160, 123) 1px 0px 0px');
  await expect(page.locator('.case-header h1')).toHaveCSS('text-shadow', 'none');
  const media = await page.context().newCDPSession(page);
  try { await media.send('Emulation.setTouchEmulationEnabled', { enabled: true }); await expect(caseNumber).toHaveCSS('text-shadow', 'none'); }
  finally { await media.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await media.detach(); }
});

// Catches the M1 same-element clipping defect through actual exterior pixels, a missing cut
// stroke, moved glyphs/marker and lost decorative aria; computed box-shadow alone cannot pass.
test('file plates paint an unclipped shadow and diagonal edge without moving their glyphs', async ({ page }, info) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto('/');
    if (await page.locator('html').getAttribute('data-transmission') === 'on') await page.locator('[data-transmission-toggle]').click();
    for (const file of await page.locator('.file-id').all()) {
      const geometry = await file.evaluate(el => {
        const face = el.querySelector('.file-id-face') || el, r = el.getBoundingClientRect(), s = getComputedStyle(el), fs = getComputedStyle(face);
        const marker = getComputedStyle(face, '::after'), edge = getComputedStyle(face, '::before');
        const markerLeft = r.width - parseFloat(fs.borderRightWidth) - parseFloat(marker.right) - parseFloat(marker.width);
        return { width: r.width, height: r.height, clip: s.clipPath, faceClip: fs.clipPath, aria: el.getAttribute('aria-hidden'), edge: edge.content,
          glyphs: [...el.querySelectorAll('small,strong')].map(label => {
            const range = document.createRange(); range.selectNodeContents(label); const box = range.getBoundingClientRect();
            return { text: label.textContent, x: box.x - r.x, y: box.y - r.y, gap: markerLeft - (box.right - r.x) };
          }) };
      });
      expect(geometry.clip, `${width}: shadow wrapper`).toBe('none'); expect(geometry.faceClip).toContain('polygon');
      expect(geometry.aria).toBe('true'); expect(geometry.edge).toBe('""');
      expect([geometry.width, geometry.height]).toEqual(width <= 600 ? [38, 52] : [49, 60]);
      expect(geometry.glyphs[0].text).toBe('FILE'); expect(geometry.glyphs.map(glyph => glyph.x)).toEqual(width <= 600 ? [4, 4] : [8, 8]);
      expect(geometry.glyphs[0].y).toBe(width <= 600 ? 9 : 10);
      expect(geometry.glyphs[1].y).toBeCloseTo(width <= 600 ? 21 : 23.203125, 3);
      expect(geometry.glyphs.every(glyph => glyph.gap >= 1)).toBe(true);
    }
    const file = page.locator('.file-id').first(); await file.scrollIntoViewIfNeeded(); await page.mouse.move(1, 1);
    const box = (await file.boundingBox())!, clip = { x: Math.floor(box.x) - 5, y: Math.floor(box.y) - 5,
      width: Math.ceil(box.x + box.width) - Math.floor(box.x) + 12, height: Math.ceil(box.y + box.height) - Math.floor(box.y) + 12 };
    const image = await page.screenshot({ clip, animations: 'allow' });
    const { data, info: png } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((Math.floor(y - clip.y) * png.width + Math.floor(x - clip.x)) * 3,
      (Math.floor(y - clip.y) * png.width + Math.floor(x - clip.x)) * 3 + 3)];
    expect(pixel(box.x + box.width + 1, box.y + box.height / 2), `${width}: right shadow is painted`).toEqual([38, 52, 55]);
    expect(pixel(box.x + box.width / 2, box.y + box.height + 1), `${width}: bottom shadow is painted`).toEqual([38, 52, 55]);
    // A 3×3 midpoint window tolerates half-pixel alignment; absent stroke stays at raised hull.
    const edgePixels = [3, 4, 5].flatMap(y => [3, 4, 5].map(x => pixel(box.x + box.width - x, box.y + y)[0]));
    expect(Math.max(...edgePixels), `${width}: real diagonal edge pixels`).toBeGreaterThan(70);
    await info.attach(`file-plate-${width}.png`, { body: image, contentType: 'image/png' });
  }
});

// Catches a persistent boost, wrong beat timeout, snapped return, filter tween, or moving/dimmed captions.
test('selection reacts for one beat without changing caption legibility', async ({ page }) => {
  await pauseClock(page);
  await page.goto('/');
  const selected = page.locator('.artifact.nature');
  const before = await selectionFrame(page);
  await page.locator('.channel-key[data-channel="nature"]').click();
  await expect(selected).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('#channel-title')).toContainText('Gardening');
  expect(await selected.evaluate(el => getComputedStyle(el).getPropertyValue('--react').trim())).toBe('1.6');
  await expect(page.locator('.nature-leaf').first()).toHaveCSS('animation-duration', '4.4375s');
  await expect(page.locator('.nature-drop')).toHaveCSS('animation-duration', '14s');
  for (const id of ids) await expect(page.locator(`.artifact.${id} .artifact-caption`)).toHaveCSS('opacity', '1');
  expect(await selectionFrame(page)).toEqual(before);
  const tint = await page.locator('.artifact-graphic > svg').evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return { id: node.closest('.artifact')!.getAttribute('data-channel'), filter: style.filter,
      transition: style.transitionProperty, animatedFilter: node.getAnimations().some(animation =>
        (animation.effect as KeyframeEffect).getKeyframes().some(frame => 'filter' in frame)) };
  }));
  expect(Object.fromEntries(tint.map(node => [node.id, node.filter]))).toEqual({ pc: 'saturate(0.78)', games: 'saturate(0.78)',
    nature: 'saturate(1)', cooking: 'saturate(0.78)', sky: 'saturate(0.78)', ai: 'saturate(0.78)' });
  expect(tint.every(node => node.transition === 'none' && !node.animatedFilter)).toBe(true);
  await page.clock.runFor(7099);
  await expect(selected).toHaveAttribute('data-selected', 'true');
  await page.clock.runFor(51);
  await expect(selected).not.toHaveAttribute('data-selected', 'true');
  expect(await selected.evaluate(el => el.getAnimations().filter(animation =>
    animation instanceof CSSTransition && animation.transitionProperty === '--react')
    .map(animation => (animation.effect as KeyframeEffect).getTiming().duration))).toEqual([1200]);
  await expect.poll(() => selected.evaluate(el => {
    const scalar = Number(getComputedStyle(el).getPropertyValue('--react'));
    return scalar > 1 && scalar < 1.6;
  }), { message: 'Registered scalar returns through a real compositor transition' }).toBe(true);
  await expect.poll(() => selected.evaluate(el => Number(getComputedStyle(el).getPropertyValue('--react')))).toBe(1);
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  expect(await selectionFrame(page)).toEqual(before);
});

// Task 15: all six exact endpoints belong in the maintained suite, rather than an observation helper.
test('every channel reaction expires at the exact one-beat boundary', async ({ page }, info) => {
  await pauseClock(page); await page.goto('/');
  const samples = [];
  for (const id of ids) {
    const plate = page.locator(`.artifact.${id}`), key = page.locator(`.channel-key[data-channel="${id}"]`);
    await key.evaluate(el => (el as HTMLElement).focus({ preventScroll: true })); await page.keyboard.press('Enter');
    await expect(plate).toHaveAttribute('data-selected', 'true');
    const start = await page.evaluate(() => performance.now());
    await page.clock.runFor(beatMs[id] - 1);
    const before = { at: await page.evaluate(() => performance.now()) - start, selected: await plate.getAttribute('data-selected') };
    expect(before, `${id}: beat minus 1ms`).toEqual({ at: beatMs[id] - 1, selected: 'true' });
    await page.clock.runFor(1);
    const boundary = { at: await page.evaluate(() => performance.now()) - start, selected: await plate.getAttribute('data-selected') };
    expect(boundary, `${id}: exact beat`).toEqual({ at: beatMs[id], selected: null });
    await expect(page.locator('.artifact[data-selected="true"]')).toHaveCount(0);
    await expect(plate).toHaveAttribute('aria-pressed', 'true'); await expect(key).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#channel-link')).toHaveAttribute('href', `#interest-${id}`);
    samples.push({ id, before, boundary });
  }
  await info.attach('beat-boundaries.json', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
});

// Catches overlapping/restarted bands, a stretched 200ms lock, or admission before the 334ms flash guard.
test('rapid channel input never overlaps selection tears', async ({ page }) => {
  await pauseClock(page);
  await page.goto('/');
  const key = page.locator('.channel-key[data-channel="pc"]');
  const readout = page.locator('.screen-head');
  await key.click();
  await expect(page.locator('.is-tearing')).toHaveCount(1);
  await expect(readout).toHaveAttribute('data-tear', 'selection');
  await page.clock.runFor(100);
  await page.locator('.channel-key[data-channel="sky"]').click();
  await expect(page.locator('.is-tearing')).toHaveCount(1);
  await expect(page.locator('#channel-title')).toContainText('Space');
  await page.clock.runFor(99);
  await expect(readout).toHaveClass(/is-tearing/);
  await page.clock.runFor(1);
  await expect(page.locator('.is-tearing, [data-tear]')).toHaveCount(0);
  expect(await readout.evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');
  await page.clock.runFor(10);
  await key.click();
  await expect(page.locator('.is-tearing')).toHaveCount(0);
  await page.clock.runFor(123);
  await key.click();
  await expect(page.locator('.is-tearing')).toHaveCount(0);
  await page.clock.runFor(1);
  await key.click();
  await expect(page.locator('.is-tearing')).toHaveCount(1);
  await page.clock.runFor(200);
  await expect(page.locator('.is-tearing')).toHaveCount(0);
  await key.click();
  await expect(page.locator('.is-tearing')).toHaveCount(0);
  await page.clock.runFor(134);
  await key.click();
  await expect(page.locator('.is-tearing')).toHaveCount(1);
});

// Catches suppressing real channel content alongside decorative motion, including keyboard activation.
test('reduced-motion selection keeps content updates but creates no tear', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('.channel-key[data-channel="sky"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#channel-title')).toContainText('Space');
  await expect(page.locator('#console-copy')).toContainText('Astrophotography');
  await expect(page.locator('.artifact.sky')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-selected="true"], .is-tearing, [data-tear]')).toHaveCount(0);
  expect(await page.locator('.artifact.sky').evaluate(el => getComputedStyle(el).getPropertyValue('--react').trim())).toBe('1');
  expectFrozen(await motionFrame(page));
});

// Catches missed nested-object/keyboard clicks, a stale earlier beat timer, and home retaining selected tint.
test('selection follows objects and keyboard keys and clears on home reset', async ({ page }) => {
  await pauseClock(page);
  await page.goto('/');
  await page.locator('.artifact.games .artifact-caption span').click();
  await expect(page.locator('.artifact.games')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('#channel-title')).toContainText('Games');
  await expect(page.locator('.channel-key[data-channel="games"]')).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(1000);
  await page.locator('.channel-key[data-channel="sky"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.artifact.sky')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('.artifact.games')).not.toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-selected="true"]')).toHaveCount(1);
  await expect(page.locator('#console-copy')).toContainText('Astrophotography');
  await page.clock.runFor(4600);
  await expect(page.locator('.artifact.sky')).toHaveAttribute('data-selected', 'true');
  await page.getByRole('button', { name: 'Show introduction' }).click();
  await expect(page.locator('#console-copy')).toContainText('I study AI');
  await expect(page.locator('[data-selected="true"], .artifact[aria-pressed="true"]')).toHaveCount(0);
  expect(await page.locator('.artifact-graphic > svg').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).filter))).toEqual(ids.map(() => 'none'));
  await page.clock.runFor(10000);
  await expect(page.locator('[data-selected="true"], .is-tearing, [data-tear]')).toHaveCount(0);
});

// A queued root observer cannot authorize a synchronous click that actually occurred while off.
test('same-task off channel clicks admit no reaction or tear edges and consume no cooldown', async ({ page }, info) => {
  await pauseClock(page); await page.goto('/'); await page.clock.runFor(1200);
  const samples = [];
  for (const restoreInTask of [true, false]) {
    await page.clock.runFor(1000);
    const sample = await page.evaluate(restore => {
      const observer = new MutationObserver(() => {});
      observer.observe(document.querySelector('.desk-surface')!, { subtree: true, attributes: true,
        attributeFilter: ['class', 'data-selected', 'data-tear'], attributeOldValue: true });
      document.documentElement.dataset.transmission = 'off';
      document.querySelector<HTMLButtonElement>('.channel-key[data-channel="pc"]')!.click();
      if (restore) document.documentElement.dataset.transmission = 'on';
      const records = observer.takeRecords(); observer.disconnect();
      return { restore, selected: document.querySelectorAll('.artifact[data-selected]').length,
        tears: document.querySelectorAll('.is-tearing,[data-tear]').length,
        reactionEdges: records.filter(record => record.attributeName === 'data-selected').length,
        tearEdges: records.filter(record => record.attributeName === 'data-tear' || record.attributeName === 'class' &&
          (record.target as Element).matches('.screen-head')).length };
    }, restoreInTask);
    samples.push(sample);
    await info.attach(`same-task-off-${restoreInTask}.json`, { body: JSON.stringify(sample), contentType: 'application/json' });
    expect(sample).toEqual({ restore: restoreInTask, selected: 0, tears: 0, reactionEdges: 0, tearEdges: 0 });
    await expect(page.locator('#channel-title')).toContainText('PC'); // Original content controller still runs.
    await expect(page.locator('.artifact[data-selected],.is-tearing,[data-tear]')).toHaveCount(0);
    if (!restoreInTask) await page.evaluate(() => { document.documentElement.dataset.transmission = 'on'; });
    await page.locator('.channel-key[data-channel="sky"]').evaluate(el => (el as HTMLButtonElement).click());
    await expect(page.locator('.artifact.sky')).toHaveAttribute('data-selected', 'true');
    await expect(page.locator('[data-tear="selection"]')).toHaveCount(1); // Invalid click did not advance 334ms gate.
    await page.clock.runFor(200); await expect(page.locator('.is-tearing,[data-tear]')).toHaveCount(0);
    await page.locator('.channel-key[data-channel="intro"]').evaluate(el => (el as HTMLButtonElement).click());
    await expect(page.locator('.artifact[data-selected]')).toHaveCount(0);
  }
  await info.attach('same-task-off-ingress.json', { body: JSON.stringify(samples), contentType: 'application/json' });
});

for (const mode of ['effects-off', 'reduced-motion', 'hidden'] as const) {
  // Catches missing lifecycle cleanup, cooldown reset on suppression, and an uncancelled earlier beat timer.
  test(`selection suppression clears pending work for ${mode}`, async ({ page }) => {
    await pauseClock(page);
    await page.goto('/');
    await page.locator('.channel-key[data-channel="pc"]').click();
    await expect(page.locator('.artifact.pc')).toHaveAttribute('data-selected', 'true');
    await expect(page.locator('.is-tearing')).toHaveCount(1);
    if (mode === 'effects-off') await page.getByRole('button', { name: 'Turn transmission effects off', exact: true }).click();
    else if (mode === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
    else await page.evaluate(() => {
      // A visibility boundary fixture; headless tabs do not reliably become document.hidden.
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('[data-selected="true"], .is-tearing, [data-tear]')).toHaveCount(0);
    await page.clock.runFor(210);
    if (mode === 'effects-off') await page.getByRole('button', { name: 'Turn transmission effects on', exact: true }).click();
    else if (mode === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'no-preference' });
    else await page.evaluate(() => {
      Reflect.deleteProperty(document, 'hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('[data-selected="true"], .is-tearing')).toHaveCount(0);
    const sky = page.locator('.artifact.sky'), key = page.locator('.channel-key[data-channel="sky"]');
    await key.click();
    await expect(sky).toHaveAttribute('data-selected', 'true');
    await expect(page.locator('.is-tearing')).toHaveCount(0);
    await page.clock.runFor(124);
    await key.click();
    await expect(page.locator('.is-tearing')).toHaveCount(1);
    await page.clock.runFor(3866);
    await expect(sky).toHaveAttribute('data-selected', 'true');
    await page.clock.runFor(5834);
    await expect(sky).not.toHaveAttribute('data-selected', 'true');
    await expect.poll(() => sky.evaluate(el => Number(getComputedStyle(el).getPropertyValue('--react')))).toBe(1);
  });
}

// Function identities distinguish native listener ownership from repeated registration calls.
async function instrumentPointer(page: Page) {
  await page.addInitScript(() => {
    const active: { target: EventTarget; type: string; callback: EventListenerOrEventListenerObject; capture: boolean }[] = []; let additions = 0;
    const captureOf = (options?: boolean | AddEventListenerOptions) => typeof options === 'boolean' ? options : options?.capture === true;
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, callback, options) {
      if (type === 'pointermove' && this instanceof Element && this.matches('.desk-surface') && callback) {
        const capture = captureOf(options);
        if (!active.some(entry => entry.target === this && entry.type === type && entry.callback === callback && entry.capture === capture)) {
          active.push({ target: this, type, callback, capture }); additions++;
        }
      }
      return add.call(this, type, callback, options);
    };
    EventTarget.prototype.removeEventListener = function (type, callback, options) {
      const capture = captureOf(options);
      const index = active.findIndex(entry => entry.target === this && entry.type === type && entry.callback === callback && entry.capture === capture);
      if (index !== -1) active.splice(index, 1);
      return remove.call(this, type, callback, options);
    };
    Object.assign(window, { __bayPointerCount: () => active.length, __bayPointerAdds: () => additions });
  });
}
const pointerCount = (page: Page) => page.evaluate(() => (window as unknown as { __bayPointerCount: () => number }).__bayPointerCount());
const pointerAdds = (page: Page) => page.evaluate(() => (window as unknown as { __bayPointerAdds: () => number }).__bayPointerAdds());

// Native capture is part of identity: a wrong-capture removal must not falsify cleanup evidence.
test('pointer listener census retains capture-mismatched native registrations', async ({ page }) => {
  await instrumentPointer(page); await page.goto('/');
  const values = await page.evaluate(() => {
    const bay = document.querySelector('.desk-surface')!, callback = () => {};
    const count = () => (window as unknown as { __bayPointerCount: () => number }).__bayPointerCount();
    const baseline = count();
    bay.addEventListener('pointermove', callback, false); bay.addEventListener('pointermove', callback, true);
    const both = count() - baseline;
    bay.removeEventListener('pointermove', callback, false); const captureRemaining = count() - baseline;
    bay.removeEventListener('pointermove', callback, false); const wrongRemoval = count() - baseline;
    bay.removeEventListener('pointermove', callback, true); const cleaned = count() - baseline;
    return { both, captureRemaining, wrongRemoval, cleaned };
  });
  expect(values).toEqual({ both: 2, captureRemaining: 1, wrongRemoval: 1, cleaned: 0 });
});

// Cached attachment alone must not schedule an input that occurred during a synchronous off interval.
test('same-task off pointer input stays idle until fresh input without postponing ambient', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await pauseClock(page); await page.goto('/'); await page.locator('.artifact.pc').scrollIntoViewIfNeeded();
  const box = (await page.locator('.artifact.pc').boundingBox())!;
  const input = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  await page.evaluate(point => {
    document.documentElement.dataset.transmission = 'off';
    document.querySelector('.desk-surface')!.dispatchEvent(new PointerEvent('pointermove', point));
    document.documentElement.dataset.transmission = 'on';
  }, input);
  await page.clock.runFor(32); expect(await pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
  await page.locator('.desk-surface').dispatchEvent('pointermove', input);
  await page.clock.runFor(16); expect((await pointerValues(page))[0][0]).toBeCloseTo(.08, 3);
  await page.clock.runFor(19951);
  await page.locator('.desk-surface').dispatchEvent('pointermove', input);
  await expect(page.locator('.is-tearing')).toHaveCount(0);
  await page.clock.runFor(1); await expect(page.locator('[data-tear="ambient"]')).toHaveCount(1);
});

// Catches a transient registration on guarded load, even if the first observable
// pointer values are zero. One fresh context per mode; no stored session state.
test('cold pointer guards never register a bay listener', async ({ browser, baseURL }, info) => {
  const samples = [];
  for (const mode of ['off', 'reduce', 'touch', 'hidden'] as const) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 },
      hasTouch: mode === 'touch', isMobile: mode === 'touch', reducedMotion: mode === 'reduce' ? 'reduce' : 'no-preference' });
    try {
      const page = await context.newPage(); await pauseClock(page); await instrumentPointer(page);
      if (mode === 'off') await page.addInitScript(() => localStorage.setItem('ha-transmission', 'off'));
      if (mode === 'hidden') await page.addInitScript(() => Object.defineProperty(document, 'hidden', { configurable: true, value: true }));
      await page.goto(baseURL!); await page.locator('.artifact.pc').scrollIntoViewIfNeeded();
      if (mode === 'touch') expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
      if (mode === 'hidden') expect(await page.evaluate(() => document.hidden)).toBe(true);
      const box = (await page.locator('.artifact.pc').boundingBox())!;
      await page.locator('.desk-surface').dispatchEvent('pointermove', { clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2, pointerType: mode === 'touch' ? 'touch' : 'mouse' });
      await page.clock.runFor(700);
      const sample = { mode, active: await pointerCount(page), additions: await pointerAdds(page), values: await pointerValues(page) };
      expect(sample.active, mode).toBe(0); expect(sample.additions, mode).toBe(0);
      expect(sample.values, mode).toEqual(ids.map(() => [0, 0, 0])); samples.push(sample);
    } finally { await context.close(); }
  }
  await info.attach('cold-pointer-guards.json', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
});

// Mutation oldValue reconstructs transient class edges even if a leaked callback
// adds and removes a tear in one task. Endpoint-only checks would miss that flash.
test('suppressed effects never start a transient tear over 70 seconds', async ({ browser, baseURL }, info) => {
  const samples = [];
  for (const mode of ['off', 'reduce'] as const) {
    const context = await browser.newContext({ reducedMotion: mode === 'reduce' ? 'reduce' : 'no-preference' });
    try {
      const page = await context.newPage(); await pauseClock(page); await auditBoot(page);
      await page.addInitScript(() => {
        let starts = 0;
        const observer = new MutationObserver(records => records.forEach((record, index) => {
          const next = records.slice(index + 1).find(item => item.target === record.target);
          const before = (record.oldValue || '').split(/\s+/).includes('is-tearing');
          const after = (next ? next.oldValue || '' : (record.target as Element).getAttribute('class') || '').split(/\s+/).includes('is-tearing');
          if (!before && after) starts++;
        }));
        observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
        Object.assign(window, { __tearStarts: () => starts });
      });
      if (mode === 'off') await page.addInitScript(() => localStorage.setItem('ha-transmission', 'off'));
      await page.goto(baseURL!);
      const frozen = await motionFrame(page); expectFrozen(frozen);
      for (const id of ids) {
        await page.locator(`.channel-key[data-channel="${id}"]`).evaluate(el => (el as HTMLElement).focus({ preventScroll: true }));
        await page.keyboard.press('Enter'); await expect(page.locator('.artifact[data-selected="true"]')).toHaveCount(0);
        await expect(page.locator(`.artifact.${id}`)).toHaveAttribute('aria-pressed', 'true');
      }
      await page.clock.runFor(70000);
      const sample = { mode, starts: await page.evaluate(() => (window as unknown as { __tearStarts: () => number }).__tearStarts()),
        bootCreated: (await bootAudit(page)).created };
      expect(sample.starts, mode).toBe(0); expect(sample.bootCreated, mode).toBe(0);
      await expect(page.locator('.is-tearing,[data-tear],[data-boot]')).toHaveCount(0);
      expect(await motionFrame(page)).toEqual(frozen); samples.push(sample);
    } finally { await context.close(); }
  }
  await info.attach('suppressed-tear-interval.json', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
});

// Discover by the unique boot key, not a filename; Astro may emit this as an
// external module today and inline it after optimization. Unmatched suppression fails.
test('missing alive runtime retains CSS art, conventional links and original controllers', async ({ page }, info) => {
  const key = 'ha-transmission-boot', suppressed: { delivery: string; url: string; bytes: number; coalesced: string[] }[] = [];
  const otherControllers = (code: string) => ['ha-desk-light', 'data-filter-count', 'pipeline-scenario'].filter(marker => code.includes(marker));
  await page.route('**/*', async route => {
    const request = route.request();
    if (!['document', 'script'].includes(request.resourceType())) { await route.continue(); return; }
    const response = await route.fetch(), code = await response.text();
    if (request.resourceType() === 'script') {
      if (code.includes(key)) {
        suppressed.push({ delivery: 'external', url: request.url(), bytes: Buffer.byteLength(code), coalesced: otherControllers(code) });
        await route.abort('failed');
      } else await route.fulfill({ response });
      return;
    }
    const edits: { start: number; end: number }[] = [];
    const visit = (node: DefaultTreeAdapterMap['node']) => {
      if ('tagName' in node && node.tagName === 'script' && !node.attrs.some(attr => attr.name === 'src')) {
        const body = node.childNodes.map(child => 'value' in child ? child.value : '').join('');
        if (body.includes(key)) {
          const location = node.sourceCodeLocation!; edits.push({ start: location.startOffset, end: location.endOffset });
          suppressed.push({ delivery: 'inline', url: request.url(), bytes: Buffer.byteLength(body), coalesced: otherControllers(body) });
        }
      }
      if ('childNodes' in node) node.childNodes.forEach(visit);
    };
    visit(parse(code, { sourceCodeLocationInfo: true }));
    let html = code;
    for (const edit of edits.sort((a, b) => b.start - a.start)) html = html.slice(0, edit.start) + html.slice(edit.end);
    await route.fulfill({ response, body: html });
  });
  await page.goto('/');
  expect(suppressed, 'A real script containing ha-transmission-boot must have been suppressed').toHaveLength(1);
  await info.attach('alive-load-failure.json', { body: JSON.stringify(suppressed, null, 2), contentType: 'application/json' });
  await expect(page.locator('[data-boot-host]')).toBeEmpty(); await expect(page.locator('[data-boot]')).toHaveCount(0);
  await expect(page.locator('[data-transmission-toggle]')).toBeHidden();
  for (const id of ids) {
    const probe = page.locator(`.artifact.${id} [data-pose-probe]`);
    await expect(probe).toHaveCSS('animation-play-state', 'running');
    const before = await probe.evaluate(node => getComputedStyle(node).transform);
    await expect.poll(() => probe.evaluate(node => getComputedStyle(node).transform), { message: `${id}: CSS advances without alive` }).not.toBe(before);
  }
  await expect(page.locator('[data-project]:visible')).toHaveCount(7);
  await page.locator('.header-nav').getByRole('link', { name: 'The work', exact: true }).click(); await expect(page).toHaveURL(/#work$/);
  await page.locator('#project-nasa-kepler summary').click(); await expect(page.locator('#project-nasa-kepler')).toHaveAttribute('open', '');
  await expect(page.locator('#project-nasa-kepler')).toContainText('87.74%');
  await page.getByRole('button', { name: 'Computer vision', exact: true }).click();
  await expect(page.locator('[data-project]:visible')).toHaveCount(2);
  await page.getByRole('button', { name: 'All projects', exact: true }).click();
  await page.locator('.channel-key[data-channel="sky"]').click(); await expect(page.locator('#channel-title')).toContainText('Space');
  await expect(page.locator('.artifact.sky')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.artifact[data-selected="true"],.is-tearing')).toHaveCount(0);
  await page.getByRole('button', { name: 'Lower desk lighting', exact: true }).click(); await expect(page.locator('#station')).toHaveAttribute('data-light', 'low');
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true'); await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false'); await expect(menu).toBeFocused();
  await page.goto('/projects/wayfinder/');
  expect(suppressed).toHaveLength(2); await expect(page.locator('[data-transmission-toggle]')).toBeHidden();
  await page.getByLabel('Action is forbidden').check(); await expect(page.locator('#authority-decision')).toHaveText('Refuse');
  await info.attach('alive-load-failure-routes.json', { body: JSON.stringify(suppressed, null, 2), contentType: 'application/json' });
  expect(suppressed.flatMap(row => row.coalesced), 'Unrelated entry points sharing the failed runtime must be reported').toEqual([]);
});

async function pointerValues(page: Page) {
  return page.locator('.artifact').evaluateAll(plates => plates.map(plate =>
    ['--prox', '--nx', '--ny'].map(key => Number((plate as HTMLElement).style.getPropertyValue(key)))));
}

// Catches absent proximity, unbounded vectors, an immediate leave reset, and an endless idle loop.
test('pointer proximity is bounded and resets on leave and idle', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await pauseClock(page);
  await page.goto('/');
  const plate = page.locator('.artifact.pc');
  await plate.scrollIntoViewIfNeeded();
  const box = (await plate.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.clock.runFor(500);
  const value = () => plate.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--prox')));
  await expect.poll(value).toBeGreaterThan(.2);
  const vectors = await pointerValues(page);
  for (const [p, x, y] of vectors) {
    expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1);
    expect(Math.abs(x)).toBeLessThanOrEqual(1); expect(Math.abs(y)).toBeLessThanOrEqual(1);
  }
  const peak = await value();
  await page.mouse.move(1, 1);
  await page.clock.runFor(300);
  const decaying = await value();
  expect(decaying).toBeGreaterThan(0); expect(decaying).toBeLessThan(peak);
  await page.clock.runFor(350);
  expect(await value()).toBe(0);
  expect(await pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.clock.runFor(1850);
  expect(await value()).toBeGreaterThan(.95);
  await page.clock.runFor(350);
  const idleDecay = await value();
  expect(idleDecay).toBeGreaterThan(0); expect(idleDecay).toBeLessThan(.5);
  await page.clock.runFor(350); // 2,550ms since the last real pointer input.
  expect(await value()).toBe(0);
  expect(await pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
});

// Catches the fine-input branch accidentally running for a real mobile/coarse media context.
test('coarse pointer emulation keeps all proximity values zero', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(baseURL!);
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
    await expect(page.locator('[data-transmission-toggle]')).toBeVisible();
    await page.locator('.desk-surface').dispatchEvent('pointermove', { clientX: 150, clientY: 450, pointerType: 'touch' });
    const plate = page.locator('.artifact.games');
    await plate.scrollIntoViewIfNeeded();
    const box = (await plate.boundingBox())!;
    await page.locator('.desk-surface').dispatchEvent('pointermove', { clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2, pointerType: 'touch' });
    await page.waitForTimeout(250);
    const values = await page.locator('.artifact').evaluateAll(elements => elements.map(el =>
      getComputedStyle(el).getPropertyValue('--prox').trim()));
    expect(values).toEqual(['0', '0', '0', '0', '0', '0']);
    expect(await pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
  } finally {
    await context.close();
  }
});

// Catches a hard dependency on IntersectionObserver and losing the one-shot arming input.
test('pointer activation survives an unavailable IntersectionObserver', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'IntersectionObserver', { value: undefined, configurable: true }));
  await page.goto('/');
  const plate = page.locator('.artifact.games');
  await plate.scrollIntoViewIfNeeded();
  const box = (await plate.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const value = () => plate.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--prox')));
  await expect.poll(value).toBeGreaterThan(0);
  await page.evaluate(() => { document.documentElement.dataset.transmission = 'off'; });
  await expect.poll(value).toBe(0);
  await page.evaluate(() => { document.documentElement.dataset.transmission = 'on'; });
  await expect(page.locator('[data-transmission-toggle]')).toHaveAttribute('aria-pressed', 'true');
  expect(await value()).toBe(0);
  await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2);
  await expect.poll(value).toBeGreaterThan(0);
});

// Catches excessive CSS input gain as well as a nominal cap test that passes on absent responses.
test('pointer CSS stays within the plate response envelope', async ({ page }) => {
  await page.goto('/');
  const stationary = await selectionFrame(page);
  const drive = (p: number, x: number, y: number) => page.locator('.artifact').evaluateAll((plates, values) => plates.forEach(plate => {
    ['--prox', '--nx', '--ny'].forEach((key, i) => (plate as HTMLElement).style.setProperty(key, String(values[i])));
  }), [p, x, y]);
  const caps = [
    ['.games-stick-track', 'angle', 5], ['.leaf-track', 'angle', 6],
    ['.cooking-air', 'x', 10], ['.sky-field', 'x', 3], ['.sky-scope', 'angle', 4], ['.ai-reach', 'x', 12],
  ] as const;
  const responses = async () => {
    const result: Record<string, number[]> = {};
    for (const [selector, kind] of caps) {
      result[selector] = await page.locator(selector).evaluateAll((els, measure) => els.map(el => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return measure === 'angle' ? Math.abs(Math.atan2(m.b, m.a) * 180 / Math.PI) : Math.abs(m.e);
      }), kind);
    }
    return result;
  };
  await drive(1, 1, 0);
  expect(await selectionFrame(page)).toEqual(stationary);
  expect(await page.locator('.artifact, .artifact-graphic, .artifact-caption, .artifact-graphic > svg').evaluateAll(nodes => nodes.every(node => {
    const style = getComputedStyle(node);
    return new DOMMatrix(style.transform === 'none' ? undefined : style.transform).isIdentity && style.translate === 'none';
  }))).toBe(true);
  const strongest = await responses();
  for (const [selector, , max] of caps) {
    expect(strongest[selector].length, selector).toBeGreaterThan(0);
    for (const result of strongest[selector]) {
      expect(result, selector).toBeGreaterThan(0);
      expect(result, selector).toBeLessThanOrEqual(max + .01);
    }
  }
  for (const [selector, want] of [['.games-stick-track', 5], ['.cooking-air', 10], ['.sky-field', 3], ['.sky-scope', 4], ['.ai-reach', 12]] as const) {
    expect(strongest[selector][0], selector).toBeCloseTo(want, 2);
  }
  for (const [index, want] of [6, 4.2, 5.1, 6].entries()) expect(strongest['.leaf-track'][index]).toBeCloseTo(want, 2);
  for (const selector of ['.pc-iris-track', '.ai-pupil']) {
    const matrix = await page.locator(selector).evaluate(el => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return { scale: m.a, x: m.e, y: m.f };
    });
    expect(matrix.scale, selector).toBeLessThanOrEqual(1.081);
    expect(matrix.scale, selector).toBeCloseTo(1.08, 3);
    expect(matrix.x, selector).toBeCloseTo(2, 3);
    expect(matrix.y, selector).toBe(0);
  }
  for (const [selector, baseDuration] of [['.pc-fan-a', 1.4], ['.pc-fan-b', 1.7]] as const) {
    const seconds = await page.locator(selector).evaluate(el => parseFloat(getComputedStyle(el).animationDuration));
    expect(seconds, selector).toBeGreaterThanOrEqual(baseDuration / 2.2 - .00001);
    expect(seconds, selector).toBeCloseTo(baseDuration / 2.2, 5);
  }
  await expect(page.locator('.games-screen')).toHaveCSS('opacity', '1');
  await drive(3, -4, 0);
  const clamped = await responses();
  for (const [selector] of caps) for (const [index, value] of clamped[selector].entries()) {
    expect(value, selector).toBeCloseTo(strongest[selector][index], 3);
  }
  await drive(1, 0, -1);
  for (const [selector, cap] of [['.sky-field', 3], ['.ai-reach', 12], ['.pc-iris-track', 2], ['.ai-pupil', 2]] as const) {
    const matrix = await page.locator(selector).evaluate(el => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return { x: m.e, y: m.f };
    });
    expect(matrix.x, selector).toBe(0); expect(matrix.y, selector).toBeCloseTo(-cap, 3);
  }
  await drive(0, 1, 1);
  await expect(page.locator('.games-screen')).toHaveCSS('opacity', '0.75');
  expect(await page.locator('.artifact, .artifact-graphic, .artifact-caption, .artifact-graphic > svg').evaluateAll(nodes => nodes.every(node => {
    const style = getComputedStyle(node);
    return new DOMMatrix(style.transform === 'none' ? undefined : style.transform).isIdentity && style.translate === 'none';
  }))).toBe(true);
  await expect(page.locator('.artifact')).toHaveCount(6);
});

// Catches changing the 420px falloff or .08 first-frame easing, even if eventual proximity still works.
test('pointer radius and first-frame easing match the input envelope', async ({ page }) => {
  await pauseClock(page);
  await page.goto('/');
  const plate = page.locator('.artifact.pc');
  await plate.scrollIntoViewIfNeeded();
  const box = (await plate.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.clock.runFor(16);
  const value = () => plate.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--prox')));
  expect(await value()).toBeCloseTo(.08, 3);
  await page.mouse.move(center.x + 210, center.y);
  await page.clock.runFor(1100);
  expect(await value()).toBeCloseTo(.5, 2);
  await page.mouse.move(center.x + 421, center.y);
  // The first step distinguishes zero falloff immediately, without assuming easing has settled.
  const before = await value();
  await page.clock.runFor(16);
  expect(await value()).toBeCloseTo(before * .92, 3);
  await page.clock.runFor(1100);
  expect(await value()).toBeLessThan(.003);
});

// Catches attachment/resize/scroll-only caches: channel copy changes the 320px layout by 20.5px.
test('fine-hover pointer measures current centers after channels and HOME at fixed 320px viewport and scroll', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 1800 });
  await pauseClock(page);
  await page.goto('/');
  expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(true);
  const geometry = () => page.locator('.artifact').evaluateAll(plates => plates.map(plate => {
    const box = plate.getBoundingClientRect();
    return { id: plate.getAttribute('data-channel'), x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }));
  const initial = await geometry();
  const pc = page.locator('.artifact.pc');
  await page.mouse.move(initial[0].x + 40, initial[0].y);
  await page.clock.runFor(1100);
  expect((await pointerValues(page))[0][0]).toBeGreaterThan(.8); // Already attached before any content change.
  const fixed = await page.evaluate(() => {
    const boundary = { scroll: 0, resize: 0 };
    window.addEventListener('scroll', () => boundary.scroll++, { capture: true, passive: true });
    window.addEventListener('resize', () => boundary.resize++, { passive: true });
    Object.assign(window, { __pointerLayoutBoundary: boundary });
    return { x: scrollX, y: scrollY, width: innerWidth, height: innerHeight };
  });
  const samples = [];
  for (const channel of ['nature', 'pc', 'games', 'cooking', 'sky', 'ai', 'intro']) {
    const key = page.locator(`.channel-key[data-channel="${channel}"]`);
    await key.evaluate(el => (el as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await expect(key).toHaveAttribute('aria-pressed', 'true');
    const centers = await geometry();
    const point = { x: Math.round(centers[0].x + 40), y: Math.round(centers[0].y) };
    await page.mouse.move(point.x, point.y);
    await page.clock.runFor(1100);
    const values = await pointerValues(page);
    // Independent measurements, not cached production coordinates, define the public input/output contract.
    for (const [index, center] of centers.entries()) {
      const dx = point.x - center.x, dy = point.y - center.y, distance = Math.hypot(dx, dy);
      const want = [Math.max(0, 1 - distance / 420), dx / Math.max(1, distance), dy / Math.max(1, distance)];
      for (let axis = 0; axis < 3; axis++) expect(values[index][axis], `${channel}: ${center.id}, axis ${axis}`).toBeCloseTo(want[axis], 2);
    }
    const current = await page.evaluate(() => ({ x: scrollX, y: scrollY, width: innerWidth, height: innerHeight }));
    expect(current, channel).toEqual(fixed);
    samples.push({ channel, point, centers, values, fixed: current });
  }
  expect(samples[0].centers[0].y - initial[0].y).toBeCloseTo(-20.5, 2);
  expect(samples.at(-1)!.centers[0].y).toBeCloseTo(initial[0].y, 2);
  await expect(pc).not.toHaveAttribute('aria-pressed', 'true');
  const events = await page.evaluate(() => (window as unknown as { __pointerLayoutBoundary: { scroll: number; resize: number } }).__pointerLayoutBoundary);
  expect(events).toEqual({ scroll: 0, resize: 0 });
  await info.attach('current-centers-320.json', { body: JSON.stringify({ initial, events, samples }, null, 2), contentType: 'application/json' });
});

for (const mode of ['effects-off', 'reduced-motion', 'hidden'] as const) {
  // Catches a leaked active loop/input after suppression, or stale work replayed on resume.
  test(`pointer suppression resets pending work for ${mode}`, async ({ page }) => {
    await instrumentPointer(page);
    await pauseClock(page);
    await page.goto('/');
    const plate = page.locator('.artifact.pc');
    await plate.scrollIntoViewIfNeeded();
    await expect.poll(() => pointerCount(page)).toBe(1);
    const additions = await pointerAdds(page);
    const box = (await plate.boundingBox())!;
    const input = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: 'mouse' };
    await page.mouse.move(input.clientX, input.clientY);
    await page.clock.runFor(500);
    expect((await pointerValues(page))[0][0]).toBeGreaterThan(.2);
    try {
      if (mode === 'effects-off') await page.evaluate(() => { document.documentElement.dataset.transmission = 'off'; });
      else if (mode === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
      else await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect.poll(() => pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
      expect(await pointerCount(page)).toBe(0);
      await page.locator('.desk-surface').dispatchEvent('pointermove', input);
      await page.clock.runFor(700);
      expect(await pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
      expect(await pointerAdds(page)).toBe(additions);
    } finally {
      if (mode === 'effects-off') await page.evaluate(() => { document.documentElement.dataset.transmission = 'on'; });
      else if (mode === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'no-preference' });
      else await page.evaluate(() => {
        Reflect.deleteProperty(document, 'hidden');
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }
    await expect.poll(() => pointerCount(page)).toBe(1);
    expect(await pointerAdds(page)).toBe(additions + 1);
    await page.clock.runFor(700);
    expect(await pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
    await page.locator('.desk-surface').dispatchEvent('pointermove', input);
    await page.clock.runFor(500);
    expect((await pointerValues(page))[0][0]).toBeGreaterThan(.2);
    // Idempotent visibility notifications must not accumulate registrations on resume.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(await pointerCount(page)).toBe(1); expect(await pointerAdds(page)).toBe(additions + 1);
  });
}

// Catches missing observer exit cleanup and coordinates left stale after a real scroll/re-entry.
test('IntersectionObserver stops off-bay pointer work and reattaches after scroll', async ({ page }) => {
  await instrumentPointer(page);
  await pauseClock(page);
  await page.goto('/');
  const plate = page.locator('.artifact.pc');
  await plate.scrollIntoViewIfNeeded();
  await expect.poll(() => pointerCount(page)).toBe(1);
  const additions = await pointerAdds(page);
  const center = async () => {
    const box = (await plate.boundingBox())!;
    return { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: 'mouse' };
  };
  const first = await center();
  await page.mouse.move(first.clientX, first.clientY);
  await page.clock.runFor(500);
  expect((await pointerValues(page))[0][0]).toBeGreaterThan(.2);
  await page.locator('footer').scrollIntoViewIfNeeded();
  await expect.poll(() => pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
  expect(await pointerCount(page)).toBe(0);
  await page.locator('.desk-surface').dispatchEvent('pointermove', first);
  await page.clock.runFor(700);
  expect(await pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
  expect(await pointerAdds(page)).toBe(additions);
  await plate.scrollIntoViewIfNeeded();
  await expect.poll(() => pointerCount(page)).toBe(1); expect(await pointerAdds(page)).toBe(additions + 1);
  const next = await center();
  await page.mouse.move(next.clientX + 40, next.clientY);
  await page.clock.runFor(1100);
  const value = (await pointerValues(page))[0];
  expect(value[0]).toBeCloseTo(.9048, 2); expect(value[1]).toBeCloseTo(1, 2); expect(value[2]).toBeCloseTo(0, 1);
});

// Catches coarse media changes leaving the already-attached fine-input listener/loop active.
test('pointer media changes detach coarse input and resume with fine hover', async ({ page }) => {
  await instrumentPointer(page);
  await page.goto('/');
  const plate = page.locator('.artifact.pc');
  await plate.scrollIntoViewIfNeeded();
  await expect.poll(() => pointerCount(page)).toBe(1);
  const additions = await pointerAdds(page);
  const box = (await plate.boundingBox())!;
  const input = { clientX: box.x + box.width / 2 + 30, clientY: box.y + box.height / 2, pointerType: 'touch' };
  const value = () => plate.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--prox')));
  await page.mouse.move(input.clientX, input.clientY);
  await expect.poll(value).toBeGreaterThan(.2);
  const media = await page.context().newCDPSession(page);
  try {
    await media.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await expect.poll(() => page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
    await expect.poll(() => pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
    expect(await pointerCount(page)).toBe(0);
    await page.locator('.desk-surface').dispatchEvent('pointermove', input);
    await page.waitForTimeout(120);
    expect(await pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
    expect(await pointerAdds(page)).toBe(additions);
    await media.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await expect.poll(() => page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(true);
    await expect.poll(() => pointerCount(page)).toBe(1); expect(await pointerAdds(page)).toBe(additions + 1);
    expect(await value()).toBe(0);
    await page.mouse.move(input.clientX + 1, input.clientY);
    await expect.poll(value).toBeGreaterThan(.2);
  } finally {
    await media.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await media.detach();
  }
});

// Catches stale cached centers after responsive layout or scrolling without an observer exit/re-entry.
test('pointer remeasures on resize and captured scroll while the bay remains in view', async ({ page }, info) => {
  await pauseClock(page);
  await page.goto('/');
  const plate = page.locator('.artifact.pc');
  await plate.scrollIntoViewIfNeeded();
  const measure = async () => {
    const box = (await plate.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const sample = async () => {
    const center = await measure();
    const point = { x: Math.round(center.x + 40), y: Math.round(center.y) };
    await page.mouse.move(point.x, point.y);
    await page.clock.runFor(1100);
    const actual = (await pointerValues(page))[0];
    const dx = point.x - center.x, dy = point.y - center.y, distance = Math.hypot(dx, dy);
    const want = [Math.max(0, 1 - distance / 420), dx / distance, dy / distance];
    for (let axis = 0; axis < 3; axis++) expect(actual[axis]).toBeCloseTo(want[axis], 2);
    expect(await page.locator('.desk-surface').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.top < innerHeight && rect.bottom > 0;
    })).toBe(true);
    return { center, point, actual };
  };
  const before = await sample();
  await page.setViewportSize({ width: 1024, height: 1050 });
  const resized = await sample();
  expect(Math.hypot(resized.center.x - before.center.x, resized.center.y - before.center.y)).toBeGreaterThan(20);
  await page.evaluate(() => window.scrollBy(0, 80));
  const scrolled = await sample();
  expect(scrolled.center.y - resized.center.y).toBeCloseTo(-80, 1);
  await info.attach('resize-scroll-centers.json', { body: JSON.stringify({ before, resized, scrolled }, null, 2), contentType: 'application/json' });
});

type PointerAudit = { queued: number; maxQueued: number; frames: number; frameReads: number; frameQueries: number;
  frameMutations: string[]; layoutAPIs: string[]; mutationAPIs: string[];
  writes: string[]; bayListeners: number; maxBayListeners: number; passive: boolean[]; globalListeners: number };

// Catches per-plate loops, document-wide/non-passive input, per-frame layout work and missing cancellation.
test('pointer owns one passive bay listener and one layout-free frame loop with cleanup', async ({ page }, info) => {
  await page.addInitScript(() => {
    const audit: PointerAudit = { queued: 0, maxQueued: 0, frames: 0, frameReads: 0, frameQueries: 0,
      frameMutations: [], layoutAPIs: [], mutationAPIs: [], writes: [], bayListeners: 0, maxBayListeners: 0, passive: [], globalListeners: 0 };
    Object.assign(window, { __pointerAudit: audit });
    let insideFrame = false;
    // Synchronous records also catch direct dataset/className/style assignments
    // and DOM APIs that do not delegate through the patched JavaScript methods.
    const mutations = new MutationObserver(() => {});
    mutations.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    const recordMutations = (records: MutationRecord[]) => records.forEach(record =>
      audit.frameMutations.push(`DOM:${record.type}${record.attributeName ? `:${record.attributeName}` : ''}`));
    const pending = new Set<number>();
    const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      const id = raf(now => {
        pending.delete(id); audit.queued = pending.size; audit.frames++;
        mutations.takeRecords(); // Discard real controller changes outside the frame.
        insideFrame = true;
        try { callback(now); } finally { recordMutations(mutations.takeRecords()); insideFrame = false; }
      });
      pending.add(id); audit.queued = pending.size; audit.maxQueued = Math.max(audit.maxQueued, pending.size);
      return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); audit.queued = pending.size; cancel(id); };
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { if (insideFrame) audit.frameReads++; return rect.call(this); };
    audit.layoutAPIs.push('Element.getBoundingClientRect');
    const watchMethod = (prototype: object, name: string, kind: 'read' | 'mutation', label: string) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name), original = descriptor?.value;
      if (!descriptor?.configurable || typeof original !== 'function') return;
      (kind === 'read' ? audit.layoutAPIs : audit.mutationAPIs).push(label);
      Object.defineProperty(prototype, name, { ...descriptor, value: function (this: object, ...args: unknown[]) {
        if (insideFrame) { if (kind === 'read') audit.frameReads++; else audit.frameMutations.push(label); }
        return Reflect.apply(original, this, args);
      } });
    };
    const watchProperty = (prototype: object, name: string, read: boolean, mutation: boolean, label: string) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (!descriptor?.configurable) return;
      const get = descriptor.get, set = descriptor.set;
      if (read && get) audit.layoutAPIs.push(label);
      if (mutation && set) audit.mutationAPIs.push(label);
      Object.defineProperty(prototype, name, { ...descriptor,
        ...(read && get ? { get: function (this: object) { if (insideFrame) audit.frameReads++; return get.call(this); } } : {}),
        ...(mutation && set ? { set: function (this: object, value: unknown) { if (insideFrame) audit.frameMutations.push(label); set.call(this, value); } } : {}),
      });
    };
    watchMethod(window, 'getComputedStyle', 'read', 'window.getComputedStyle');
    // Lifecycle events own these guards; an admitted frame uses cached attachment state.
    // Reading them per frame repeats DOM/media work and obscures cancellation ownership.
    watchProperty(Document.prototype, 'hidden', true, false, 'Document.hidden');
    watchProperty(MediaQueryList.prototype, 'matches', true, false, 'MediaQueryList.matches');
    watchProperty(HTMLElement.prototype, 'dataset', true, false, 'HTMLElement.dataset');
    watchMethod(Element.prototype, 'getClientRects', 'read', 'Element.getClientRects');
    for (const name of ['getBoundingClientRect', 'getClientRects']) watchMethod(Range.prototype, name, 'read', `Range.${name}`);
    for (const name of ['getBBox', 'getCTM', 'getScreenCTM']) watchMethod(SVGGraphicsElement.prototype, name, 'read', `SVG.${name}`);
    for (const name of ['offsetTop', 'offsetLeft', 'offsetWidth', 'offsetHeight', 'offsetParent']) watchProperty(HTMLElement.prototype, name, true, false, `HTMLElement.${name}`);
    for (const name of ['clientTop', 'clientLeft', 'clientWidth', 'clientHeight', 'scrollTop', 'scrollLeft', 'scrollWidth', 'scrollHeight']) watchProperty(Element.prototype, name, true, true, `Element.${name}`);
    for (const name of ['appendChild', 'insertBefore', 'removeChild', 'replaceChild']) watchMethod(Node.prototype, name, 'mutation', `Node.${name}`);
    for (const name of ['setAttribute', 'removeAttribute', 'toggleAttribute', 'append', 'prepend', 'replaceChildren', 'insertAdjacentHTML']) watchMethod(Element.prototype, name, 'mutation', `Element.${name}`);
    for (const name of ['add', 'remove', 'toggle', 'replace']) watchMethod(DOMTokenList.prototype, name, 'mutation', `classList.${name}`);
    watchProperty(Node.prototype, 'textContent', false, true, 'Node.textContent');
    watchProperty(Node.prototype, 'nodeValue', false, true, 'Node.nodeValue');
    watchProperty(Element.prototype, 'innerHTML', false, true, 'Element.innerHTML');
    watchProperty(Element.prototype, 'className', false, true, 'Element.className');
    watchProperty(HTMLElement.prototype, 'innerText', true, true, 'HTMLElement.innerText');
    for (const name of Object.getOwnPropertyNames(CSSStyleDeclaration.prototype)) {
      if (Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, name)?.set) watchProperty(CSSStyleDeclaration.prototype, name, false, true, `style.${name}`);
    }
    for (const prototype of [Element.prototype, Document.prototype]) {
      for (const method of ['querySelector', 'querySelectorAll'] as const) {
        const original = prototype[method];
        Object.defineProperty(prototype, method, { configurable: true, writable: true, value: function (this: Element | Document, selector: string) {
          if (insideFrame) audit.frameQueries++;
          return Reflect.apply(original, this, [selector]);
        } });
      }
    }
    const set = CSSStyleDeclaration.prototype.setProperty;
    CSSStyleDeclaration.prototype.setProperty = function (key, value, priority) {
      if (insideFrame) { audit.writes.push(key); recordMutations(mutations.takeRecords()); }
      set.call(this, key, value, priority);
      if (insideFrame && ['--prox', '--nx', '--ny'].includes(key)) {
        // Consume only the authorized plate style mutation from this one call.
        recordMutations(mutations.takeRecords().filter(record => record.type !== 'attributes' || record.attributeName !== 'style'
          || !(record.target instanceof Element) || !record.target.matches('.artifact')));
      }
    };
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    const listeners: { target: EventTarget; type: string; callback: EventListenerOrEventListenerObject; capture: boolean }[] = [];
    const captureOf = (options?: boolean | AddEventListenerOptions) => typeof options === 'boolean' ? options : options?.capture === true;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const capture = captureOf(options);
      if (type === 'pointermove' && this instanceof Element && this.matches('.desk-surface') && listener &&
          !listeners.some(entry => entry.target === this && entry.type === type && entry.callback === listener && entry.capture === capture)) {
        listeners.push({ target: this, type, callback: listener, capture });
        audit.bayListeners++; audit.maxBayListeners = Math.max(audit.maxBayListeners, audit.bayListeners);
        audit.passive.push(typeof options === 'object' && options?.passive === true);
      } else if (type === 'pointermove' && (this === window || this === document)) audit.globalListeners++;
      add.call(this, type, listener, options);
    };
    // Count only actual removals: stop also defensively removes an unused fallback arm listener.
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const capture = captureOf(options);
      const index = listeners.findIndex(entry => entry.target === this && entry.type === type && entry.callback === listener && entry.capture === capture);
      if (index !== -1) { listeners.splice(index, 1); audit.bayListeners--; }
      remove.call(this, type, listener, options);
    };
  });
  await page.goto('/');
  const plate = page.locator('.artifact.pc');
  await plate.scrollIntoViewIfNeeded();
  const box = (await plate.boundingBox())!;
  const input = { clientX: box.x + box.width / 2 + 30, clientY: box.y + box.height / 2 + 20, pointerType: 'mouse' };
  await page.mouse.move(input.clientX, input.clientY);
  await expect.poll(() => plate.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--prox')))).toBeGreaterThan(.2);
  await page.locator('.desk-surface').evaluate((surface, event) => {
    for (let i = 0; i < 32; i++) surface.dispatchEvent(new PointerEvent('pointermove', event));
  }, input);
  await page.waitForTimeout(120);
  await page.evaluate(() => { document.documentElement.dataset.transmission = 'off'; });
  await expect.poll(() => pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
  const read = () => page.evaluate(() => (window as unknown as { __pointerAudit: PointerAudit }).__pointerAudit);
  const stopped = await read();
  await info.attach('pointer-frame-audit-stopped.json', { body: JSON.stringify(stopped, null, 2), contentType: 'application/json' });
  expect(stopped.frames).toBeGreaterThan(0);
  expect(stopped.queued).toBe(0); expect(stopped.bayListeners).toBe(0);
  expect(stopped.maxQueued).toBe(1); expect(stopped.maxBayListeners).toBe(1);
  expect(stopped.globalListeners).toBe(0); expect(stopped.passive.every(Boolean)).toBe(true);
  expect(stopped.frameReads).toBe(0); expect(stopped.frameQueries).toBe(0);
  expect(stopped.frameMutations).toEqual([]);
  expect(stopped.layoutAPIs).toEqual(expect.arrayContaining(['window.getComputedStyle', 'Document.hidden', 'MediaQueryList.matches', 'HTMLElement.dataset', 'Element.getClientRects', 'Range.getBoundingClientRect', 'SVG.getBBox', 'HTMLElement.offsetWidth', 'Element.clientWidth', 'Element.scrollTop']));
  expect(stopped.mutationAPIs).toEqual(expect.arrayContaining(['Node.appendChild', 'Element.append', 'classList.add', 'Node.textContent', 'Element.innerHTML', 'Element.className', 'style.cssText']));
  expect([...new Set(stopped.writes)].sort()).toEqual(['--nx', '--ny', '--prox']);
  await page.locator('.desk-surface').dispatchEvent('pointermove', input);
  await page.waitForTimeout(120);
  expect((await read()).frames).toBe(stopped.frames);
  for (let round = 0; round < 3; round++) {
    await page.evaluate(() => { document.documentElement.dataset.transmission = 'on'; });
    await expect(page.locator('[data-transmission-toggle]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.desk-surface').dispatchEvent('pointermove', input);
    await expect.poll(() => plate.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--prox')))).toBeGreaterThan(.2);
    await page.evaluate(() => { document.documentElement.dataset.transmission = 'off'; });
    await expect.poll(() => pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
  }
  const final = await read();
  expect(final.queued).toBe(0); expect(final.bayListeners).toBe(0);
  expect(final.maxQueued).toBe(1); expect(final.maxBayListeners).toBe(1);
  expect(final.frameReads).toBe(0); expect(final.frameQueries).toBe(0);
  expect(final.frameMutations).toEqual([]);
  await page.evaluate(() => { document.documentElement.dataset.transmission = 'on'; });
  await expect(page.locator('[data-transmission-toggle]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.desk-surface').dispatchEvent('pointermove', input);
  await expect.poll(() => plate.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--prox')))).toBeGreaterThan(.2);
  await page.waitForTimeout(2600);
  expect(await pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
  const idle = await read();
  expect(idle.queued).toBe(0);
  await page.waitForTimeout(100);
  expect((await read()).frames).toBe(idle.frames);
  await page.locator('.desk-surface').dispatchEvent('pointermove', input);
  await expect.poll(() => plate.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--prox')))).toBeGreaterThan(.2);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(650);
  expect(await pointerValues(page)).toEqual(ids.map(() => [0, 0, 0]));
  const left = await read();
  expect(left.queued).toBe(0);
  expect(left.frameReads).toBe(0); expect(left.frameQueries).toBe(0); expect(left.frameMutations).toEqual([]);
  expect([...new Set(left.writes)].sort()).toEqual(['--nx', '--ny', '--prox']);
  await info.attach('pointer-frame-audit.json', { body: JSON.stringify({ final, idle, left }, null, 2), contentType: 'application/json' });
});

type BootAudit = { created: number; removedAt: number[]; focusOnMount: string[];
  timers: { id: number; delay: number }[]; callbacks: { delay: number; at: number }[];
  listeners: { target: string; type: string; capture: boolean; passive: boolean }[] };

// Observe browser resource ownership without replacing behavior. The watchdog fixture alone
// discards normal completion, so the independent deadline must remove a genuinely live panel.
async function auditBoot(page: Page, holdNormal = false) {
  await page.addInitScript(hold => {
    const audit: BootAudit = { created: 0, removedAt: [], focusOnMount: [], timers: [], callbacks: [], listeners: [] };
    Object.assign(window, { __bootAudit: audit });
    const timers = new Map<number, number>();
    const updateTimers = () => { audit.timers = [...timers].map(([id, delay]) => ({ id, delay })); };
    const timeout = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
    Object.defineProperty(window, 'setTimeout', { configurable: true, writable: true, value: (handler: TimerHandler, delay = 0, ...args: unknown[]) => {
      if (!document.querySelector('[data-boot]') || typeof handler !== 'function') return timeout(handler, delay, ...args);
      const id = timeout(() => {
        timers.delete(id); updateTimers();
        audit.callbacks.push({ delay, at: performance.now() });
        if (!hold || delay !== 1200) handler(...args);
      }, delay);
      timers.set(id, delay); updateTimers(); return id;
    } });
    Object.defineProperty(window, 'clearTimeout', { configurable: true, writable: true, value: (id: number | undefined) => {
      if (id !== undefined) timers.delete(id); updateTimers(); clear(id);
    } });
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    const listeners: { target: EventTarget; type: string; listener: EventListenerOrEventListenerObject; capture: boolean; passive: boolean; label: string }[] = [];
    const updateListeners = () => { audit.listeners = listeners.map(entry => ({ target: entry.label, type: entry.type, capture: entry.capture, passive: entry.passive })); };
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const label = this === document && ['pointerdown', 'keydown'].includes(type) && document.querySelector('[data-boot]') ? 'document'
        : this instanceof Element && this.matches('[data-boot] button') && type === 'click' ? 'skip' : '';
      if (label && listener) {
        listeners.push({ target: this, type, listener, capture: typeof options === 'boolean' ? options : options?.capture === true,
          passive: typeof options === 'object' && options?.passive === true, label }); updateListeners();
      }
      add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const capture = typeof options === 'boolean' ? options : options?.capture === true;
      const index = listeners.findIndex(entry => entry.target === this && entry.type === type && entry.listener === listener && entry.capture === capture);
      if (index !== -1) { listeners.splice(index, 1); updateListeners(); }
      remove.call(this, type, listener, options);
    };
    new MutationObserver(records => records.forEach(record => {
      for (const node of record.addedNodes) if (node instanceof Element && node.matches('[data-boot]')) {
        audit.created++; audit.focusOnMount.push(document.activeElement?.tagName ?? '');
      }
      for (const node of record.removedNodes) if (node instanceof Element && node.matches('[data-boot]')) audit.removedAt.push(performance.now());
    })).observe(document, { childList: true, subtree: true });
  }, holdNormal);
}

async function bootAudit(page: Page) {
  return page.evaluate(() => (window as unknown as { __bootAudit: BootAudit }).__bootAudit);
}

async function expectBootClean(page: Page) {
  await expect(page.locator('[data-boot], .artifact[data-booting]')).toHaveCount(0);
  const state = await bootAudit(page);
  expect(state.timers).toEqual([]); expect(state.listeners).toEqual([]);
  await page.clock.runFor(4001);
  expect((await bootAudit(page)).callbacks).toEqual(state.callbacks);
  await expect(page.locator('[data-boot-host]')).toBeEmpty();
  return state;
}

// Catches repeat boots, wrong LED order/deadlines, whole-plate dimming and animationend-only removal.
test('boot appears once per tab session and sequences only the six decorative LEDs', async ({ page, context }, info) => {
  await pauseClock(page); await auditBoot(page); await page.goto('/');
  const boot = page.locator('[data-boot]');
  await expect(boot).toHaveCount(1);
  expect(await boot.evaluate(node => node.firstElementChild?.tagName)).toBe('BUTTON');
  await expect(boot.locator('button').first()).toHaveText('SKIP');
  await expect(boot.locator('button')).toHaveAttribute('type', 'button');
  await expect(boot).toHaveCSS('pointer-events', 'none');
  await expect(boot.locator('button')).toHaveCSS('pointer-events', 'auto');
  expect(await boot.locator('button').evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => sessionStorage.getItem('ha-transmission-boot'))).toBe('1');
  expect((await bootAudit(page)).timers.map(timer => timer.delay).sort((a, b) => a - b)).toEqual([840, 900, 960, 1020, 1080, 1140, 1200, 4000]);
  expect((await bootAudit(page)).listeners).toContainEqual({ target: 'document', type: 'pointerdown', capture: true, passive: true });
  const before = await selectionFrame(page), samples: { at: number; dimmed: (string | null)[] }[] = [];
  const remaining = () => page.locator('.artifact[data-booting]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-channel')));
  const read = async (at: number) => {
    const lit = await remaining(); samples.push({ at, dimmed: lit }); return lit;
  };
  expect(await read(0)).toEqual(['pc', 'games', 'nature', 'cooking', 'sky', 'ai']);
  for (const led of await page.locator('.plate-led').all()) await expect(led).toHaveCSS('opacity', '0.2');
  for (const node of await page.locator('.artifact, .artifact-caption').all()) await expect(node).toHaveCSS('opacity', '1');
  await page.clock.runFor(839); expect(await read(839)).toEqual(['pc', 'games', 'nature', 'cooking', 'sky', 'ai']);
  await page.clock.runFor(1); expect(await read(840)).toEqual(['games', 'nature', 'cooking', 'sky', 'ai']);
  await page.clock.runFor(59); expect(await read(899)).toEqual(['games', 'nature', 'cooking', 'sky', 'ai']);
  await page.clock.runFor(1); expect(await read(900)).toEqual(['nature', 'cooking', 'sky', 'ai']);
  await page.clock.runFor(60); expect(await read(960)).toEqual(['cooking', 'sky', 'ai']);
  await page.clock.runFor(60); expect(await read(1020)).toEqual(['sky', 'ai']);
  await page.clock.runFor(60); expect(await read(1080)).toEqual(['ai']);
  await page.clock.runFor(60); expect(await read(1140)).toEqual([]);
  await page.clock.runFor(59); await expect(boot).toHaveCount(1);
  await page.clock.runFor(1);
  const cleaned = await expectBootClean(page);
  expect(cleaned.callbacks.map(callback => callback.delay)).toEqual([840, 900, 960, 1020, 1080, 1140, 1200]);
  expect(await selectionFrame(page)).toEqual(before);
  for (const led of await page.locator('.plate-led').all()) await expect(led).toHaveCSS('opacity', '1');
  await page.reload(); await expect(boot).toHaveCount(0);
  await page.goto('/projects/wayfinder/'); await expect(boot).toHaveCount(0);
  const other = await context.newPage();
  try {
    await pauseClock(other); await other.goto('/'); await expect(other.locator('[data-boot]')).toHaveCount(1);
  } finally { await other.close(); }
  await info.attach('boot-led-session.json', { body: JSON.stringify({ samples, cleaned }, null, 2), contentType: 'application/json' });
});

for (const action of ['escape', 'pointer', 'Enter', 'Space'] as const) {
  // Catches swallowed real input, a mouse-only SKIP, focus theft and pending work after early exit.
  test(`boot dismisses by ${action} and releases all owned timers and listeners`, async ({ page }, info) => {
    await pauseClock(page); await auditBoot(page); await page.goto('/');
    await expect(page.locator('[data-boot]')).toHaveCount(1);
    if (action === 'escape') {
      await page.locator('.wordmark').focus(); await page.keyboard.press('Escape');
      await expect(page.locator('.wordmark')).toBeFocused();
    } else if (action === 'pointer') {
      await page.locator('.channel-key[data-channel="sky"]').click();
      await expect(page.locator('#channel-title')).toContainText('Space');
      await expect(page.locator('.channel-key[data-channel="sky"]')).toBeFocused();
    } else {
      await page.locator('.site-footer a').last().focus(); await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'SKIP', exact: true })).toBeFocused();
      await page.keyboard.press(action);
      await expect(page.locator('[data-transmission-toggle]')).toBeFocused();
    }
    const cleaned = await expectBootClean(page);
    expect(cleaned.callbacks).toEqual([]);
    await info.attach(`boot-clean-${action}.json`, { body: JSON.stringify(cleaned, null, 2), contentType: 'application/json' });
  });
}

// Catches a click-blocking panel even when the target really overlaps its painted bounds.
test('boot panel passes pointer input through to an overlapping real header control', async ({ page }) => {
  await pauseClock(page); await auditBoot(page); await page.goto('/');
  await expect(page.locator('[data-boot]')).toHaveCount(1);
  const boot = (await page.locator('[data-boot]').boundingBox())!;
  const skip = (await page.getByRole('button', { name: 'SKIP', exact: true }).boundingBox())!;
  const target = (await page.locator('[data-transmission-toggle]').boundingBox())!;
  const point = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  expect(point.x).toBeGreaterThan(boot.x); expect(point.x).toBeLessThan(boot.x + boot.width);
  expect(point.y).toBeGreaterThan(boot.y); expect(point.y).toBeLessThan(boot.y + boot.height);
  expect(point.x > skip.x + skip.width || point.y > skip.y + skip.height).toBe(true);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('html')).toHaveAttribute('data-transmission', 'off');
  await expect(page.locator('[data-transmission-toggle]')).toBeFocused();
  await expectBootClean(page);
});

// Catches a nominal watchdog that merely waits for already successful normal completion.
test('boot independent four-second watchdog removes the panel if normal completion is lost', async ({ page }, info) => {
  await pauseClock(page); await auditBoot(page, true); await page.goto('/');
  await expect(page.locator('[data-boot]')).toHaveCount(1);
  await page.clock.runFor(3999);
  await expect(page.locator('[data-boot]')).toHaveCount(1);
  await expect(page.locator('.artifact[data-booting]')).toHaveCount(0);
  expect((await bootAudit(page)).timers.map(timer => timer.delay)).toEqual([4000]);
  await page.clock.runFor(1);
  const cleaned = await expectBootClean(page);
  expect(cleaned.callbacks.map(callback => callback.delay)).toEqual([840, 900, 960, 1020, 1080, 1140, 1200, 4000]);
  await info.attach('boot-watchdog.json', { body: JSON.stringify({ fixture: '1200ms callback deliberately discarded; all other callbacks unchanged', cleaned }, null, 2), contentType: 'application/json' });
});

for (const mode of ['effects-off', 'reduced-motion', 'hidden'] as const) {
  // Catches a CSS-only suppression with live pending callbacks/listeners or a boot replay on resume.
  test(`boot suppression clears pending work without replay for ${mode}`, async ({ page }, info) => {
    await pauseClock(page); await auditBoot(page); await page.goto('/');
    await expect(page.locator('[data-boot]')).toHaveCount(1); await page.clock.runFor(100);
    if (mode === 'effects-off') await page.evaluate(() => { document.documentElement.dataset.transmission = 'off'; });
    else if (mode === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
    else await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
    });
    const cleaned = await expectBootClean(page); expect(cleaned.callbacks).toEqual([]);
    if (mode === 'effects-off') await page.evaluate(() => { document.documentElement.dataset.transmission = 'on'; });
    else if (mode === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'no-preference' });
    else await page.evaluate(() => { Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.locator('[data-boot]')).toHaveCount(0);
    expect((await bootAudit(page)).created).toBe(1);
    await info.attach(`boot-suppressed-${mode}.json`, { body: JSON.stringify(cleaned, null, 2), contentType: 'application/json' });
  });
}

for (const blocked of ['read', 'write', 'both-storage-APIs'] as const) {
  // Catches either throwing storage boundary and reliance on a successful write for this-visit once.
  test(`boot blocked session storage (${blocked}) permits one attempt per visit without errors`, async ({ page }) => {
    await pauseClock(page); await auditBoot(page);
    await page.addInitScript(mode => {
      if (mode === 'write') {
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (this === window.sessionStorage) throw new Error('session write blocked');
          set.call(this, key, value);
        };
      } else {
        Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('session read blocked'); } });
        if (mode === 'both-storage-APIs') Object.defineProperty(window, 'localStorage', { get() { throw new Error('preference blocked'); } });
      }
    }, blocked);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await expect(page.locator('[data-boot]')).toHaveCount(1);
    await page.keyboard.press('Escape'); await expectBootClean(page);
    await page.locator('[data-transmission-toggle]').click(); await page.locator('[data-transmission-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-transmission', 'on');
    await expect(page.locator('[data-boot]')).toHaveCount(0); expect((await bootAudit(page)).created).toBe(1);
    await page.reload(); await expect(page.locator('[data-boot]')).toHaveCount(1);
    await page.keyboard.press('Escape'); await expectBootClean(page); expect(errors).toEqual([]);
  });
}

for (const mode of ['stored-off', 'reduced-motion'] as const) {
  // Catches even a transient boot mount or storage-session consumption before suppression is read.
  test(`boot is never created initially for ${mode}`, async ({ page }) => {
    await pauseClock(page); await auditBoot(page);
    if (mode === 'stored-off') await page.addInitScript(() => localStorage.setItem('ha-transmission', 'off'));
    else await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/'); await expectBootClean(page);
    expect((await bootAudit(page)).created).toBe(0);
    expect(await page.evaluate(() => sessionStorage.getItem('ha-transmission-boot'))).toBeNull();
    if (mode === 'stored-off') await expect(page.locator('html')).toHaveAttribute('data-transmission', 'off');
  });
}

// Catches hidden server-rendered boot copy and a focusable dead SKIP when enhancement is unavailable.
test('boot has no overlay or SKIP with JavaScript unavailable', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'no-preference' });
  try {
    const page = await context.newPage(); await pauseClock(page); await page.goto(baseURL!);
    await expect(page.locator('[data-boot-host]')).toBeEmpty(); await expect(page.locator('[data-boot]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'SKIP', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-project]:visible')).toHaveCount(7);
  } finally { await context.close(); }
});

for (const route of ['/projects/wayfinder/', '/not-a-real-coordinate/']) {
  // Catches coupling a global session boot to homepage plates.
  test(`boot starts on the direct no-bay route ${route}`, async ({ page }) => {
    await pauseClock(page); await auditBoot(page); await page.goto(route);
    await expect(page.locator('.desk-surface')).toHaveCount(0); await expect(page.locator('[data-boot]')).toHaveCount(1);
    await page.keyboard.press('Escape'); await expectBootClean(page);
    await page.goto('/'); await expect(page.locator('[data-boot]')).toHaveCount(0);
  });
}

// Catches mount autofocus, Tab interception and unconditional focus restoration on timer removal.
test('boot preserves pre-existing focus and Tab can leave SKIP without a trap', async ({ page }) => {
  await pauseClock(page); await auditBoot(page);
  await page.addInitScript(() => document.addEventListener('readystatechange', () => {
    if (document.readyState === 'interactive') document.querySelector<HTMLElement>('.wordmark')?.focus({ preventScroll: true });
  }));
  await page.goto('/'); await expect(page.locator('[data-boot]')).toHaveCount(1);
  await expect(page.locator('.wordmark')).toBeFocused(); expect((await bootAudit(page)).focusOnMount).toEqual(['A']);
  await page.keyboard.press('Tab'); await expect(page.locator('#primary-nav a').first()).toBeFocused();
  await page.locator('.site-footer a').last().focus(); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'SKIP', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.locator('[data-boot]').evaluate(node => node.contains(document.activeElement))).toBe(false);
  await page.locator('.wordmark').focus(); await page.clock.runFor(1200);
  await expect(page.locator('.wordmark')).toBeFocused(); await expectBootClean(page);
});

// Catches stopping Escape propagation or restoring boot focus over the real menu's focus behavior.
test('boot Escape also closes the keyboard-opened original mobile menu', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 }); await pauseClock(page); await auditBoot(page); await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  await menu.focus(); await page.keyboard.press('Enter'); await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-boot]')).toHaveCount(1);
  await page.keyboard.press('Escape'); await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused(); await expectBootClean(page);
});

for (const width of [320, 1440]) {
  // Catches ineffective child-only z-index inside a bone isolation context. Keyboard focus is real;
  // temporarily hit-testing the click-through panel reveals the browser's actual stacking order.
  test(`boot leaves keyboard focus painted above the panel and isolated bone at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1050 }); await pauseClock(page); await page.goto('/');
    await expect(page.locator('[data-boot]')).toHaveCount(1);
    await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused();
    await expect(page.locator('.skip-link')).toHaveCSS('z-index', '100');
    await page.screenshot({ path: info.outputPath(`boot-skip-link-${width}.png`), animations: 'allow' });
    for (let i = 0; i < 12 && !await page.locator('[data-transmission-toggle]').evaluate(node => node === document.activeElement); i++) await page.keyboard.press('Tab');
    await expect(page.locator('[data-transmission-toggle]')).toBeFocused();
    const paintProbe = (selector: string) => page.locator(selector).first().evaluate(node => {
      const panel = document.querySelector<HTMLElement>('[data-boot]')!, target = node.getBoundingClientRect(), boot = panel.getBoundingClientRect();
      const x = Math.max(target.left, boot.left) + (Math.min(target.right, boot.right) - Math.max(target.left, boot.left)) / 2;
      const y = Math.max(target.top, boot.top) + (Math.min(target.bottom, boot.bottom) - Math.max(target.top, boot.top)) / 2;
      const overlap = Math.min(target.right, boot.right) > Math.max(target.left, boot.left) && Math.min(target.bottom, boot.bottom) > Math.max(target.top, boot.top);
      const style = getComputedStyle(node), region = node.closest('.site-header, #main, .site-footer')!;
      panel.style.pointerEvents = 'auto';
      const above = overlap && node.contains(document.elementFromPoint(x, y)); panel.style.removeProperty('pointer-events');
      return { overlap, above, region: region.id || region.className, z: getComputedStyle(region).zIndex,
        focusVisible: node.matches(':focus-visible'), outline: style.outlineColor, outlineWidth: style.outlineWidth,
        boneIsolation: node.closest('.bone-plate') ? getComputedStyle(node.closest('.bone-plate')!).isolation : null,
        target: { x: target.x, y: target.y, width: target.width, height: target.height }, point: { x, y } };
    });
    const header = await paintProbe('[data-transmission-toggle]');
    expect(header.focusVisible).toBe(true); expect(header.z).toBe('20');
    expect(header.overlap).toBe(true); expect(header.above).toBe(true); expect(header.outline).toBe('rgb(194, 222, 94)');
    await page.screenshot({ path: info.outputPath(`boot-header-focus-${width}.png`), animations: 'allow' });
    await page.locator('.cert-list a').first().evaluate(node => window.scrollBy(0, node.getBoundingClientRect().top - 45));
    await page.locator('#credentials .skills-grid a').last().evaluate(node => (node as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Tab'); await expect(page.locator('.cert-list a').first()).toBeFocused();
    const bone = await paintProbe('.cert-list a');
    expect(bone.focusVisible).toBe(true); expect(bone.boneIsolation).toBe('isolate'); expect(bone.z).toBe('20');
    expect(bone.overlap).toBe(true); expect(bone.above).toBe(true); expect(bone.outline).toBe('rgb(179, 18, 43)');
    expect(bone.outlineWidth).toBe('3px');
    await page.screenshot({ path: info.outputPath(`boot-bone-focus-${width}.png`), animations: 'allow' });
    await page.locator('.site-footer a').first().focus(); await page.keyboard.press('Tab');
    await expect(page.locator('.site-footer')).toHaveCSS('z-index', '20');
    await page.locator('.site-footer a').last().focus(); await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'SKIP', exact: true })).toBeFocused();
    await page.screenshot({ path: info.outputPath(`boot-skip-focus-${width}.png`), animations: 'allow' });
    await page.clock.runFor(1200); await expect(page.locator('[data-transmission-toggle]')).toBeFocused();
    await expect(page.locator('[data-boot]')).toHaveCount(0);
    await info.attach(`boot-focus-stacking-${width}.json`, { body: JSON.stringify({ header, bone }, null, 2), contentType: 'application/json' });
  });
}
