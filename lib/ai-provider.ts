export type AIProviderName = "openai" | string;

export type AIConfig = {
  apiKey: string;
  model?: string;
  provider?: AIProviderName;
  maxTokens?: number;
  temperature?: number;
};

export type AIJsonRequest = {
  systemPrompt: string;
  userPrompt: string;
  schema?: unknown;
  model?: string;
  maxTokens?: number;
  temperature?: number;
};

export interface AIProvider {
  generateJson<T>(request: AIJsonRequest): Promise<T>;
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

export class OpenAIProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens?: number;
  private readonly temperature?: number;

  constructor(config: AIConfig) {
    if (!config.apiKey) {
      throw new Error("OpenAIProvider requires an apiKey.");
    }
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gpt-5.5";
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;
  }

  async generateJson<T>(request: AIJsonRequest): Promise<T> {
    const body: Record<string, unknown> = {
      model: request.model ?? this.model,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
    };

    const maxTokens = request.maxTokens ?? this.maxTokens;
    if (typeof maxTokens === "number") {
      body.max_tokens = maxTokens;
    }

    const temperature = request.temperature ?? this.temperature;
    if (typeof temperature === "number") {
      body.temperature = temperature;
    }

    if (request.schema) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => null)) as ChatCompletionResponse | null;
    if (!response.ok) {
      const message = payload?.error?.message ?? response.statusText;
      throw new Error(`OpenAI chat completion failed (${response.status}): ${message}`);
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI chat completion did not include message content.");
    }

    try {
      return JSON.parse(content) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON";
      throw new Error(`OpenAI chat completion returned invalid JSON: ${message}`);
    }
  }
}

export class ProviderFactory {
  static create(config: AIConfig): AIProvider {
    const provider = config.provider ?? "openai";
    if (provider === "openai") {
      return new OpenAIProvider(config);
    }
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
