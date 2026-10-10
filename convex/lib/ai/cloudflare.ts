import type { AIProvider, AIResponse } from "./types";

type CloudflareResponse = {
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: AIResponse["toolCalls"];
    };
  }>;
  errors?: Array<{ message?: string }>;
};

export function createCloudflareProvider(): AIProvider {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const model =
    process.env.CLOUDFLARE_AI_MODEL?.trim() ||
    "@cf/zai-org/glm-4.7-flash";
  if (!accountId || !apiToken) {
    throw new Error("Cloudflare Workers AI is not configured.");
  }

  return {
    async generate({ messages, tools }) {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model, messages, tools, temperature: 0.25, max_completion_tokens: 500 }),
        },
      );
      const payload = (await response.json()) as CloudflareResponse;
      if (!response.ok) {
        throw new Error(payload.errors?.[0]?.message || `Workers AI returned ${response.status}.`);
      }
      const message = payload.choices?.[0]?.message;
      if (!message) throw new Error("Workers AI returned no response.");
      const inputTokens = payload.usage?.prompt_tokens;
      const outputTokens = payload.usage?.completion_tokens;
      const totalTokens = payload.usage?.total_tokens;
      return {
        content: message.content ?? null,
        toolCalls: message.tool_calls ?? [],
        model: payload.model ?? model,
        usage:
          typeof inputTokens === "number" &&
          typeof outputTokens === "number" &&
          typeof totalTokens === "number"
            ? { inputTokens, outputTokens, totalTokens }
            : undefined,
      };
    },
  };
}
