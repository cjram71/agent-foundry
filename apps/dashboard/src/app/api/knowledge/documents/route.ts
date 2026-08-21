import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { BOOSTA_COMPANY_ID } from '@/lib/company';
import { requireApiAdmin as admin } from '@/lib/dashboard/auth';
import { text } from '@/lib/validation';

const NAMESPACES = ['crm', 'operations', 'intelligence'];

export async function POST(request: Request) {
  const auth = await admin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const actor = auth.session!.userId;
    const namespace = text(body.namespace, 'namespace', 40);
    if (!NAMESPACES.includes(namespace)) throw new Error('namespace must be one of ' + NAMESPACES.join(', '));
    const title = text(body.title, 'title', 300);
    const sourceUri = text(body.sourceUri, 'source', 2000);
    const content = text(body.content, 'document text', 200_000);
    const contentHash = createHash('sha256').update(content).digest('hex');
    const row = await prisma.$transaction(async (tx) => {
      const document = await tx.knowledgeDocument.create({ data: { companyId: BOOSTA_COMPANY_ID, namespace, title, sourceUri, content, contentHash, createdBy: actor } });
      await tx.auditEvent.create({ data: { actor, action: 'knowledge.document_registered', target: document.id, result: 'success', metadata: { namespace, externalAction: false } } });
      return document;
    });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'This document has already been registered for this company.' }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Document registration failed' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await admin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (body.action !== 'approve') return NextResponse.json({ error: 'Invalid knowledge action' }, { status: 400 });
    const document = await prisma.knowledgeDocument.findFirst({ where: { id: text(body.id, 'document id', 100), companyId: BOOSTA_COMPANY_ID } });
    if (!document || document.ingestionStatus !== 'PENDING_APPROVAL') return NextResponse.json({ error: 'A pending document is required' }, { status: 409 });
    const actor = auth.session!.userId;
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.knowledgeDocument.update({ where: { id: document.id }, data: { ingestionStatus: 'APPROVED', approvedBy: actor, approvedAt: new Date() } });
      await tx.auditEvent.create({ data: { actor, action: 'knowledge.document_approved', target: document.id, result: 'success', metadata: { executionEnabled: false } } });
      return updated;
    });
    return NextResponse.json(row);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Document approval failed' }, { status: 400 }); }
}
