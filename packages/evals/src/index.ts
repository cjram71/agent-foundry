export type EvalKind = 'golden' | 'redteam' | 'regression';

export interface EvalCase {
  id: string;
  kind: EvalKind;
  component: string;
  input: unknown;
  expected: unknown;
  rubric?: string;
  risk?: 'low' | 'medium' | 'high';
}

export interface EvalResult {
  caseId: string;
  passed: boolean;
  score?: number;
  notes?: string;
  baselineDelta?: number;
}
