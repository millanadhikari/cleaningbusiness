import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  bookingConfirmationEmail,
  bookingPaymentLinkEmail,
  quoteRequestReceivedEmail,
} from "./emailTemplates";
import { sendTransactionalEmail } from "./lib/sendTransactionalEmail";

export const sendBookingConfirmation = internalAction({
  args: {
    bookingId: v.id("bookings"),
    customerId: v.id("customers"),
    to: v.string(),
    customerFirstName: v.string(),
    serviceName: v.string(),
    scheduledDate: v.string(),
    scheduledTime: v.string(),
    address: v.string(),
    totalAmountCents: v.number(),
    amountPaidCents: v.number(),
    paymentStatus: v.union(
      v.literal("UNPAID"),
      v.literal("DEPOSIT_PAID"),
      v.literal("PAID"),
    ),
    developmentPayment: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const template = bookingConfirmationEmail({
      customerFirstName: args.customerFirstName,
      bookingReference: args.bookingId,
      serviceName: args.serviceName,
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      address: args.address,
      totalAmountCents: args.totalAmountCents,
      amountPaidCents: args.amountPaidCents,
      paymentStatus: args.paymentStatus,
      developmentPayment: args.developmentPayment,
    });
    await sendTransactionalEmail(ctx, {
      type: "BOOKING_CONFIRMATION",
      to: args.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      customerId: args.customerId,
      bookingId: args.bookingId,
    });
    return null;
  },
});

export const sendBookingPaymentLink = internalAction({
  args: {
    bookingId: v.id("bookings"),
    customerId: v.id("customers"),
    to: v.string(),
    customerFirstName: v.string(),
    serviceName: v.string(),
    scheduledDate: v.string(),
    address: v.string(),
    revisedTotalCents: v.number(),
    amountPaidCents: v.number(),
    balanceDueCents: v.number(),
    checkoutUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const template = bookingPaymentLinkEmail({
      ...args,
      bookingReference: args.bookingId,
    });
    await sendTransactionalEmail(ctx, {
      type: "BOOKING_PAYMENT_LINK",
      to: args.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      customerId: args.customerId,
      bookingId: args.bookingId,
    });
    return null;
  },
});

export const sendQuoteRequestReceived = internalAction({
  args: {
    quoteRequestId: v.id("quoteRequests"),
    customerId: v.id("customers"),
    to: v.string(),
    customerFirstName: v.string(),
    serviceName: v.string(),
    requestType: v.union(
      v.literal("CUSTOM_QUOTE"),
      v.literal("CALLBACK_REQUEST"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const template = quoteRequestReceivedEmail({
      customerFirstName: args.customerFirstName,
      quoteReference: args.quoteRequestId,
      serviceName: args.serviceName,
      requestType: args.requestType,
    });
    await sendTransactionalEmail(ctx, {
      type: "QUOTE_REQUEST_RECEIVED",
      to: args.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      customerId: args.customerId,
      quoteRequestId: args.quoteRequestId,
    });
    return null;
  },
});
