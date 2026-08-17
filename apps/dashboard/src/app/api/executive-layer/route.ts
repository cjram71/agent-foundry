import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { loadExecutiveLayer } from '@/lib/executive-layer';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const layer = await loadExecutiveLayer(prisma);
  return NextResponse.json({
    ...layer,
    departments: layer.departments.map((row) => ({ ...row, budgetLimitMinor: row.budgetLimitMinor.toString() })),
    agents: layer.agents.map((row) => ({ ...row, financialLimitMinor: row.financialLimitMinor.toString() })),
  });
}
