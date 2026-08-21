import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const workspace = await prisma.boostaWorkspace.findUnique({
    where: { id: "BSTA-WORKSPACE-001" },
    include: {
      brainVersions: { orderBy: { version: "desc" }, take: 5 },
      books: { include: { author: true, submissions: true } },
      roles: true, artifacts: { orderBy: { createdAt: "desc" }, take: 20 },
      reviews: { orderBy: { createdAt: "desc" }, take: 20 },
      approvals: { orderBy: { requestedAt: "desc" }, take: 30 },
      subscribers: { orderBy: { createdAt: "desc" }, take: 20 },
      experiments: { orderBy: { createdAt: "desc" } }, offers: { orderBy: { createdAt: "desc" } },
      weeklyReviews: { orderBy: { weekStart: "desc" }, take: 12 },
      revenueAttributions: { orderBy: { occurredAt: "desc" }, take: 100 },
    },
  });
  if (!workspace) return NextResponse.json({ error: "workspace_not_seeded" }, { status: 404 });
  const revenue = workspace.revenueAttributions.reduce((sum, item) => sum + Number(item.netMinor), 0);
  const confirmedRevenue = workspace.revenueAttributions.filter((item) => item.paymentStatus === "CONFIRMED").reduce((sum, item) => sum + Number(item.netMinor), 0);
  return NextResponse.json({
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, brainSummary: workspace.brainSummary },
    books: workspace.books.map((book) => ({ ...book, priceMinor: book.priceMinor ? Number(book.priceMinor) : null })),
    roles: workspace.roles,
    counts: { pendingApprovals: workspace.approvals.filter((approval) => approval.decision === "PENDING").length, artifacts: workspace.artifacts.length, subscribersWithConsent: workspace.subscribers.filter((subscriber) => subscriber.consentStatus === "GRANTED" && !subscriber.unsubscribedAt).length, experiments: workspace.experiments.length, submissions: workspace.books.reduce((sum, book) => sum + book.submissions.length, 0) },
    revenue: { netMinor: revenue, confirmedNetMinor: confirmedRevenue, actualOnly: confirmedRevenue },
    approvals: workspace.approvals, artifacts: workspace.artifacts, reviews: workspace.reviews,
    experiments: workspace.experiments.map((experiment) => ({ ...experiment, dailyBudgetMinor: Number(experiment.dailyBudgetMinor), totalBudgetMinor: Number(experiment.totalBudgetMinor), spendMinor: Number(experiment.spendMinor) })),
    offers: workspace.offers.map((offer) => ({ ...offer, priceMinor: offer.priceMinor ? Number(offer.priceMinor) : null })),
    weeklyReviews: workspace.weeklyReviews.map((review) => ({ ...review, revenueMinor: Number(review.revenueMinor), adSpendMinor: Number(review.adSpendMinor) })),
    canApprove: isAdmin(session),
  });
}
