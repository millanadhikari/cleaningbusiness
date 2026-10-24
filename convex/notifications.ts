import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireCleaner, requireRole } from "./lib/auth";

const adminRoles = ["SUPER_ADMIN", "ADMIN"] as const;

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

type NotificationInput = {
  recipientUserId: Id<"users">;
  type:
    | "QUOTE_REQUEST_NEW"
    | "BOOKING_CREATED"
    | "BOOKING_UPDATED"
    | "BOOKING_CANCELLED"
    | "BOOKING_CHANGE_REQUESTED"
    | "JOB_OFFERED"
    | "JOB_ACCEPTED"
    | "JOB_DECLINED"
    | "JOB_COMPLETED"
    | "ISSUE_PHOTO_UPLOADED"
    | "CUSTOMER_EMAIL_RECEIVED"
    | "PAYMENT_SUCCEEDED"
    | "PAYMENT_FAILED"
    | "ADMIN_MESSAGE"
    | "JOB_REMINDER";
  title: string;
  body: string;
  entityType?: "BOOKING" | "QUOTE_REQUEST" | "EMAIL_THREAD" | "PAYMENT" | "SYSTEM";
  entityId?: string;
  deepLink?: string;
  priority: "NORMAL" | "HIGH";
  dedupeKey: string;
};

async function insertNotification(ctx: MutationCtx, args: NotificationInput) {
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
  if (recipient.role === "CLEANER") {
    await ctx.scheduler.runAfter(0, internal.pushNotifications.sendNotification, {
      notificationId,
    });
  }
  return { notificationId, created: true, reason: "created" as const };
}

export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, adminRoles);
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
    const user = await requireRole(ctx, adminRoles);
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
    const user = await requireRole(ctx, adminRoles);
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
    const user = await requireRole(ctx, adminRoles);
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

export const listCleanerMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { user } = await requireCleaner(ctx);
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

export const getCleanerUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireCleaner(ctx);
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

export const markCleanerRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const { user } = await requireCleaner(ctx);
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

export const markAllCleanerRead = mutation({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireCleaner(ctx);
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
  handler: insertNotification,
});

export const notifyActiveAdmins = internalMutation({
  args: {
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
    const [superAdmins, admins] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_role_and_status", (index) =>
          index.eq("role", "SUPER_ADMIN").eq("status", "ACTIVE"),
        )
        .collect(),
      ctx.db
        .query("users")
        .withIndex("by_role_and_status", (index) =>
          index.eq("role", "ADMIN").eq("status", "ACTIVE"),
        )
        .collect(),
    ]);

    let created = 0;
    for (const recipient of [...superAdmins, ...admins]) {
      const result = await insertNotification(ctx, {
        ...args,
        recipientUserId: recipient._id,
      });
      if (result.created) created += 1;
    }
    return { recipients: superAdmins.length + admins.length, created };
  },
});

export const notifyAssignedCleaners = internalMutation({
  args: {
    bookingId: v.id("bookings"),
    type: v.union(
      v.literal("BOOKING_UPDATED"),
      v.literal("BOOKING_CANCELLED"),
      v.literal("ADMIN_MESSAGE"),
      v.literal("JOB_REMINDER"),
    ),
    title: v.string(),
    body: v.string(),
    priority: notificationPriority,
    dedupeKey: v.string(),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("bookingCleanerAssignments")
      .withIndex("by_booking", (index) => index.eq("bookingId", args.bookingId))
      .collect();
    let created = 0;
    for (const assignment of assignments) {
      if (assignment.status === "DECLINED") continue;
      const cleaner = await ctx.db.get(assignment.cleanerId);
      if (!cleaner?.userId || cleaner.status !== "ACTIVE") continue;
      const result = await insertNotification(ctx, {
        recipientUserId: cleaner.userId,
        type: args.type,
        title: args.title,
        body: args.body,
        entityType: "BOOKING",
        entityId: String(args.bookingId),
        deepLink: `/cleaner/jobs/${args.bookingId}`,
        priority: args.priority,
        dedupeKey: args.dedupeKey,
      });
      if (result.created) created += 1;
    }
    return { assignments: assignments.length, created };
  },
});

export const markRecipientNotificationRead = internalMutation({
  args: {
    recipientUserId: v.id("users"),
    dedupeKey: v.string(),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_dedupe_key", (index) =>
        index.eq("recipientUserId", args.recipientUserId).eq("dedupeKey", args.dedupeKey),
      )
      .unique();
    if (notification && !notification.isRead) {
      await ctx.db.patch(notification._id, { isRead: true, readAt: Date.now() });
    }
    return null;
  },
});

export const deleteRecipientNotification = internalMutation({
  args: {
    recipientUserId: v.id("users"),
    dedupeKey: v.string(),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_dedupe_key", (index) =>
        index.eq("recipientUserId", args.recipientUserId).eq("dedupeKey", args.dedupeKey),
      )
      .unique();
    if (notification) await ctx.db.delete(notification._id);
    return null;
  },
});
