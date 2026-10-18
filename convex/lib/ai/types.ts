export type AIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: AIToolCall[];
};

export type AIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AITool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AIResponse = {
  content: string | null;
  toolCalls: AIToolCall[];
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type AIProvider = {
  generate(input: { messages: AIMessage[]; tools: AITool[] }): Promise<AIResponse>;
};
