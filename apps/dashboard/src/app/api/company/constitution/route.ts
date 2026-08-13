import { NextResponse } from 'next/server';
import { getSession, isSameOrigin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { BOOSTA_COMPANY_ID } from '@/lib/company';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (body?.confirmation !== 'APPROVE BOOSTA CONSTITUTION') {
    return NextResponse.json({ error: 'Explicit constitution confirmation is required' }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const constitution = await tx.companyConstitution.findFirst({
      where: { companyId: BOOSTA_COMPANY_ID },
      orderBy: { version: 'desc' },
    });
    if (!constitution) throw new Error('Boosta constitution not found');
    if (constitution.status === 'ACTIVE') return { constitution, unchanged: true };
    if (constitution.status !== 'DRAFT') throw new Error(`Constitution cannot be approved from ${constitution.status}`);

    await tx.companyConstitution.updateMany({
      where: { companyId: BOOSTA_COMPANY_ID, status: 'ACTIVE' },
      data: { status: 'SUPERSEDED' },
    });
    const approved = await tx.companyConstitution.update({
      where: { id: constitution.id },
      data: { status: 'ACTIVE', approvedBy: session.userId, approvedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        actor: session.userId,
        action: 'company.constitution_approved',
        target: approved.id,
        result: 'success',
        metadata: { companyId: BOOSTA_COMPANY_ID, version: approved.version },
      },
    });
    return { constitution: approved, unchanged: false };
  });

  return NextResponse.json({
    status: result.constitution.status,
    version: result.constitution.version,
    unchanged: result.unchanged,
  });
}

