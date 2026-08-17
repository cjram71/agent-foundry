import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { compileMission } from '@foundry/mission';
import { getSession, isSameOrigin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { BOOSTA_COMPANY_ID } from '@/lib/company';
import { campaignMission, campaignMissionCeiling, campaignSource, parseCampaignRequest } from '@/lib/boosta-campaign';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  let sourcePath = '';
  try {
    const campaign = parseCampaignRequest(await request.json());
    const contract = compileMission(campaignMission(campaign, session.userId), campaignMissionCeiling);
    const missionId = randomUUID(), jobId = randomUUID();
    const root = resolve(/* turbopackIgnore: true */ process.env.BOOSTA_WORKSPACE_ROOT || '/srv/boosta');
    const processing = join(root, 'work', 'processing');
    await mkdir(processing, { recursive: true });
    sourcePath = join(processing, `${jobId}-campaign.md`);
    await writeFile(sourcePath, campaignSource(campaign), { encoding: 'utf8', flag: 'wx' });
    const result = await prisma.$transaction(async tx => {
      const mission = await tx.mission.create({ data: { id: missionId, companyId: BOOSTA_COMPANY_ID, ...contract, status: 'active', createdBy: session.userId } });
      const job = await tx.editorialJob.create({ data: { id: jobId, companyId: BOOSTA_COMPANY_ID, missionId, title: campaign.title, sourcePath, destinations: campaign.destinations, targetLanguages: campaign.targetLanguages, instructions: campaign.constraints.join('\n') || null } });
      await tx.missionEvent.create({ data: { missionId, type: 'campaign_requested', actor: session.userId, actorType: 'human', correlationId: jobId, payload: { destinations: campaign.destinations, targetLanguages: campaign.targetLanguages } } });
      await tx.auditEvent.create({ data: { actor: session.userId, action: 'campaign.requested', target: missionId, result: 'success', metadata: { editorialJobId: jobId, destinations: campaign.destinations } } });
      return { mission, job };
    });
    return NextResponse.json({ missionId: result.mission.id, editorialJobId: result.job.id, status: result.job.status }, { status: 201 });
  } catch (error) {
    if (sourcePath) await unlink(sourcePath).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Campaign request failed' }, { status: 400 });
  }
}
