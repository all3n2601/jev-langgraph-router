import { describe, expect, it } from "vitest";
import {
  compareAgentLabels,
  makeBlindPacket,
  validateAgentLabels,
  type AgentLabel,
} from "../src/bitext-agents.js";

const source = [
  { id: "bitext-000101", input: "Where is my order?", split: "test", sourceIntent: "track_order" },
  { id: "bitext-000102", input: "Cancel it now", split: "test", sourceIntent: "cancel_order" },
  { id: "bitext-000103", input: "What is the return policy?", split: "calibration" },
];

describe("blind agent labeling", () => {
  it("hides split and intent and shuffles independently", () => {
    const a = makeBlindPacket(source, "a");
    const b = makeBlindPacket(source, "b");
    expect(a).toHaveLength(3);
    expect(a).toEqual(makeBlindPacket(source, "a"));
    expect(new Set(a.map((row) => row.id))).toEqual(new Set(b.map((row) => row.id)));
    expect(a.every((row) => Object.keys(row).sort().join(",") === "id,input")).toBe(true);
  });

  it("rejects incomplete, duplicate, or malformed agent responses", () => {
    const valid: AgentLabel[] = [
      { id: "bitext-000101", label: "search", uncertain: false, rationale: "Needs live order" },
      { id: "bitext-000102", label: "human", uncertain: false, rationale: "Changes order" },
    ];
    const ids = valid.map((row) => row.id);
    expect(validateAgentLabels(valid, ids)).toEqual(valid);
    expect(() => validateAgentLabels(valid.slice(0, 1), ids)).toThrow();
    expect(() => validateAgentLabels([valid[0], valid[0]], ids)).toThrow();
    expect(() => validateAgentLabels([{ ...valid[0], label: "invalid" }, valid[1]], ids)).toThrow();
    expect(() => validateAgentLabels([{ ...valid[0], rationale: "" }, valid[1]], ids)).toThrow();
  });

  it("separates disagreements from broader safety and uncertainty review", () => {
    const packet = makeBlindPacket(source, "a");
    const a: AgentLabel[] = [
      { id: "bitext-000101", label: "search", uncertain: false, rationale: "Live order" },
      { id: "bitext-000102", label: "human", uncertain: false, rationale: "Changes order" },
      { id: "bitext-000103", label: "answer", uncertain: true, rationale: "Policy question" },
    ];
    const b: AgentLabel[] = [
      { id: "bitext-000101", label: "answer", uncertain: false, rationale: "General question" },
      { id: "bitext-000102", label: "human", uncertain: false, rationale: "Changes order" },
      { id: "bitext-000103", label: "answer", uncertain: false, rationale: "Policy question" },
    ];
    const comparison = compareAgentLabels(packet, a, b);
    expect(comparison.agreementCount).toBe(2);
    expect(comparison.disagreements.map((row) => row.id)).toEqual(["bitext-000101"]);
    expect(comparison.reviewRequired).toHaveLength(3);
    expect(comparison.disagreements[0]?.adjudicatedLabel).toBeNull();
  });
});
