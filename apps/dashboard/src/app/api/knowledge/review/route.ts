import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession, isSameOrigin } from '@/lib/auth';
import { BOOSTA_COMPANY_ID } from '@/lib/company';

async function admin(request?: Request) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'ADMIN') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (request && !isSameOrigin(request)) return { error: NextResponse.json({ error: 'Invalid origin' }, { status: 403 }) };
  return { session };
}
const text = (value: unknown, field: string, limit: number) => {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(field + ' is required');
  if (result.length > limit) throw new Error(field + ' is too long');
  return result;
};

/**
 * This route is the ONLY code path that ever moves WorldEntity/WorldRelation
 * .validationStatus or KnowledgeEvidence.reviewStatus away from PROPOSED.
 * The evaluator (lib/knowledge/evaluate.ts) is advisory display data only —
 * it never writes to these fields. That split is what makes "model
 * confidence never makes a fact trusted" true in code, not just policy.
 */
export async function PATCH(request: Request) {
  const auth = await admin(request);
  if (auth.error) return auth.error;
  const actor = auth.session!.userId;
  try {
    const body = await request.json();

    if (body.action === 'approve_entity' || body.action === 'reject_entity') {
      const id = text(body.id, 'entity id', 100);
      const entity = await prisma.worldEntity.findFirst({ where: { id, companyId: BOOSTA_COMPANY_ID } });
      if (!entity || entity.validationStatus !== 'PROPOSED') return NextResponse.json({ error: 'A proposed entity is required' }, { status: 409 });
      const decision = body.action === 'approve_entity' ? 'APPROVED' : 'REJECTED';
      const reviewStatus = body.action === 'approve_entity' ? 'HUMAN_APPROVED' : 'HUMAN_REJECTED';
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.worldEntity.update({ where: { id }, data: { validationStatus: decision } });
        await tx.knowledgeEvidence.updateMany({ where: { entityId: id }, data: { reviewStatus, reviewedBy: actor, reviewedAt: new Date() } });
        await tx.auditEvent.create({ data: { actor, action: 'knowledge.entity_reviewed', target: id, result: 'success', metadata: { decision, externalAction: false } } });
        return updated;
      });
      return NextResponse.json(row);
    }

    if (body.action === 'approve_relation' || body.action === 'reject_relation') {
      const id = text(body.id, 'relation id', 100);
      const relation = await prisma.worldRelation.findFirst({ where: { id, companyId: BOOSTA_COMPANY_ID } });
      if (!relation || relation.validationStatus !== 'PROPOSED') return NextResponse.json({ error: 'A proposed relation is required' }, { status: 409 });
      const decision = body.action === 'approve_relation' ? 'APPROVED' : 'REJECTED';
      const reviewStatus = body.action === 'approve_relation' ? 'HUMAN_APPROVED' : 'HUMAN_REJECTED';
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.worldRelation.update({ where: { id }, data: { validationStatus: decision } });
        await tx.knowledgeEvidence.updateMany({ where: { relationId: id }, data: { reviewStatus, reviewedBy: actor, reviewedAt: new Date() } });
        await tx.auditEvent.create({ data: { actor, action: 'knowledge.relation_reviewed', target: id, result: 'success', metadata: { decision, externalAction: false } } });
        return updated;
      });
      return NextResponse.json(row);
    }

    if (body.action === 'link_alias') {
      const id = text(body.id, 'alias id', 100);
      const entityId = text(body.entityId, 'entity id', 100);
      const [alias, entity] = await Promise.all([
        prisma.knowledgeAlias.findFirst({ where: { id, companyId: BOOSTA_COMPANY_ID } }),
        prisma.worldEntity.findFirst({ where: { id: entityId, companyId: BOOSTA_COMPANY_ID } }),
      ]);
      if (!alias) return NextResponse.json({ error: 'Alias not found' }, { status: 404 });
      if (!entity) return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.knowledgeAlias.update({ where: { id }, data: { entityId, resolutionStatus: 'RESOLVED' } });
        await tx.auditEvent.create({ data: { actor, action: 'knowledge.alias_linked', target: id, result: 'success', metadata: { entityId, externalAction: false } } });
        return updated;
      });
      return NextResponse.json(row);
    }

    if (body.action === 'confirm_unmatched') {
      const id = text(body.id, 'alias id', 100);
      const alias = await prisma.knowledgeAlias.findFirst({ where: { id, companyId: BOOSTA_COMPANY_ID } });
      if (!alias) return NextResponse.json({ error: 'Alias not found' }, { status: 404 });
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.knowledgeAlias.update({ where: { id }, data: { entityId: null, resolutionStatus: 'UNMATCHED' } });
        await tx.auditEvent.create({ data: { actor, action: 'knowledge.alias_confirmed_unmatched', target: id, result: 'success', metadata: { externalAction: false } } });
        return updated;
      });
      return NextResponse.json(row);
    }

    return NextResponse.json({ error: 'Invalid knowledge review action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Review action failed' }, { status: 400 });
  }
}
