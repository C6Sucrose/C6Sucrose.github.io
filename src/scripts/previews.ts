import { evaluateAuthority, type AuthorityInput } from '../lib/authority';
import { initialPipeline, advancePipeline } from '../lib/pipeline';

const anon = document.querySelector('[data-preview="anon"]');
if (anon) {
  type Result = { id: string; name: string; image: string; map: number; rank1: number; leakage: number; note: string };
  const rows: Result[] = JSON.parse(document.getElementById('anon-data')!.textContent!);
  const select = document.getElementById('anon-method') as HTMLSelectElement;
  select.addEventListener('change', () => {
    const row = rows.find(item => item.id === select.value);
    if (!row) return;
    const image = document.getElementById('anon-image') as HTMLImageElement;
    image.src = `/images/anon/${row.image}.png`; image.alt = `Market-1501 sample after ${row.name}.`;
    document.getElementById('anon-image-caption')!.textContent = row.name;
    for (const [valueId, barId, value] of [['anon-map','anon-map-bar',row.map], ['anon-rank','anon-rank-bar',row.rank1], ['anon-leakage','anon-leak-bar',row.leakage]] as const) {
      document.getElementById(valueId)!.textContent = `${value.toFixed(2)}%`;
      document.getElementById(barId)!.style.width = `${value}%`;
    }
    document.getElementById('anon-note')!.textContent = row.note;
    anon.querySelectorAll<HTMLElement>('[data-method-row]').forEach(item => item.classList.toggle('selected-result', item.dataset.methodRow === row.id));
  });
}

const authority = document.querySelector('[data-preview="authority"]');
if (authority) {
  const number = (id: string) => (document.getElementById(id) as HTMLInputElement).valueAsNumber;
  const value = (id: string) => (document.getElementById(id) as HTMLSelectElement).value;
  const labels = { allow:'Allow', confirm:'Confirm first', refuse:'Refuse', escalate:'Escalate' };
  const update = () => {
    const result = evaluateAuthority({
      forbidden: (document.getElementById('action-forbidden') as HTMLInputElement).checked,
      amount: number('action-amount'), autoLimit: number('auto-limit'), confirmAt: number('confirm-at'),
      confidence: value('action-confidence') as AuthorityInput['confidence'],
      lowConfidence: value('confidence-policy') as AuthorityInput['lowConfidence'],
      currency: value('action-currency'), policyCurrency: 'EUR',
    });
    document.getElementById('authority-decision')!.textContent = labels[result.decision];
    document.getElementById('authority-reason')!.textContent = result.reason;
  };
  authority.addEventListener('input', update); authority.addEventListener('change', update);
  update();
}

const pipeline = document.querySelector('[data-preview="pipeline"]');
if (pipeline) {
  let state = initialPipeline();
  const stages = ['Configure','Build','Gates','Listing','Package','Upload'];
  const scenario = document.getElementById('pipeline-scenario') as HTMLSelectElement;
  const next = document.getElementById('pipeline-next') as HTMLButtonElement;
  const log = document.getElementById('pipeline-log')!;
  const draw = () => {
    const status = state.status === 'rc_ready' ? 'Release candidate ready' : state.status === 'quarantined' ? 'Quarantined' : `Ready for ${stages[state.completed].toLowerCase()}`;
    document.getElementById('pipeline-status')!.textContent = status;
    document.getElementById('pipeline-detail')!.textContent = state.status === 'running' ? `${state.completed} of 6 stages completed. Attempt ${state.attempts} of 3 for ${stages[state.completed]}.` : `${state.completed} of 6 stages completed. ${state.status === 'quarantined' ? 'The gate exhausted its three attempts.' : 'Mock upload completed; no app was published.'}`;
    pipeline.querySelectorAll<HTMLElement>('[data-stage]').forEach(element => {
      const index = Number(element.dataset.stage);
      element.dataset.state = index < state.completed ? 'done' : index === state.completed ? 'current' : 'pending';
      element.querySelector('small')!.textContent = index < state.completed ? 'Completed' : index === state.completed ? (state.status === 'quarantined' ? 'Stopped' : 'Ready to attempt') : 'Pending';
    });
    next.disabled = state.status !== 'running';
  };
  const reset = () => { state = initialPipeline(); log.textContent = 'New illustrated run. A product brief is ready.'; draw(); };
  scenario.addEventListener('change', reset);
  document.getElementById('pipeline-reset')!.addEventListener('click', reset);
  next.addEventListener('click', () => {
    const fail = scenario.value === 'fail' && state.completed === 2;
    const stage = stages[state.completed]; const attempt = state.attempts;
    state = advancePipeline(state, fail);
    log.textContent = fail ? `${stage}: attempt ${attempt} failed. ${state.status === 'quarantined' ? 'Retry budget exhausted → quarantined.' : 'State recorded; the next attempt stays at this stage.'}` : `${stage}: completed. ${state.status === 'rc_ready' ? 'Release candidate ready (illustration only).' : `Checkpoint saved → next: ${stages[state.completed]}.`}`;
    draw();
  });
  draw();
}
