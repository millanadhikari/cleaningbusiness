import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireCleaner } from "./lib/auth";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const RETRY_DELAYS_MS = [5_000, 30_000, 5 * 60_000] as const;

const platform = v.union(v.literal("ANDROID"), v.literal("IOS"));
const deliveryStatus = v.union(
  v.literal("PENDING"),
  v.literal("TICKET_OK"),
  v.literal("TICKET_ERROR"),
  v.literal("RECEIPT_OK"),
  v.literal("RECEIPT_ERROR"),
  v.literal("FAILED"),
);

function cleanText(value: string | undefined, maximumLength: number) {
  const cleaned = value?.trim().replace(/[\u0000-\u001f\u007f]/g, " ");
  return cleaned ? cleaned.slice(0, maximumLength) : undefined;
}

function validateExpoPushToken(value: string) {
  const token = value.trim();
  if (!/^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token)) {
    throw new Error("Enter a valid Expo push token.");
  }
  return token;
}

function expoHeaders() {
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  return {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorDetails(value: unknown) {
  const details = objectValue(value);
  return typeof details?.error === "string" ? details.error.slice(0, 120) : undefined;
}

export const registerDevice = mutation({
  args: {
    expoPushToken: v.string(),
    nativePushToken: v.optional(v.string()),
    platform,
    installationId: v.string(),
    projectId: v.optional(v.string()),
    appVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, cleaner } = await requireCleaner(ctx);
    const expoPushToken = validateExpoPushToken(args.expoPushToken);
    const installationId = cleanText(args.installationId, 160);
    if (!installationId) throw new Error("Installation identifier is required.");
    const now = Date.now();

    const [tokenDevice, installationDevices] = await Promise.all([
      ctx.db
        .query("pushDevices")
        .withIndex("by_expo_push_token", (index) => index.eq("expoPushToken", expoPushToken))
        .unique(),
      ctx.db
        .query("pushDevices")
        .withIndex("by_user_and_installation", (index) =>
          index.eq("userId", user._id).eq("installationId", installationId),
        )
        .collect(),
    ]);

    for (const device of installationDevices) {
      if (device._id !== tokenDevice?._id && device.status !== "INACTIVE") {
        await ctx.db.patch(device._id, { status: "INACTIVE", updatedAt: now });
      }
    }

    let deviceId: Id<"pushDevices">;
    if (tokenDevice) {
      await ctx.db.patch(tokenDevice._id, {
        userId: user._id,
        nativePushToken: cleanText(args.nativePushToken, 500),
        platform: args.platform,
        installationId,
        projectId: cleanText(args.projectId, 160),
        appVersion: cleanText(args.appVersion, 80),
        status: "ACTIVE",
        lastRegisteredAt: now,
        updatedAt: now,
      });
      deviceId = tokenDevice._id;
    } else {
      deviceId = await ctx.db.insert("pushDevices", {
        userId: user._id,
        expoPushToken,
        nativePushToken: cleanText(args.nativePushToken, 500),
        platform: args.platform,
        installationId,
        projectId: cleanText(args.projectId, 160),
        appVersion: cleanText(args.appVersion, 80),
        status: "ACTIVE",
        lastRegisteredAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.jobReminders.syncCleanerReminders, {
      cleanerId: cleaner._id,
    });
    return deviceId;
  },
});

export const unregisterDevice = mutation({
  args: { installationId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireCleaner(ctx);
    const installationId = cleanText(args.installationId, 160);
    if (!installationId) return { updated: 0 };
    const devices = await ctx.db
      .query("pushDevices")
      .withIndex("by_user_and_installation", (index) =>
        index.eq("userId", user._id).eq("installationId", installationId),
      )
      .collect();
    const now = Date.now();
    await Promise.all(
      devices.map((device) =>
        ctx.db.patch(device._id, { status: "INACTIVE", updatedAt: now }),
      ),
    );
    return { updated: devices.length };
  },
});

export const getMyPushStatus = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireCleaner(ctx);
    const devices = await ctx.db
      .query("pushDevices")
      .withIndex("by_user", (index) => index.eq("userId", user._id))
      .collect();
    return devices.map((device) => ({
      id: device._id,
      platform: device.platform,
      installationId: device.installationId,
      appVersion: device.appVersion,
      status: device.status,
      lastRegisteredAt: device.lastRegisteredAt,
    }));
  },
});

export const prepareDeliveries = internalMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;
    const recipient = await ctx.db.get(notification.recipientUserId);
    if (!recipient || recipient.role !== "CLEANER" || recipient.status !== "ACTIVE") return null;
    const devices = await ctx.db
      .query("pushDevices")
      .withIndex("by_user", (index) => index.eq("userId", recipient._id))
      .collect();
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_read_and_created_at", (index) =>
        index.eq("recipientUserId", recipient._id).eq("isRead", false),
      )
      .take(100);
    const now = Date.now();
    const deliveries = [];
    for (const device of devices) {
      if (device.status !== "ACTIVE") continue;
      let delivery = await ctx.db
        .query("notificationPushDeliveries")
        .withIndex("by_notification_and_device", (index) =>
          index.eq("notificationId", notification._id).eq("pushDeviceId", device._id),
        )
        .unique();
      if (!delivery) {
        const deliveryId = await ctx.db.insert("notificationPushDeliveries", {
          notificationId: notification._id,
          pushDeviceId: device._id,
          status: "PENDING",
          attemptCount: 0,
          createdAt: now,
          updatedAt: now,
        });
        delivery = await ctx.db.get(deliveryId);
      }
      if (!delivery || delivery.attemptCount >= 4 || !["PENDING", "FAILED"].includes(delivery.status)) {
        continue;
      }
      await ctx.db.patch(delivery._id, {
        attemptCount: delivery.attemptCount + 1,
        status: "PENDING",
        errorCode: undefined,
        errorMessage: undefined,
        updatedAt: now,
      });
      deliveries.push({
        deliveryId: delivery._id,
        pushDeviceId: device._id,
        expoPushToken: device.expoPushToken,
      });
    }
    return {
      notification: {
        id: notification._id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        deepLink: notification.deepLink,
        entityType: notification.entityType,
        entityId: notification.entityId,
        priority: notification.priority,
      },
      badge: Math.min(unread.length, 99),
      deliveries,
    };
  },
});

export const recordTickets = internalMutation({
  args: {
    results: v.array(v.object({
      deliveryId: v.id("notificationPushDeliveries"),
      pushDeviceId: v.id("pushDevices"),
      status: deliveryStatus,
      expoTicketId: v.optional(v.string()),
      errorCode: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const receiptDeliveryIds: Id<"notificationPushDeliveries">[] = [];
    for (const result of args.results) {
      await ctx.db.patch(result.deliveryId, {
        status: result.status,
        expoTicketId: result.expoTicketId,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        updatedAt: now,
      });
      if (result.status === "TICKET_OK" && result.expoTicketId) {
        receiptDeliveryIds.push(result.deliveryId);
      }
      if (result.errorCode === "DeviceNotRegistered") {
        await ctx.db.patch(result.pushDeviceId, { status: "INACTIVE", updatedAt: now });
      }
    }
    return receiptDeliveryIds;
  },
});

export const markDispatchFailed = internalMutation({
  args: {
    deliveryIds: v.array(v.id("notificationPushDeliveries")),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await Promise.all(
      args.deliveryIds.map((deliveryId) =>
        ctx.db.patch(deliveryId, {
          status: "FAILED",
          errorMessage: args.errorMessage.slice(0, 500),
          updatedAt: now,
        }),
      ),
    );
    return null;
  },
});

export const getReceiptRequests = internalQuery({
  args: { deliveryIds: v.array(v.id("notificationPushDeliveries")) },
  handler: async (ctx, args) => {
    const requests = [];
    for (const deliveryId of args.deliveryIds) {
      const delivery = await ctx.db.get(deliveryId);
      if (!delivery?.expoTicketId || delivery.status !== "TICKET_OK") continue;
      requests.push({
        deliveryId: delivery._id,
        pushDeviceId: delivery.pushDeviceId,
        expoTicketId: delivery.expoTicketId,
      });
    }
    return requests;
  },
});

export const recordReceipts = internalMutation({
  args: {
    results: v.array(v.object({
      deliveryId: v.id("notificationPushDeliveries"),
      pushDeviceId: v.id("pushDevices"),
      status: deliveryStatus,
      errorCode: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const result of args.results) {
      await ctx.db.patch(result.deliveryId, {
        status: result.status,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        updatedAt: now,
      });
      if (result.errorCode === "DeviceNotRegistered") {
        await ctx.db.patch(result.pushDeviceId, { status: "INACTIVE", updatedAt: now });
      }
    }
    return null;
  },
});

export const sendNotification = internalAction({
  args: { notificationId: v.id("notifications"), attempt: v.optional(v.number()) },
  handler: async (ctx, args): Promise<void> => {
    const attempt = Math.max(0, Math.floor(args.attempt ?? 0));
    const prepared = await ctx.runMutation(internal.pushNotifications.prepareDeliveries, {
      notificationId: args.notificationId,
    });
    if (!prepared?.deliveries.length) return;
    const deliveryIds = prepared.deliveries.map((item) => item.deliveryId);
    try {
      const response = await fetch(EXPO_SEND_URL, {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify(prepared.deliveries.map((delivery) => ({
          to: delivery.expoPushToken,
          title: prepared.notification.title,
          body: prepared.notification.body,
          sound: "default",
          priority: prepared.notification.priority === "HIGH" ? "high" : "default",
          channelId: prepared.notification.priority === "HIGH" ? "job-alerts" : "updates",
          badge: prepared.badge,
          data: {
            notificationId: String(prepared.notification.id),
            type: prepared.notification.type,
            deepLink: prepared.notification.deepLink ?? "/cleaner",
            entityType: prepared.notification.entityType ?? "SYSTEM",
            entityId: prepared.notification.entityId ?? "",
          },
        }))),
      });
      if (!response.ok) {
        const message = `Expo push request failed with status ${response.status}.`;
        await ctx.runMutation(internal.pushNotifications.markDispatchFailed, {
          deliveryIds,
          errorMessage: message,
        });
        if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS_MS.length) {
          await ctx.scheduler.runAfter(
            RETRY_DELAYS_MS[attempt],
            internal.pushNotifications.sendNotification,
            { notificationId: args.notificationId, attempt: attempt + 1 },
          );
        }
        return;
      }
      const payload = objectValue(await response.json());
      const ticketValues = Array.isArray(payload?.data) ? payload.data : [payload?.data];
      const results = prepared.deliveries.map((delivery, index) => {
        const ticket = objectValue(ticketValues[index]);
        const ok = ticket?.status === "ok" && typeof ticket.id === "string";
        return {
          deliveryId: delivery.deliveryId,
          pushDeviceId: delivery.pushDeviceId,
          status: ok ? "TICKET_OK" as const : "TICKET_ERROR" as const,
          expoTicketId: ok ? String(ticket.id) : undefined,
          errorCode: ok ? undefined : errorDetails(ticket?.details),
          errorMessage: ok
            ? undefined
            : typeof ticket?.message === "string"
              ? ticket.message.slice(0, 500)
              : "Expo rejected the push notification.",
        };
      });
      const receiptDeliveryIds = await ctx.runMutation(
        internal.pushNotifications.recordTickets,
        { results },
      );
      if (receiptDeliveryIds.length) {
        await ctx.scheduler.runAfter(
          RECEIPT_DELAY_MS,
          internal.pushNotifications.checkReceipts,
          { deliveryIds: receiptDeliveryIds },
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Expo push delivery failed.";
      await ctx.runMutation(internal.pushNotifications.markDispatchFailed, {
        deliveryIds,
        errorMessage: message,
      });
      if (attempt < RETRY_DELAYS_MS.length) {
        await ctx.scheduler.runAfter(
          RETRY_DELAYS_MS[attempt],
          internal.pushNotifications.sendNotification,
          { notificationId: args.notificationId, attempt: attempt + 1 },
        );
      }
    }
  },
});

export const checkReceipts = internalAction({
  args: {
    deliveryIds: v.array(v.id("notificationPushDeliveries")),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const requests = await ctx.runQuery(internal.pushNotifications.getReceiptRequests, {
      deliveryIds: args.deliveryIds,
    });
    if (!requests.length) return;
    const attempt = Math.max(0, Math.floor(args.attempt ?? 0));
    try {
      const response = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify({ ids: requests.map((item) => item.expoTicketId) }),
      });
      if (!response.ok) throw new Error(`Expo receipt request failed with status ${response.status}.`);
      const payload = objectValue(await response.json());
      const receiptMap = objectValue(payload?.data);
      if (!receiptMap) throw new Error("Expo receipt response was invalid.");
      const results = requests.flatMap((request) => {
        const receipt = objectValue(receiptMap[request.expoTicketId]);
        if (!receipt) return [];
        const ok = receipt.status === "ok";
        return [{
          deliveryId: request.deliveryId,
          pushDeviceId: request.pushDeviceId,
          status: ok ? "RECEIPT_OK" as const : "RECEIPT_ERROR" as const,
          errorCode: ok ? undefined : errorDetails(receipt.details),
          errorMessage: ok
            ? undefined
            : typeof receipt.message === "string"
              ? receipt.message.slice(0, 500)
              : "Push provider rejected the notification.",
        }];
      });
      if (results.length) {
        await ctx.runMutation(internal.pushNotifications.recordReceipts, { results });
      }
    } catch {
      if (attempt < 2) {
        await ctx.scheduler.runAfter(
          5 * 60_000,
          internal.pushNotifications.checkReceipts,
          { deliveryIds: args.deliveryIds, attempt: attempt + 1 },
        );
      }
    }
  },
});
