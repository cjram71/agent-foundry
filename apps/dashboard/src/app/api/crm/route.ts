import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { BOOSTA_COMPANY_ID } from '@/lib/company';
import { requireApiAdmin as admin } from '@/lib/dashboard/auth';
import { text } from '@/lib/validation';

export async function GET() {
  const auth = await admin();
  if (auth.error) return auth.error;
  const contacts = await prisma.crmContact.findMany({ where: { companyId: BOOSTA_COMPANY_ID }, orderBy: { updatedAt: 'desc' }, include: { customerAccount: { select: { accountName: true } }, activities: { orderBy: { occurredAt: 'desc' }, take: 3 }, agentTasks: { orderBy: { updatedAt: 'desc' }, take: 3 } } });
  await prisma.auditEvent.create({ data: { actor: auth.session!.userId, action: 'crm.department_accessed', target: BOOSTA_COMPANY_ID, result: 'success', metadata: { scope: 'crm', contacts: contacts.length, externalAction: false } } });
  return NextResponse.json(contacts);
}

export async function POST(request: Request) {
  const auth = await admin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const actor = auth.session!.userId;
    if (body.action === 'create_contact') {
      const email = text(body.email, 'email', 320, false).toLowerCase() || null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email is required');
      const row = await prisma.$transaction(async (tx) => {
        const contact = await tx.crmContact.create({ data: { companyId: BOOSTA_COMPANY_ID, firstName: text(body.firstName, 'first name', 120), lastName: text(body.lastName, 'last name', 120), email, title: text(body.title, 'title', 200, false) || null, lifecycleStage: 'LEAD', source: 'HUMAN_ENTERED', consentStatus: 'UNKNOWN', owner: text(body.owner, 'owner', 160), createdBy: actor } });
        await tx.auditEvent.create({ data: { actor, action: 'crm.contact_created', target: contact.id, result: 'success', metadata: { source: 'human', externalAction: false, emailStored: Boolean(email) } } });
        return contact;
      });
      return NextResponse.json(row, { status: 201 });
    }
    if (body.action === 'record_activity') {
      const contact = await prisma.crmContact.findFirst({ where: { id: text(body.contactId, 'contact id', 100), companyId: BOOSTA_COMPANY_ID } });
      if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      const row = await prisma.$transaction(async (tx) => {
        const activity = await tx.crmActivity.create({ data: { companyId: BOOSTA_COMPANY_ID, contactId: contact.id, type: text(body.type, 'activity type', 80), summary: text(body.summary, 'summary', 4000), source: 'HUMAN_ENTERED', createdBy: actor } });
        await tx.auditEvent.create({ data: { actor, action: 'crm.activity_recorded', target: activity.id, result: 'success', metadata: { contactId: contact.id, externalAction: false } } });
        return activity;
      });
      return NextResponse.json(row, { status: 201 });
    }
    if (body.action === 'draft_agent_task') {
      const contactId = text(body.contactId, 'contact id', 100, false) || null;
      if (contactId && !await prisma.crmContact.findFirst({ where: { id: contactId, companyId: BOOSTA_COMPANY_ID } })) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      const agentId = text(body.agentId, 'agent id', 100);
      if (!['BSTA-CRM-001', 'BSTA-CRM-002'].includes(agentId)) throw new Error('Unknown CRM agent');
      const row = await prisma.$transaction(async (tx) => {
        const task = await tx.crmAgentTask.create({ data: { companyId: BOOSTA_COMPANY_ID, contactId, agentId, taskType: text(body.taskType, 'task type', 100), instruction: text(body.instruction, 'instruction', 4000), status: 'DRAFT', requiresApproval: true, createdBy: actor } });
        await tx.auditEvent.create({ data: { actor, action: 'crm.agent_task_drafted', target: task.id, result: 'success', metadata: { agentId, approvalRequired: true, externalAction: false } } });
        return task;
      });
      return NextResponse.json(row, { status: 201 });
    }
    return NextResponse.json({ error: 'Invalid CRM action' }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'CRM request failed' }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  const auth = await admin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (body.action !== 'approve_agent_task') return NextResponse.json({ error: 'Invalid CRM action' }, { status: 400 });
    const task = await prisma.crmAgentTask.findFirst({ where: { id: text(body.id, 'task id', 100), companyId: BOOSTA_COMPANY_ID } });
    if (!task || task.status !== 'DRAFT') return NextResponse.json({ error: 'A draft CRM task is required' }, { status: 409 });
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.crmAgentTask.update({ where: { id: task.id }, data: { status: 'APPROVED', approvedBy: auth.session!.userId, approvedAt: new Date() } });
      await tx.auditEvent.create({ data: { actor: auth.session!.userId, action: 'crm.agent_task_approved', target: task.id, result: 'success', metadata: { agentId: task.agentId, executionEnabled: false, externalAction: false } } });
      return updated;
    });
    return NextResponse.json(row);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'CRM update failed' }, { status: 400 }); }
}
