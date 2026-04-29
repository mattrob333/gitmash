import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OpenAIProvider,
  ProviderFactory,
  type AIJsonRequest,
  type AIProvider,
} from "../lib/ai-provider.ts";

class FixtureProvider implements AIProvider {
  private readonly fixture: unknown;

  constructor(fixture: unknown) {
    this.fixture = fixture;
  }

  async generateJson<T>(_request: AIJsonRequest): Promise<T> {
    return this.fixture as T;
  }
}

describe("AI provider abstraction", () => {
  it("supports mock providers for fixture JSON", async () => {
    const provider = new FixtureProvider({ ok: true });
    assert.deepEqual(await provider.generateJson({ systemPrompt: "s", userPrompt: "u" }), { ok: true });
  });

  it("creates the OpenAI provider by default", () => {
    const provider = ProviderFactory.create({ apiKey: "test-key" });
    assert.ok(provider instanceof OpenAIProvider);
  });

  it("rejects unsupported providers", () => {
    assert.throws(
      () => ProviderFactory.create({ apiKey: "test-key", provider: "other-ai" }),
      /Unsupported AI provider/,
    );
  });
});

describe("OpenAIProvider", () => {
  it("posts chat completion requests with JSON mode when schema is provided", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | null = null;
    let capturedHeaders: HeadersInit | undefined;

    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      capturedHeaders = init?.headers;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ result: "ok" }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    try {
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        model: "gpt-test",
        maxTokens: 123,
        temperature: 0.2,
      });
      const result = await provider.generateJson<{ result: string }>({
        systemPrompt: "system",
        userPrompt: "user",
        schema: { type: "object" },
      });

      assert.deepEqual(result, { result: "ok" });
      const body = capturedBody as Record<string, unknown>;
      assert.equal(capturedUrl, "https://api.openai.com/v1/chat/completions");
      assert.equal(body.model, "gpt-test");
      assert.equal(body.max_tokens, 123);
      assert.equal(body.temperature, 0.2);
      assert.deepEqual(body.response_format, { type: "json_object" });
      assert.match(JSON.stringify(body.messages), /system/);
      assert.match(JSON.stringify(capturedHeaders), /Bearer test-key/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not make a real OpenAI request unless MOCK_OPENAI_API_KEY is set", { skip: !process.env.MOCK_OPENAI_API_KEY }, async () => {
    const provider = new OpenAIProvider({
      apiKey: process.env.MOCK_OPENAI_API_KEY ?? "",
      model: "gpt-4o",
      maxTokens: 50,
      temperature: 0,
    });

    const result = await provider.generateJson<{ ok: boolean }>({
      systemPrompt: "Return JSON only.",
      userPrompt: "Return {\"ok\": true}.",
      schema: { type: "object" },
    });

    assert.equal(result.ok, true);
  });
});
