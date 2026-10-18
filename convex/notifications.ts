import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

const notificationType = v.union(
  v.literal("QUOTE_REQUEST_NEW"),
  v.literal("BOOKING_CREATED"),
  v.literal("BOOKING_UPDATED"),
  v.literal("BOOKING_CANCELLED"),
  v.literal("BOOKING_CHANGE_REQUESTED"),
  v.literal("JOB_OFFERED"),
  v.literal("JOB_ACCEPTED"),
  v.literal("JOB_DECLINED"),
  v.literal("JOB_COMPLETED"),
  v.literal("ISSUE_PHOTO_UPLOADED"),
  v.literal("CUSTOMER_EMAIL_RECEIVED"),
  v.literal("PAYMENT_SUCCEEDED"),
  v.literal("PAYMENT_FAILED"),
  v.literal("ADMIN_MESSAGE"),
  v.literal("JOB_REMINDER"),
);

const notificationEntityType = v.union(
  v.literal("BOOKING"),
  v.literal("QUOTE_REQUEST"),
  v.literal("EMAIL_THREAD"),
  v.literal("PAYMENT"),
  v.literal("SYSTEM"),
);

const notificationPriority = v.union(v.literal("NORMAL"), v.literal("HIGH"));

function requiredText(value: string, label: string, maximumLength: number) {
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, " ");
  if (!cleaned) throw new Error(`${label} is required.`);
  return cleaned.slice(0, maximumLength);
}

function optionalText(value: string | undefined, maximumLength: number) {
  const cleaned = value?.trim().replace(/[\u0000-\u001f\u007f]/g, " ");
  return cleaned ? cleaned.slice(0, maximumLength) : undefined;
}

function safeDeepLink(value: string | undefined) {
  const deepLink = optionalText(value, 300);
  if (!deepLink) return undefined;
  if (!deepLink.startsWith("/") || deepLink.startsWith("//")) {
    throw new Error("Notification deep links must be relative application routes.");
  }
  return deepLink;
}

export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limit = args.limit ?? 30;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Notification limit must be between 1 and 100.");
    }
    return ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_created_at", (index) =>
        index.eq("recipientUserId", user._id),
      )
      .order("desc")
      .take(limit);
  },
});

export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_read_and_created_at", (index) =>
        index.eq("recipientUserId", user._id).eq("isRead", false),
      )
      .take(100);
    return {
      count: Math.min(unread.length, 99),
      hasMore: unread.length === 100,
    };
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.recipientUserId !== user._id) {
      throw new Error("Notification not found.");
    }
    if (!notification.isRead) {
      await ctx.db.patch(notification._id, {
        isRead: true,
        readAt: Date.now(),
      });
    }
    return null;
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_read_and_created_at", (index) =>
        index.eq("recipientUserId", user._id).eq("isRead", false),
      )
      .collect();
    const readAt = Date.now();
    await Promise.all(
      unread.map((notification) =>
        ctx.db.patch(notification._id, { isRead: true, readAt }),
      ),
    );
    return { updated: unread.length };
  },
});

export const createNotification = internalMutation({
  args: {
    recipientUserId: v.id("users"),
    type: notificationType,
    title: v.string(),
    body: v.string(),
    entityType: v.optional(notificationEntityType),
    entityId: v.optional(v.string()),
    deepLink: v.optional(v.string()),
    priority: notificationPriority,
    dedupeKey: v.string(),
  },
  handler: async (ctx, args) => {
    const recipient = await ctx.db.get(args.recipientUserId);
    if (!recipient || recipient.status !== "ACTIVE") {
      return { notificationId: null, created: false, reason: "recipient_inactive" as const };
    }

    const dedupeKey = requiredText(args.dedupeKey, "Dedupe key", 180);
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_dedupe_key", (index) =>
        index.eq("recipientUserId", recipient._id).eq("dedupeKey", dedupeKey),
      )
      .unique();
    if (existing) {
      return { notificationId: existing._id, created: false, reason: "duplicate" as const };
    }

    const entityId = optionalText(args.entityId, 120);
    if (Boolean(args.entityType) !== Boolean(entityId)) {
      throw new Error("Notification entity type and entity ID must be provided together.");
    }

    const notificationId = await ctx.db.insert("notifications", {
      recipientUserId: recipient._id,
      type: args.type,
      title: requiredText(args.title, "Notification title", 120),
      body: requiredText(args.body, "Notification body", 500),
      entityType: args.entityType,
      entityId,
      deepLink: safeDeepLink(args.deepLink),
      priority: args.priority,
      dedupeKey,
      isRead: false,
      createdAt: Date.now(),
    });
    return { notificationId, created: true, reason: "created" as const };
  },
});
