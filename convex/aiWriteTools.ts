import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { submitQuoteRequest } from "./quoteRequests";

function cleanPage(value: string) {
  const page = value.trim().slice(0, 300);
  return page.startsWith("/") && !page.startsWith("//")
    ? page.split("#", 1)[0] || "/"
    : "/";
}

function validSessionId(value: string) {
  const sessionId = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    throw new Error("Invalid chat session.");
  }
  return sessionId;
}

export const createRequest = internalMutation({
  args: {
    sessionId: v.string(),
    kind: v.union(v.literal("QUOTE"), v.literal("CALLBACK")),
    explicitConfirmation: v.boolean(),
    page: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionId = validSessionId(args.sessionId);
    const session = await ctx.db
      .query("chatSessions")
      .withIndex("by_session_id", (query) => query.eq("sessionId", sessionId))
      .unique();
    if (!session) return { status: "ERROR" as const, error: "Chat session not found." };

    if (session.quoteId) {
      const existing = await ctx.db.get(session.quoteId);
      if (existing) {
        return {
          status: "SUCCESS" as const,
          quoteId: existing._id,
          customerId: existing.customerId,
          reference: existing.reference ?? "",
          requestStatus: existing.status,
          formattedEstimate: existing.estimatedTotalCents === undefined
            ? null
            : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(existing.estimatedTotalCents / 100),
          duplicate: true,
        };
      }
    }

    const draft = session.pendingRequest;
    if (!draft || draft.kind !== args.kind || !session.confirmationPending) {
      return { status: "ERROR" as const, error: "No matching request is awaiting confirmation." };
    }
    if (!args.explicitConfirmation) {
      return { status: "CONFIRMATION_REQUIRED" as const, error: "The customer must explicitly confirm the displayed summary first." };
    }

    const result = await submitQuoteRequest(
        ctx,
        {
          submissionKey: sessionId,
          sessionId: session.websiteSessionId,
          firstName: draft.firstName,
          lastName: draft.lastName,
          email: draft.email,
          phone: draft.phone,
          serviceId: args.kind === "QUOTE" ? draft.serviceId : undefined,
          answers: args.kind === "QUOTE" ? draft.answers : undefined,
          serviceType: draft.serviceName,
          addressLine1: draft.addressLine1,
          addressLine2: draft.addressLine2,
          suburb: draft.suburb,
          state: draft.state,
          postcode: draft.postcode,
          preferredDate: draft.preferredDate,
          preferredTime: draft.preferredTime,
          propertyType: draft.propertyType,
          bedrooms: draft.bedrooms,
          bathrooms: draft.bathrooms,
          notes: draft.notes,
          requestType: args.kind === "CALLBACK" ? "CALLBACK_REQUEST" : "CUSTOM_QUOTE",
        },
        { source: "AI_CHAT", chatSessionId: session._id },
    );
    const now = Date.now();
    await ctx.db.patch(session._id, {
        quoteId: result.quoteRequestId,
        customerId: result.customerId,
        intent: args.kind,
        confirmationPending: false,
        status: args.kind === "CALLBACK" ? "HANDED_OFF" : session.status,
        updatedAt: now,
    });
    if (session.websiteSessionId) {
      await ctx.db.insert("websiteEvents", {
          sessionId: session.websiteSessionId,
          eventType: args.kind === "CALLBACK" ? "AI_CALLBACK_CREATED" : "AI_QUOTE_CREATED",
          page: cleanPage(args.page),
          createdAt: now,
      });
    }
    return {
        status: "SUCCESS" as const,
        quoteId: result.quoteRequestId,
        customerId: result.customerId,
        reference: result.reference,
        requestStatus: "NEW" as const,
        formattedEstimate: result.estimatedTotalCents === undefined
          ? null
          : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(result.estimatedTotalCents / 100),
      duplicate: false,
    };
  },
});
