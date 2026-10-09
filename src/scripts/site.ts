const nav = document.querySelector<HTMLElement>('#primary-nav');
const menu = document.querySelector<HTMLButtonElement>('.menu-toggle');
if (menu && nav) {
  menu.hidden = window.innerWidth > 900;
  nav.dataset.open = 'false';
  const breakpoint = window.matchMedia('(max-width: 900px)');
  const syncMenu = () => { menu.hidden = !breakpoint.matches; nav.dataset.open = String(!breakpoint.matches); menu.setAttribute('aria-expanded', String(!breakpoint.matches)); };
  syncMenu(); breakpoint.addEventListener('change', syncMenu);
  menu.addEventListener('click', () => { const open = nav.dataset.open !== 'true'; nav.dataset.open = String(open); menu.setAttribute('aria-expanded', String(open)); });
  nav.addEventListener('click', event => { if ((event.target as Element).closest('a') && breakpoint.matches) { nav.dataset.open = 'false'; menu.setAttribute('aria-expanded','false'); } });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && breakpoint.matches && nav.dataset.open === 'true') { nav.dataset.open = 'false'; menu.setAttribute('aria-expanded','false'); menu.focus(); } });
}

const filters = document.querySelector<HTMLElement>('[data-filters]');
if (filters) {
  filters.hidden = false;
  const projects = [...document.querySelectorAll<HTMLElement>('[data-project]')];
  filters.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.filter;
    filters.querySelectorAll('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    projects.forEach(project => { project.hidden = category !== 'all' && project.dataset.category !== category; });
    const count = document.querySelector('[data-filter-count]');
    if (count) count.textContent = `${projects.filter(project => !project.hidden).length} of ${projects.length} projects`;
  }));
}

document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => {
  button.hidden = false;
  button.addEventListener('click', async () => {
    const block = button.closest('.run-guide');
    const text = block?.querySelector('code')?.textContent ?? '';
    const status = block?.querySelector('[data-copy-status]');
    if (!status) return;
    try { await navigator.clipboard.writeText(text); status.textContent = 'Copied to clipboard.'; }
    catch { status.textContent = 'Select and copy the commands above; clipboard access is unavailable.'; }
  });
});

// Opening a deep link must reveal its native disclosure, including when sent directly.
function revealHash(hash = location.hash) {
  let id: string;
  try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
  const target = document.getElementById(id);
  if (target instanceof HTMLDetailsElement) target.open = true;
  if (target?.hasAttribute('data-project') && target.hidden) {
    document.querySelector<HTMLButtonElement>('[data-filter="all"]')?.click();
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}
window.addEventListener('hashchange', () => revealHash());
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
  const destination = new URL(anchor.href, location.href);
  if (destination.origin === location.origin && destination.pathname === location.pathname && destination.hash) revealHash(destination.hash);
});
revealHash();
