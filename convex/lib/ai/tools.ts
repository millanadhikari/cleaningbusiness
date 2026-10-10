import type { AITool } from "./types";

export const PUBLIC_AI_TOOLS: AITool[] = [
  {
    type: "function",
    function: {
      name: "getServices",
      description: "List the currently active cleaning services. Use before answering what services are offered.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "getServiceDetails",
      description: "Get authoritative details and estimate questions for one active service.",
      parameters: {
        type: "object",
        properties: { service: { type: "string", description: "Active service slug, name or ID." } },
        required: ["service"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBusinessInfo",
      description: "Get safe configured contact and service-area information.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "calculateEstimate",
      description: "Calculate an estimate with the server-authoritative estimator. Returns missing required inputs instead of guessing.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", description: "Active service slug, name or ID." },
          answers: { type: "object", description: "Answers keyed by the exact service question key.", additionalProperties: true },
        },
        required: ["service", "answers"],
        additionalProperties: false,
      },
    },
  },
];
