import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { normalizeAnalyticsSessionId } from "./lib/websiteAnalytics";

const answerValue = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.array(v.string()),
);

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

function isExplicitConfirmation(value: string) {
  const message = value.toLowerCase().replace(/[^a-z\s']/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(no|don't|do not|change|edit|wait|hold)\b/.test(message)) return false;
  return /^(yes|yes please|confirm|confirmed|submit|submit it|submit this|go ahead|please submit|please confirm|do it|that's correct|that is correct)( please)?$/.test(message);
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
    const lastAssistant = history.find((message) => message.role === "ASSISTANT");
    const bookingConfirmationWasRequested = Boolean(
      lastAssistant && /(?:submit|send) (?:this|the|a) (?:reschedule|booking change|change|cancellation) request|would you like me to submit/i.test(lastAssistant.content),
    );
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
      explicitConfirmation:
        isExplicitConfirmation(content) &&
        (session.confirmationPending === true || bookingConfirmationWasRequested),
    };
  },
});

export const storePendingRequest = internalMutation({
  args: {
    sessionId: v.string(),
    page: v.string(),
    kind: v.union(v.literal("QUOTE"), v.literal("CALLBACK")),
    serviceId: v.optional(v.id("services")),
    serviceName: v.string(),
    answers: v.record(v.string(), answerValue),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.string(),
    addressLine1: v.string(),
    addressLine2: v.optional(v.string()),
    suburb: v.string(),
    state: v.string(),
    postcode: v.string(),
    preferredDate: v.optional(v.string()),
    preferredTime: v.optional(v.string()),
    notes: v.optional(v.string()),
    formattedEstimate: v.optional(v.string()),
    estimatedAmountCents: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sessionId = validSessionId(args.sessionId);
    const session = await ctx.db.query("chatSessions").withIndex("by_session_id", (q) => q.eq("sessionId", sessionId)).unique();
    if (!session || session.status !== "ACTIVE") throw new Error("Active chat session not found.");
    if (session.quoteId) return { status: "ALREADY_CREATED" as const };
    const name = args.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 160) throw new Error("Enter a valid name.");
    const email = args.email?.trim().toLowerCase() || undefined;
    if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
      throw new Error("Enter a valid email address.");
    }
    const phoneDigits = args.phone.replace(/\D/g, "");
    if (!/^61[23478]\d{8}$/.test(phoneDigits) && !/^0[23478]\d{8}$/.test(phoneDigits)) {
      throw new Error("Enter a valid Australian phone number.");
    }
    const state = args.state.trim().toUpperCase();
    if (!new Set(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]).has(state)) {
      throw new Error("Enter a valid Australian state or territory.");
    }
    const postcode = args.postcode.trim();
    if (!/^\d{4}$/.test(postcode)) throw new Error("Postcode must contain four digits.");
    const addressLine1 = args.addressLine1.trim().replace(/\s+/g, " ");
    const suburb = args.suburb.trim().replace(/\s+/g, " ");
    if (!addressLine1 || addressLine1.length > 160 || !suburb || suburb.length > 80) {
      throw new Error("Enter a valid service address and suburb.");
    }
    const preferredDate = args.preferredDate?.trim() || undefined;
    if (preferredDate) {
      const parsed = new Date(`${preferredDate}T12:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== preferredDate) {
        throw new Error("Preferred date is invalid.");
      }
    }
    const [firstName, ...lastNameParts] = name.split(" ");
    const lastName = lastNameParts.join(" ") || undefined;
    const now = Date.now();
    await ctx.db.patch(session._id, {
      intent: args.kind,
      pendingRequest: {
        kind: args.kind,
        serviceId: args.serviceId,
        serviceName: args.serviceName.trim().slice(0, 80),
        answers: args.answers,
        firstName,
        lastName,
        email,
        phone: args.phone.trim().slice(0, 40),
        addressLine1,
        addressLine2: args.addressLine2?.trim().slice(0, 160) || undefined,
        suburb,
        state,
        postcode,
        preferredDate,
        preferredTime: args.preferredTime?.trim().slice(0, 80) || undefined,
        propertyType: typeof args.answers.propertyType === "string" ? args.answers.propertyType.slice(0, 80) : undefined,
        bedrooms: typeof args.answers.bedrooms === "number" ? args.answers.bedrooms : undefined,
        bathrooms: typeof args.answers.bathrooms === "number" ? args.answers.bathrooms : undefined,
        notes: args.notes?.trim().slice(0, 2000) || undefined,
        formattedEstimate: args.formattedEstimate,
        estimatedAmountCents: args.estimatedAmountCents,
        preparedAt: now,
      },
      confirmationPending: true,
      updatedAt: now,
    });
    if (session.websiteSessionId) {
      await ctx.db.insert("websiteEvents", {
        sessionId: session.websiteSessionId,
        eventType: args.kind === "CALLBACK" ? "AI_CALLBACK_REQUESTED" : "AI_QUOTE_CONFIRMATION_SHOWN",
        page: cleanPage(args.page),
        createdAt: now,
      });
    }
    return { status: "CONFIRMATION_REQUIRED" as const };
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
    eventType: v.union(
      v.literal("AI_ESTIMATE_STARTED"),
      v.literal("AI_ESTIMATE_COMPLETED"),
      v.literal("AI_QUOTE_FAILED"),
    ),
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
