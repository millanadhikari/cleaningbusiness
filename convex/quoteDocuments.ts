import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { emailBrandLockup } from "./emailTemplates";
import { createQuotePdf } from "./lib/quotePdf";
import { sendTransactionalEmail } from "./lib/sendTransactionalEmail";

type PreparedQuote = {
  quoteRequestId: Id<"quoteRequests">;
  customerId: Id<"customers">;
  reference: string;
  createdAt: number;
  customerName: string;
  customerFirstName: string;
  customerEmail?: string;
  customerPhone: string;
  customerAddress: string;
  serviceName: string;
  preferredDate?: string;
  preferredTime?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  answers: Array<{
    key: string;
    label: string;
    value: number | boolean | string | string[];
  }>;
  notes?: string;
  items: Array<{ description: string; amountCents: number }>;
  totalCents: number;
};

type GeneratedQuote = {
  contentBase64: string;
  filename: string;
  generatedAt: number;
};

type SentQuote = { sentTo: string; sentAt: number };

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Enter a valid quote email address.");
  }
  return email;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character]!,
  );
}

function filename(reference: string) {
  return `Quote-${reference.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;
}

export const generateQuote = action({
  args: { quoteRequestId: v.id("quoteRequests") },
  returns: v.object({
    contentBase64: v.string(),
    filename: v.string(),
    generatedAt: v.number(),
  }),
  handler: async (ctx, args): Promise<GeneratedQuote> => {
    const quote: PreparedQuote = await ctx.runQuery(
      internal.quoteData.prepare,
      args,
    );
    const generatedAt = Date.now();
    const bytes = await createQuotePdf({ ...quote, generatedAt });
    return {
      contentBase64: bytesToBase64(bytes),
      filename: filename(quote.reference),
      generatedAt,
    };
  },
});

export const sendQuote = action({
  args: {
    quoteRequestId: v.id("quoteRequests"),
    to: v.string(),
  },
  returns: v.object({ sentTo: v.string(), sentAt: v.number() }),
  handler: async (ctx, args): Promise<SentQuote> => {
    const to = normalizeEmail(args.to);
    const quote: PreparedQuote = await ctx.runQuery(internal.quoteData.prepare, {
      quoteRequestId: args.quoteRequestId,
    });
    const generatedAt = Date.now();
    const bytes = await createQuotePdf({ ...quote, generatedAt });
    const attachmentFilename = filename(quote.reference);
    const subject = `Quote ${quote.reference} - WeDo Cleaning Services`;
    const greetingName = escapeHtml(
      quote.customerFirstName || quote.customerName,
    );
    const result = await sendTransactionalEmail(ctx, {
      type: "QUOTE",
      to,
      subject,
      html: `<!doctype html><html lang="en"><body style="margin:0;background:#f3f7f6;font-family:Arial,sans-serif;color:#183837;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #dce8e5;border-radius:18px;overflow:hidden;"><tr><td style="background:#fff;padding:22px 32px;border-bottom:1px solid #dce8e5;">${emailBrandLockup()}</td></tr><tr><td style="padding:32px;"><h1 style="margin:0 0 14px;font-size:26px;color:#123f3b;">Your quote ${escapeHtml(quote.reference)}</h1><p style="font-size:15px;line-height:1.7;color:#496663;">Hi ${greetingName},</p><p style="font-size:15px;line-height:1.7;color:#496663;">Your detailed cleaning quote is attached as a PDF.</p><p style="font-size:15px;line-height:1.7;color:#496663;">To make a booking, please call us on <strong>+61 401 356 937</strong> and mention quote reference <strong>${escapeHtml(quote.reference)}</strong>.</p><p style="margin-top:24px;font-size:13px;line-height:1.6;color:#67817e;">Please reply to this email if you have any questions.</p></td></tr></table></td></tr></table></body></html>`,
      text: `Hi ${quote.customerFirstName || quote.customerName},\n\nYour detailed cleaning quote ${quote.reference} is attached as a PDF.\n\nTo make a booking, please call us on +61 401 356 937 and mention quote reference ${quote.reference}.\n\nPlease reply to this email if you have any questions.`,
      customerId: quote.customerId,
      quoteRequestId: quote.quoteRequestId,
      attachments: [
        {
          filename: attachmentFilename,
          content: bytesToBase64(bytes),
          contentType: "application/pdf",
        },
      ],
    });
    if (result.status === "FAILED") {
      throw new Error(
        "The quote could not be sent. Check the email configuration and try again.",
      );
    }
    await ctx.runMutation(internal.quoteData.markSent, {
      quoteRequestId: quote.quoteRequestId,
    });
    return { sentTo: to, sentAt: result.sentAt };
  },
});
