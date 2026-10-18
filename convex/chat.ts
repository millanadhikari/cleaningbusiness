import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, mutation, query, type ActionCtx } from "./_generated/server";
import { getAIProvider } from "./lib/ai/provider";
import { PUBLIC_ASSISTANT_PROMPT } from "./lib/ai/prompts";
import { PUBLIC_AI_TOOLS } from "./lib/ai/tools";
import type { AIMessage, AIToolCall } from "./lib/ai/types";
import { normalizeAnalyticsSessionId } from "./lib/websiteAnalytics";

const FALLBACK = "Sorry, I'm having trouble answering right now. You can still use our quote form or call us on 0401 356 937.";

function sessionId(value: string) {
  const cleaned = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)) {
    throw new Error("Invalid chat session.");
  }
  return cleaned;
}

export const ensureSession = mutation({
  args: { sessionId: v.string(), websiteSessionId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const id = sessionId(args.sessionId);
    const existing = await ctx.db.query("chatSessions").withIndex("by_session_id", (q) => q.eq("sessionId", id)).unique();
    if (existing) return existing.status;
    const now = Date.now();
    await ctx.db.insert("chatSessions", {
      sessionId: id,
      websiteSessionId: normalizeAnalyticsSessionId(args.websiteSessionId ?? "") ?? undefined,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });
    return "ACTIVE" as const;
  },
});

export const listMessages = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const id = sessionId(args.sessionId);
    const session = await ctx.db.query("chatSessions").withIndex("by_session_id", (q) => q.eq("sessionId", id)).unique();
    if (!session) return [];
    const rows = await ctx.db.query("chatMessages").withIndex("by_session", (q) => q.eq("sessionId", id)).order("desc").take(50);
    return rows
      .filter((message) => message.role === "USER" || message.role === "ASSISTANT")
      .reverse()
      .map((message) => ({ id: message._id, role: message.role, content: message.content, createdAt: message.createdAt }));
  },
});

export const getRequestState = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const id = sessionId(args.sessionId);
    const session = await ctx.db.query("chatSessions").withIndex("by_session_id", (q) => q.eq("sessionId", id)).unique();
    if (!session?.confirmationPending || !session.pendingRequest || session.quoteId) return null;
    const draft = session.pendingRequest;
    return {
      kind: draft.kind,
      serviceName: draft.serviceName,
      details: Object.entries(draft.answers)
        .filter(([, value]) => value !== false && value !== "" && (!Array.isArray(value) || value.length > 0))
        .slice(0, 8)
        .map(([key, value]) => ({
          key,
          value: Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? "Yes" : String(value),
        })),
      preferredDate: draft.preferredDate,
      preferredTime: draft.preferredTime,
      formattedEstimate: draft.formattedEstimate,
      customerName: [draft.firstName, draft.lastName].filter(Boolean).join(" "),
      email: draft.email,
      phone: draft.phone,
      address: [draft.addressLine1, draft.addressLine2, draft.suburb, draft.state, draft.postcode].filter(Boolean).join(", "),
      notes: draft.notes,
    };
  },
});

export const requestHandoff = mutation({
  args: { sessionId: v.string(), websiteSessionId: v.optional(v.string()), page: v.string() },
  handler: async (ctx, args) => {
    const id = sessionId(args.sessionId);
    const chat = await ctx.db.query("chatSessions").withIndex("by_session_id", (q) => q.eq("sessionId", id)).unique();
    if (chat) await ctx.db.patch(chat._id, { status: "HANDED_OFF", updatedAt: Date.now() });
    const websiteId = normalizeAnalyticsSessionId(args.websiteSessionId ?? "");
    if (websiteId) {
      await ctx.db.insert("websiteEvents", {
        sessionId: websiteId,
        eventType: "AI_HANDOFF_REQUESTED",
        page: args.page.startsWith("/") ? args.page.slice(0, 300) : "/",
        createdAt: Date.now(),
      });
    }
  },
});

function requiredString(args: Record<string, unknown>, key: string) {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function answerRecord(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Answers are required.");
  }
  return value as Record<string, string | number | boolean | string[]>;
}

async function executeTool(
  ctx: ActionCtx,
  call: AIToolCall,
  turn: { sessionId: string; page: string; explicitConfirmation: boolean; websiteSessionId?: string },
) {
  let parsed: unknown = {};
  try { parsed = JSON.parse(call.function.arguments || "{}"); } catch { parsed = {}; }
  const args = typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  if (call.function.name === "getServices") return ctx.runQuery(internal.aiTools.getServices, {});
  if (call.function.name === "getBusinessInfo") return ctx.runQuery(internal.aiTools.getBusinessInfo, {});
  if (call.function.name === "getServiceDetails") {
    if (typeof args.service !== "string") return { error: "A service is required." };
    return ctx.runQuery(internal.aiTools.getServiceDetails, { service: args.service });
  }
  if (call.function.name === "calculateEstimate") {
    if (typeof args.service !== "string" || typeof args.answers !== "object" || args.answers === null || Array.isArray(args.answers)) {
      return { status: "ERROR", error: "Service and answers are required." };
    }
    return ctx.runQuery(internal.aiTools.calculateEstimate, {
      service: args.service,
      answers: args.answers as Record<string, string | number | boolean | string[]>,
    });
  }
  if (call.function.name === "previewQuoteRequest") {
    try {
      const service = requiredString(args, "service");
      const answers = answerRecord(args.answers);
      const estimate = await ctx.runQuery(internal.aiTools.calculateEstimate, { service, answers });
      if (estimate.status !== "OK") return estimate;
      const prepared = await ctx.runMutation(internal.chatData.storePendingRequest, {
        sessionId: turn.sessionId,
        page: turn.page,
        kind: "QUOTE",
        serviceId: estimate.service.id,
        serviceName: estimate.service.name,
        answers,
        name: requiredString(args, "name"),
        email: optionalString(args, "email"),
        phone: requiredString(args, "phone"),
        addressLine1: requiredString(args, "addressLine1"),
        addressLine2: optionalString(args, "addressLine2"),
        suburb: requiredString(args, "suburb"),
        state: requiredString(args, "state"),
        postcode: requiredString(args, "postcode"),
        preferredDate: optionalString(args, "preferredDate"),
        preferredTime: optionalString(args, "preferredTime"),
        notes: optionalString(args, "notes"),
        formattedEstimate: estimate.formattedTotal ?? undefined,
        estimatedAmountCents: estimate.estimate.type === "ESTIMATE" ? estimate.estimate.total : undefined,
      });
      return {
        ...prepared,
        service: estimate.service,
        answers,
        formattedTotal: estimate.formattedTotal,
        instruction: "Use formattedTotal exactly. Do not add, multiply or recalculate pricing components.",
      };
    } catch (error) {
      return { status: "ERROR", error: error instanceof Error ? error.message : "Quote details are invalid." };
    }
  }
  if (call.function.name === "previewCallbackRequest") {
    try {
      const serviceName = requiredString(args, "service");
      const service = await ctx.runQuery(internal.aiTools.getServiceDetails, { service: serviceName });
      if ("error" in service) return { status: "ERROR", error: service.error };
      const prepared = await ctx.runMutation(internal.chatData.storePendingRequest, {
        sessionId: turn.sessionId,
        page: turn.page,
        kind: "CALLBACK",
        serviceId: service.service.id,
        serviceName: service.service.name,
        answers: answerRecord(args.answers),
        name: requiredString(args, "name"),
        email: optionalString(args, "email"),
        phone: requiredString(args, "phone"),
        addressLine1: requiredString(args, "addressLine1"),
        addressLine2: optionalString(args, "addressLine2"),
        suburb: requiredString(args, "suburb"),
        state: requiredString(args, "state"),
        postcode: requiredString(args, "postcode"),
        preferredDate: optionalString(args, "preferredDate"),
        preferredTime: optionalString(args, "preferredTime"),
        notes: requiredString(args, "reason"),
      });
      return { ...prepared, service: service.service, reason: requiredString(args, "reason") };
    } catch (error) {
      return { status: "ERROR", error: error instanceof Error ? error.message : "Callback details are invalid." };
    }
  }
  if (call.function.name === "createQuoteRequest" || call.function.name === "createCallbackRequest") {
    try {
      return await ctx.runMutation(internal.aiWriteTools.createRequest, {
        sessionId: turn.sessionId,
        kind: call.function.name === "createQuoteRequest" ? "QUOTE" : "CALLBACK",
        explicitConfirmation: turn.explicitConfirmation,
        page: turn.page,
      });
    } catch (error) {
      await ctx.runMutation(internal.chatData.trackAIEvent, {
        websiteSessionId: turn.websiteSessionId,
        eventType: "AI_QUOTE_FAILED",
        page: turn.page,
      });
      return { status: "ERROR", error: error instanceof Error ? error.message : "The request could not be created." };
    }
  }
  if (call.function.name === "checkAvailability") {
    const window = requiredString(args, "preferredTimeWindow");
    if (window !== "MORNING" && window !== "AFTERNOON" && window !== "ANY") {
      return { status: "ERROR", error: "Select morning, afternoon or any time." };
    }
    return ctx.runMutation(internal.aiBookingTools.checkAvailability, {
      sessionId: turn.sessionId,
      service: requiredString(args, "service"),
      preferredDate: requiredString(args, "preferredDate"),
      preferredTimeWindow: window,
      postcode: requiredString(args, "postcode"),
      page: turn.page,
    });
  }
  if (call.function.name === "verifyBookingIdentity") {
    return ctx.runMutation(internal.aiBookingTools.verifyBookingIdentity, {
      sessionId: turn.sessionId,
      bookingReference: requiredString(args, "bookingReference"),
      contact: requiredString(args, "contact"),
      page: turn.page,
    });
  }
  if (call.function.name === "getVerifiedBookingSummary") {
    return ctx.runQuery(internal.aiBookingTools.getVerifiedBookingSummary, { sessionId: turn.sessionId });
  }
  if (call.function.name === "createBookingChangeRequest") {
    const type = requiredString(args, "type");
    if (type !== "RESCHEDULE" && type !== "DETAILS_CHANGE") return { status: "ERROR", error: "Unsupported change request." };
    if (typeof args.changes !== "object" || args.changes === null || Array.isArray(args.changes)) return { status: "ERROR", error: "Requested changes are required." };
    const source = args.changes as Record<string, unknown>;
    const changes = {
      scheduledDate: optionalString(source, "scheduledDate"),
      scheduledTime: optionalString(source, "scheduledTime"),
      firstName: optionalString(source, "firstName"),
      lastName: optionalString(source, "lastName"),
      email: optionalString(source, "email"),
      phone: optionalString(source, "phone"),
      notes: optionalString(source, "notes"),
    };
    return ctx.runMutation(internal.aiBookingTools.createBookingChangeRequest, {
      sessionId: turn.sessionId,
      page: turn.page,
      explicitConfirmation: turn.explicitConfirmation,
      type,
      changes,
      reason: optionalString(args, "reason"),
    });
  }
  if (call.function.name === "createCancellationRequest") {
    return ctx.runMutation(internal.aiBookingTools.createCancellationRequest, {
      sessionId: turn.sessionId,
      page: turn.page,
      explicitConfirmation: turn.explicitConfirmation,
      reason: optionalString(args, "reason"),
    });
  }
  return { error: "Tool is not allowed." };
}

export const sendMessage = action({
  args: { sessionId: v.string(), websiteSessionId: v.optional(v.string()), message: v.string(), page: v.string() },
  handler: async (ctx, args): Promise<{ message: string }> => {
    const prepared = await ctx.runMutation(internal.chatData.prepareTurn, args);
    const messages: AIMessage[] = [
      { role: "system", content: PUBLIC_ASSISTANT_PROMPT },
      ...(prepared.toolContext.length
        ? [{
            role: "system" as const,
            content: `Recent authoritative tool context from this conversation. Use it to continue the existing flow without restarting or re-asking answered questions. Reconstruct the complete answers object from the conversation before calling calculateEstimate.\n${JSON.stringify(prepared.toolContext).slice(0, 6000)}`,
          }]
        : []),
      ...prepared.messages.map((message) => ({
        role: message.role === "USER" ? "user" as const : message.role === "ASSISTANT" ? "assistant" as const : "tool" as const,
        content: message.content,
      })),
    ];
    try {
      const provider = getAIProvider();
      for (let round = 0; round < 5; round += 1) {
        const response = await provider.generate({ messages, tools: PUBLIC_AI_TOOLS });
        if (response.usage) {
          await ctx.runMutation(internal.chatData.recordAIUsage, {
            model: response.model,
            ...response.usage,
          });
        }
        if (!response.toolCalls.length) {
          const content = response.content?.trim() || FALLBACK;
          await ctx.runMutation(internal.chatData.storeAssistant, { sessionId: args.sessionId, content });
          return { message: content };
        }
        messages.push({ role: "assistant", content: response.content, tool_calls: response.toolCalls });
        for (const call of response.toolCalls.slice(0, 3)) {
          if (call.function.name === "calculateEstimate") {
            await ctx.runMutation(internal.chatData.trackAIEvent, { websiteSessionId: prepared.websiteSessionId, eventType: "AI_ESTIMATE_STARTED", page: args.page });
          }
          const result = await executeTool(ctx, call, {
            sessionId: args.sessionId,
            page: args.page,
            explicitConfirmation: prepared.explicitConfirmation,
            websiteSessionId: prepared.websiteSessionId,
          });
          const content = JSON.stringify(result);
          await ctx.runMutation(internal.chatData.storeTool, { sessionId: args.sessionId, toolName: call.function.name, toolCallId: call.id, content });
          messages.push({ role: "tool", tool_call_id: call.id, content });
          if (call.function.name === "calculateEstimate" && typeof result === "object" && result !== null && "status" in result && result.status === "OK") {
            await ctx.runMutation(internal.chatData.trackAIEvent, { websiteSessionId: prepared.websiteSessionId, eventType: "AI_ESTIMATE_COMPLETED", page: args.page });
          }
        }
      }
      throw new Error("Tool limit reached.");
    } catch (error) {
      console.error(
        "Public AI turn failed:",
        error instanceof Error ? error.message : "Unknown provider error",
      );
      await ctx.runMutation(internal.chatData.storeAssistant, { sessionId: args.sessionId, content: FALLBACK });
      return { message: FALLBACK };
    }
  },
});
