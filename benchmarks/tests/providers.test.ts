import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { createOpenAIProvider } from "../src/providers.js";

describe("structured-output LLM baseline", () => {
  it("sends the same route set in a strict, closed schema", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: '{"route":"search"}',
      model: "test-model-snapshot",
      usage: { input_tokens: 123, output_tokens: 7 },
    });
    const client = { responses: { create } } as unknown as OpenAI;
    const provider = createOpenAIProvider("test-model", 1000, client);
    const signal = new AbortController().signal;
    const result = await provider.evaluate("Latest news?", signal);
    expect(result).toEqual({
      route: "search",
      modelId: "test-model-snapshot",
      inputTokens: 123,
      outputTokens: 7,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        input: "Latest news?",
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "routing_decision",
            strict: true,
            schema: {
              type: "object",
              properties: {
                route: { type: "string", enum: ["answer", "search", "calculate", "human"] },
              },
              required: ["route"],
              additionalProperties: false,
            },
          },
        },
      }),
      { signal, timeout: 1000, maxRetries: 0 },
    );
  });

  it("rejects malformed or undeclared model outputs", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: '{"route":"unknown"}', usage: null });
    const client = { responses: { create } } as unknown as OpenAI;
    const provider = createOpenAIProvider("test-model", 1000, client);
    await expect(provider.evaluate("Hi", new AbortController().signal)).rejects.toThrow(
      "InvalidStructuredRoute",
    );
    expect(() => createOpenAIProvider(" ", 1000, client)).toThrow("model ID");
  });

  it("tolerates missing token usage", async () => {
    const client = {
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: '{"route":"answer"}',
          model: "test-model",
          usage: null,
        }),
      },
    } as unknown as OpenAI;
    const result = await createOpenAIProvider("test-model", 1000, client).evaluate(
      "Hi",
      new AbortController().signal,
    );
    expect(result).toEqual({ route: "answer", modelId: "test-model" });
  });
});
