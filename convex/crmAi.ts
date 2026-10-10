import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import { getAIProvider } from "./lib/ai/provider";
import { CRM_ASSISTANT_PROMPT } from "./lib/ai/prompts";
import { CRM_ADMIN_AI_TOOLS, CRM_SUPER_ADMIN_AI_TOOLS } from "./lib/ai/tools";
import type { AIMessage, AIToolCall } from "./lib/ai/types";
import type { Id } from "./_generated/dataModel";

const FALLBACK = "WeDo AI is temporarily unavailable. Your CRM data and normal workflows are still available.";

function parseArguments(call: AIToolCall) {
  try {
    const parsed: unknown = JSON.parse(call.function.arguments || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

async function executeTool(ctx: ActionCtx, sessionId: Id<"crmAiSessions">, call: AIToolCall) {
  const args = parseArguments(call);
  if (call.function.name === "addInternalNote") {
    const bookingId = typeof args.bookingId === "string" ? args.bookingId : "";
    const body = typeof args.body === "string" ? args.body : "";
    return ctx.runMutation(internal.crmAiData.prepareInternalNote, {
      sessionId, bookingId, body,
    });
  }
  return ctx.runQuery(internal.crmAiData.executeReadTool, {
    sessionId,
    toolName: call.function.name,
    argsJson: JSON.stringify(args).slice(0, 6000),
  });
}

export const sendMessage = action({
  args: {
    sessionId: v.id("crmAiSessions"),
    message: v.string(),
    contextType: v.optional(v.union(v.literal("CUSTOMER"), v.literal("BOOKING"), v.literal("QUOTE"), v.literal("EMAIL_THREAD"), v.literal("ANALYTICS"), v.literal("DASHBOARD"))),
    contextId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ message: string; actionCompleted?: boolean }> => {
    const prepared = await ctx.runMutation(internal.crmAiData.prepareTurn, args);
    if (prepared.explicitConfirmation && prepared.pendingAction) {
      const result = await ctx.runMutation(internal.crmAiData.confirmPendingAction, { sessionId: args.sessionId });
      const content = result.status === "SUCCESS"
        ? `Internal note added to booking ${result.bookingReference}.`
        : "There is no pending action to confirm.";
      await ctx.runMutation(internal.crmAiData.storeAssistant, { sessionId: args.sessionId, content });
      return { message: content, actionCompleted: result.status === "SUCCESS" };
    }
    const tools = prepared.user.role === "SUPER_ADMIN" ? CRM_SUPER_ADMIN_AI_TOOLS : CRM_ADMIN_AI_TOOLS;
    const allowed = new Set(tools.map(tool => tool.function.name));
    const context = prepared.session.contextType
      ? `Current CRM context (identifier only): ${prepared.session.contextType} ${prepared.session.contextId ?? ""}. Retrieve authoritative data before using it.`
      : "No record-specific CRM context is currently selected.";
    const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const messages: AIMessage[] = [
      { role: "system", content: CRM_ASSISTANT_PROMPT },
      { role: "system", content: context },
      { role: "system", content: `Today's date in Australia/Sydney is ${currentDate}. Resolve relative dates such as today, tomorrow and next week into YYYY-MM-DD tool inputs.` },
      ...prepared.messages.map(message => ({ role: message.role === "USER" ? "user" as const : "assistant" as const, content: message.content })),
    ];
    try {
      const provider = getAIProvider();
      let toolCalls = 0;
      for (let round = 0; round < 4; round += 1) {
        const response = await provider.generate({ messages, tools });
        if (response.usage) await ctx.runMutation(internal.chatData.recordAIUsage, { model: response.model, ...response.usage });
        if (!response.toolCalls.length) {
          const content = response.content?.trim().slice(0, 5000) || FALLBACK;
          await ctx.runMutation(internal.crmAiData.storeAssistant, { sessionId: args.sessionId, content });
          return { message: content };
        }
        messages.push({ role: "assistant", content: response.content, tool_calls: response.toolCalls });
        for (const call of response.toolCalls.slice(0, 4)) {
          toolCalls += 1;
          if (toolCalls > 8 || !allowed.has(call.function.name)) throw new Error("Tool is not allowed for this role.");
          let result: unknown;
          let success = true;
          try { result = await executeTool(ctx, args.sessionId, call); }
          catch (error) { success = false; result = { status: "ERROR", error: error instanceof Error ? error.message : "Tool failed." }; }
          const content = JSON.stringify(result).slice(0, 8000);
          await ctx.runMutation(internal.crmAiData.storeTool, { sessionId: args.sessionId, toolName: call.function.name, toolCallId: call.id, content, success });
          messages.push({ role: "tool", tool_call_id: call.id, content });
        }
      }
      throw new Error("Tool limit reached.");
    } catch (error) {
      console.error("CRM AI turn failed:", error instanceof Error ? error.message : "Unknown error");
      await ctx.runMutation(internal.crmAiData.storeAssistant, { sessionId: args.sessionId, content: FALLBACK });
      return { message: FALLBACK };
    }
  },
});
