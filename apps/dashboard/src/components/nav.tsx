"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
const sections = [
  [
    "BOOSTA FÖRLAG",
    [
      ["/", "Home"],
      ["/ceo", "AI CEO"],
      ["/approvals", "My decisions"],
      ["/opportunities", "Opportunities"],
      ["/projects", "Workspaces"],
      ["/editorial", "Content pipeline"],
    ],
  ],
  [
    "COMPANY WORK",
    [
      ["/missions", "Plans & missions"],
      ["/tasks", "Work tasks"],
      ["/results", "Results & Evidence"],
    ],
  ],
  [
    "KNOWLEDGE",
    [
      ["/intelligence/agents", "AI Workforce"],
      ["/workforce", "Departments"],
      ["/intelligence/knowledge", "Company memory"],
    ],
  ],
  [
    "SETTINGS",
    [
      ["/businesses", "Company identity & rules"],
      ["/intelligence/skills", "Skills"],
      ["/intelligence/workflows", "Workflows"],
      ["/platform/models-cost", "AI Cost"],
      ["/platform/system-health", "System Health"],
      ["/platform/security-audit", "Security & Audit"],
    ],
  ],
] as const;
export default function Nav() {
  const pathname = usePathname(),
    [system, setSystem] = useState<
      "unknown" | "operational" | "degraded" | "emergency"
    >("unknown");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" }),
          data = await response.json();
        if (active)
          setSystem(
            data.emergencyStop
              ? "emergency"
              : response.ok && data.ok
                ? "operational"
                : "degraded",
          );
      } catch {
        if (active) setSystem("unknown");
      }
    }
    void load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">B</span>
        <div>
          <strong>Boosta Förlag</strong>
          <small>Company headquarters</small>
        </div>
      </div>
      <nav>
        {sections.map(([section, links]) => (
          <div className="nav-section" key={section}>
            <span>{section}</span>
            {links.map(([href, text]) => (
              <Link
                key={href}
                href={href}
                className={
                  pathname === href ||
                  (href !== "/" && pathname.startsWith(href))
                    ? "active"
                    : ""
                }
              >
                {text}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-status">
        <span className={`status-dot nav-${system}`} />
        {system === "unknown"
            ? "Status unknown"
          : system === "operational"
            ? "Company systems ready"
            : system === "emergency"
              ? "Emergency stop"
              : "System needs attention"}
        <small>Human-controlled company</small>
        <button
          className="button secondary logout-button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
