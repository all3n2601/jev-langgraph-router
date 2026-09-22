import { createHash } from "node:crypto";
import { routes, type Route } from "./dataset.js";

export interface BlindCase {
  readonly id: string;
  readonly input: string;
}

export interface AgentLabel {
  readonly id: string;
  readonly label: Route;
  readonly uncertain: boolean;
  readonly rationale: string;
}

export interface Disagreement {
  readonly id: string;
  readonly input: string;
  readonly agentA: AgentLabel;
  readonly agentB: AgentLabel;
  readonly adjudicatedLabel: null;
  readonly adjudicationNote: "";
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Agents see only ID and input, shuffled independently to avoid intent-group ordering cues. */
export function makeBlindPacket(
  reviews: readonly unknown[],
  agent: "a" | "b",
): readonly BlindCase[] {
  const seen = new Set<string>();
  return reviews
    .map((value, index) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`Invalid source case ${index + 1}`);
      }
      const row = value as Record<string, unknown>;
      if (
        typeof row.id !== "string" ||
        !/^bitext-[0-9]{6}$/.test(row.id) ||
        typeof row.input !== "string" ||
        row.input.trim().length === 0 ||
        seen.has(row.id)
      ) {
        throw new Error(`Invalid or duplicate source case ${index + 1}`);
      }
      seen.add(row.id);
      return { id: row.id, input: row.input };
    })
    .sort((left, right) =>
      hash(`blind-${agent}:${left.id}`).localeCompare(hash(`blind-${agent}:${right.id}`)),
    );
}

export function validateAgentLabels(
  value: unknown,
  expectedIds: readonly string[],
): readonly AgentLabel[] {
  if (!Array.isArray(value) || value.length !== expectedIds.length) {
    throw new Error("Agent output must contain exactly one label per supplied case");
  }
  const expected = new Set(expectedIds);
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`Invalid agent label ${index + 1}`);
    }
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      !expected.has(row.id) ||
      seen.has(row.id) ||
      typeof row.label !== "string" ||
      !Object.hasOwn(routes, row.label) ||
      typeof row.uncertain !== "boolean" ||
      typeof row.rationale !== "string" ||
      row.rationale.trim().length < 4 ||
      row.rationale.length > 500
    ) {
      throw new Error(`Invalid, missing, or duplicate agent label ${index + 1}`);
    }
    seen.add(row.id);
    return {
      id: row.id,
      label: row.label as Route,
      uncertain: row.uncertain,
      rationale: row.rationale.trim(),
    };
  });
}

export function compareAgentLabels(
  packet: readonly BlindCase[],
  agentA: readonly AgentLabel[],
  agentB: readonly AgentLabel[],
): {
  readonly disagreements: readonly Disagreement[];
  readonly reviewRequired: readonly Disagreement[];
  readonly agreementCount: number;
} {
  const ids = packet.map((item) => item.id);
  const a = new Map(validateAgentLabels(agentA, ids).map((row) => [row.id, row]));
  const b = new Map(validateAgentLabels(agentB, ids).map((row) => [row.id, row]));
  const combined = packet.map((item) => {
    const left = a.get(item.id);
    const right = b.get(item.id);
    if (!left || !right) throw new Error(`Missing labels for ${item.id}`);
    return {
      id: item.id,
      input: item.input,
      agentA: left,
      agentB: right,
      adjudicatedLabel: null,
      adjudicationNote: "",
    } as const;
  });
  return {
    disagreements: combined.filter((item) => item.agentA.label !== item.agentB.label),
    reviewRequired: combined.filter(
      (item) =>
        item.agentA.label !== item.agentB.label ||
        item.agentA.uncertain ||
        item.agentB.uncertain ||
        item.agentA.label === "human" ||
        item.agentB.label === "human",
    ),
    agreementCount: combined.filter((item) => item.agentA.label === item.agentB.label).length,
  };
}
