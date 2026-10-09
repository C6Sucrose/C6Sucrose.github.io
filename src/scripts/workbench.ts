type Channel = { title: string; short: string; footer: string; number?: string };
const data = document.querySelector('#channel-data');
const station = document.querySelector<HTMLElement>('#station');
if (data?.textContent && station) {
  const channels: Record<string, Channel> = JSON.parse(data.textContent);
  const controls = [...station.querySelectorAll<HTMLButtonElement>('[data-channel]')];
  const keyboard = station.querySelector<HTMLElement>('.keyboard');
  if (keyboard) keyboard.hidden = false;
  controls.forEach(control => control.addEventListener('click', () => {
    const key = control.dataset.channel!;
    const channel = channels[key];
    if (!channel) return;
    controls.forEach(other => other.setAttribute('aria-pressed', String(other.dataset.channel === key)));
    document.getElementById('channel-title')!.textContent = `${channel.number ?? '00'} / ${channel.title}`;
    document.getElementById('console-copy')!.textContent = channel.short;
    document.getElementById('channel-footer')!.textContent = channel.footer;
    const link = document.getElementById('channel-link') as HTMLAnchorElement;
    link.href = key === 'intro' ? '#about' : `#interest-${key}`;
    link.textContent = key === 'intro' ? 'Meet the person ↓' : 'Follow this interest ↓';
    if (control.classList.contains('artifact')) {
      const screen = document.getElementById('screen')!;
      const rect = screen.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > innerHeight) screen.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }));
  const lamp = station.querySelector<HTMLButtonElement>('.lamp-switch')!;
  lamp.hidden = false;
  function setLight(low: boolean) {
    station!.dataset.light = low ? 'low' : 'high';
    lamp.setAttribute('aria-pressed', String(low));
    lamp.setAttribute('aria-label', low ? 'Raise desk lighting' : 'Lower desk lighting');
    lamp.querySelector('.lamp-state')!.textContent = low ? 'LOW' : 'HIGH';
  }
  try { setLight(localStorage.getItem('ha-desk-light') === 'low'); } catch { setLight(false); }
  lamp.addEventListener('click', () => { const low = station.dataset.light !== 'low'; setLight(low); try { localStorage.setItem('ha-desk-light', low ? 'low' : 'high'); } catch { /* Lighting remains usable for this visit. */ } });
}
