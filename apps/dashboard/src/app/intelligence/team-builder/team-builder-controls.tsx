"use client";
import { useState } from "react";
async function call(method: string, body: unknown) {
  const response = await fetch("/api/agent-team", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error + (result.details ? ` — ${result.details.join("; ")}` : ""),
    );
  location.reload();
}
export function TeamBuilderControls({ initial }: { initial: any }) {
  const [error, setError] = useState("");
  const run = (work: () => Promise<void>) => {
    setError("");
    void work().catch((reason) => setError(reason.message));
  };
  const v2 = initial.versions.filter(
    (version: any) => version.manifest?.contract,
  );
  return (
    <div className="page-stack">
      {!initial.charter ? (
        <div className="notice error">
          Activate a Foundry Charter before assigning agents to projects.
        </div>
      ) : (
        <div className="notice">
          Governed by {initial.charter.name} v{initial.charter.version}
        </div>
      )}
      <section className="grid-two">
        <div className="panel form">
          <h2>Starter roster</h2>
          <p>
            Install four governed templates derived from the playbook: Research
            Scout, Weekly Ledger, Meeting Notes, and Content Repurposer.
          </p>
          <button
            className="button primary"
            onClick={() =>
              run(() => call("POST", { action: "install_starters" }))
            }
          >
            Install missing starter agents
          </button>
        </div>
        <form
          className="panel form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(() =>
              call("POST", {
                action: "assign",
                projectId: data.get("projectId"),
                agentVersionId: data.get("agentVersionId"),
              }),
            );
          }}
        >
          <h2>Add agent to a project</h2>
          <label>
            Authorized project
            <select name="projectId" required>
              {initial.projects.map((project: any) => (
                <option value={project.id} key={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Agent Contract v2
            <select name="agentVersionId" required>
              {v2.map((version: any) => (
                <option value={version.id} key={version.id}>
                  {version.agent.name} · {version.version}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button primary"
            disabled={!initial.charter || !v2.length}
          >
            Begin supervised onboarding
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Available Agent Contracts</h2>
            <p>
              Each agent has one job, explicit exclusions, bounded execution,
              and candidate-only learning.
            </p>
          </div>
        </div>
        {v2.map((version: any) => {
          const contract = version.manifest.contract;
          return (
            <div className="list-row" key={version.id}>
              <span>
                <strong>
                  {version.agent.name} · {version.version}
                </strong>
                <small>{contract.oneJob}</small>
                <small>Never: {contract.exclusions.join(" · ")}</small>
              </span>
              <span className="badge">
                {contract.supervisedTrialsRequired} trials ·{" "}
                {(contract.minimumAcceptanceRate * 100).toFixed(0)}%
              </span>
            </div>
          );
        })}
        {!v2.length ? (
          <div className="empty">
            Install the starter roster or stage an Agent Contract v2.
          </div>
        ) : null}
      </section>
      <section className="panel">
        <h2>Project team</h2>
        {initial.assignments.map((assignment: any) => {
          const contract = assignment.agentVersion.manifest?.contract;
          const rate = assignment.supervisedRuns
            ? Math.round(
                (assignment.acceptedRuns / assignment.supervisedRuns) * 100,
              )
            : 0;
          return (
            <div
              className="panel"
              key={assignment.id}
              style={{ marginTop: 12 }}
            >
              <div className="panel-head">
                <div>
                  <h3>
                    {assignment.agentVersion.agent.name} →{" "}
                    {assignment.project.name}
                  </h3>
                  <p>
                    {assignment.status} · {assignment.acceptedRuns}/
                    {assignment.supervisedRuns} accepted ({rate}%) · Charter v
                    {assignment.charterVersion}
                  </p>
                </div>
                <span className="badge">
                  {contract ? "Contract v2" : "Legacy"}
                </span>
              </div>
              {assignment.status === "supervised" ? (
                <div className="button-row">
                  <button
                    className="button"
                    onClick={() =>
                      run(() =>
                        call("PATCH", {
                          action: "evidence",
                          id: assignment.id,
                          requiredTestsPassed: true,
                          securityReviewPassed: true,
                        }),
                      )
                    }
                  >
                    Record test + security evidence
                  </button>
                  <button
                    className="button primary"
                    onClick={() =>
                      run(() =>
                        call("PATCH", { action: "certify", id: assignment.id }),
                      )
                    }
                  >
                    Certify when ready
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      run(() =>
                        call("PATCH", {
                          action: "lifecycle",
                          id: assignment.id,
                          status: "retired",
                        }),
                      )
                    }
                  >
                    Retire
                  </button>
                </div>
              ) : assignment.status === "certified" ? (
                <div className="button-row">
                  <button
                    className="button"
                    onClick={() =>
                      run(() =>
                        call("PATCH", {
                          action: "lifecycle",
                          id: assignment.id,
                          status: "paused",
                        }),
                      )
                    }
                  >
                    Pause
                  </button>
                </div>
              ) : null}
              {assignment.reports.map((report: any) => (
                <div className="list-row" key={report.id}>
                  <span>
                    <strong>
                      {report.completed.join(" · ") || "Run report"}
                    </strong>
                    <small>
                      {report.evidence.length} evidence item(s) ·{" "}
                      {report.uncertain.length} uncertainty flag(s)
                    </small>
                  </span>
                  {report.accepted === null ? (
                    <span>
                      <button
                        className="button primary"
                        onClick={() =>
                          run(() =>
                            call("PATCH", {
                              action: "review_report",
                              id: report.id,
                              accepted: true,
                            }),
                          )
                        }
                      >
                        Accept
                      </button>{" "}
                      <button
                        className="button"
                        onClick={() =>
                          run(() =>
                            call("PATCH", {
                              action: "review_report",
                              id: report.id,
                              accepted: false,
                            }),
                          )
                        }
                      >
                        Reject
                      </button>
                    </span>
                  ) : (
                    <span className="badge">
                      {report.accepted ? "accepted" : "rejected"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        {!initial.assignments.length ? (
          <div className="empty">No project agents are onboarding yet.</div>
        ) : null}
      </section>
      {error ? <div className="notice error">{error}</div> : null}
    </div>
  );
}
