import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession, isSameOrigin } from '@/lib/auth';
import { BOOSTA_COMPANY_ID } from '@/lib/company';
import { generateKnowledge } from '@foundry/knowledge-model';
import { buildExtractionPrompt, parseExtraction } from '@/lib/knowledge/extract';
import { applyExtractionResult } from '@/lib/knowledge/apply';
import { defaultCostLimitMinor, defaultTokenLimit, estimateTokens, postCallOverage, preCallBudgetCheck } from '@/lib/knowledge/budget';

async function admin(request?: Request) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'ADMIN') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (request && !isSameOrigin(request)) return { error: NextResponse.json({ error: 'Invalid origin' }, { status: 403 }) };
  return { session };
}

const EXTRACTION_MODEL = 'orchestrator-knowledge-tier';
const PROMPT_VERSION = 'v1';
const SCHEMA_VERSION = 'v1';

export async function POST(request: Request) {
  const auth = await admin(request);
  if (auth.error) return auth.error;
  const actor = auth.session!.userId;
  try {
    const body = await request.json();
    const documentId = String(body.documentId ?? '').trim();
    if (!documentId) throw new Error('documentId is required');
    const document = await prisma.knowledgeDocument.findFirst({ where: { id: documentId, companyId: BOOSTA_COMPANY_ID } });
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    if (document.ingestionStatus !== 'APPROVED') return NextResponse.json({ error: 'Document must be approved before extraction' }, { status: 409 });

    const tokenLimit = defaultTokenLimit();
    const costLimitMinor = defaultCostLimitMinor();
    const estimatedTokens = estimateTokens(document.content);
    const budget = await preCallBudgetCheck(BOOSTA_COMPANY_ID, estimatedTokens, tokenLimit, costLimitMinor);
    if (!budget.allowed) {
      const rejected = await prisma.knowledgeExtractionRun.create({ data: { companyId: BOOSTA_COMPANY_ID, documentId: document.id, model: EXTRACTION_MODEL, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION, tokenLimit, costLimitMinor, status: 'FAILED', errorMessage: budget.reason, createdBy: actor } });
      await prisma.auditEvent.create({ data: { actor, action: 'knowledge.extraction_rejected', target: rejected.id, result: 'rejected', metadata: { reason: budget.reason, executionEnabled: false } } });
      return NextResponse.json({ error: budget.reason, run: rejected }, { status: 429 });
    }

    const run = await prisma.knowledgeExtractionRun.create({ data: { companyId: BOOSTA_COMPANY_ID, documentId: document.id, model: EXTRACTION_MODEL, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION, tokenLimit, costLimitMinor, status: 'PENDING', createdBy: actor } });

    let generation;
    try {
      const prompt = buildExtractionPrompt(document);
      generation = await generateKnowledge(prompt, 'private-analysis', (text) => { parseExtraction(text); });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Extraction model call failed';
      await prisma.knowledgeExtractionRun.update({ where: { id: run.id }, data: { status: 'FAILED', errorMessage: message, completedAt: new Date() } });
      await prisma.auditEvent.create({ data: { actor, action: 'knowledge.extraction_failed', target: run.id, result: 'failed', metadata: { reason: message, executionEnabled: false } } });
      return NextResponse.json({ error: message, run: { id: run.id, status: 'FAILED' } }, { status: 502 });
    }

    const overageReason = postCallOverage(generation.tokens, tokenLimit, costLimitMinor);
    if (overageReason) {
      await prisma.knowledgeExtractionRun.update({ where: { id: run.id }, data: { status: 'FAILED', errorMessage: overageReason, outcome: { tokensUsed: generation.tokens, provider: generation.provider, model: generation.model }, completedAt: new Date() } });
      await prisma.auditEvent.create({ data: { actor, action: 'knowledge.extraction_overage', target: run.id, result: 'rejected', metadata: { reason: overageReason, executionEnabled: false } } });
      return NextResponse.json({ error: overageReason, run: { id: run.id, status: 'FAILED' } }, { status: 429 });
    }

    const parsed = parseExtraction(generation.text);
    const result = await prisma.$transaction((tx) => applyExtractionResult(tx, { companyId: BOOSTA_COMPANY_ID, document, runId: run.id, actor, parsed, generation: generation! }));

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Extraction failed' }, { status: 400 });
  }
}
