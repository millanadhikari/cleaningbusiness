import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { normalizeAnalyticsSessionId } from "./lib/websiteAnalytics";

function validSessionId(value: string) {
  const sessionId = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    throw new Error("Invalid chat session.");
  }
  return sessionId;
}

function cleanPage(value: string) {
  const page = value.trim().slice(0, 300);
  return page.startsWith("/") && !page.startsWith("//") ? page.split("#", 1)[0] || "/" : "/";
}

export const prepareTurn = internalMutation({
  args: {
    sessionId: v.string(),
    websiteSessionId: v.optional(v.string()),
    message: v.string(),
    page: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionId = validSessionId(args.sessionId);
    const content = args.message.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 1200);
    if (!content) throw new Error("Enter a message.");
    const now = Date.now();
    let session = await ctx.db.query("chatSessions").withIndex("by_session_id", (q) => q.eq("sessionId", sessionId)).unique();
    const websiteSessionId = normalizeAnalyticsSessionId(args.websiteSessionId ?? "") ?? undefined;
    if (!session) {
      const id = await ctx.db.insert("chatSessions", {
        sessionId,
        websiteSessionId,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
      });
      session = await ctx.db.get(id);
    }
    if (!session || session.status !== "ACTIVE") throw new Error("Start a new conversation to continue.");
    const recent = await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId).gte("createdAt", now - 60_000))
      .collect();
    if (recent.filter((message) => message.role === "USER").length >= 6) {
      throw new Error("Please wait a moment before sending another message.");
    }
    const history = await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(81);
    if (history.filter((message) => message.role === "USER").length >= 80) {
      throw new Error("This conversation has reached its limit. Start a new conversation to continue.");
    }
    const firstUserMessage = !history.some((message) => message.role === "USER");
    const previous = history
      .filter((message) => message.role === "USER" || message.role === "ASSISTANT")
      .slice(0, 18);
    const toolContext = history
      .filter((message) => message.role === "TOOL")
      .slice(0, 3)
      .reverse()
      .map((message) => ({
        toolName: message.toolName ?? "unknown",
        result: message.content,
      }));
    await ctx.db.insert("chatMessages", { sessionId, role: "USER", content, createdAt: now });
    await ctx.db.patch(session._id, {
      websiteSessionId: session.websiteSessionId ?? websiteSessionId,
      updatedAt: now,
      lastMessageAt: now,
    });
    if (firstUserMessage && websiteSessionId) {
      await ctx.db.insert("websiteEvents", {
        sessionId: websiteSessionId,
        eventType: "AI_CHAT_STARTED",
        page: cleanPage(args.page),
        createdAt: now,
      });
    }
    if (websiteSessionId && /\b(talk|speak|callback|call back)\b.*\b(person|human|team|someone)\b/i.test(content)) {
      await ctx.db.insert("websiteEvents", {
        sessionId: websiteSessionId,
        eventType: "AI_HANDOFF_REQUESTED",
        page: cleanPage(args.page),
        createdAt: now,
      });
    }
    return {
      messages: [...previous.reverse(), { role: "USER" as const, content, createdAt: now }].map((message) => ({
        role: message.role,
        content: message.content,
      })),
      toolContext,
      websiteSessionId: session.websiteSessionId ?? websiteSessionId,
    };
  },
});

export const storeAssistant = internalMutation({
  args: { sessionId: v.string(), content: v.string() },
  handler: async (ctx, args) => {
    const sessionId = validSessionId(args.sessionId);
    const content = args.content.trim().slice(0, 3000);
    if (!content) return;
    const now = Date.now();
    await ctx.db.insert("chatMessages", { sessionId, role: "ASSISTANT", content, createdAt: now });
    const session = await ctx.db.query("chatSessions").withIndex("by_session_id", (q) => q.eq("sessionId", sessionId)).unique();
    if (session) await ctx.db.patch(session._id, { updatedAt: now, lastMessageAt: now });
  },
});

export const storeTool = internalMutation({
  args: { sessionId: v.string(), toolName: v.string(), toolCallId: v.string(), content: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("chatMessages", {
      sessionId: validSessionId(args.sessionId),
      role: "TOOL",
      content: args.content.slice(0, 4000),
      toolName: args.toolName.slice(0, 80),
      toolCallId: args.toolCallId.slice(0, 160),
      createdAt: Date.now(),
    });
  },
});

export const trackAIEvent = internalMutation({
  args: {
    websiteSessionId: v.optional(v.string()),
    eventType: v.union(v.literal("AI_ESTIMATE_STARTED"), v.literal("AI_ESTIMATE_COMPLETED")),
    page: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionId = normalizeAnalyticsSessionId(args.websiteSessionId ?? "");
    if (!sessionId) return;
    await ctx.db.insert("websiteEvents", {
      sessionId,
      eventType: args.eventType,
      page: cleanPage(args.page),
      createdAt: Date.now(),
    });
  },
});

export const recordAIUsage = internalMutation({
  args: {
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
  },
  handler: async (ctx, args) => {
    const inputTokens = Math.max(0, Math.floor(args.inputTokens));
    const outputTokens = Math.max(0, Math.floor(args.outputTokens));
    const totalTokens = Math.max(inputTokens + outputTokens, Math.floor(args.totalTokens));
    const estimatedNeurons =
      args.model === "@cf/zai-org/glm-4.7-flash"
        ? (inputTokens * 5_500 + outputTokens * 36_400) / 1_000_000
        : undefined;

    await ctx.db.insert("aiUsageEvents", {
      provider: "CLOUDFLARE",
      model: args.model.slice(0, 160),
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedNeurons,
      createdAt: Date.now(),
    });
  },
});
