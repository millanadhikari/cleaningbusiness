"use node";

import { randomUUID } from "node:crypto";
import { gmail_v1, google } from "googleapis";
import type { UserIdentity } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

function oauthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Gmail OAuth is not configured.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function identitySubject(identity: UserIdentity | null) {
  if (!identity) throw new Error("Authentication required.");
  return identity.subject;
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeRawMessage(headers: string[], body: string) {
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

function isRevokedAuthorization(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: number; message?: string; response?: { data?: { error?: string } } };
  return candidate.code === 401 || candidate.response?.data?.error === "invalid_grant" ||
    candidate.message?.toLowerCase().includes("invalid_grant") === true;
}

function safeProviderError(error: unknown) {
  if (!error || typeof error !== "object") return "Gmail request failed.";
  const candidate = error as { code?: number; message?: string };
  if (candidate.message === "Gmail Pub/Sub topic is not configured.") {
    return candidate.message;
  }
  if (candidate.code === 401 || isRevokedAuthorization(error)) {
    return "Gmail authorization has expired or was revoked.";
  }
  if (candidate.code === 403) return "Gmail or Pub/Sub denied the watch request.";
  if (candidate.code === 404) return "The stored Gmail history cursor expired.";
  return "Gmail synchronization failed. Check the Google Cloud configuration.";
}

function decodeBody(data: string | null | undefined) {
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf8");
}

function collectMimeBodies(part: gmail_v1.Schema$MessagePart | undefined) {
  const plain: string[] = [];
  const html: string[] = [];
  const visit = (current: gmail_v1.Schema$MessagePart | undefined) => {
    if (!current) return;
    const mimeType = current.mimeType?.toLowerCase();
    const content = decodeBody(current.body?.data);
    if (content && mimeType === "text/plain") plain.push(content);
    if (content && mimeType === "text/html") html.push(content);
    for (const child of current.parts ?? []) visit(child);
  };
  visit(part);
  return { bodyText: plain.join("\n\n").trim(), bodyHtml: html.join("\n").trim() };
}

function plainTextFromHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function headerMap(message: gmail_v1.Schema$Message) {
  return new Map(
    (message.payload?.headers ?? []).map((header) => [header.name?.toLowerCase() ?? "", header.value ?? ""]),
  );
}

function extractMessageIds(value: string | undefined) {
  if (!value) return [];
  return value.match(/<[^>]+>/g)?.map((item) => item.trim()) ??
    value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function senderAddress(value: string) {
  const bracketed = value.match(/<([^>]+)>/);
  return (bracketed?.[1] ?? value).trim().toLowerCase();
}

function isClearlyAutomatedMessage(headers: Map<string, string>, labels: Set<string>, from: string) {
  const address = senderAddress(from);
  const localPart = address.split("@")[0] ?? "";
  const autoSubmitted = headers.get("auto-submitted")?.trim().toLowerCase();
  const precedence = headers.get("precedence")?.trim().toLowerCase();

  return (
    labels.has("CATEGORY_PROMOTIONS") ||
    labels.has("CATEGORY_SOCIAL") ||
    labels.has("CATEGORY_FORUMS") ||
    Boolean(autoSubmitted && autoSubmitted !== "no") ||
    ["bulk", "list", "junk"].includes(precedence ?? "") ||
    headers.has("list-unsubscribe") ||
    /(?:^|[-_.])(?:no-?reply|do-?not-?reply|notifications?)(?:$|[-_.])/i.test(localPart)
  );
}

function isExpiredHistoryError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: number; message?: string };
  return candidate.code === 404 || /history.*(invalid|expired|not found)/i.test(candidate.message ?? "");
}

type ConnectionCredentials = {
  id: Id<"gmailConnections">;
  email: string;
  refreshToken: string;
  gmailHistoryId?: string;
};

type ProcessingResult = "attached" | "unmatched" | "duplicate" | "ignored";

async function startWatch(ctx: ActionCtx, connection: ConnectionCredentials) {
  const topicName = process.env.GMAIL_PUBSUB_TOPIC?.trim();
  if (!topicName) throw new Error("Gmail Pub/Sub topic is not configured.");
  const oauth = oauthClient();
  oauth.setCredentials({ refresh_token: connection.refreshToken });
  const response = await google.gmail({ version: "v1", auth: oauth }).users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    },
  });
  if (!response.data.historyId || !response.data.expiration) {
    throw new Error("Gmail did not return a watch history ID and expiration.");
  }
  const expiration = Number(response.data.expiration);
  if (!Number.isFinite(expiration)) throw new Error("Gmail returned an invalid watch expiration.");
  await ctx.runMutation(internal.gmail.updateWatchState, {
    connectionId: connection.id,
    gmailHistoryId: response.data.historyId,
    watchExpiration: expiration,
  });
  return { historyId: response.data.historyId, expiration };
}

export const completeConnection = action({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const clerkUserId = identitySubject(await ctx.auth.getUserIdentity());
    await ctx.runQuery(internal.gmail.prepareConnectionManagement, { clerkUserId });
    const oauth = oauthClient();
    const { tokens } = await oauth.getToken(code);
    oauth.setCredentials(tokens);
    const profile = await google.gmail({ version: "v1", auth: oauth }).users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress?.trim().toLowerCase();
    if (!email) throw new Error("Google did not return the connected Gmail address.");
    const connectionId = await ctx.runMutation(internal.gmail.storeConnection, {
      clerkUserId,
      email,
      refreshToken: tokens.refresh_token ?? undefined,
      scope: tokens.scope ?? "",
    });
    const stored = await ctx.runQuery(internal.gmail.getActiveConnection, {});
    let watchActive = false;
    if (stored && stored.id === connectionId) {
      try {
        await startWatch(ctx, stored);
        watchActive = true;
      } catch (error) {
        const message = safeProviderError(error);
        console.error("Gmail watch initialization failed", message);
        await ctx.runMutation(internal.gmail.setWatchError, { connectionId, message });
      }
    }
    return { email, watchActive };
  },
});

export const disconnect = action({
  args: {},
  handler: async (ctx) => {
    const clerkUserId = identitySubject(await ctx.auth.getUserIdentity());
    const prepared = await ctx.runQuery(internal.gmail.prepareConnectionManagement, { clerkUserId });
    if (!prepared.connection) return null;
    if (prepared.connection.refreshToken) {
      try {
        await oauthClient().revokeToken(prepared.connection.refreshToken);
      } catch (error) {
        console.error("Unable to revoke Google authorization", error instanceof Error ? error.message : error);
      }
    }
    await ctx.runMutation(internal.gmail.markDisconnected, {
      clerkUserId,
      connectionId: prepared.connection.id,
    });
    return null;
  },
});

export const refreshWatch = action({
  args: {},
  handler: async (ctx): Promise<{ historyId: string; expiration: number }> => {
    const clerkUserId = identitySubject(await ctx.auth.getUserIdentity());
    await ctx.runQuery(internal.gmail.prepareConnectionManagement, { clerkUserId });
    const connection: ConnectionCredentials | null = await ctx.runQuery(
      internal.gmail.getActiveConnection,
      {},
    );
    if (!connection) throw new Error("Company Gmail is not connected.");
    try {
      return await startWatch(ctx, connection);
    } catch (error) {
      const message = safeProviderError(error);
      console.error("Manual Gmail watch renewal failed", message);
      await ctx.runMutation(internal.gmail.setWatchError, {
        connectionId: connection.id,
        message,
      });
      throw new Error(message);
    }
  },
});

export const sendMessage = action({
  args: {
    quoteId: v.optional(v.id("quoteRequests")),
    bookingId: v.optional(v.id("bookings")),
    to: v.string(),
    subject: v.string(),
    bodyText: v.string(),
  },
  handler: async (ctx, args) => {
    const clerkUserId = identitySubject(await ctx.auth.getUserIdentity());
    const to = args.to.trim().toLowerCase();
    const requestedSubject = cleanHeader(args.subject).slice(0, 300);
    const bodyText = args.bodyText.trim().slice(0, 100_000);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Enter a valid recipient email.");
    if (!requestedSubject) throw new Error("Add an email subject.");
    if (!bodyText) throw new Error("Add an email message.");

    const prepared = await ctx.runQuery(internal.gmail.prepareSend, {
      clerkUserId,
      quoteId: args.quoteId,
      bookingId: args.bookingId,
      to,
    });
    const subject = prepared.existingSubject ?? requestedSubject;
    const oauth = oauthClient();
    oauth.setCredentials({ refresh_token: prepared.refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth });
    const domain = prepared.connectedEmail.split("@")[1] || "wedocleaning.com.au";
    const rfcMessageId = `<${randomUUID()}@${domain}>`;
    const headers = [
      `From: ${cleanHeader(prepared.connectedEmail)}`,
      `To: ${cleanHeader(to)}`,
      `Subject: ${cleanHeader(subject)}`,
      `Message-ID: ${rfcMessageId}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
    ];
    if (prepared.replyToMessageId) {
      headers.push(`In-Reply-To: ${cleanHeader(prepared.replyToMessageId)}`);
      headers.push(`References: ${cleanHeader(prepared.replyToMessageId)}`);
    }

    try {
      const sent = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodeRawMessage(headers, bodyText),
          threadId: prepared.gmailThreadId,
        },
      });
      if (!sent.data.id || !sent.data.threadId) throw new Error("Gmail did not return message identifiers.");
      const sentAt = Date.now();
      await ctx.runMutation(internal.gmail.recordSentMessage, {
        clerkUserId,
        quoteId: args.quoteId,
        bookingId: args.bookingId,
        customerId: prepared.customerId,
        gmailThreadId: sent.data.threadId,
        gmailMessageId: sent.data.id,
        rfcMessageId,
        from: prepared.connectedEmail,
        to,
        subject,
        bodyText,
        sentAt,
      });
      return { sentAt };
    } catch (error) {
      console.error("Gmail send failed", error instanceof Error ? error.message : error);
      if (isRevokedAuthorization(error)) {
        await ctx.runMutation(internal.gmail.markProviderDisconnected, {
          connectionId: prepared.connectionId,
        });
        throw new Error("Gmail authorization has expired or was revoked. Ask a Super Admin to reconnect it.");
      }
      throw new Error("Gmail could not send this email. Please try again.");
    }
  },
});

export const renewWatch = internalAction({
  args: {},
  handler: async (ctx) => {
    const connection = await ctx.runQuery(internal.gmail.getActiveConnection, {});
    if (!connection) return { renewed: false, reason: "not_connected" as const };
    try {
      const watch = await startWatch(ctx, connection);
      return { renewed: true, ...watch };
    } catch (error) {
      const message = safeProviderError(error);
      console.error("Gmail watch renewal failed", message);
      await ctx.runMutation(internal.gmail.setWatchError, {
        connectionId: connection.id,
        message,
      });
      return { renewed: false, reason: "provider_error" as const };
    }
  },
});

export const verifyPubSubToken = internalAction({
  args: { token: v.string() },
  handler: async (_ctx, { token }) => {
    const audience = process.env.GMAIL_PUBSUB_AUDIENCE?.trim();
    const serviceAccount = process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT?.trim().toLowerCase();
    if (!audience || !serviceAccount) {
      throw new Error("Gmail Pub/Sub authentication is not configured.");
    }
    const ticket = await new google.auth.OAuth2().verifyIdToken({
      idToken: token,
      audience,
    });
    const payload = ticket.getPayload();
    const validIssuer = payload?.iss === "accounts.google.com" ||
      payload?.iss === "https://accounts.google.com";
    const audienceClaim = Array.isArray(payload?.aud) ? payload.aud : [payload?.aud];
    if (
      !payload ||
      !validIssuer ||
      !audienceClaim.includes(audience) ||
      payload.email?.toLowerCase() !== serviceAccount ||
      payload.email_verified !== true
    ) {
      throw new Error("Invalid Pub/Sub identity token.");
    }
    return { email: payload.email };
  },
});

async function fetchAndStoreMessage(
  ctx: ActionCtx,
  gmail: gmail_v1.Gmail,
  connectedEmail: string,
  gmailMessageId: string,
): Promise<ProcessingResult> {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "full",
  });
  const message = response.data;
  if (!message.id || !message.threadId) return "ignored" as const;
  const labels = new Set(message.labelIds ?? []);
  if (!labels.has("INBOX") || labels.has("SENT")) return "ignored" as const;

  const headers = headerMap(message);
  const from = headers.get("from")?.trim() ?? "";
  if (!from || senderAddress(from) === connectedEmail.trim().toLowerCase()) {
    return "ignored" as const;
  }
  if (isClearlyAutomatedMessage(headers, labels, from)) return "ignored" as const;
  const to = headers.get("to")?.trim() || connectedEmail;
  const subject = headers.get("subject")?.trim() || "(No subject)";
  const rfcMessageId = headers.get("message-id")?.trim() || undefined;
  const inReplyTo = headers.get("in-reply-to")?.trim() || undefined;
  const referencesHeader = headers.get("references")?.trim();
  const references = extractMessageIds(referencesHeader);
  const bodies = collectMimeBodies(message.payload);
  const bodyText = bodies.bodyText || (bodies.bodyHtml ? plainTextFromHtml(bodies.bodyHtml) : "") ||
    "(No text body was available for this message.)";
  const headerDate = Date.parse(headers.get("date") ?? "");
  const internalDate = Number(message.internalDate);
  const sentAt = Number.isFinite(headerDate)
    ? headerDate
    : Number.isFinite(internalDate) && internalDate > 0
      ? internalDate
      : Date.now();

  const result = await ctx.runMutation(internal.gmail.storeInboundMessage, {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    rfcMessageId,
    inReplyTo,
    references,
    from,
    to,
    subject,
    bodyText: bodyText.slice(0, 200_000),
    bodyHtml: bodies.bodyHtml ? bodies.bodyHtml.slice(0, 500_000) : undefined,
    sentAt,
  });
  return result.result;
}

async function processMessageIds(
  ctx: ActionCtx,
  gmail: gmail_v1.Gmail,
  connectedEmail: string,
  ids: Iterable<string>,
) {
  const uniqueIds = [...new Set(ids)];
  const counts = { attached: 0, unmatched: 0, duplicate: 0, ignored: 0 };
  for (let index = 0; index < uniqueIds.length; index += 8) {
    const batch = uniqueIds.slice(index, index + 8);
    const results = await Promise.all(
      batch.map((id) => fetchAndStoreMessage(ctx, gmail, connectedEmail, id)),
    );
    for (const result of results) counts[result] += 1;
  }
  return counts;
}

async function fullInboxRecovery(
  ctx: ActionCtx,
  gmail: gmail_v1.Gmail,
  connectedEmail: string,
) {
  const profile = await gmail.users.getProfile({ userId: "me" });
  if (!profile.data.historyId) throw new Error("Gmail did not return a recovery history ID.");
  const totals = { attached: 0, unmatched: 0, duplicate: 0, ignored: 0 };
  let pageToken: string | undefined;
  do {
    const page = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      maxResults: 500,
      pageToken,
    });
    const counts = await processMessageIds(
      ctx,
      gmail,
      connectedEmail,
      (page.data.messages ?? []).flatMap((message) => message.id ? [message.id] : []),
    );
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] += counts[key];
    pageToken = page.data.nextPageToken ?? undefined;
  } while (pageToken);
  return { historyId: profile.data.historyId, totals };
}

export const processHistoryNotification = internalAction({
  args: { emailAddress: v.string(), historyId: v.string() },
  handler: async (ctx, notification) => {
    const connection = await ctx.runQuery(internal.gmail.getActiveConnection, {});
    if (!connection) return { processed: false, reason: "not_connected" as const };
    if (notification.emailAddress.trim().toLowerCase() !== connection.email.trim().toLowerCase()) {
      console.error("Ignored Gmail notification for a different connected mailbox");
      return { processed: false, reason: "mailbox_mismatch" as const };
    }

    const oauth = oauthClient();
    oauth.setCredentials({ refresh_token: connection.refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth });
    try {
      if (!connection.gmailHistoryId) {
        const recovery = await fullInboxRecovery(ctx, gmail, connection.email);
        await ctx.runMutation(internal.gmail.advanceHistoryId, {
          connectionId: connection.id,
          gmailHistoryId: recovery.historyId,
        });
        return { processed: true, recovered: true, ...recovery.totals };
      }

      const totals = { attached: 0, unmatched: 0, duplicate: 0, ignored: 0 };
      let pageToken: string | undefined;
      let completedHistoryId = notification.historyId;
      try {
        do {
          const page = await gmail.users.history.list({
            userId: "me",
            startHistoryId: connection.gmailHistoryId,
            historyTypes: ["messageAdded"],
            maxResults: 500,
            pageToken,
          });
          const ids = (page.data.history ?? []).flatMap((history) =>
            (history.messagesAdded ?? []).flatMap((entry) => entry.message?.id ? [entry.message.id] : []),
          );
          const counts = await processMessageIds(ctx, gmail, connection.email, ids);
          for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] += counts[key];
          if (page.data.historyId) completedHistoryId = page.data.historyId;
          pageToken = page.data.nextPageToken ?? undefined;
        } while (pageToken);
      } catch (error) {
        if (!isExpiredHistoryError(error)) throw error;
        console.warn("Gmail history cursor expired; starting a full inbox recovery");
        const recovery = await fullInboxRecovery(ctx, gmail, connection.email);
        await ctx.runMutation(internal.gmail.advanceHistoryId, {
          connectionId: connection.id,
          gmailHistoryId: recovery.historyId,
        });
        return { processed: true, recovered: true, ...recovery.totals };
      }

      await ctx.runMutation(internal.gmail.advanceHistoryId, {
        connectionId: connection.id,
        gmailHistoryId: completedHistoryId,
      });
      return { processed: true, recovered: false, ...totals };
    } catch (error) {
      const message = safeProviderError(error);
      console.error("Gmail history synchronization failed", message);
      await ctx.runMutation(internal.gmail.setWatchError, {
        connectionId: connection.id,
        message,
      });
      throw new Error(message);
    }
  },
});

export const pollInbox = internalAction({
  args: {},
  handler: async (ctx): Promise<unknown> => {
    const connection: ConnectionCredentials | null = await ctx.runQuery(
      internal.gmail.getActiveConnection,
      {},
    );
    if (!connection) return { processed: false, reason: "not_connected" as const };

    const oauth = oauthClient();
    oauth.setCredentials({ refresh_token: connection.refreshToken });
    const profile = await google.gmail({ version: "v1", auth: oauth }).users.getProfile({
      userId: "me",
    });
    const historyId = profile.data.historyId;
    if (!historyId || historyId === connection.gmailHistoryId) {
      return { processed: false, reason: "up_to_date" as const };
    }

    return await ctx.runAction(internal.gmailActions.processHistoryNotification, {
      emailAddress: connection.email,
      historyId,
    });
  },
});
