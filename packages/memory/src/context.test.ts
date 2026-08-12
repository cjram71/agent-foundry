import assert from "node:assert/strict";
import test from "node:test";
import { assembleMissionContext, type ContextCandidate } from "./context";
const base: ContextCandidate[] = [
  {
    id: "m",
    kind: "mission",
    content: "Build the governed intelligence layer",
    citation: "mission:m",
    trust: "trusted",
  },
  {
    id: "c",
    kind: "charter",
    content: "Human approval for consequential action",
    citation: "charter:1",
    trust: "trusted",
  },
];
test("requires mission and charter context", () => {
  assert.throws(
    () =>
      assembleMissionContext([], {
        tokenBudget: 256,
        maxSemanticChunks: 5,
        maxEpisodicMemories: 3,
      }),
    /Mission/,
  );
  assert.throws(
    () =>
      assembleMissionContext(base.slice(0, 1), {
        tokenBudget: 256,
        maxSemanticChunks: 5,
        maxEpisodicMemories: 3,
      }),
    /Charter/,
  );
});
test("orders context deterministically and cites every item", () => {
  const result = assembleMissionContext(
    [
      ...base,
      {
        id: "e",
        kind: "economic",
        content: "Spend is within target",
        citation: "stream:s1",
        trust: "trusted",
      },
      {
        id: "s",
        kind: "skill",
        content: "Use certified research procedure",
        citation: "skill:research@1",
        trust: "trusted",
      },
    ],
    { tokenBudget: 1024, maxSemanticChunks: 5, maxEpisodicMemories: 3 },
  );
  assert.deepEqual(
    result.included.map((x) => x.kind),
    ["mission", "charter", "skill", "economic"],
  );
  assert.match(result.text, /mission:m/);
});
test("drops lowest precedence context when bounded", () => {
  const result = assembleMissionContext(
    [
      ...base,
      {
        id: "sem1",
        kind: "semantic",
        content: "x".repeat(400),
        citation: "knowledge:1",
        trust: "reviewed",
      },
      {
        id: "sem2",
        kind: "semantic",
        content: "second",
        citation: "knowledge:2",
        trust: "reviewed",
      },
    ],
    { tokenBudget: 256, maxSemanticChunks: 1, maxEpisodicMemories: 3 },
  );
  assert(
    result.dropped.some((x) => x.id === "sem2" && x.reason.includes("limit")),
  );
  assert(result.warnings.length > 0);
});
