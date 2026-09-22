import { describe, expect, it } from "vitest";
import { finalizeBitextReviews, parseBitextCsv, selectBitextReviewCases } from "../src/bitext.js";

const header = "instruction,intent,category,tags,response\n";

describe("Bitext import", () => {
  it("parses multiline quoted fields and doubled quotes", () => {
    const rows = parseBitextCsv(
      `${header}"Where is my ""order""?",track_order,ORDER,B,"First line\nSecond line"\n`,
    );
    expect(rows).toEqual([
      { sourceRow: 2, input: 'Where is my "order"?', intent: "track_order", category: "ORDER" },
    ]);
  });

  it("rejects changed source structure", () => {
    expect(() => parseBitextCsv("input,intent\nHello,track_order\n")).toThrow(
      "Unexpected Bitext CSV header",
    );
    expect(() => parseBitextCsv(`${header}"unclosed,track_order,ORDER,B,answer`)).toThrow(
      "Unclosed CSV quote",
    );
  });

  it("selects deterministic intent-stratified cases without auto-labeling", () => {
    const intents = [
      ["refund_policy", "RETURNS"],
      ["return_policy", "RETURNS"],
      ["track_order", "ORDER"],
      ["track_delivery", "DELIVERY"],
      ["human_agent", "CONTACT"],
      ["cancel_order", "ORDER"],
    ];
    const rows = intents.flatMap(([intent, category], intentIndex) =>
      Array.from({ length: 8 }, (_, index) => ({
        sourceRow: intentIndex * 8 + index + 2,
        input: `${intent} example ${index}`,
        intent: intent ?? "",
        category: category ?? "",
      })),
    );
    const first = selectBitextReviewCases(rows, 5);
    const second = selectBitextReviewCases(rows, 5);
    expect(first).toEqual(second);
    expect(first.review).toHaveLength(30);
    expect(first.review.filter((row) => row.split === "calibration")).toHaveLength(6);
    expect(first.review.every((row) => row.label === null)).toBe(true);
    expect(new Set(first.review.map((row) => row.id)).size).toBe(30);
    expect(first.provenance).toHaveLength(30);
  });

  it("requires two valid reviews and a reason for disagreements", () => {
    const base = {
      id: "bitext-000123",
      input: "Where is my order?",
      split: "test",
      reviewer1: "search",
      reviewer2: "search",
      label: "search",
      adjudicationNote: "",
    };
    expect(finalizeBitextReviews([base])).toEqual([
      { id: base.id, input: base.input, split: "test", label: "search" },
    ]);
    expect(() => finalizeBitextReviews([{ ...base, reviewer2: null }])).toThrow();
    expect(() =>
      finalizeBitextReviews([{ ...base, reviewer2: "answer", adjudicationNote: "" }]),
    ).toThrow();
    expect(() =>
      finalizeBitextReviews([
        { ...base, reviewer2: "answer", adjudicationNote: "Requires live order lookup" },
      ]),
    ).not.toThrow();
    expect(() => finalizeBitextReviews([base, base])).toThrow("Duplicate review ID");
  });
});
