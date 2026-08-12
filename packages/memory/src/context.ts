export type ContextKind =
  | "mission"
  | "charter"
  | "skill"
  | "episodic"
  | "semantic"
  | "economic"
  | "environment";
export interface ContextCandidate {
  id: string;
  kind: ContextKind;
  content: string;
  citation: string;
  trust: "reviewed" | "trusted";
  relevance?: number;
}
export interface ContextPolicy {
  tokenBudget: number;
  maxSemanticChunks: number;
  maxEpisodicMemories: number;
}
export interface AssembledContext {
  text: string;
  estimatedTokens: number;
  included: Array<{
    id: string;
    kind: ContextKind;
    citation: string;
    trust: string;
  }>;
  dropped: Array<{ id: string; reason: string }>;
  warnings: string[];
}

const precedence: Record<ContextKind, number> = {
  mission: 0,
  charter: 1,
  skill: 2,
  episodic: 3,
  semantic: 4,
  economic: 5,
  environment: 6,
};
const estimateTokens = (value: string) =>
  Math.max(1, Math.ceil(value.length / 4));

export function assembleMissionContext(
  candidates: ContextCandidate[],
  policy: ContextPolicy,
): AssembledContext {
  if (!Number.isInteger(policy.tokenBudget) || policy.tokenBudget < 256)
    throw new Error("Context token budget must be at least 256");
  if (!candidates.some((x) => x.kind === "mission"))
    throw new Error("Active Mission Contract is required");
  if (!candidates.some((x) => x.kind === "charter"))
    throw new Error("Active Charter is required");
  const dropped: AssembledContext["dropped"] = [];
  const counts = { semantic: 0, episodic: 0 };
  const bounded = candidates
    .filter((item) => {
      if (!item.content.trim() || !item.citation.trim()) {
        dropped.push({ id: item.id, reason: "empty content or provenance" });
        return false;
      }
      if (
        item.kind === "semantic" &&
        ++counts.semantic > policy.maxSemanticChunks
      ) {
        dropped.push({ id: item.id, reason: "semantic chunk limit" });
        return false;
      }
      if (
        item.kind === "episodic" &&
        ++counts.episodic > policy.maxEpisodicMemories
      ) {
        dropped.push({ id: item.id, reason: "episodic memory limit" });
        return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        precedence[a.kind] - precedence[b.kind] ||
        (b.relevance ?? 1) - (a.relevance ?? 1) ||
        a.id.localeCompare(b.id),
    );
  const selected: ContextCandidate[] = [];
  let used = 0;
  for (const item of bounded) {
    const rendered = `[${item.kind.toUpperCase()} | ${item.trust} | ${item.citation}]\n${item.content}`;
    const tokens = estimateTokens(rendered);
    const mandatory = item.kind === "mission" || item.kind === "charter";
    if (used + tokens > policy.tokenBudget) {
      if (mandatory)
        throw new Error(`Mandatory ${item.kind} context exceeds token budget`);
      dropped.push({ id: item.id, reason: "token budget" });
      continue;
    }
    selected.push(item);
    used += tokens;
  }
  const text = selected
    .map(
      (item) =>
        `[${item.kind.toUpperCase()} | ${item.trust} | ${item.citation}]\n${item.content}`,
    )
    .join("\n\n");
  return {
    text,
    estimatedTokens: estimateTokens(text),
    included: selected.map(({ id, kind, citation, trust }) => ({
      id,
      kind,
      citation,
      trust,
    })),
    dropped,
    warnings: dropped.length
      ? [`${dropped.length} context item(s) excluded by policy`]
      : [],
  };
}
