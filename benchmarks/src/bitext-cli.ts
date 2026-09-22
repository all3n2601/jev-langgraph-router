import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BITEXT_INTENTS,
  BITEXT_REVISION,
  BITEXT_SELECTION_SEED,
  BITEXT_SHA256,
  BITEXT_URL,
  finalizeBitextReviews,
  parseBitextCsv,
  selectBitextReviewCases,
} from "./bitext.js";

const outputDir = resolve("benchmarks/results/raw/bitext-retail-ecommerce-v1");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function prepare(): Promise<void> {
  const response = await fetch(BITEXT_URL, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Source download failed: HTTP ${response.status}`);
  const csv = await response.text();
  if (sha256(csv) !== BITEXT_SHA256) throw new Error("Source checksum changed");
  const rows = parseBitextCsv(csv);
  if (rows.length !== 44_884) throw new Error("Source row count changed");
  const { review, provenance } = selectBitextReviewCases(rows);
  const reviewJsonl = `${review.map((row) => JSON.stringify(row)).join("\n")}\n`;
  await mkdir(resolve("benchmarks/results/raw"), { recursive: true });
  await mkdir(outputDir);
  await writeFile(resolve(outputDir, "review.jsonl"), reviewJsonl, { flag: "wx" });
  await writeFile(
    resolve(outputDir, "provenance.jsonl"),
    `${provenance.map((row) => JSON.stringify(row)).join("\n")}\n`,
    { flag: "wx" },
  );
  await writeFile(
    resolve(outputDir, "source.json"),
    `${JSON.stringify(
      {
        name: "Bitext retail e-commerce tagged training dataset",
        url: BITEXT_URL,
        revision: BITEXT_REVISION,
        sourceSha256: BITEXT_SHA256,
        license: "CDLA-Sharing-1.0",
        sourceRows: rows.length,
        selectionSeed: BITEXT_SELECTION_SEED,
        sampledIntents: BITEXT_INTENTS,
        casesPerIntent: 20,
        totalCases: review.length,
        calibrationCases: review.filter((row) => row.split === "calibration").length,
        testCases: review.filter((row) => row.split === "test").length,
        reviewFileSha256: sha256(reviewJsonl),
        note: "Source-intent-stratified synthetic challenge set; labels pending independent human review. Not representative of natural support traffic.",
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      outputDir,
      sourceRows: rows.length,
      sampledCases: review.length,
      scored: false,
    }),
  );
}

async function finalize(): Promise<void> {
  const reviewFile = await readFile(resolve(outputDir, "review.jsonl"), "utf8");
  const reviews = reviewFile
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown);
  const cases = finalizeBitextReviews(reviews);
  const provenanceFile = await readFile(resolve(outputDir, "provenance.jsonl"), "utf8");
  const provenance = provenanceFile
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as { id: string; inputSha256: string });
  if (
    cases.length !== provenance.length ||
    cases.some(
      (row, index) =>
        row.id !== provenance[index]?.id || sha256(row.input) !== provenance[index]?.inputSha256,
    )
  ) {
    throw new Error("Review cases no longer match the downloaded source sample");
  }
  const agreement = reviews.filter((row) => {
    const entry = row as { reviewer1: string; reviewer2: string };
    return entry.reviewer1 === entry.reviewer2;
  }).length;
  await writeFile(
    resolve(outputDir, "cases.jsonl"),
    `${cases.map((row) => JSON.stringify(row)).join("\n")}\n`,
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({ outputDir, cases: cases.length, rawAgreement: agreement / cases.length }),
  );
}

const command = process.argv[2];
if (command === "prepare") {
  await prepare();
} else if (command === "finalize") {
  await finalize();
} else {
  throw new Error("Expected prepare or finalize");
}
