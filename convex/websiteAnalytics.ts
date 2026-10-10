import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { normalizeAnalyticsSessionId } from "./lib/websiteAnalytics";

const publicEventType = v.union(
  v.literal("QUOTE_STARTED"),
  v.literal("BOOKING_STARTED"),
  v.literal("PAYMENT_STARTED"),
  v.literal("AI_CHAT_OPENED"),
  v.literal("AI_CHAT_STARTED"),
  v.literal("AI_ESTIMATE_STARTED"),
  v.literal("AI_ESTIMATE_COMPLETED"),
  v.literal("AI_HANDOFF_REQUESTED"),
);

function cleanText(value: string | undefined, maxLength: number) {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
  return cleaned || undefined;
}

function cleanPage(value: string) {
  const page = value.trim().slice(0, 300);
  if (!page.startsWith("/") || page.startsWith("//")) return "/";
  return page.split("#", 1)[0] || "/";
}

function cleanReferrer(value: string | undefined) {
  const cleaned = cleanText(value, 500);
  if (!cleaned) return undefined;
  try {
    const url = new URL(cleaned);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return undefined;
  }
}

const sessionArgs = {
  sessionId: v.string(),
  page: v.string(),
};

export const trackPageView = mutation({
  args: {
    ...sessionArgs,
    landingPage: v.string(),
    referrer: v.optional(v.string()),
    source: v.optional(v.string()),
    medium: v.optional(v.string()),
    campaign: v.optional(v.string()),
    term: v.optional(v.string()),
    content: v.optional(v.string()),
    deviceType: v.optional(v.string()),
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sessionId = normalizeAnalyticsSessionId(args.sessionId);
    if (!sessionId) return null;
    const page = cleanPage(args.page);
    const now = Date.now();
    const existing = await ctx.db
      .query("websiteSessions")
      .withIndex("by_session_id", (query) => query.eq("sessionId", sessionId))
      .unique();
    if (!existing) {
      await ctx.db.insert("websiteSessions", {
        sessionId,
        anonymousId: sessionId,
        firstSeenAt: now,
        lastSeenAt: now,
        landingPage: cleanPage(args.landingPage),
        currentPage: page,
        referrer: cleanReferrer(args.referrer),
        source: cleanText(args.source, 120),
        medium: cleanText(args.medium, 120),
        campaign: cleanText(args.campaign, 160),
        term: cleanText(args.term, 160),
        content: cleanText(args.content, 160),
        deviceType: cleanText(args.deviceType, 40),
        browser: cleanText(args.browser, 40),
        os: cleanText(args.os, 40),
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        currentPage: page,
        lastSeenAt: now,
        updatedAt: now,
        referrer: existing.referrer ?? cleanReferrer(args.referrer),
        source: existing.source ?? cleanText(args.source, 120),
        medium: existing.medium ?? cleanText(args.medium, 120),
        campaign: existing.campaign ?? cleanText(args.campaign, 160),
        term: existing.term ?? cleanText(args.term, 160),
        content: existing.content ?? cleanText(args.content, 160),
        deviceType: existing.deviceType ?? cleanText(args.deviceType, 40),
        browser: existing.browser ?? cleanText(args.browser, 40),
        os: existing.os ?? cleanText(args.os, 40),
      });
    }

    const latest = await ctx.db
      .query("websiteEvents")
      .withIndex("by_session_and_created_at", (query) => query.eq("sessionId", sessionId))
      .order("desc")
      .first();
    if (
      !latest ||
      latest.eventType !== "PAGE_VIEW" ||
      latest.page !== page ||
      now - latest.createdAt > 30_000
    ) {
      await ctx.db.insert("websiteEvents", { sessionId, eventType: "PAGE_VIEW", page, createdAt: now });
    }
    return null;
  },
});

export const touchSession = mutation({
  args: sessionArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const sessionId = normalizeAnalyticsSessionId(args.sessionId);
    if (!sessionId) return null;
    const session = await ctx.db
      .query("websiteSessions")
      .withIndex("by_session_id", (query) => query.eq("sessionId", sessionId))
      .unique();
    if (session) {
      const now = Date.now();
      await ctx.db.patch(session._id, {
        currentPage: cleanPage(args.page),
        lastSeenAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const trackEvent = mutation({
  args: { ...sessionArgs, eventType: publicEventType },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sessionId = normalizeAnalyticsSessionId(args.sessionId);
    if (!sessionId) return null;
    const session = await ctx.db
      .query("websiteSessions")
      .withIndex("by_session_id", (query) => query.eq("sessionId", sessionId))
      .unique();
    const now = Date.now();
    const page = cleanPage(args.page);
    if (!session) {
      await ctx.db.insert("websiteSessions", {
        sessionId,
        anonymousId: sessionId,
        firstSeenAt: now,
        lastSeenAt: now,
        landingPage: page,
        currentPage: page,
        createdAt: now,
        updatedAt: now,
      });
    }
    const recent = await ctx.db
      .query("websiteEvents")
      .withIndex("by_session_and_created_at", (query) =>
        query.eq("sessionId", sessionId).gte("createdAt", now - 60_000),
      )
      .collect();
    if (!recent.some((event) => event.eventType === args.eventType)) {
      await ctx.db.insert("websiteEvents", {
        sessionId,
        eventType: args.eventType,
        page,
        createdAt: now,
      });
    }
    if (session) {
      await ctx.db.patch(session._id, {
        currentPage: page,
        lastSeenAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});
