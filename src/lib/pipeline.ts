export type PipelineState = {
  completed: number;
  /** One-based attempt for the current stage; a successful stage resets it to 1. */
  attempts: number;
  status: 'running' | 'rc_ready' | 'quarantined';
};

const STAGE_COUNT = 6;
const MAX_ATTEMPTS = 3;

export function initialPipeline(): PipelineState {
  return { completed: 0, attempts: 1, status: 'running' };
}

/** failGate is the outcome of the current stage's gate on this attempt. */
export function advancePipeline(state: PipelineState, failGate: boolean): PipelineState {
  if (state.status !== 'running') {
    return state;
  }

  if (failGate) {
    if (state.attempts >= MAX_ATTEMPTS) {
      return { ...state, status: 'quarantined' };
    }
    return { ...state, attempts: state.attempts + 1 };
  }

  const completed = state.completed + 1;
  return {
    completed,
    attempts: 1,
    status: completed === STAGE_COUNT ? 'rc_ready' : 'running',
  };
}
