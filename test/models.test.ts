import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAuthority, type AuthorityInput } from '../src/lib/authority.ts';
import {
  advancePipeline,
  initialPipeline,
  type PipelineState,
} from '../src/lib/pipeline.ts';

const policy: AuthorityInput = Object.freeze({
  forbidden: false,
  confidence: 'high',
  lowConfidence: 'ask',
  amount: 100,
  currency: 'EUR',
  policyCurrency: 'EUR',
  autoLimit: 100,
  confirmAt: 150,
});

test('authority allows the exact auto-act limit below the confirmation threshold', () => {
  const result = evaluateAuthority({
    forbidden: false,
    confidence: 'high',
    lowConfidence: 'ask',
    amount: 100,
    currency: 'EUR',
    policyCurrency: 'EUR',
    autoLimit: 100,
    confirmAt: 150,
  });

  assert.equal(result.decision, 'allow');
  assert.ok(result.reason.trim().length > 0);
});

test('authority confirms at the inclusive threshold even inside the auto-act limit', () => {
  const result = evaluateAuthority({
    forbidden: false,
    confidence: 'high',
    lowConfidence: 'ask',
    amount: 150,
    currency: 'EUR',
    policyCurrency: 'EUR',
    autoLimit: 200,
    confirmAt: 150,
  });

  assert.equal(result.decision, 'confirm');
  assert.ok(result.reason.trim().length > 0);
});

for (const lowConfidence of ['ask', 'refuse', 'escalate'] as const) {
  test(`authority refuses forbidden actions before low-confidence ${lowConfidence}`, () => {
    const result = evaluateAuthority({
      ...policy,
      forbidden: true,
      confidence: 'low',
      lowConfidence,
    });

    assert.equal(result.decision, 'refuse');
    assert.match(result.reason, /forbidden/i);
  });
}

for (const scenario of [
  { lowConfidence: 'ask', decision: 'confirm' },
  { lowConfidence: 'refuse', decision: 'refuse' },
  { lowConfidence: 'escalate', decision: 'escalate' },
] as const) {
  test(`authority applies low-confidence ${scenario.lowConfidence} below the auto-act limit`, () => {
    const result = evaluateAuthority({
      ...policy,
      amount: 50,
      confidence: 'low',
      lowConfidence: scenario.lowConfidence,
    });

    assert.equal(result.decision, scenario.decision);
    assert.match(result.reason, /confidence/i);
  });
}

for (const scenario of [
  {
    name: 'allows a fractional amount just below the confirmation threshold',
    input: { amount: 149.99, autoLimit: 200 },
    decision: 'allow',
  },
  {
    name: 'confirms just above the auto-act limit even below the confirmation threshold',
    input: { amount: 100.01 },
    decision: 'confirm',
  },
  {
    name: 'confirms above both limits',
    input: { amount: 200 },
    decision: 'confirm',
  },
  {
    name: 'confirms when the amount and both limits are equal',
    input: { amount: 100, autoLimit: 100, confirmAt: 100 },
    decision: 'confirm',
  },
  {
    name: 'allows zero at a zero auto-act limit below the confirmation threshold',
    input: { amount: 0, autoLimit: 0 },
    decision: 'allow',
  },
  {
    name: 'confirms zero when the confirmation threshold is zero',
    input: { amount: 0, confirmAt: 0 },
    decision: 'confirm',
  },
] as const) {
  test(`authority ${scenario.name}`, () => {
    const result = evaluateAuthority({ ...policy, ...scenario.input });

    assert.equal(result.decision, scenario.decision);
    assert.ok(result.reason.trim().length > 0);
  });
}

test('authority refuses currency mismatch instead of comparing unlike amounts', () => {
  const result = evaluateAuthority({ ...policy, currency: 'USD' });

  assert.equal(result.decision, 'refuse');
  assert.match(result.reason, /currency/i);
});

test('authority refuses currency mismatch before low-confidence escalation', () => {
  const result = evaluateAuthority({
    ...policy,
    currency: 'USD',
    confidence: 'low',
    lowConfidence: 'escalate',
  });

  assert.equal(result.decision, 'refuse');
  assert.match(result.reason, /currency/i);
});

for (const field of ['amount', 'autoLimit', 'confirmAt'] as const) {
  for (const invalid of [
    { name: 'NaN', value: Number.NaN },
    { name: 'positive infinity', value: Number.POSITIVE_INFINITY },
    { name: 'negative infinity', value: Number.NEGATIVE_INFINITY },
    { name: 'negative value', value: -1 },
    { name: 'numeric string', value: '100' },
    { name: 'null', value: null },
    { name: 'undefined', value: undefined },
  ]) {
    test(`authority refuses ${invalid.name} in ${field}`, () => {
      // Deliberately exercise invalid runtime values as well as invalid numbers.
      const input = { ...policy, [field]: invalid.value } as AuthorityInput;
      const result = evaluateAuthority(input);

      assert.equal(result.decision, 'refuse');
      assert.match(result.reason, /finite|invalid|non-negative/i);
    });
  }
}

test('authority refuses invalid numeric input before low-confidence escalation', () => {
  const result = evaluateAuthority({
    ...policy,
    amount: Number.NaN,
    confidence: 'low',
    lowConfidence: 'escalate',
  });

  assert.equal(result.decision, 'refuse');
  assert.match(result.reason, /finite|invalid|non-negative/i);
});

test('authority evaluates frozen input repeatably without mutation', () => {
  assert.equal(evaluateAuthority(policy).decision, 'allow');
  assert.equal(evaluateAuthority(policy).decision, 'allow');
});

test('pipeline completes exactly six successful stages without mutating prior states', () => {
  let run = initialPipeline();
  const expected: PipelineState[] = [
    { completed: 1, attempts: 1, status: 'running' },
    { completed: 2, attempts: 1, status: 'running' },
    { completed: 3, attempts: 1, status: 'running' },
    { completed: 4, attempts: 1, status: 'running' },
    { completed: 5, attempts: 1, status: 'running' },
    { completed: 6, attempts: 1, status: 'rc_ready' },
  ];

  for (const state of expected) {
    run = advancePipeline(Object.freeze(run), false);
    assert.deepEqual(run, state);
  }
});

test('pipeline quarantines a failing third stage after three total attempts', () => {
  let run = advancePipeline(initialPipeline(), false);
  run = advancePipeline(run, false);
  assert.deepEqual(run, { completed: 2, attempts: 1, status: 'running' });

  const expected: PipelineState[] = [
    { completed: 2, attempts: 2, status: 'running' },
    { completed: 2, attempts: 3, status: 'running' },
    { completed: 2, attempts: 3, status: 'quarantined' },
  ];

  for (const state of expected) {
    run = advancePipeline(Object.freeze(run), true);
    assert.deepEqual(run, state);
  }
});

test('pipeline can succeed on the third attempt and gives the next gate a fresh retry budget', () => {
  let run = advancePipeline(initialPipeline(), false);
  run = advancePipeline(run, false);
  run = advancePipeline(run, true);
  run = advancePipeline(run, true);
  assert.deepEqual(run, { completed: 2, attempts: 3, status: 'running' });

  run = advancePipeline(Object.freeze(run), false);
  assert.deepEqual(run, { completed: 3, attempts: 1, status: 'running' });

  run = advancePipeline(Object.freeze(run), true);
  assert.deepEqual(run, { completed: 3, attempts: 2, status: 'running' });
});

test('pipeline release-candidate terminal steps are inert', () => {
  const state = Object.freeze({ completed: 6, attempts: 1, status: 'rc_ready' } as const);

  for (const failGate of [false, true]) {
    assert.deepEqual(advancePipeline(state, failGate), {
      completed: 6,
      attempts: 1,
      status: 'rc_ready',
    });
  }
});

test('pipeline quarantined terminal steps are inert', () => {
  const state = Object.freeze({ completed: 2, attempts: 3, status: 'quarantined' } as const);

  for (const failGate of [false, true]) {
    assert.deepEqual(advancePipeline(state, failGate), {
      completed: 2,
      attempts: 3,
      status: 'quarantined',
    });
  }
});

test('pipeline runs start independently after a previous run has advanced', () => {
  const original = initialPipeline();
  const advanced = advancePipeline(Object.freeze(original), true);

  assert.deepEqual(advanced, { completed: 0, attempts: 2, status: 'running' });
  assert.deepEqual(original, { completed: 0, attempts: 1, status: 'running' });
  assert.deepEqual(initialPipeline(), { completed: 0, attempts: 1, status: 'running' });
});
