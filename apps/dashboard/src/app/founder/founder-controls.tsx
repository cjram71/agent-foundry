"use client";
import { useState } from "react";
const approvals = [
  "customer_commitment",
  "public_representation",
  "financial_action",
  "production_deployment",
  "legal_commitment",
];
async function call(method: string, body: unknown) {
  const r = await fetch("/api/foundry", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    x = await r.json();
  if (!r.ok)
    throw new Error(x.error + (x.details ? " — " + x.details.join("; ") : ""));
  location.reload();
}
export function FounderControls({ initial }: { initial: any }) {
  const [message, setMessage] = useState("");
  const run = (work: () => Promise<void>) =>
    work().catch((e) => setMessage(e.message));
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Foundry Charter</h2>
            <p>
              Only a human administrator can activate a version. Historical
              mission linkage never changes.
            </p>
          </div>
        </div>
        {initial.charters.map((x: any) => (
          <div className="list-row" key={x.id}>
            <span>
              <strong>
                v{x.version} · {x.name}
              </strong>
              <small>
                {x.status} · {x.currency} · mission ceiling{" "}
                {x.maxMissionBudgetMinor} minor units
              </small>
            </span>
            {x.status === "draft" ? (
              <button
                className="button primary"
                onClick={() =>
                  confirm(
                    "Activate this Charter and supersede the current version?",
                  ) &&
                  run(() =>
                    call("PATCH", { action: "activate_charter", id: x.id }),
                  )
                }
              >
                Activate
              </button>
            ) : (
              <span className="badge">{x.status}</span>
            )}
          </div>
        ))}
      </section>
      <section className="grid-two">
        <form
          className="panel form"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            run(() =>
              call("POST", {
                action: "create_charter",
                charter: {
                  name: d.get("name"),
                  goal: d.get("goal"),
                  constraints: [
                    "Every revenue stream has rollback and measurement",
                  ],
                  allowedToolClasses: [
                    "research",
                    "code_generation",
                    "design_draft",
                    "content_creation",
                    "outreach_automation",
                    "accounting_tracking",
                  ],
                  requiredApprovalRules: approvals,
                  maxMissionBudgetMinor: Number(d.get("missionBudget")),
                  monthlyOperatingBudgetMinor: Number(d.get("opBudget")),
                  monthlyExperimentBudgetMinor: Number(
                    d.get("experimentBudget"),
                  ),
                  currency: d.get("currency"),
                  defaultTokenBudget: 150000,
                  hardTokenCeiling: 500000,
                  maxParallelMissions: 5,
                  reviewIntervalDays: 30,
                },
              }),
            );
          }}
        >
          <h2>Draft Charter</h2>
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            Goal
            <textarea name="goal" required rows={4} />
          </label>
          <label>
            Mission ceiling (minor units)
            <input
              name="missionBudget"
              type="number"
              defaultValue="5000"
              min="0"
            />
          </label>
          <label>
            Monthly operations
            <input name="opBudget" type="number" defaultValue="50000" min="0" />
          </label>
          <label>
            Monthly experiments
            <input
              name="experimentBudget"
              type="number"
              defaultValue="20000"
              min="0"
            />
          </label>
          <label>
            Currency
            <input name="currency" defaultValue="USD" maxLength={3} />
          </label>
          <button className="button primary">Create draft</button>
        </form>
        <form
          className="panel form"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            run(() =>
              call("POST", {
                action: "record_event",
                event: {
                  type: d.get("type"),
                  amountMinor: Number(d.get("amount")),
                  currency: d.get("currency"),
                  category: d.get("category"),
                  source: d.get("source"),
                  externalReference: d.get("reference") || undefined,
                  attributionMethod: "manual",
                  idempotencyKey: d.get("key"),
                  occurredAt: new Date().toISOString(),
                },
              }),
            );
          }}
        >
          <h2>Record economic event</h2>
          <label>
            Type
            <select name="type">
              <option>cost</option>
              <option>revenue</option>
              <option>refund</option>
              <option>fee</option>
              <option>credit</option>
            </select>
          </label>
          <label>
            Amount (minor units)
            <input name="amount" type="number" min="1" required />
          </label>
          <label>
            Currency
            <input name="currency" defaultValue="USD" />
          </label>
          <label>
            Category
            <input name="category" required />
          </label>
          <label>
            Source
            <input name="source" required />
          </label>
          <label>
            Evidence reference
            <input name="reference" />
          </label>
          <label>
            Idempotency key
            <input name="key" required />
          </label>
          <button className="button primary">Record append-only event</button>
        </form>
      </section>
      <section className="panel">
        <h2>Revenue streams</h2>
        {initial.streams.length ? (
          initial.streams.map((x: any) => (
            <div className="list-row" key={x.id}>
              <span>
                <strong>{x.name}</strong>
                <small>
                  {x.pricingModel} · {x.currency}
                </small>
              </span>
              <span className="badge">{x.status}</span>
            </div>
          ))
        ) : (
          <div className="empty">No revenue streams recorded.</div>
        )}
      </section>
      {message ? <div className="notice error">{message}</div> : null}
    </div>
  );
}
