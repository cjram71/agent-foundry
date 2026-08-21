import type { Prisma, PrismaClient } from '@prisma/client';

type QueryClient = PrismaClient | Prisma.TransactionClient;

/** Deterministic normalization only — never a model guess. An ambiguous
 * surface form simply fails to normalize to an existing canonicalKey and
 * falls through to UNMATCHED, which is a human review decision, not an
 * auto-merge of two possibly-different real-world entities. */
export function normalizeSurfaceForm(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function resolveAlias(client: QueryClient, companyId: string, surfaceForm: string): Promise<{ entityId: string | null; canonicalKey: string }> {
  const canonicalKey = normalizeSurfaceForm(surfaceForm);
  if (!canonicalKey) return { entityId: null, canonicalKey };
  const match = await client.worldEntity.findUnique({ where: { companyId_canonicalKey: { companyId, canonicalKey } }, select: { id: true } });
  return { entityId: match?.id ?? null, canonicalKey };
}
