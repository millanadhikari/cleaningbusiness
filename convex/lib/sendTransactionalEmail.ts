import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

const DEFAULT_FROM = "We Do Cleaning <onboarding@resend.dev>";
const DEFAULT_REPLY_TO = "wedocleaning99@gmail.com";

export type DeliveryInput = {
  type:
    | "BOOKING_CONFIRMATION"
    | "QUOTE_REQUEST_RECEIVED"
    | "QUOTE_PAYMENT_LINK"
    | "BOOKING_PAYMENT_LINK"
    | "INVOICE"
    | "CLEANER_INVITATION"
    | "CLEANER_JOB_ASSIGNED";
  to: string;
  subject: string;
  html: string;
  text: string;
  customerId?: Id<"customers">;
  bookingId?: Id<"bookings">;
  quoteRequestId?: Id<"quoteRequests">;
  cleanerId?: Id<"cleaners">;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
  }>;
};

export type DeliveryResult =
  | { status: "SENT"; sentAt: number }
  | { status: "FAILED"; errorMessage: string };

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown email error";
  return message.replace(/[\r\n]+/g, " ").slice(0, 1000);
}

function configuredHeader(value: string | undefined, fallback: string) {
  const normalized = value?.trim() || fallback;
  if (/[\r\n]/.test(normalized)) {
    throw new Error("Email configuration contains an invalid header value.");
  }
  return normalized;
}

export async function sendTransactionalEmail(
  ctx: ActionCtx,
  input: DeliveryInput,
): Promise<DeliveryResult> {
  const emailLogId: Id<"emailLogs"> = await ctx.runMutation(
    internal.emailDelivery.createPendingLog,
    {
      type: input.type,
      to: input.to,
      subject: input.subject,
      customerId: input.customerId,
      bookingId: input.bookingId,
      quoteRequestId: input.quoteRequestId,
      cleanerId: input.cleanerId,
    },
  );

  try {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: configuredHeader(process.env.EMAIL_FROM, DEFAULT_FROM),
        to: [input.to],
        reply_to: configuredHeader(
          process.env.EMAIL_REPLY_TO,
          DEFAULT_REPLY_TO,
        ),
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          content_type: attachment.contentType,
        })),
      }),
    });

    const responseBody: unknown = await response.json().catch(() => null);
    const providerMessageId =
      typeof responseBody === "object" &&
      responseBody !== null &&
      "id" in responseBody &&
      typeof responseBody.id === "string"
        ? responseBody.id
        : undefined;

    if (!response.ok || !providerMessageId) {
      const providerDetail =
        typeof responseBody === "object" &&
        responseBody !== null &&
        "message" in responseBody &&
        typeof responseBody.message === "string"
          ? ` ${responseBody.message}`
          : "";
      throw new Error(
        `Resend request failed with status ${response.status}.${providerDetail}`,
      );
    }

    const sentAt: number = await ctx.runMutation(internal.emailDelivery.markSent, {
      emailLogId,
      providerMessageId,
    });
    return { status: "SENT" as const, sentAt };
  } catch (error) {
    const errorMessage = safeErrorMessage(error);
    await ctx.runMutation(internal.emailDelivery.markFailed, {
      emailLogId,
      errorMessage,
    });
    return { status: "FAILED" as const, errorMessage };
  }
}
