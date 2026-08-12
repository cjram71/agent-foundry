import { requireDashboardAdmin } from "@/lib/dashboard/auth";
import prisma from "@/lib/prisma";
import { OpsPage } from "@/components/ops-shell";
import { TeamBuilderControls } from "./team-builder-controls";
export const dynamic = "force-dynamic";
export default async function TeamBuilderPage() {
  await requireDashboardAdmin();
  const [projects, versions, assignments, charter] = await Promise.all([
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
    prisma.foundryCharter.findFirst({
      where: { status: "active" },
      select: { version: true, name: true },
    }),
  ]);
  const initial = JSON.parse(
    JSON.stringify({ projects, versions, assignments, charter }),
  );
  return (
    <OpsPage
      eyebrow="INTELLIGENCE"
      title="Agent Team Builder"
      description="Define one-job agents, supervise real runs, certify proven behavior, then optionally schedule it."
    >
      <TeamBuilderControls initial={initial} />
    </OpsPage>
  );
}
