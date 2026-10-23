export {};

const html = document.documentElement;
const preference = html.dataset;
const query = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(hover: none)');
const bay = query<HTMLElement>('.desk-surface');
const plates = [...(bay?.querySelectorAll<HTMLElement>('.artifact') ?? [])];
const toggle = query<HTMLButtonElement>('[data-transmission-toggle]');
const label = toggle?.firstElementChild;
const random = (range: number) => Math.random() * range;
// Current guards belong to event/timeout admission; frames use cached attachment only.
const enabled = () => preference.transmission !== 'off' && !reduced.matches && !document.hidden;
let reconcilePointer: (() => void) | undefined;

// Native event identity/capture is shared by attachment and cancellation.
type NativeEvents = HTMLElementEventMap & DocumentEventMap & WindowEventMap & MediaQueryListEventMap;
function listen<K extends keyof NativeEvents>(target: EventTarget, type: K, callback: (event: NativeEvents[K]) => void, on = true, capture?: boolean) {
  // EventTarget erases event names; callers retain the native name/handler pairing.
  target[`${on ? 'add' : 'remove'}EventListener`](type, callback as EventListener, { passive: true, capture });
}
// Timer slots: 0 tear, 1 reaction, 2 ambient; boot alone owns the tail from 3.
const timers: ReturnType<typeof setTimeout>[] = [];
function deadline(owner: number, delay?: number, callback?: () => void) {
  clearTimeout(timers[owner]);
  if (delay) timers[owner] = setTimeout(callback!, delay);
}

// One record per plate: center x/y, prox/nx/ny, beat ms. Only inputs change per frame.
const states = plates.map(plate => {
  const beat = parseFloat(getComputedStyle(plate).getPropertyValue('--beat'));
  if (isFinite(beat)) plate.style.setProperty('--phase', `${-random(beat)}s`);
  return [0, 0, 0, 0, 0, beat * 1000];
});

let tearTarget: HTMLElement | undefined;
let nextTear = 0;
function endTear(): void {
  deadline(0);
  tearTarget?.classList.remove('is-tearing');
  delete tearTarget?.dataset.tear;
  tearTarget = undefined;
}
function tear(target: HTMLElement | null | undefined, kind: 'selection' | 'ambient'): void {
  const now = performance.now();
  if (!target || tearTarget || now < nextTear) return; // Both ingress callers check current guards.
  nextTear = now + 334;
  tearTarget = target;
  target.dataset.tear = kind;
  target.classList.add('is-tearing');
  deadline(0, 200, endTear);
}

let selected: HTMLElement | undefined;
function endReaction(): void {
  deadline(1);
  delete selected?.dataset.selected;
}
if (plates.length) {
  const hasObserver = typeof IntersectionObserver === 'function';
  const properties = ['--prox', '--nx', '--ny'];
  let inView = !hasObserver, attached = false, measured = false, frame = 0;
  let x = 0, y = 0, decayAt = 0;
  function measure() {
    plates.forEach((plate, index) => {
      const rect = plate.getBoundingClientRect();
      states[index][0] = rect.left + rect.width / 2;
      states[index][1] = rect.top + rect.height / 2;
    });
    measured = true;
  }
  const refresh = () => { if (measured) measure(); };
  // Bubble after workbench's control handler has synchronized copy and aria-pressed.
  const readout = query('.screen-head', bay!);
  bay!.addEventListener('click', event => {
    const control = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-channel]') : null;
    if (!control) return;
    refresh();
    if (!enabled()) return;
    endReaction();
    const index = plates.findIndex(plate => plate.dataset.channel === control.dataset.channel);
    selected = plates[index];
    if (selected) {
      selected.dataset.selected = 'true';
      deadline(1, states[index][5], endReaction);
    }
    tear(readout, 'selection');
  });
  function listeners(on: boolean) {
    for (const type of ['pointermove', 'pointerleave'] as const) listen(bay!, type, input, on);
    for (const type of ['resize', 'scroll'] as const) listen(window, type, refresh, on, type === 'scroll');
    attached = on;
  }
  function paint(decay: boolean, snap: boolean) {
    for (let index = 0; index < plates.length; index++) {
      const state = states[index];
      const dx = x - state[0];
      const dy = y - state[1];
      const distance = Math.hypot(dx, dy), divisor = Math.max(1, distance);
      for (let axis = 2; axis < 5; axis++) {
        const target = decay ? 0 : axis === 2 ? Math.max(0, 1 - distance / 420) : (axis === 3 ? dx : dy) / divisor;
        const value = state[axis];
        const next = snap ? 0 : Math.round((value + (target - value) * .08) * 10000) / 10000;
        if (value !== next) {
          plates[index].style.setProperty(properties[axis - 2], `${next}`);
          state[axis] = next;
        }
      }
    }
  }
  function tick(now: number) {
    frame = 0;
    // Lifecycle/observer events detach and cancel; admitted frames read only cached state.
    if (!attached) return;
    const snap = now >= decayAt + 600;
    paint(now >= decayAt, snap);
    if (!snap) frame = requestAnimationFrame(tick);
  }
  function input(event: PointerEvent) {
    if (!attached || !enabled() || coarse.matches) return;
    // A single native listener also supplies lazy activation when IO is unavailable.
    if (!measured) measure();
    const moving = event.type === 'pointermove';
    if (moving) { x = event.clientX; y = event.clientY; }
    decayAt = performance.now() + (moving ? 1900 : 0);
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function reconcile() {
    if (!enabled() || coarse.matches || !inView) {
      listeners(false); measured = false;
      cancelAnimationFrame(frame); frame = 0;
      paint(true, true);
      return;
    }
    if (attached) return;
    if (hasObserver) measure();
    listeners(true);
  }
  if (hasObserver) new IntersectionObserver(entries => { inView = entries[0].isIntersecting; reconcile(); }).observe(bay!);
  reconcilePointer = reconcile;
}

// One lifecycle-owned deadline: skipped events never queue a catch-up on resume.
function scheduleAmbient(): void {
  deadline(2, enabled() ? 20000 + random(14000) : 0, () => {
    if (!enabled()) return;
    const targets = [...document.querySelectorAll<HTMLElement>('.screen-head,.file-id,.case-numeral')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width && r.height && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && !el.closest('.bone-content');
    });
    tear(targets.at(random(targets.length)), 'ambient');
    scheduleAmbient();
  });
}

let bootHost = query('[data-boot-host]');
const sessionKey = 'ha-transmission-boot';
let boot: HTMLElement | undefined;
function bootListeners(on: boolean) {
  listen(boot!.firstElementChild!, 'click', dismissBoot, on);
  listen(document, 'pointerdown', dismissBoot, on, true);
  listen(document, 'keydown', dismissBoot, on);
}
function dismissBoot(event?: Event): void {
  if (!boot || (event?.type === 'keydown' && (event as KeyboardEvent).key !== 'Escape')) return;
  const ownedFocus = boot.contains(document.activeElement);
  timers.splice(3).forEach(clearTimeout);
  bootListeners(false);
  boot.remove(); boot = undefined;
  plates.forEach(plate => delete plate.dataset.booting);
  if (ownedFocus) toggle?.focus({ preventScroll: true });
}
// One state boundary owns guards, cancellation and fresh deadlines for every effect.
function syncEffects(): void {
  const on = preference.transmission !== 'off';
  if (toggle) {
    toggle.hidden = false;
    toggle.ariaPressed = `${on}`;
    toggle.ariaLabel = `Turn transmission effects ${on ? 'off' : 'on'}`;
  }
  if (label) label.textContent = on ? 'ON' : 'OFF';
  reconcilePointer?.();
  scheduleAmbient();
  if (!enabled()) { endReaction(); endTear(); dismissBoot(); return; }
  const host = bootHost;
  if (!host) return;
  bootHost = null; // Consume the host once, even if either storage operation fails.
  try {
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');
  } catch { /* One attempt per visit even if either storage operation fails. */ }
  host.innerHTML = '<div class="boot" data-boot><button type="button">SKIP</button><div class="boot-progress" aria-hidden="true"><i></i></div><p>HA–01 ONLINE</p></div>';
  boot = query<HTMLElement>('.boot', host)!;
  bootListeners(true);
  plates.forEach((plate, index) => {
    plate.dataset.booting = 'true';
    deadline(3 + index, 840 + index * 60, () => delete plate.dataset.booting);
  });
  // Independent watchdog and normal completion; no animationend dependency.
  for (const delay of [4000, 1200]) deadline(timers.length, delay, dismissBoot);
}
for (const media of [reduced, coarse]) listen(media, 'change', syncEffects);
listen(document, 'visibilitychange', syncEffects);
// attributeFilter enables attribute observation and excludes our other DOM work.
new MutationObserver(syncEffects).observe(html, { attributeFilter: ['data-transmission'] });
toggle?.addEventListener('click', () => {
  const value = preference.transmission === 'off' ? 'on' : 'off';
  preference.transmission = value;
  syncEffects();
  try { localStorage.setItem('ha-transmission', value); }
  catch { /* This-visit state remains usable. */ }
});
syncEffects();
