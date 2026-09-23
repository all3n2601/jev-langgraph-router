import { describe, expect, it } from "vitest";
import { buildProvisionalSet, validateUserAdjudications } from "../src/bitext-provisional.js";
import type { AgentLabel } from "../src/bitext-agents.js";

const reviews = [
  { id: "bitext-000101", input: "Where is my order?", split: "test" },
  { id: "bitext-000102", input: "Cancel it now", split: "test" },
  { id: "bitext-000103", input: "What is the return policy?", split: "calibration" },
];
const a: AgentLabel[] = [
  { id: "bitext-000101", label: "search", uncertain: false, rationale: "Needs live order" },
  { id: "bitext-000102", label: "human", uncertain: false, rationale: "Changes order" },
  { id: "bitext-000103", label: "answer", uncertain: true, rationale: "Policy question" },
];
const b: AgentLabel[] = [
  { id: "bitext-000101", label: "answer", uncertain: false, rationale: "General question" },
  { id: "bitext-000102", label: "human", uncertain: false, rationale: "Changes order" },
  { id: "bitext-000103", label: "answer", uncertain: false, rationale: "Policy question" },
];

describe("provisional AI-assisted comparison set", () => {
  it("requires exactly the disputed IDs and valid routes", () => {
    const valid = [{ id: "bitext-000101", label: "search" }];
    expect(validateUserAdjudications(valid, ["bitext-000101"])).toEqual(valid);
    expect(() => validateUserAdjudications([], ["bitext-000101"])).toThrow();
    expect(() => validateUserAdjudications([...valid, valid[0]], ["bitext-000101"])).toThrow();
    expect(() =>
      validateUserAdjudications([{ id: "bitext-000102", label: "search" }], ["bitext-000101"]),
    ).toThrow();
    expect(() =>
      validateUserAdjudications([{ id: "bitext-000101", label: "wrong" }], ["bitext-000101"]),
    ).toThrow();
  });

  it("preserves review order and distinguishes user choices from unverified consensus", () => {
    const result = buildProvisionalSet(reviews, a, b, [{ id: "bitext-000101", label: "search" }]);
    expect(result.cases.map((row) => row.id)).toEqual(reviews.map((row) => row.id));
    expect(result.cases.map((row) => row.label)).toEqual(["search", "human", "answer"]);
    expect(result.provenance.map((row) => row.source)).toEqual([
      "user-adjudicated-disagreement",
      "two-agent-consensus",
      "two-agent-consensus",
    ]);
    expect(result.provenance.map((row) => row.stillRequiresReview)).toEqual([false, true, true]);
    expect(result.remainingReview.map((row) => row.id).sort()).toEqual([
      "bitext-000102",
      "bitext-000103",
    ]);
  });
});
