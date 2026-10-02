export type AuthorityInput = {
  forbidden: boolean;
  confidence: 'high' | 'low';
  lowConfidence: 'ask' | 'refuse' | 'escalate';
  amount: number;
  currency: string;
  policyCurrency: string;
  autoLimit: number;
  confirmAt: number;
};

export function evaluateAuthority(input: AuthorityInput): {
  decision: 'allow' | 'confirm' | 'refuse' | 'escalate';
  reason: string;
} {
  if (input.forbidden) {
    return { decision: 'refuse', reason: 'This action is forbidden by policy.' };
  }

  for (const value of [input.amount, input.autoLimit, input.confirmAt]) {
    if (!Number.isFinite(value) || value < 0) {
      return {
        decision: 'refuse',
        reason: 'Amounts and limits must be finite, non-negative numbers.',
      };
    }
  }

  if (input.currency !== input.policyCurrency) {
    return { decision: 'refuse', reason: 'Action currency must match the policy currency.' };
  }

  if (input.confidence === 'low') {
    if (input.lowConfidence === 'ask') {
      return { decision: 'confirm', reason: 'Low confidence requires confirmation.' };
    }
    if (input.lowConfidence === 'escalate') {
      return { decision: 'escalate', reason: 'Low confidence requires escalation.' };
    }
    return { decision: 'refuse', reason: 'Policy refuses actions with low confidence.' };
  }

  if (input.amount >= input.confirmAt) {
    return { decision: 'confirm', reason: 'The amount reaches the confirmation threshold.' };
  }

  if (input.amount <= input.autoLimit) {
    return { decision: 'allow', reason: 'The amount is within the automatic-action limit.' };
  }

  return { decision: 'confirm', reason: 'The amount exceeds the automatic-action limit.' };
}
