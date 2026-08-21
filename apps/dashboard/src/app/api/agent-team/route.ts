import { NextResponse } from "next/server";
import { createHash } from 'node:crypto';
import { transitionTask, emitTaskEvent } from '@foundry/state-machine';
import type { AgentManifest } from "@foundry/agent-contracts";
import { certificationReadiness } from "@foundry/agent-contracts";
import { starterAgentTemplates } from "@foundry/agent-contracts";
import { stageAgentVersion } from "@/lib/agent-registry";
import { redactForModel } from "@foundry/memory-policy";
import { requireApiAdmin as admin } from "@/lib/dashboard/auth";
import prisma from "@/lib/prisma";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Agent Team request failed";

export async function GET() {
  const auth = await admin();
  if (auth.error) return auth.error;
  const [projects, versions, assignments] = await Promise.all([
    prisma.project.findMany({
      where: { authorisedStatus: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.agentVersion.findMany({
      where: { status: { in: ["STAGING", "ACTIVE"] } },
      orderBy: [{ agentId: "asc" }, { createdAt: "desc" }],
      include: { agent: { select: { name: true, mission: true } } },
    }),
    prisma.projectAgent.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true } },
        agentVersion: { include: { agent: { select: { name: true } } } },
        reports: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    }),
  ]);
  return NextResponse.json({ projects, versions, assignments });
}

export async function POST(request: Request) {
  const auth = await admin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (body.action === "install_starters") {
      const installed = [];
      for (const manifest of starterAgentTemplates) {
        const exists = await prisma.agentVersion.findUnique({
          where: {
            agentId_version: {
              agentId: manifest.id,
              version: manifest.version,
            },
          },
        });
        if (exists) continue;
        const version = await stageAgentVersion(
          prisma,
          manifest,
          auth.session!.userId,
        );
        installed.push({
          id: version.id,
          agentId: manifest.id,
          version: manifest.version,
        });
      }
      return NextResponse.json({ installed }, { status: 201 });
    }
    if (body.action === "assign") {
      const [project, version, charter] = await Promise.all([
        prisma.project.findUnique({ where: { id: body.projectId } }),
        prisma.agentVersion.findUnique({ where: { id: body.agentVersionId } }),
        prisma.foundryCharter.findFirst({ where: { status: "active" } }),
      ]);
      if (!project?.authorisedStatus)
        throw new Error("An authorized project is required");
      if (!version || !["STAGING", "ACTIVE"].includes(version.status))
        throw new Error("A staged or active agent version is required");
      if (!charter) throw new Error("An active Foundry Charter is required");
      const manifest = version.manifest as unknown as AgentManifest;
      if (!manifest.contract) throw new Error("Agent Contract v2 is required");
      const assignment = await prisma.$transaction(async (tx) => {
        const row = await tx.projectAgent.create({
          data: {
            projectId: project.id,
            agentVersionId: version.id,
            charterVersion: charter.version,
            createdBy: auth.session!.userId,
          },
        });
        await tx.auditEvent.create({
          data: {
            actor: auth.session!.userId,
            action: "agent_team.assigned",
            target: row.id,
            result: "success",
            metadata: {
              projectId: project.id,
              agentId: version.agentId,
              version: version.version,
              charterVersion: charter.version,
            },
          },
        });
        return row;
      });
      return NextResponse.json(assignment, { status: 201 });
    }
    if (body.action === "record_report") {
      const assignment = await prisma.projectAgent.findUnique({
        where: { id: body.projectAgentId },
      });
      if (!assignment || assignment.status !== "supervised")
        throw new Error(
          "Reports can only be added during supervised operation",
        );
      const fields = [
        "completed",
        "waitingForApproval",
        "uncertain",
        "evidence",
      ] as const;
      for (const field of fields)
        if (
          !Array.isArray(body[field]) ||
          body[field].some((x: unknown) => typeof x !== "string")
        )
          throw new Error(`${field} must be a string array`);
      const redacted = redactForModel(body.memoryCandidates ?? []);
      const startedAt = new Date(body.startedAt);
      const completedAt = new Date(body.completedAt);
      if (
        !Number.isFinite(startedAt.getTime()) ||
        !Number.isFinite(completedAt.getTime()) ||
        completedAt < startedAt
      )
        throw new Error("Valid report timestamps are required");
      const report = await prisma.$transaction(async (tx) => {
        const row = await tx.agentRunReport.create({
          data: {
            projectAgentId: assignment.id,
            taskId: typeof body.taskId === "string" ? body.taskId : null,
            completed: body.completed,
            waitingForApproval: body.waitingForApproval,
            uncertain: body.uncertain,
            evidence: body.evidence,
            memoryCandidates: JSON.parse(
              JSON.stringify({
                redacted: redacted.value,
                findings: redacted.findings,
              }),
            ),
            startedAt,
            completedAt,
          },
        });
        await tx.projectAgent.update({
          where: { id: assignment.id },
          data: { supervisedRuns: { increment: 1 } },
        });
        await tx.auditEvent.create({
          data: {
            actor: auth.session!.userId,
            action: "agent_team.report_recorded",
            target: row.id,
            result: "success",
            metadata: {
              projectAgentId: assignment.id,
              redactions: redacted.findings.length,
            },
          },
        });
        return row;
      });
      return NextResponse.json(report, { status: 201 });
    }
    return NextResponse.json(
      { error: "Invalid Agent Team action" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await admin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (body.action === "review_report") {
      if (typeof body.accepted !== "boolean")
        throw new Error("accepted must be boolean");
      const report = await prisma.agentRunReport.findUnique({
        where: { id: body.id },
        include: { projectAgent: true },
      });
      if (!report || report.accepted !== null)
        throw new Error("An unreviewed report is required");
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.agentRunReport.update({
          where: { id: report.id },
          data: {
            accepted: body.accepted,
            reviewNotes: String(body.reviewNotes ?? "").slice(0, 4000),
            reviewedBy: auth.session!.userId,
            reviewedAt: new Date(),
          },
        });
        if (body.accepted)
          await tx.projectAgent.update({
            where: { id: report.projectAgentId },
            data: { acceptedRuns: { increment: 1 } },
          });
        if (report.taskId) {
          const task = await tx.task.findUnique({ where: { id: report.taskId } });
          if (task?.state === 'AWAITING_APPROVAL') {
            await transitionTask(tx, { taskId: task.id, to: body.accepted ? 'COMPLETED' : 'CHANGES_REQUESTED', actor: auth.session!.userId, actorType: 'human', reason: body.accepted ? 'supervised agent run accepted' : 'supervised agent run rejected for revision', legacyStatus: body.accepted ? 'completed' : 'awaiting_human_review', extraTaskData: body.accepted ? { completedAt: new Date() } : undefined });
            await tx.approval.updateMany({ where: { taskId: task.id, approvalType: 'agent_run', decision: 'pending' }, data: { decision: body.accepted ? 'approved' : 'changes_requested', approvedBy: auth.session!.userId, approvedAt: new Date(), comments: String(body.reviewNotes ?? '').slice(0, 2000) } });
            await emitTaskEvent(tx, { taskId: task.id, type: body.accepted ? 'task_completed' : 'final_rejected', actor: auth.session!.userId, actorType: 'human', payload: { via: 'supervised_agent_review', reportId: report.id } });
          }
        }
        if (body.accepted && Array.isArray(report.memoryCandidates)) {
          for (const candidate of report.memoryCandidates.slice(0, 10)) {
            if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
            const item = candidate as Record<string, unknown>;
            if (typeof item.summary !== 'string' || typeof item.content !== 'string' || typeof item.sourceReference !== 'string') continue;
            const serialized = JSON.stringify({ summary: item.summary, content: item.content });
            const contentHash = createHash('sha256').update(serialized).digest('hex');
            await tx.memoryRecord.upsert({
              where: { contentHash_scopeType_scopeId: { contentHash, scopeType: 'PROJECT', scopeId: report.projectAgent.projectId } },
              create: { kind: 'SEMANTIC', status: 'CANDIDATE', agentId: report.projectAgentId, projectId: report.projectAgent.projectId, scopeType: 'PROJECT', scopeId: report.projectAgent.projectId, summary: item.summary.slice(0, 1000), content: JSON.parse(JSON.stringify({ text: item.content, sourceReference: item.sourceReference })), contentHash, provenance: `agent-run-report:${report.id}`, source: 'governed-agent', confidence: typeof item.confidence === 'number' ? item.confidence : null, trustLevel: 'untrusted', sensitivity: 'INTERNAL', retentionUntil: new Date(Date.now() + 365 * 86400000), reviewAt: new Date() },
              update: {},
            });
          }
        }
        await tx.auditEvent.create({
          data: {
            actor: auth.session!.userId,
            action: body.accepted
              ? "agent_team.run_accepted"
              : "agent_team.run_rejected",
            target: report.id,
            result: "success",
          },
        });
        return row;
      });
      return NextResponse.json(updated);
    }
    if (body.action === "certify") {
      const assignment = await prisma.projectAgent.findUnique({
        where: { id: body.id },
        include: { agentVersion: true },
      });
      const charter = await prisma.foundryCharter.findFirst({
        where: { status: "active" },
      });
      if (!assignment || assignment.status !== "supervised")
        throw new Error("A supervised agent is required");
      const readiness = certificationReadiness(
        assignment.agentVersion.manifest as unknown as AgentManifest,
        {
          supervisedRuns: assignment.supervisedRuns,
          acceptedRuns: assignment.acceptedRuns,
          requiredTestsPassed: assignment.requiredTestsPassed,
          securityReviewPassed: assignment.securityReviewPassed,
          charterCompliant: Boolean(
            charter && assignment.charterVersion === charter.version,
          ),
        },
      );
      if (!readiness.ready)
        return NextResponse.json(
          {
            error: "Agent is not ready for certification",
            details: readiness.reasons,
          },
          { status: 409 },
        );
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.projectAgent.update({
          where: { id: assignment.id },
          data: {
            status: "certified",
            certifiedBy: auth.session!.userId,
            certifiedAt: new Date(),
          },
        });
        await tx.auditEvent.create({
          data: {
            actor: auth.session!.userId,
            action: "agent_team.certified",
            target: assignment.id,
            result: "success",
            metadata: { charterVersion: assignment.charterVersion },
          },
        });
        return updated;
      });
      return NextResponse.json(row);
    }
    if (body.action === "evidence") {
      const row = await prisma.projectAgent.update({
        where: { id: body.id, status: "supervised" },
        data: {
          requiredTestsPassed: body.requiredTestsPassed === true,
          securityReviewPassed: body.securityReviewPassed === true,
        },
      });
      return NextResponse.json(row);
    }
    if (
      body.action === "lifecycle" &&
      ["paused", "retired"].includes(body.status)
    ) {
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.projectAgent.update({
          where: { id: body.id },
          data: {
            status: body.status,
            scheduleEnabled: false,
            pausedAt: body.status === "paused" ? new Date() : undefined,
            retiredAt: body.status === "retired" ? new Date() : undefined,
          },
        });
        await tx.auditEvent.create({
          data: {
            actor: auth.session!.userId,
            action: `agent_team.${body.status}`,
            target: body.id,
            result: "success",
          },
        });
        return updated;
      });
      return NextResponse.json(row);
    }
    if (body.action === "schedule") {
      const assignment = await prisma.projectAgent.findUnique({
        where: { id: body.id },
      });
      if (!assignment || assignment.status !== "certified")
        throw new Error("Only a certified agent can be scheduled");
      const expression = String(body.scheduleExpression ?? "").trim();
      if (!expression || expression.length > 120)
        throw new Error("A bounded schedule expression is required");
      const row = await prisma.projectAgent.update({
        where: { id: assignment.id },
        data: {
          scheduleEnabled: body.enabled === true,
          scheduleExpression: expression,
        },
      });
      return NextResponse.json(row);
    }
    return NextResponse.json(
      { error: "Invalid Agent Team transition" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}
