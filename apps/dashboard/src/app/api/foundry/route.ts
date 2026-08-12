import { NextResponse } from "next/server";
import { validateCharter, validateMissionTemplate } from "@foundry/mission";
import { aggregateEconomics, validateEconomicEvent } from "@foundry/cost";
import { getSession, isSameOrigin } from "@/lib/auth";
import prisma from "@/lib/prisma";
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status });
async function admin(request?: Request) {
  const session = await getSession();
  if (!session) return { error: json({ error: "Unauthorized" }, 401) };
  if (session.role !== "ADMIN")
    return { error: json({ error: "Forbidden" }, 403) };
  if (request && !isSameOrigin(request))
    return { error: json({ error: "Invalid origin" }, 403) };
  return { session };
}
const plain = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
export async function GET() {
  const auth = await admin();
  if (auth.error) return auth.error;
  const [charters, templates, streams, events, missions] = await Promise.all([
    prisma.foundryCharter.findMany({ orderBy: { version: "desc" } }),
    prisma.missionTemplate.findMany({
      orderBy: [{ key: "asc" }, { version: "desc" }],
    }),
    prisma.revenueStream.findMany({
      orderBy: { createdAt: "desc" },
      include: { project: { select: { name: true } } },
    }),
    prisma.economicEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: 100,
    }),
    prisma.mission.groupBy({ by: ["economicStatus"], _count: true }),
  ]);
  const currency =
    charters.find((x) => x.status === "active")?.currency || "USD";
  const summary = aggregateEconomics(
    events.map((x) => ({
      type: x.type as any,
      amountMinor: x.amountMinor,
      currency: x.currency,
    })),
    currency,
  );
  return json(
    plain({ charters, templates, streams, events, missions, summary }),
  );
}
export async function POST(request: Request) {
  const auth = await admin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (body.action === "create_charter") {
      const errors = validateCharter(body.charter);
      if (errors.length)
        return json({ error: "Invalid Charter", details: errors }, 400);
      const version =
        (await prisma.foundryCharter.aggregate({ _max: { version: true } }))
          ._max.version || 0;
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.foundryCharter.create({
          data: {
            ...body.charter,
            version: version + 1,
            maxMissionBudgetMinor: BigInt(body.charter.maxMissionBudgetMinor),
            monthlyOperatingBudgetMinor: BigInt(
              body.charter.monthlyOperatingBudgetMinor,
            ),
            monthlyExperimentBudgetMinor: BigInt(
              body.charter.monthlyExperimentBudgetMinor,
            ),
            createdBy: auth.session!.userId,
          },
        });
        await tx.auditEvent.create({
          data: {
            actor: auth.session!.userId,
            action: "charter.drafted",
            target: row.id,
            result: "success",
            metadata: { version: row.version },
          },
        });
        return row;
      });
      return json(plain(created), 201);
    }
    if (body.action === "create_template") {
      const errors = validateMissionTemplate(body.template);
      if (errors.length)
        return json(
          { error: "Invalid Mission Template", details: errors },
          400,
        );
      const latest = await prisma.missionTemplate.findFirst({
        where: { key: body.template.key },
        orderBy: { version: "desc" },
      });
      const created = await prisma.missionTemplate.create({
        data: {
          ...body.template,
          version: (latest?.version || 0) + 1,
          defaultBudgetMinor: BigInt(body.template.defaultBudgetMinor),
          createdBy: auth.session!.userId,
        },
      });
      return json(plain(created), 201);
    }
    if (body.action === "create_stream") {
      if (
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.stream?.key) ||
        !body.stream?.name?.trim()
      )
        return json({ error: "Invalid revenue stream" }, 400);
      const created = await prisma.revenueStream.create({
        data: { ...body.stream, status: "proposed" },
      });
      return json(plain(created), 201);
    }
    if (body.action === "record_event") {
      const errors = validateEconomicEvent(body.event);
      if (errors.length)
        return json({ error: "Invalid economic event", details: errors }, 400);
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.economicEvent.create({
          data: {
            ...body.event,
            amountMinor: BigInt(body.event.amountMinor),
            occurredAt: new Date(body.event.occurredAt),
            recordedBy: auth.session!.userId,
          },
        });
        await tx.auditEvent.create({
          data: {
            actor: auth.session!.userId,
            action: "economics.event_recorded",
            target: row.id,
            result: "success",
            metadata: {
              type: row.type,
              amountMinor: row.amountMinor.toString(),
              currency: row.currency,
            },
          },
        });
        return row;
      });
      return json(plain(created), 201);
    }
    return json({ error: "Invalid foundry action" }, 400);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Foundry request failed",
      },
      400,
    );
  }
}
export async function PATCH(request: Request) {
  const auth = await admin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (body.action === "activate_charter") {
      const result = await prisma.$transaction(async (tx) => {
        const target = await tx.foundryCharter.findUnique({
          where: { id: body.id },
        });
        if (!target || target.status !== "draft")
          throw new Error("Only a draft Charter can be activated");
        const current = await tx.foundryCharter.findFirst({
          where: { status: "active" },
        });
        if (current)
          await tx.foundryCharter.update({
            where: { id: current.id },
            data: { status: "superseded" },
          });
        const row = await tx.foundryCharter.update({
          where: { id: target.id },
          data: {
            status: "active",
            approvedBy: auth.session!.userId,
            approvedAt: new Date(),
            supersedesId: current?.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            actor: auth.session!.userId,
            action: "charter.activated",
            target: row.id,
            result: "success",
            metadata: {
              version: row.version,
              supersededVersion: current?.version,
            },
          },
        });
        return row;
      });
      return json(plain(result));
    }
    if (body.action === "certify_template") {
      const target = await prisma.missionTemplate.findUnique({
        where: { id: body.id },
      });
      if (!target || target.status !== "draft")
        throw new Error("Only a draft template can be certified");
      const row = await prisma.missionTemplate.update({
        where: { id: body.id },
        data: {
          status: "certified",
          certifiedBy: auth.session!.userId,
          certifiedAt: new Date(),
        },
      });
      return json(plain(row));
    }
    if (
      body.action === "stream_status" &&
      ["active", "paused", "retired"].includes(body.status)
    ) {
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.revenueStream.update({
          where: { id: body.id },
          data: { status: body.status },
        });
        await tx.auditEvent.create({
          data: {
            actor: auth.session!.userId,
            action: "revenue_stream." + body.status,
            target: body.id,
            result: "success",
          },
        });
        return updated;
      });
      return json(plain(row));
    }
    return json({ error: "Invalid foundry transition" }, 400);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Foundry transition failed",
      },
      400,
    );
  }
}
