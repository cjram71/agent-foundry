"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
const sections = [
  [
    "EXECUTIVE OFFICE",
    [
      ["/", "Home"],
      ["/approvals", "Decisions"],
      ["/businesses", "Company"],
      ["/projects", "Projects"],
    ],
  ],
  [
    "WORK IN PROGRESS",
    [
      ["/missions", "Company Missions"],
      ["/tasks", "Tasks"],
      ["/results", "Results & Evidence"],
    ],
  ],
  [
    "COMPANY KNOWLEDGE",
    [
      ["/intelligence/agents", "AI Workforce"],
      ["/intelligence/knowledge", "Memory"],
    ],
  ],
  [
    "ADVANCED",
    [
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
          <strong>Boosta OS</strong>
          <small>Executive Office</small>
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
