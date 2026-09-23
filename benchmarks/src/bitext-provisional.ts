import { routes, type BenchmarkCase, type Route, type Split } from "./dataset.js";
import {
  compareAgentLabels,
  makeBlindPacket,
  type AgentLabel,
  type Disagreement,
} from "./bitext-agents.js";

export interface UserAdjudication {
  readonly id: string;
  readonly label: Route;
}

export interface ProvisionalRecord {
  readonly id: string;
  readonly label: Route;
  readonly source: "user-adjudicated-disagreement" | "two-agent-consensus";
  readonly stillRequiresReview: boolean;
}

export function validateUserAdjudications(
  value: unknown,
  disagreementIds: readonly string[],
): readonly UserAdjudication[] {
  if (!Array.isArray(value) || value.length !== disagreementIds.length) {
    throw new Error("User adjudications must cover exactly the disputed IDs");
  }
  const expected = new Set(disagreementIds);
  const seen = new Set<string>();
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Invalid user adjudication");
    }
    const row = entry as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      !expected.has(row.id) ||
      seen.has(row.id) ||
      typeof row.label !== "string" ||
      !Object.hasOwn(routes, row.label) ||
      Object.keys(row).sort().join(",") !== "id,label"
    ) {
      throw new Error("Invalid, extra, or duplicate user adjudication");
    }
    seen.add(row.id);
    return { id: row.id, label: row.label as Route };
  });
}

/** A research-only comparison set: consensus is not ground truth. */
export function buildProvisionalSet(
  reviews: readonly unknown[],
  agentA: readonly AgentLabel[],
  agentB: readonly AgentLabel[],
  userLabels: unknown,
): {
  readonly cases: readonly BenchmarkCase[];
  readonly provenance: readonly ProvisionalRecord[];
  readonly remainingReview: readonly Disagreement[];
  readonly comparison: ReturnType<typeof compareAgentLabels>;
} {
  const packet = makeBlindPacket(reviews, "a");
  const comparison = compareAgentLabels(packet, agentA, agentB);
  const adjudications = validateUserAdjudications(
    userLabels,
    comparison.disagreements.map((row) => row.id),
  );
  const byId = new Map(adjudications.map((row) => [row.id, row.label]));
  const a = new Map(agentA.map((row) => [row.id, row]));
  const b = new Map(agentB.map((row) => [row.id, row]));
  const flagged = new Set(comparison.reviewRequired.map((row) => row.id));
  const cases: BenchmarkCase[] = [];
  const provenance: ProvisionalRecord[] = [];
  for (const [index, value] of reviews.entries()) {
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.input !== "string" ||
      (row.split !== "test" && row.split !== "calibration")
    ) {
      throw new Error(`Invalid review case ${index + 1}`);
    }
    const left = a.get(row.id);
    const right = b.get(row.id);
    if (!left || !right) throw new Error(`Missing agent label for ${row.id}`);
    const userLabel = byId.get(row.id);
    const label = userLabel ?? left.label;
    if (!userLabel && left.label !== right.label) {
      throw new Error(`Unresolved disagreement for ${row.id}`);
    }
    cases.push({ id: row.id, input: row.input, split: row.split as Split, label });
    provenance.push({
      id: row.id,
      label,
      source: userLabel ? "user-adjudicated-disagreement" : "two-agent-consensus",
      stillRequiresReview: flagged.has(row.id) && !userLabel,
    });
  }
  return {
    cases,
    provenance,
    remainingReview: comparison.reviewRequired.filter((row) => !byId.has(row.id)),
    comparison,
  };
}
