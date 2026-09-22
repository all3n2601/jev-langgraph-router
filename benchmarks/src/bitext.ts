import { createHash } from "node:crypto";
import { routes, type BenchmarkCase, type Route, type Split } from "./dataset.js";

export const BITEXT_REVISION = "12dd624ddcd3057382b2faad661bcda1fa869491";
export const BITEXT_SHA256 = "13a988266fed4e2b2c1ff947a89ef220ce09b5b13ac83c4a1496c0d7b81e8127";
export const BITEXT_URL = `https://huggingface.co/datasets/bitext/Bitext-retail-ecommerce-llm-chatbot-training-dataset/resolve/${BITEXT_REVISION}/bitext-retail-ecommerce-llm-chatbot-training-dataset.csv`;
export const BITEXT_INTENTS = [
  "refund_policy",
  "return_policy",
  "track_order",
  "track_delivery",
  "human_agent",
  "cancel_order",
] as const;
export const BITEXT_SELECTION_SEED = "jev-bitext-postpurchase-v1";

export interface BitextRow {
  readonly sourceRow: number;
  readonly input: string;
  readonly intent: string;
  readonly category: string;
}

export interface ReviewCase {
  readonly id: string;
  readonly input: string;
  readonly split: Split;
  readonly reviewer1: Route | null;
  readonly reviewer2: Route | null;
  readonly label: Route | null;
  readonly adjudicationNote: string;
}

/** Parse the full CSV grammar used by the source, including quoted newlines and doubled quotes. */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (field.length > 0 || closedQuote) throw new Error("Malformed CSV quote");
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
      closedQuote = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      closedQuote = false;
    } else {
      if (closedQuote) throw new Error("Unexpected character after CSV quote");
      field += char;
    }
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (record.length > 0 || field.length > 0 || closedQuote) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function parseBitextCsv(text: string): readonly BitextRow[] {
  const records = parseCsv(text.replace(/^\uFEFF/, ""));
  const header = records.shift();
  if (header?.join(",") !== "instruction,intent,category,tags,response") {
    throw new Error("Unexpected Bitext CSV header");
  }
  return records.map((record, index) => {
    if (record.length !== header.length) throw new Error(`Invalid Bitext CSV record ${index + 2}`);
    const [input, intent, category] = record;
    if (!input?.trim() || !intent?.trim() || !category?.trim()) {
      throw new Error(`Missing Bitext CSV field in record ${index + 2}`);
    }
    return { sourceRow: index + 2, input: input.trim(), intent, category };
  });
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** This is intent-stratified challenge sampling, not a natural-prevalence sample. */
export function selectBitextReviewCases(
  rows: readonly BitextRow[],
  perIntent = 20,
): { readonly review: readonly ReviewCase[]; readonly provenance: readonly object[] } {
  if (!Number.isInteger(perIntent) || perIntent < 5 || perIntent % 5 !== 0) {
    throw new Error("perIntent must be a positive multiple of five");
  }
  const seen = new Set<string>();
  const uniqueRows = rows.filter((row) => {
    const normalized = row.input.toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  const selected = BITEXT_INTENTS.flatMap((intent) => {
    const matches = uniqueRows
      .filter((row) => row.intent === intent)
      .sort((a, b) => {
        const first = digest(`${BITEXT_SELECTION_SEED}:${a.sourceRow}:${a.input}`);
        const second = digest(`${BITEXT_SELECTION_SEED}:${b.sourceRow}:${b.input}`);
        return first.localeCompare(second);
      })
      .slice(0, perIntent);
    if (matches.length !== perIntent) throw new Error(`Insufficient source rows for ${intent}`);
    return matches.map((row, index) => ({
      row,
      split: (index < perIntent / 5 ? "calibration" : "test") as Split,
    }));
  });
  return {
    review: selected.map(({ row, split }) => ({
      id: `bitext-${String(row.sourceRow).padStart(6, "0")}`,
      input: row.input,
      split,
      reviewer1: null,
      reviewer2: null,
      label: null,
      adjudicationNote: "",
    })),
    provenance: selected.map(({ row }) => ({
      id: `bitext-${String(row.sourceRow).padStart(6, "0")}`,
      sourceRow: row.sourceRow,
      sourceIntent: row.intent,
      sourceCategory: row.category,
      inputSha256: digest(row.input),
    })),
  };
}

function isRoute(value: unknown): value is Route {
  return typeof value === "string" && Object.hasOwn(routes, value);
}

/** Only double-reviewed and adjudicated cases may enter the scored benchmark file. */
export function finalizeBitextReviews(value: unknown): readonly BenchmarkCase[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Review cases are required");
  const seen = new Set<string>();
  return value.map((entry: unknown, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`Invalid review case ${index + 1}`);
    }
    const row = entry as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      !/^bitext-[0-9]{6}$/.test(row.id) ||
      typeof row.input !== "string" ||
      row.input.trim().length === 0 ||
      row.input.length > 10_000 ||
      (row.split !== "calibration" && row.split !== "test") ||
      !isRoute(row.reviewer1) ||
      !isRoute(row.reviewer2) ||
      !isRoute(row.label) ||
      typeof row.adjudicationNote !== "string" ||
      ((row.reviewer1 !== row.reviewer2 ||
        row.label !== row.reviewer1 ||
        row.label !== row.reviewer2) &&
        row.adjudicationNote.trim().length === 0)
    ) {
      throw new Error(`Incomplete or invalid review case ${index + 1}`);
    }
    if (seen.has(row.id)) throw new Error(`Duplicate review ID ${row.id}`);
    seen.add(row.id);
    return {
      id: row.id,
      input: row.input,
      split: row.split,
      label: row.label,
    };
  });
}
