import { createHash } from 'node:crypto';

export const masterPlanSections = [
  'objective','customer','requirements','architecture','security','privacy','legal','compliance',
  'marketing','sales','support','finance','budget','schedule','dependencies','risks','quality',
  'testing','launch','operations','metrics','exitCriteria',
] as const;

export type MasterProjectPlan = Record<(typeof masterPlanSections)[number], string | string[]>;

export function normalizeMasterPlan(value: unknown): MasterProjectPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Master Project Plan must be an object.');
  const source = value as Record<string, unknown>;
  const plan = {} as MasterProjectPlan;
  for (const section of masterPlanSections) {
    const raw = source[section];
    if (Array.isArray(raw)) {
      const items = raw.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 50);
      if (!items.length) throw new Error(`Master Project Plan section ${section} is required.`);
      plan[section] = items;
    } else {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (text.length < 3) throw new Error(`Master Project Plan section ${section} is required.`);
      plan[section] = text.slice(0, 12000);
    }
  }
  return plan;
}

export function hashMasterPlan(plan: MasterProjectPlan) {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

export function validRepositoryPart(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(value);
}

export function isApprovedGovernance(status: string) {
  return status === 'APPROVED' || status === 'LEGACY_APPROVED';
}
