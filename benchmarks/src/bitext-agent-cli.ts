import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  compareAgentLabels,
  makeBlindPacket,
  validateAgentLabels,
  type AgentLabel,
  type BlindCase,
} from "./bitext-agents.js";

const execFileAsync = promisify(execFile);
const baseDir = resolve("benchmarks/results/raw/bitext-retail-ecommerce-v1");
const rubricPath = resolve("benchmarks/datasets/bitext-retail-ecommerce-v1/AGENT_LABELING.md");
const batchSize = 20;
const schema = {
  type: "object",
  properties: {
    labels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string", enum: ["answer", "search", "calculate", "human"] },
          uncertain: { type: "boolean" },
          rationale: { type: "string" },
        },
        required: ["id", "label", "uncertain", "rationale"],
        additionalProperties: false,
      },
    },
  },
  required: ["labels"],
  additionalProperties: false,
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function jsonl<T>(rows: readonly T[]): string {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

async function readJsonl(path: string): Promise<unknown[]> {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown);
}

async function packetFor(agent: "a" | "b"): Promise<readonly BlindCase[]> {
  const raw = await readJsonl(resolve(baseDir, `agent-${agent}/cases.jsonl`));
  const source = await readJsonl(resolve(baseDir, "review.jsonl"));
  const expected = makeBlindPacket(source, agent);
  if (JSON.stringify(raw) !== JSON.stringify(expected)) {
    throw new Error("Blind packet no longer matches the prepared sample");
  }
  return expected;
}

async function prepare(): Promise<void> {
  const source = await readJsonl(resolve(baseDir, "review.jsonl"));
  const rubric = await readFile(rubricPath, "utf8");
  for (const agent of ["a", "b"] as const) {
    const directory = resolve(baseDir, `agent-${agent}`);
    const cases = makeBlindPacket(source, agent);
    await mkdir(directory);
    await writeFile(resolve(directory, "cases.jsonl"), jsonl(cases), { flag: "wx" });
    await writeFile(resolve(directory, "TASK.md"), rubric, { flag: "wx" });
  }
  console.log(JSON.stringify({ packets: 2, casesPerPacket: source.length, labels: "pending" }));
}

function structuredLabels(output: string): unknown {
  const wrapper = JSON.parse(output) as Record<string, unknown>;
  if (wrapper.is_error === true) throw new Error("Claude labeling request failed");
  const result = wrapper.structured_output;
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("Claude did not return structured labels");
  }
  return (result as Record<string, unknown>).labels;
}

async function run(agent: "a" | "b"): Promise<void> {
  const packet = await packetFor(agent);
  const rubric = await readFile(rubricPath, "utf8");
  const directory = resolve(baseDir, `agent-${agent}`);
  const collected: AgentLabel[] = [];
  for (let start = 0; start < packet.length; start += batchSize) {
    const batch = packet.slice(start, start + batchSize);
    const batchNumber = String(start / batchSize + 1).padStart(2, "0");
    const batchPath = resolve(directory, `batch-${batchNumber}.jsonl`);
    let labels: readonly AgentLabel[];
    try {
      labels = validateAgentLabels(
        await readJsonl(batchPath),
        batch.map((row) => row.id),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const prompt = `${rubric}\n\nReturn exactly ${batch.length} labels in the required JSON schema.\n\nCases:\n${jsonl(batch)}`;
      const { stdout } = await execFileAsync(
        "claude",
        [
          "-p",
          "--model",
          "sonnet",
          "--safe-mode",
          "--tools",
          "",
          "--no-session-persistence",
          "--output-format",
          "json",
          "--json-schema",
          JSON.stringify(schema),
          "--max-budget-usd",
          "1",
          prompt,
        ],
        { timeout: 180_000, maxBuffer: 5_000_000 },
      );
      labels = validateAgentLabels(
        structuredLabels(stdout),
        batch.map((row) => row.id),
      );
      await writeFile(batchPath, jsonl(labels), { flag: "wx" });
      console.log(JSON.stringify({ agent, completedBatch: batchNumber, cases: batch.length }));
    }
    collected.push(...labels);
  }
  await writeFile(resolve(directory, "labels.jsonl"), jsonl(collected), { flag: "wx" });
  await writeFile(
    resolve(directory, "run.json"),
    `${JSON.stringify(
      {
        agent,
        tool: "Claude Code CLI",
        modelRequested: "sonnet",
        separateSessionPerBatch: true,
        toolsEnabled: false,
        caseCount: collected.length,
        rubricSha256: sha256(rubric),
        packetSha256: sha256(jsonl(packet)),
        labelSha256: sha256(jsonl(collected)),
        labelingMethod: "AI draft, not human-reviewed",
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
  console.log(JSON.stringify({ agent, labels: collected.length, method: "AI draft" }));
}

function reviewMarkdown(
  title: string,
  rows: readonly ReturnType<typeof compareAgentLabels>["disagreements"][number][],
): string {
  return `# ${title}\n\nAI draft labels only. A person must resolve or confirm these before any human-validated claim.\n\n${rows
    .map(
      (row) =>
        `## ${row.id}\n\nRequest: ${row.input.replace(/\s+/g, " ")}\n\n- Agent A: ${row.agentA.label}${row.agentA.uncertain ? " (uncertain)" : ""} — ${row.agentA.rationale}\n- Agent B: ${row.agentB.label}${row.agentB.uncertain ? " (uncertain)" : ""} — ${row.agentB.rationale}\n- Final route: _pending human review_\n`,
    )
    .join("\n")}\n`;
}

async function merge(): Promise<void> {
  const packet = await packetFor("a");
  const left = validateAgentLabels(
    await readJsonl(resolve(baseDir, "agent-a/labels.jsonl")),
    packet.map((row) => row.id),
  );
  const right = validateAgentLabels(
    await readJsonl(resolve(baseDir, "agent-b/labels.jsonl")),
    packet.map((row) => row.id),
  );
  const comparison = compareAgentLabels(packet, left, right);
  await writeFile(resolve(baseDir, "disagreements.jsonl"), jsonl(comparison.disagreements), {
    flag: "wx",
  });
  await writeFile(
    resolve(baseDir, "disagreements.md"),
    reviewMarkdown("Agent labeling disagreements", comparison.disagreements),
    { flag: "wx" },
  );
  await writeFile(resolve(baseDir, "review-required.jsonl"), jsonl(comparison.reviewRequired), {
    flag: "wx",
  });
  await writeFile(
    resolve(baseDir, "review-required.md"),
    reviewMarkdown("Safety and uncertainty review", comparison.reviewRequired),
    { flag: "wx" },
  );
  await writeFile(
    resolve(baseDir, "agents-summary.json"),
    `${JSON.stringify(
      {
        cases: packet.length,
        agreementCount: comparison.agreementCount,
        agreementRate: comparison.agreementCount / packet.length,
        disagreementCount: comparison.disagreements.length,
        reviewRequiredCount: comparison.reviewRequired.length,
        note: "AI-to-AI agreement is not accuracy. No benchmark ground truth was created.",
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      cases: packet.length,
      disagreements: comparison.disagreements.length,
      safetyOrUncertaintyReview: comparison.reviewRequired.length,
      scored: false,
    }),
  );
}

const command = process.argv[2];
try {
  if (command === "prepare") await prepare();
  else if (command === "run-a") await run("a");
  else if (command === "run-b") await run("b");
  else if (command === "merge") await merge();
  else throw new Error("Expected prepare, run-a, run-b, or merge");
} catch (error) {
  // Model and parser errors can include customer text; keep CLI diagnostics data-free.
  const output =
    typeof error === "object" && error !== null && "stdout" in error
      ? String((error as { stdout: unknown }).stdout)
      : "";
  if (output.includes("OAuth session expired")) {
    console.error("Claude authentication expired. Run `claude auth login`, then retry.");
  } else {
    console.error(error instanceof Error ? error.name : "AgentLabelingError");
  }
  process.exitCode = 1;
}
