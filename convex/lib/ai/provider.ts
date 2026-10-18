import { createCloudflareProvider } from "./cloudflare";
import type { AIProvider } from "./types";

export function getAIProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER || "cloudflare").trim().toLowerCase();
  if (provider === "cloudflare") return createCloudflareProvider();
  throw new Error(`Unsupported AI provider: ${provider}`);
}
