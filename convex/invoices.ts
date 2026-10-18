import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';
import { createInvoicePdf } from './lib/invoicePdf';
import { sendTransactionalEmail } from './lib/sendTransactionalEmail';
import { emailBrandLockup } from './emailTemplates';

type PreparedInvoice = {
  bookingId: Id<'bookings'>;
  customerId: Id<'customers'>;
  invoiceNumber: string;
  customerName: string;
  customerFirstName: string;
  customerEmail?: string;
  customerAddress: string;
  serviceName: string;
  scheduledDate: string;
  items: Array<{
    description: string;
    quantity: number;
    unitAmountCents: number;
    amountCents: number;
  }>;
  totalCents: number;
  paidCents: number;
  balanceDueCents: number;
  refundDueCents: number;
};

type GeneratedInvoice = {
  contentBase64: string;
  filename: string;
  generatedAt: number;
};

type SentInvoice = { sentTo: string; sentAt: number };

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Enter a valid invoice email address.');
  }
  return email;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
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
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character]!,
  );
}

function paymentDescription(paidCents: number, balanceDueCents: number) {
  if (balanceDueCents === 0) return 'This invoice is fully paid.';
  if (paidCents > 0) return 'This invoice records a partial payment and shows the remaining balance.';
  return 'This invoice shows the current amount due.';
}

export const generateInvoice = action({
  args: { bookingId: v.id('bookings') },
  returns: v.object({
    contentBase64: v.string(),
    filename: v.string(),
    generatedAt: v.number(),
  }),
  handler: async (ctx, args): Promise<GeneratedInvoice> => {
    const invoice: PreparedInvoice = await ctx.runQuery(
      internal.invoiceData.prepare,
      args,
    );
    const generatedAt = Date.now();
    const bytes = await createInvoicePdf({ ...invoice, generatedAt });
    return {
      contentBase64: bytesToBase64(bytes),
      filename: `${invoice.invoiceNumber}.pdf`,
      generatedAt,
    };
  },
});

export const sendInvoice = action({
  args: {
    bookingId: v.id('bookings'),
    to: v.string(),
  },
  returns: v.object({ sentTo: v.string(), sentAt: v.number() }),
  handler: async (ctx, args): Promise<SentInvoice> => {
    const to = normalizeEmail(args.to);
    const invoice: PreparedInvoice = await ctx.runQuery(internal.invoiceData.prepare, {
      bookingId: args.bookingId,
    });
    const generatedAt = Date.now();
    const bytes = await createInvoicePdf({ ...invoice, generatedAt });
    const filename = `${invoice.invoiceNumber}.pdf`;
    const subject = `Invoice ${invoice.invoiceNumber} - WeDo Cleaning Services`;
    const paymentCopy = paymentDescription(
      invoice.paidCents,
      invoice.balanceDueCents,
    );
    const greetingName = escapeHtml(invoice.customerFirstName || invoice.customerName);
    const result = await sendTransactionalEmail(ctx, {
      type: 'INVOICE',
      to,
      subject,
      html: `<!doctype html><html lang="en"><body style="margin:0;background:#f3f7f6;font-family:Arial,sans-serif;color:#183837;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #dce8e5;border-radius:18px;overflow:hidden;"><tr><td style="background:#fff;padding:22px 32px;border-bottom:1px solid #dce8e5;">${emailBrandLockup()}</td></tr><tr><td style="padding:32px;"><h1 style="margin:0 0 14px;font-size:26px;color:#123f3b;">Invoice ${escapeHtml(invoice.invoiceNumber)}</h1><p style="font-size:15px;line-height:1.7;color:#496663;">Hi ${greetingName},</p><p style="font-size:15px;line-height:1.7;color:#496663;">Your invoice is attached as a PDF. ${escapeHtml(paymentCopy)}</p><p style="margin-top:24px;font-size:13px;line-height:1.6;color:#67817e;">Please reply to this email if you have any questions.</p></td></tr></table></td></tr></table></body></html>`,
      text: `Hi ${invoice.customerFirstName || invoice.customerName},\n\nYour invoice ${invoice.invoiceNumber} is attached as a PDF. ${paymentCopy}\n\nPlease reply to this email if you have any questions.`,
      customerId: invoice.customerId,
      bookingId: invoice.bookingId,
      attachments: [
        {
          filename,
          content: bytesToBase64(bytes),
          contentType: 'application/pdf',
        },
      ],
    });
    if (result.status === 'FAILED') {
      throw new Error('The invoice could not be sent. Check the email configuration and try again.');
    }
    return { sentTo: to, sentAt: result.sentAt };
  },
});
