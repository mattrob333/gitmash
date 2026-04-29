import { OpenAIProvider, type AIProvider } from "@/lib/ai-provider";

/**
 * Extract the user's API key from a Next.js request's x-api-key header.
 */
export function extractApiKey(request: Request): string {
  return request.headers.get("x-api-key") ?? "";
}

/**
 * Create an AI provider from an API key. Returns null if no key is provided.
 */
export function createProviderFromKey(apiKey: string): AIProvider | null {
  if (!apiKey.trim()) return null;
  return new OpenAIProvider({ apiKey: apiKey.trim() });
}
