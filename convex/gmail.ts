import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireRole } from "./lib/auth";

const adminRoles = ["SUPER_ADMIN", "ADMIN"] as const;

type EmailAttachTarget = {
  type: "BOOKING" | "QUOTE";
  id: Id<"bookings"> | Id<"quoteRequests">;
  reference: string;
  customerName: string;
  detail: string;
};

async function internalUser(ctx: Parameters<typeof requireRole>[0], clerkUserId: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (index) => index.eq("clerkUserId", clerkUserId))
    .unique();
  if (!user || user.status !== "ACTIVE") throw new Error("Authentication required.");
  return user;
}

function displayName(user: { firstName?: string; lastName?: string; email?: string }) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Admin";
}

export const getConnectionStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, adminRoles);
    const connection = await ctx.db
      .query("gmailConnections")
      .withIndex("by_status", (index) => index.eq("status", "ACTIVE"))
      .first();
    return {
      connected: Boolean(connection),
      status: connection?.status ?? "DISCONNECTED",
      email: user.role === "SUPER_ADMIN" ? connection?.email : undefined,
      canManage: user.role === "SUPER_ADMIN",
      watchStatus: connection?.watchStatus,
      watchExpiration: connection?.watchExpiration,
      watchUpdatedAt: connection?.watchUpdatedAt,
      watchError: user.role === "SUPER_ADMIN" ? connection?.watchError : undefined,
    };
  },
});

export const getConversation = query({
  args: {
    quoteId: v.optional(v.id("quoteRequests")),
    bookingId: v.optional(v.id("bookings")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, adminRoles);
    if (Boolean(args.quoteId) === Boolean(args.bookingId)) {
      throw new Error("Select one quote or booking conversation.");
    }

    const entity = args.quoteId
      ? await ctx.db.get(args.quoteId)
      : args.bookingId
        ? await ctx.db.get(args.bookingId)
        : null;
    if (!entity) throw new Error("Quote or booking not found.");
    const customer = await ctx.db.get(entity.customerId);
    if (!customer) throw new Error("Customer not found.");

    let thread = args.quoteId
      ? await ctx.db
          .query("emailThreads")
          .withIndex("by_quote", (index) => index.eq("quoteId", args.quoteId))
          .first()
      : await ctx.db
          .query("emailThreads")
          .withIndex("by_booking", (index) => index.eq("bookingId", args.bookingId))
          .first();

    if (!thread && args.bookingId && "quoteRequestId" in entity && entity.quoteRequestId) {
      thread = await ctx.db
        .query("emailThreads")
        .withIndex("by_quote", (index) => index.eq("quoteId", entity.quoteRequestId))
        .first();
    }

    const connection = await ctx.db
      .query("gmailConnections")
      .withIndex("by_status", (index) => index.eq("status", "ACTIVE"))
      .first();
    const messages = thread
      ? await ctx.db
          .query("emailMessages")
          .withIndex("by_thread", (index) => index.eq("threadId", thread!._id))
          .order("asc")
          .take(200)
      : [];
    const senders = new Map<string, string>();
    await Promise.all(
      messages.map(async (message) => {
        if (!message.sentByUserId || senders.has(message.sentByUserId)) return;
        const sender = await ctx.db.get(message.sentByUserId);
        if (sender) senders.set(message.sentByUserId, displayName(sender));
      }),
    );

    return {
      connected: Boolean(connection),
      recipient: customer.email,
      movedToBookingId:
        args.quoteId && thread?.activeContext === "BOOKING" ? thread.bookingId : undefined,
      thread: thread
        ? {
            _id: thread._id,
            subject: thread.subject,
            status: thread.status,
            activeContext: thread.activeContext,
            lastMessageAt: thread.lastMessageAt,
            unreadCount: thread.unreadCount ?? 0,
            messages: messages.map((message) => ({
              _id: message._id,
              direction: message.direction,
              from: message.from,
              to: message.to,
              subject: message.subject,
              bodyText: message.bodyText,
              sentAt: message.sentAt,
              isUnread: message.direction === "INBOUND" && !message.readAt,
              senderName: message.sentByUserId
                ? senders.get(message.sentByUserId) ?? "Admin"
                : undefined,
            })),
          }
        : null,
    };
  },
});

export const prepareConnectionManagement = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const user = await internalUser(ctx, clerkUserId);
    if (user.role !== "SUPER_ADMIN") throw new Error("Super Admin access required.");
    const connection = await ctx.db
      .query("gmailConnections")
      .withIndex("by_status", (index) => index.eq("status", "ACTIVE"))
      .first();
    return {
      userId: user._id,
      connection: connection
        ? { id: connection._id, email: connection.email, refreshToken: connection.refreshToken }
        : null,
    };
  },
});

export const storeConnection = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    refreshToken: v.optional(v.string()),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await internalUser(ctx, args.clerkUserId);
    if (user.role !== "SUPER_ADMIN") throw new Error("Super Admin access required.");
    const now = Date.now();
    const activeConnections = await ctx.db
      .query("gmailConnections")
      .withIndex("by_status", (index) => index.eq("status", "ACTIVE"))
      .collect();
    const matching = await ctx.db
      .query("gmailConnections")
      .withIndex("by_email", (index) => index.eq("email", args.email))
      .first();
    const refreshToken = args.refreshToken ?? matching?.refreshToken;
    if (!refreshToken) {
      throw new Error("Google did not return a refresh token. Reconnect and grant consent again.");
    }
    for (const connection of activeConnections) {
      if (connection._id !== matching?._id) {
        await ctx.db.patch(connection._id, {
          refreshToken: undefined,
          status: "DISCONNECTED",
          updatedAt: now,
        });
      }
    }
    if (matching) {
      await ctx.db.patch(matching._id, {
        refreshToken,
        scope: args.scope,
        status: "ACTIVE",
        connectedByUserId: user._id,
        updatedAt: now,
      });
      return matching._id;
    }
    return ctx.db.insert("gmailConnections", {
      email: args.email,
      refreshToken,
      scope: args.scope,
      status: "ACTIVE",
      connectedByUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markDisconnected = internalMutation({
  args: { clerkUserId: v.string(), connectionId: v.id("gmailConnections") },
  handler: async (ctx, args) => {
    const user = await internalUser(ctx, args.clerkUserId);
    if (user.role !== "SUPER_ADMIN") throw new Error("Super Admin access required.");
    const connection = await ctx.db.get(args.connectionId);
    if (connection) {
      await ctx.db.patch(connection._id, {
        refreshToken: undefined,
        status: "DISCONNECTED",
        watchStatus: undefined,
        watchExpiration: undefined,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const markProviderDisconnected = internalMutation({
  args: { connectionId: v.id("gmailConnections") },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (connection) {
      await ctx.db.patch(connection._id, {
        refreshToken: undefined,
        status: "DISCONNECTED",
        watchStatus: undefined,
        watchExpiration: undefined,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const prepareSend = internalQuery({
  args: {
    clerkUserId: v.string(),
    quoteId: v.optional(v.id("quoteRequests")),
    bookingId: v.optional(v.id("bookings")),
    to: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await internalUser(ctx, args.clerkUserId);
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      throw new Error("Admin access required.");
    }
    if (Boolean(args.quoteId) === Boolean(args.bookingId)) {
      throw new Error("Select one quote or booking conversation.");
    }
    const entity = args.quoteId
      ? await ctx.db.get(args.quoteId)
      : args.bookingId
        ? await ctx.db.get(args.bookingId)
        : null;
    if (!entity) throw new Error("Quote or booking not found.");
    const customer = await ctx.db.get(entity.customerId);
    if (!customer?.email) throw new Error("Add a customer email before sending.");
    if (customer.email.trim().toLowerCase() !== args.to.trim().toLowerCase()) {
      throw new Error("The recipient must match the customer on this record.");
    }
    let thread = args.quoteId
      ? await ctx.db
          .query("emailThreads")
          .withIndex("by_quote", (index) => index.eq("quoteId", args.quoteId))
          .first()
      : await ctx.db
          .query("emailThreads")
          .withIndex("by_booking", (index) => index.eq("bookingId", args.bookingId))
          .first();
    if (!thread && args.bookingId && "quoteRequestId" in entity && entity.quoteRequestId) {
      thread = await ctx.db
        .query("emailThreads")
        .withIndex("by_quote", (index) => index.eq("quoteId", entity.quoteRequestId))
        .first();
    }
    if (args.quoteId && thread?.activeContext === "BOOKING") {
      throw new Error("This conversation has moved to the booking.");
    }
    const connection = await ctx.db
      .query("gmailConnections")
      .withIndex("by_status", (index) => index.eq("status", "ACTIVE"))
      .first();
    if (!connection?.refreshToken) throw new Error("Company Gmail is not connected.");
    const messages = thread
      ? await ctx.db
          .query("emailMessages")
          .withIndex("by_thread", (index) => index.eq("threadId", thread!._id))
          .order("desc")
          .take(50)
      : [];
    return {
      userId: user._id,
      senderName: displayName(user),
      customerId: customer._id,
      connectionId: connection._id,
      connectedEmail: connection.email,
      refreshToken: connection.refreshToken,
      gmailThreadId: thread?.gmailThreadId,
      existingSubject: thread?.subject,
      replyToMessageId: messages.find((message) => message.rfcMessageId)?.rfcMessageId,
    };
  },
});

export const recordSentMessage = internalMutation({
  args: {
    clerkUserId: v.string(),
    quoteId: v.optional(v.id("quoteRequests")),
    bookingId: v.optional(v.id("bookings")),
    customerId: v.id("customers"),
    gmailThreadId: v.string(),
    gmailMessageId: v.string(),
    rfcMessageId: v.string(),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    bodyText: v.string(),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await internalUser(ctx, args.clerkUserId);
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      throw new Error("Admin access required.");
    }
    if (Boolean(args.quoteId) === Boolean(args.bookingId)) {
      throw new Error("Select one quote or booking conversation.");
    }
    const entity = args.quoteId
      ? await ctx.db.get(args.quoteId)
      : args.bookingId
        ? await ctx.db.get(args.bookingId)
        : null;
    if (!entity || entity.customerId !== args.customerId) {
      throw new Error("Conversation record mismatch.");
    }
    const linkedQuoteId = args.quoteId ??
      (args.bookingId && "quoteRequestId" in entity ? entity.quoteRequestId : undefined);
    let thread = args.quoteId
      ? await ctx.db
          .query("emailThreads")
          .withIndex("by_quote", (index) => index.eq("quoteId", args.quoteId))
          .first()
      : await ctx.db
          .query("emailThreads")
          .withIndex("by_booking", (index) => index.eq("bookingId", args.bookingId))
          .first();
    if (!thread && args.bookingId && "quoteRequestId" in entity && entity.quoteRequestId) {
      thread = await ctx.db
        .query("emailThreads")
        .withIndex("by_quote", (index) => index.eq("quoteId", entity.quoteRequestId))
        .first();
    }
    const now = Date.now();
    const threadId = thread?._id ??
      (await ctx.db.insert("emailThreads", {
        customerId: args.customerId,
        quoteId: linkedQuoteId,
        bookingId: args.bookingId,
        activeContext: args.bookingId ? "BOOKING" : "QUOTE",
        gmailThreadId: args.gmailThreadId,
        subject: args.subject,
        status: "WAITING_CUSTOMER",
        unreadCount: 0,
        lastMessageAt: args.sentAt,
        createdAt: now,
        updatedAt: now,
      }));
    if (thread) {
      await ctx.db.patch(thread._id, {
        quoteId: linkedQuoteId ?? thread.quoteId,
        bookingId: args.bookingId ?? thread.bookingId,
        activeContext: args.bookingId ? "BOOKING" : thread.activeContext,
        gmailThreadId: args.gmailThreadId,
        status: "WAITING_CUSTOMER",
        lastMessageAt: args.sentAt,
        updatedAt: now,
      });
    }
    await ctx.db.insert("emailMessages", {
      threadId,
      gmailMessageId: args.gmailMessageId,
      rfcMessageId: args.rfcMessageId,
      direction: "OUTBOUND",
      from: args.from,
      to: args.to,
      subject: args.subject,
      bodyText: args.bodyText,
      sentByUserId: user._id,
      sentAt: args.sentAt,
      createdAt: now,
    });
    return threadId;
  },
});

function messageIds(value: string | undefined) {
  if (!value) return [];
  const bracketed = value.match(/<[^>]+>/g);
  if (bracketed?.length) return bracketed.map((item) => item.trim());
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function historyIdIsAfter(candidate: string, current: string | undefined) {
  if (!current) return true;
  const cleanCandidate = candidate.replace(/^0+/, "") || "0";
  const cleanCurrent = current.replace(/^0+/, "") || "0";
  return cleanCandidate.length > cleanCurrent.length ||
    (cleanCandidate.length === cleanCurrent.length && cleanCandidate > cleanCurrent);
}

async function threadForBooking(ctx: MutationCtx, booking: Doc<"bookings">) {
  let thread = await ctx.db
    .query("emailThreads")
    .withIndex("by_booking", (index) => index.eq("bookingId", booking._id))
    .first();
  if (!thread && booking.quoteRequestId) {
    thread = await ctx.db
      .query("emailThreads")
      .withIndex("by_quote", (index) => index.eq("quoteId", booking.quoteRequestId))
      .first();
  }
  return thread;
}

async function targetFromSubject(ctx: MutationCtx, subject: string) {
  const references = [...new Set((subject.match(/\bWD\d{4,}\b/gi) ?? []).map((value) => value.toUpperCase()))];
  for (const reference of references) {
    const booking = await ctx.db
      .query("bookings")
      .withIndex("by_reference", (index) => index.eq("reference", reference))
      .first();
    if (booking) {
      return {
        thread: await threadForBooking(ctx, booking),
        customerId: booking.customerId,
        quoteId: booking.quoteRequestId,
        bookingId: booking._id,
        activeContext: "BOOKING" as const,
      };
    }

    const quote = await ctx.db
      .query("quoteRequests")
      .withIndex("by_reference", (index) => index.eq("reference", reference))
      .first();
    if (!quote) continue;
    if (quote.convertedBookingId) {
      const convertedBooking = await ctx.db.get(quote.convertedBookingId);
      if (convertedBooking) {
        return {
          thread: await threadForBooking(ctx, convertedBooking),
          customerId: convertedBooking.customerId,
          quoteId: quote._id,
          bookingId: convertedBooking._id,
          activeContext: "BOOKING" as const,
        };
      }
    }
    return {
      thread: await ctx.db
        .query("emailThreads")
        .withIndex("by_quote", (index) => index.eq("quoteId", quote._id))
        .first(),
      customerId: quote.customerId,
      quoteId: quote._id,
      bookingId: undefined,
      activeContext: "QUOTE" as const,
    };
  }
  return null;
}

async function threadFromReplyHeaders(
  ctx: MutationCtx,
  inReplyTo: string | undefined,
  references: string[],
) {
  const identifiers = [...new Set([...messageIds(inReplyTo), ...references.flatMap(messageIds)])];
  for (const identifier of identifiers) {
    const message = await ctx.db
      .query("emailMessages")
      .withIndex("by_rfc_message", (index) => index.eq("rfcMessageId", identifier))
      .first();
    if (message?.direction === "OUTBOUND") {
      const thread = await ctx.db.get(message.threadId);
      if (thread) return thread;
    }
  }
  return null;
}

const inboundMessageArgs = {
  gmailMessageId: v.string(),
  gmailThreadId: v.string(),
  rfcMessageId: v.optional(v.string()),
  inReplyTo: v.optional(v.string()),
  references: v.array(v.string()),
  from: v.string(),
  to: v.string(),
  subject: v.string(),
  bodyText: v.string(),
  bodyHtml: v.optional(v.string()),
  sentAt: v.number(),
};

export const getActiveConnection = internalQuery({
  args: {},
  handler: async (ctx) => {
    const connection = await ctx.db
      .query("gmailConnections")
      .withIndex("by_status", (index) => index.eq("status", "ACTIVE"))
      .first();
    if (!connection?.refreshToken) return null;
    return {
      id: connection._id,
      email: connection.email,
      refreshToken: connection.refreshToken,
      gmailHistoryId: connection.gmailHistoryId,
    };
  },
});

export const updateWatchState = internalMutation({
  args: {
    connectionId: v.id("gmailConnections"),
    gmailHistoryId: v.string(),
    watchExpiration: v.number(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "ACTIVE") return null;
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      gmailHistoryId: historyIdIsAfter(args.gmailHistoryId, connection.gmailHistoryId)
        ? args.gmailHistoryId
        : connection.gmailHistoryId,
      watchExpiration: args.watchExpiration,
      watchUpdatedAt: now,
      watchStatus: "ACTIVE",
      watchError: undefined,
      updatedAt: now,
    });
    return null;
  },
});

export const setWatchError = internalMutation({
  args: { connectionId: v.id("gmailConnections"), message: v.string() },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "ACTIVE") return null;
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      watchStatus: "ERROR",
      watchError: args.message.slice(0, 300),
      watchUpdatedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const advanceHistoryId = internalMutation({
  args: { connectionId: v.id("gmailConnections"), gmailHistoryId: v.string() },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "ACTIVE") return null;
    if (historyIdIsAfter(args.gmailHistoryId, connection.gmailHistoryId)) {
      await ctx.db.patch(connection._id, {
        gmailHistoryId: args.gmailHistoryId,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const storeInboundMessage = internalMutation({
  args: inboundMessageArgs,
  handler: async (ctx, args) => {
    const existingMessage = await ctx.db
      .query("emailMessages")
      .withIndex("by_gmail_message", (index) => index.eq("gmailMessageId", args.gmailMessageId))
      .first();
    if (existingMessage) return { result: "duplicate" as const, threadId: existingMessage.threadId };
    const existingUnmatched = await ctx.db
      .query("unmatchedEmailMessages")
      .withIndex("by_gmail_message", (index) => index.eq("gmailMessageId", args.gmailMessageId))
      .first();
    if (existingUnmatched) return { result: "duplicate" as const, threadId: undefined };

    let thread = await ctx.db
      .query("emailThreads")
      .withIndex("by_gmail_thread", (index) => index.eq("gmailThreadId", args.gmailThreadId))
      .first();
    if (!thread) {
      thread = await threadFromReplyHeaders(ctx, args.inReplyTo, args.references);
    }

    let subjectTarget: Awaited<ReturnType<typeof targetFromSubject>> = null;
    if (!thread) {
      subjectTarget = await targetFromSubject(ctx, args.subject);
      thread = subjectTarget?.thread ?? null;
    }

    if (!thread && subjectTarget) {
      const now = Date.now();
      const threadId = await ctx.db.insert("emailThreads", {
        customerId: subjectTarget.customerId,
        quoteId: subjectTarget.quoteId,
        bookingId: subjectTarget.bookingId,
        activeContext: subjectTarget.activeContext,
        gmailThreadId: args.gmailThreadId,
        subject: args.subject,
        status: "WAITING_STAFF",
        unreadCount: 0,
        lastMessageAt: args.sentAt,
        createdAt: now,
        updatedAt: now,
      });
      thread = await ctx.db.get(threadId);
    }

    if (!thread) {
      await ctx.db.insert("unmatchedEmailMessages", {
        ...args,
        receivedAt: Date.now(),
      });
      return { result: "unmatched" as const, threadId: undefined };
    }

    const now = Date.now();
    await ctx.db.insert("emailMessages", {
      threadId: thread._id,
      gmailMessageId: args.gmailMessageId,
      rfcMessageId: args.rfcMessageId,
      direction: "INBOUND",
      from: args.from,
      to: args.to,
      subject: args.subject,
      bodyText: args.bodyText,
      bodyHtml: args.bodyHtml,
      sentAt: args.sentAt,
      createdAt: now,
    });

    const priorUnmatched = await ctx.db
      .query("unmatchedEmailMessages")
      .withIndex("by_gmail_thread", (index) => index.eq("gmailThreadId", args.gmailThreadId))
      .collect();
    for (const message of priorUnmatched) {
      const duplicate = await ctx.db
        .query("emailMessages")
        .withIndex("by_gmail_message", (index) => index.eq("gmailMessageId", message.gmailMessageId))
        .first();
      if (!duplicate) {
        await ctx.db.insert("emailMessages", {
          threadId: thread._id,
          gmailMessageId: message.gmailMessageId,
          rfcMessageId: message.rfcMessageId,
          direction: "INBOUND",
          from: message.from,
          to: message.to,
          subject: message.subject,
          bodyText: message.bodyText,
          bodyHtml: message.bodyHtml,
          sentAt: message.sentAt,
          createdAt: message.receivedAt,
        });
      }
      await ctx.db.delete(message._id);
    }

    await ctx.db.patch(thread._id, {
      gmailThreadId: args.gmailThreadId,
      status: "WAITING_STAFF",
      unreadCount: (thread.unreadCount ?? 0) + 1 + priorUnmatched.length,
      lastMessageAt: Math.max(thread.lastMessageAt, args.sentAt, ...priorUnmatched.map((item) => item.sentAt)),
      updatedAt: now,
    });
    return { result: "attached" as const, threadId: thread._id };
  },
});

export const markConversationRead = mutation({
  args: {
    quoteId: v.optional(v.id("quoteRequests")),
    bookingId: v.optional(v.id("bookings")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, adminRoles);
    if (Boolean(args.quoteId) === Boolean(args.bookingId)) {
      throw new Error("Select one quote or booking conversation.");
    }
    let thread = args.quoteId
      ? await ctx.db.query("emailThreads").withIndex("by_quote", (index) => index.eq("quoteId", args.quoteId)).first()
      : await ctx.db.query("emailThreads").withIndex("by_booking", (index) => index.eq("bookingId", args.bookingId)).first();
    if (!thread && args.bookingId) {
      const booking = await ctx.db.get(args.bookingId);
      if (booking?.quoteRequestId) {
        thread = await ctx.db.query("emailThreads").withIndex("by_quote", (index) => index.eq("quoteId", booking.quoteRequestId)).first();
      }
    }
    if (!thread) return null;
    const unreadMessages = await ctx.db
      .query("emailMessages")
      .withIndex("by_thread", (index) => index.eq("threadId", thread!._id))
      .collect();
    const now = Date.now();
    for (const message of unreadMessages) {
      if (message.direction === "INBOUND" && !message.readAt) {
        await ctx.db.patch(message._id, { readAt: now });
      }
    }
    await ctx.db.patch(thread._id, { unreadCount: 0, updatedAt: now });
    return null;
  },
});

export const getUnmatchedInbox = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, adminRoles);
    const [messages, quotes, bookings] = await Promise.all([
      ctx.db.query("unmatchedEmailMessages").withIndex("by_received_at").order("desc").take(200),
      ctx.db.query("quoteRequests").withIndex("by_created_at").order("desc").take(100),
      ctx.db.query("bookings").withIndex("by_created_at").order("desc").take(100),
    ]);
    const customerIds = new Set<Id<"customers">>([
      ...quotes.map((item) => item.customerId),
      ...bookings.map((item) => item.customerId),
    ]);
    const customers = new Map<Id<"customers">, Doc<"customers">>();
    await Promise.all([...customerIds].map(async (id) => {
      const customer = await ctx.db.get(id);
      if (customer) customers.set(id, customer);
    }));
    const labelFor = (customerId: Id<"customers">) => {
      const customer = customers.get(customerId);
      return customer
        ? [customer.firstName, customer.lastName].filter(Boolean).join(" ")
        : "Unknown customer";
    };
    const grouped = new Map<string, typeof messages>();
    for (const message of messages) {
      grouped.set(message.gmailThreadId, [...(grouped.get(message.gmailThreadId) ?? []), message]);
    }
    return {
      threads: [...grouped.entries()].map(([gmailThreadId, threadMessages]) => ({
        gmailThreadId,
        latestAt: Math.max(...threadMessages.map((message) => message.sentAt)),
        messages: threadMessages.sort((a, b) => a.sentAt - b.sentAt),
      })),
      targets: [
        ...bookings.map((booking) => ({
          type: "BOOKING" as const,
          id: booking._id,
          reference: booking.reference ?? String(booking._id),
          customerName: labelFor(booking.customerId),
          detail: [booking.addressLine1, booking.suburb].filter(Boolean).join(", "),
        })),
        ...quotes.map((quote) => ({
          type: "QUOTE" as const,
          id: quote._id,
          reference: quote.reference ?? String(quote._id),
          customerName: labelFor(quote.customerId),
          detail: [quote.addressLine1, quote.suburb].filter(Boolean).join(", "),
        })),
      ],
    };
  },
});

export const getUnmatchedCount = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, adminRoles);
    return (await ctx.db.query("unmatchedEmailMessages").withIndex("by_received_at").take(201)).length;
  },
});

export const findEmailAttachTargets = query({
  args: { reference: v.string() },
  handler: async (ctx, { reference }): Promise<EmailAttachTarget[]> => {
    await requireRole(ctx, adminRoles);
    const normalized = reference.trim().toUpperCase();
    if (!/^WD\d{4,}$/.test(normalized)) return [];
    const [booking, quote] = await Promise.all([
      ctx.db.query("bookings").withIndex("by_reference", (index) => index.eq("reference", normalized)).first(),
      ctx.db.query("quoteRequests").withIndex("by_reference", (index) => index.eq("reference", normalized)).first(),
    ]);
    const results: EmailAttachTarget[] = [];
    if (booking) {
      const customer = await ctx.db.get(booking.customerId);
      results.push({
        type: "BOOKING",
        id: booking._id,
        reference: booking.reference ?? normalized,
        customerName: customer ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") : "Unknown customer",
        detail: [booking.addressLine1, booking.suburb].filter(Boolean).join(", "),
      });
    }
    if (quote && !quote.convertedBookingId) {
      const customer = await ctx.db.get(quote.customerId);
      results.push({
        type: "QUOTE",
        id: quote._id,
        reference: quote.reference ?? normalized,
        customerName: customer ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") : "Unknown customer",
        detail: [quote.addressLine1, quote.suburb].filter(Boolean).join(", "),
      });
    }
    return results;
  },
});

export const attachUnmatchedThread = mutation({
  args: {
    unmatchedMessageId: v.id("unmatchedEmailMessages"),
    quoteId: v.optional(v.id("quoteRequests")),
    bookingId: v.optional(v.id("bookings")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, adminRoles);
    if (Boolean(args.quoteId) === Boolean(args.bookingId)) {
      throw new Error("Choose one quote or booking.");
    }
    const selected = await ctx.db.get(args.unmatchedMessageId);
    if (!selected) return null;

    let customerId: Id<"customers">;
    let quoteId = args.quoteId;
    let bookingId = args.bookingId;
    let activeContext: "QUOTE" | "BOOKING";
    let thread: Doc<"emailThreads"> | null = null;
    if (bookingId) {
      const booking = await ctx.db.get(bookingId);
      if (!booking) throw new Error("Booking not found.");
      customerId = booking.customerId;
      quoteId = booking.quoteRequestId;
      activeContext = "BOOKING";
      thread = await threadForBooking(ctx, booking);
    } else {
      const quote = await ctx.db.get(quoteId!);
      if (!quote) throw new Error("Quote not found.");
      if (quote.convertedBookingId) {
        const booking = await ctx.db.get(quote.convertedBookingId);
        if (!booking) throw new Error("Converted booking not found.");
        customerId = booking.customerId;
        bookingId = booking._id;
        activeContext = "BOOKING";
        thread = await threadForBooking(ctx, booking);
      } else {
        customerId = quote.customerId;
        activeContext = "QUOTE";
        thread = await ctx.db.query("emailThreads").withIndex("by_quote", (index) => index.eq("quoteId", quote._id)).first();
      }
    }

    const alreadyLinked = await ctx.db
      .query("emailThreads")
      .withIndex("by_gmail_thread", (index) => index.eq("gmailThreadId", selected.gmailThreadId))
      .first();
    if (alreadyLinked && alreadyLinked._id !== thread?._id) {
      throw new Error("This Gmail thread is already attached to another conversation.");
    }

    const now = Date.now();
    const threadId = thread?._id ?? await ctx.db.insert("emailThreads", {
      customerId,
      quoteId,
      bookingId,
      activeContext,
      gmailThreadId: selected.gmailThreadId,
      subject: selected.subject,
      status: "WAITING_STAFF",
      unreadCount: 0,
      lastMessageAt: selected.sentAt,
      createdAt: now,
      updatedAt: now,
    });
    const unmatched = await ctx.db
      .query("unmatchedEmailMessages")
      .withIndex("by_gmail_thread", (index) => index.eq("gmailThreadId", selected.gmailThreadId))
      .collect();
    let inserted = 0;
    for (const message of unmatched) {
      const duplicate = await ctx.db
        .query("emailMessages")
        .withIndex("by_gmail_message", (index) => index.eq("gmailMessageId", message.gmailMessageId))
        .first();
      if (!duplicate) {
        await ctx.db.insert("emailMessages", {
          threadId,
          gmailMessageId: message.gmailMessageId,
          rfcMessageId: message.rfcMessageId,
          direction: "INBOUND",
          from: message.from,
          to: message.to,
          subject: message.subject,
          bodyText: message.bodyText,
          bodyHtml: message.bodyHtml,
          sentAt: message.sentAt,
          createdAt: message.receivedAt,
        });
        inserted += 1;
      }
      await ctx.db.delete(message._id);
    }
    const latestAt = Math.max(selected.sentAt, ...unmatched.map((message) => message.sentAt));
    const currentThread = await ctx.db.get(threadId);
    await ctx.db.patch(threadId, {
      quoteId,
      bookingId,
      activeContext,
      gmailThreadId: selected.gmailThreadId,
      status: "WAITING_STAFF",
      unreadCount: (currentThread?.unreadCount ?? 0) + inserted,
      lastMessageAt: Math.max(currentThread?.lastMessageAt ?? 0, latestAt),
      updatedAt: now,
    });
    return { threadId, bookingId, quoteId };
  },
});
