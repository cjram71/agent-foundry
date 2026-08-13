import prisma from '@/lib/prisma';

export const BOOSTA_COMPANY_ID = 'BSTA-COMP-001';

export async function loadBoostaCompany() {
  return prisma.company.findUnique({
    where: { id: BOOSTA_COMPANY_ID },
    include: {
      activities: { orderBy: [{ category: 'asc' }, { name: 'asc' }] },
      sources: { orderBy: { retrievedAt: 'desc' }, take: 5 },
      constitutions: { orderBy: { version: 'desc' }, take: 1 },
      _count: { select: { missions: true, projects: true, facts: true } },
    },
  });
}

export function addressLine(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Not verified';
  const address = value as Record<string, unknown>;
  return [address.street, address.postalCode, address.city]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(', ') || 'Not verified';
}

