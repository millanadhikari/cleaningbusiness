import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";
import { allocateWorkReference } from "./lib/workReferences";
import { calculateEstimateForService } from "./services";
import { assessPostcode } from "./serviceAreas";
import { linkWebsiteBooking, linkWebsiteQuote } from "./lib/websiteAnalytics";

const quoteStatus = v.union(
  v.literal("NEW"),
  v.literal("REVIEWING"),
  v.literal("QUOTED"),
  v.literal("ACCEPTED"),
  v.literal("DECLINED"),
  v.literal("EXPIRED"),
);

const requestType = v.union(
  v.literal("CUSTOM_QUOTE"),
  v.literal("CALLBACK_REQUEST"),
);

const answerValue = v.union(
  v.number(),
  v.boolean(),
  v.string(),
  v.array(v.string()),
);

export type AnswerValue = number | boolean | string | string[];

const adminQuoteFields = {
  firstName: v.string(),
  lastName: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.string(),
  serviceId: v.id("services"),
  pricingSource: v.union(v.literal("SERVICE"), v.literal("CUSTOM")),
  answers: v.optional(v.record(v.string(), answerValue)),
  customTotalCents: v.optional(v.number()),
  addressLine1: v.string(),
  addressLine2: v.optional(v.string()),
  suburb: v.string(),
  state: v.string(),
  postcode: v.string(),
  preferredDate: v.optional(v.string()),
  preferredTime: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  bedrooms: v.optional(v.number()),
  bathrooms: v.optional(v.number()),
  notes: v.optional(v.string()),
};

export type AdminQuoteInput = {
  firstName: string;
  lastName?: string;
  email?: string;
  phone: string;
  serviceId: Id<"services">;
  pricingSource: "SERVICE" | "CUSTOM";
  answers?: Record<string, AnswerValue>;
  customTotalCents?: number;
  addressLine1: string;
  addressLine2?: string;
  suburb: string;
  state: string;
  postcode: string;
  preferredDate?: string;
  preferredTime?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  notes?: string;
};

const allowedServiceTypes = new Set([
  "House Cleaning",
  "End of Lease Cleaning",
  "Office Cleaning",
  "Commercial Cleaning",
  "Carpet Cleaning",
  "Window Cleaning",
  "Deep Cleaning",
  "Other",
]);

const australianStates = new Set([
  "ACT",
  "NSW",
  "NT",
  "QLD",
  "SA",
  "TAS",
  "VIC",
  "WA",
]);

function requiredText(value: string, label: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }

  return normalized;
}

function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
) {
  if (value === undefined) return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Enter a valid email address.");
  }
  return email;
}

function normalizeAustralianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  let localNumber: string;

  if (/^61[23478]\d{8}$/.test(digits)) {
    localNumber = digits.slice(2);
  } else if (/^0[23478]\d{8}$/.test(digits)) {
    localNumber = digits.slice(1);
  } else {
    throw new Error("Enter a valid Australian phone number.");
  }

  return `+61${localNumber}`;
}

function optionalCount(value: number | undefined, label: string) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0 || value > 30) {
    throw new Error(`${label} must be a whole number between 0 and 30.`);
  }
  return value;
}

function validateDate(value: string | undefined) {
  const normalized = optionalText(value, "Preferred date", 10);
  if (!normalized) return undefined;
  const parsed = new Date(`${normalized}T12:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new Error("Preferred date is invalid.");
  }
  return normalized;
}

export async function prepareAdminQuote(ctx: MutationCtx, args: AdminQuoteInput) {
  const firstName = requiredText(args.firstName, "First name", 80);
  const lastName = optionalText(args.lastName, "Last name", 80);
  const email = args.email ? normalizeEmail(args.email) : undefined;
  const phone = normalizeAustralianPhone(args.phone);
  const addressLine1 = requiredText(args.addressLine1, "Address", 160);
  const addressLine2 = optionalText(args.addressLine2, "Address line 2", 160);
  const suburb = requiredText(args.suburb, "Suburb", 80);
  const state = requiredText(args.state, "State", 3).toUpperCase();
  const postcode = args.postcode.trim();
  const preferredDate = validateDate(args.preferredDate);
  const preferredTime = optionalText(args.preferredTime, "Preferred time", 5);
  const propertyType = optionalText(args.propertyType, "Property type", 80);
  const bedrooms = optionalCount(args.bedrooms, "Bedrooms");
  const bathrooms = optionalCount(args.bathrooms, "Bathrooms");
  const notes = optionalText(args.notes, "Additional notes", 2000);

  if (!australianStates.has(state)) {
    throw new Error("Select a valid Australian state or territory.");
  }
  if (!/^\d{4}$/.test(postcode)) {
    throw new Error("Postcode must contain four digits.");
  }
  if (preferredTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(preferredTime)) {
    throw new Error("Preferred time is invalid.");
  }

  const service = await ctx.db.get(args.serviceId);
  if (!service || service.status !== "ACTIVE") {
    throw new Error("Select an active service.");
  }

  const answers = args.answers ?? {};
  const questions = await ctx.db
    .query("serviceQuestions")
    .withIndex("by_service", (index) => index.eq("serviceId", service._id))
    .collect();
  const submittedAnswers = questions
    .filter(
      (question) =>
        question.status === "ACTIVE" &&
        answers[question.key] !== undefined &&
        (question.key !== "carpetRooms" || answers.carpetSteam === true),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((question) => ({
      key: question.key,
      label: question.label,
      value: answers[question.key]!,
    }));

  if (args.pricingSource === "CUSTOM") {
    if (
      args.customTotalCents === undefined ||
      !Number.isInteger(args.customTotalCents) ||
      args.customTotalCents <= 0 ||
      args.customTotalCents > 100_000_000
    ) {
      throw new Error("Enter a valid custom quote total.");
    }
    return {
      customer: { firstName, lastName, email, phone },
      quote: {
        serviceId: service._id,
        serviceType: service.name,
        pricingSource: "CUSTOM" as const,
        addressLine1,
        addressLine2,
        suburb,
        state,
        postcode,
        preferredDate,
        preferredTime,
        propertyType,
        bedrooms,
        bathrooms,
        notes,
        submittedAnswers,
        estimateType: "ESTIMATE" as const,
        estimatedSubtotalCents: args.customTotalCents,
        estimatedTotalCents: args.customTotalCents,
        estimateBreakdown: [
          { label: "Custom quoted price", amount: args.customTotalCents },
        ],
        hourlyRateCents: undefined,
        minimumHours: undefined,
        maximumHours: undefined,
        requestType: "CUSTOM_QUOTE" as const,
      },
    };
  }

  const estimate = await calculateEstimateForService(ctx, {
    serviceId: service._id,
    answers,
  });
  return {
    customer: { firstName, lastName, email, phone },
    quote: {
      serviceId: service._id,
      serviceType: service.name,
      pricingSource: "SERVICE" as const,
      addressLine1,
      addressLine2,
      suburb,
      state,
      postcode,
      preferredDate,
      preferredTime,
      propertyType,
      bedrooms,
      bathrooms,
      notes,
      submittedAnswers,
      estimateType: estimate.type,
      estimatedSubtotalCents:
        estimate.type === "ESTIMATE" ? estimate.subtotal : undefined,
      estimatedTotalCents:
        estimate.type === "ESTIMATE" ? estimate.total : undefined,
      estimateBreakdown:
        estimate.type === "ESTIMATE" ? estimate.breakdown : undefined,
      hourlyRateCents:
        estimate.type === "HOURLY_CONFIGURATION"
          ? (estimate.hourlyRateCents ?? undefined)
          : undefined,
      minimumHours:
        estimate.type === "HOURLY_CONFIGURATION"
          ? estimate.minimumHours
          : undefined,
      maximumHours:
        estimate.type === "HOURLY_CONFIGURATION"
          ? estimate.maximumHours
          : undefined,
      requestType:
        estimate.type === "CUSTOM_QUOTE_REQUIRED"
          ? ("CUSTOM_QUOTE" as const)
          : ("CALLBACK_REQUEST" as const),
    },
  };
}

export const submit = mutation({
  args: {
    submissionKey: v.string(),
    sessionId: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.string(),
    serviceId: v.optional(v.id("services")),
    answers: v.optional(v.record(v.string(), answerValue)),
    serviceType: v.string(),
    addressLine1: v.string(),
    addressLine2: v.optional(v.string()),
    suburb: v.string(),
    state: v.string(),
    postcode: v.string(),
    preferredDate: v.optional(v.string()),
    preferredTime: v.optional(v.string()),
    propertyType: v.optional(v.string()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    notes: v.optional(v.string()),
    requestType: v.optional(requestType),
  },
  returns: v.object({
    quoteRequestId: v.id("quoteRequests"),
    reference: v.string(),
  }),
  handler: async (ctx, args) => {
    const submissionKey = args.submissionKey.trim();
    if (!/^[0-9a-f-]{36}$/i.test(submissionKey)) {
      throw new Error("The quote submission identifier is invalid.");
    }
    const existingSubmission = await ctx.db
      .query("quoteRequests")
      .withIndex("by_submission_key", (index) =>
        index.eq("submissionKey", submissionKey),
      )
      .unique();
    if (existingSubmission) {
      const reference =
        existingSubmission.reference ?? (await allocateWorkReference(ctx));
      if (!existingSubmission.reference) {
        await ctx.db.patch(existingSubmission._id, { reference });
      }
      await linkWebsiteQuote(
        ctx,
        args.sessionId,
        existingSubmission._id,
        existingSubmission.customerId,
      );
      return { quoteRequestId: existingSubmission._id, reference };
    }

    const firstName = requiredText(args.firstName, "First name", 80);
    const lastName = optionalText(args.lastName, "Last name", 80);
    const email = args.email ? normalizeEmail(args.email) : undefined;
    const phone = normalizeAustralianPhone(args.phone);
    let serviceType = requiredText(args.serviceType, "Service type", 80);
    const addressLine1 = requiredText(args.addressLine1, "Address", 160);
    const addressLine2 = optionalText(args.addressLine2, "Address line 2", 160);
    const suburb = requiredText(args.suburb, "Suburb", 80);
    const state = requiredText(args.state, "State", 3).toUpperCase();
    const postcode = args.postcode.trim();
    const preferredDate = optionalText(
      args.preferredDate,
      "Preferred date",
      10,
    );
    const preferredTime = optionalText(
      args.preferredTime,
      "Preferred time",
      80,
    );
    const propertyType = optionalText(args.propertyType, "Property type", 80);
    const bedrooms = optionalCount(args.bedrooms, "Bedrooms");
    const bathrooms = optionalCount(args.bathrooms, "Bathrooms");
    const notes = optionalText(args.notes, "Additional notes", 2000);

    if (!args.serviceId && !allowedServiceTypes.has(serviceType)) {
      throw new Error("Select a valid service type.");
    }
    if (!australianStates.has(state)) {
      throw new Error("Select a valid Australian state or territory.");
    }
    if (!/^\d{4}$/.test(postcode)) {
      throw new Error("Postcode must contain four digits.");
    }
    const serviceArea = await assessPostcode(ctx, postcode);
    if (preferredDate) {
      const parsedDate = new Date(`${preferredDate}T12:00:00.000Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) ||
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== preferredDate
      ) {
        throw new Error("Preferred date is invalid.");
      }
    }

    const customerByEmail = email
      ? await ctx.db
          .query("customers")
          .withIndex("by_email", (index) => index.eq("email", email))
          .first()
      : null;
    const customerByPhone = customerByEmail
      ? null
      : await ctx.db
          .query("customers")
          .withIndex("by_phone", (index) => index.eq("phone", phone))
          .first();
    const existingCustomer = customerByEmail ?? customerByPhone;
    const now = Date.now();
    let customerId;

    if (existingCustomer) {
      customerId = existingCustomer._id;
      await ctx.db.patch(customerId, {
        firstName,
        lastName,
        ...(email ? { email } : {}),
        phone,
        updatedAt: now,
      });
    } else {
      customerId = await ctx.db.insert("customers", {
        firstName,
        lastName,
        email,
        phone,
        status: "ACTIVE",
        source: "WEBSITE",
        createdAt: now,
        updatedAt: now,
      });
    }

    let estimateSnapshot:
      Awaited<ReturnType<typeof calculateEstimateForService>> | undefined;
    let submittedAnswers:
      | Array<{
          key: string;
          label: string;
          value: number | boolean | string | string[];
        }>
      | undefined;

    if (args.serviceId) {
      const service = await ctx.db.get(args.serviceId);
      if (!service || service.status !== "ACTIVE") {
        throw new Error("Active service not found.");
      }
      serviceType = service.name;
      const answers = args.answers ?? {};
      estimateSnapshot = await calculateEstimateForService(ctx, {
        serviceId: service._id,
        answers,
      });
      const questions = await ctx.db
        .query("serviceQuestions")
        .withIndex("by_service", (index) => index.eq("serviceId", service._id))
        .collect();
      submittedAnswers = questions
        .filter(
          (question) =>
            question.status === "ACTIVE" &&
            answers[question.key] !== undefined &&
            (question.key !== "carpetRooms" || answers.carpetSteam === true),
        )
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((question) => ({
          key: question.key,
          label: question.label,
          value: answers[question.key]!,
        }));
    }

    const resolvedRequestType =
      args.requestType ??
      (estimateSnapshot?.type === "CUSTOM_QUOTE_REQUIRED"
        ? ("CUSTOM_QUOTE" as const)
        : ("CALLBACK_REQUEST" as const));
    const reference = await allocateWorkReference(ctx);
    const quoteRequestId = await ctx.db.insert("quoteRequests", {
      reference,
      submissionKey,
      customerId,
      serviceId: args.serviceId,
      source: "WEBSITE",
      pricingSource: args.serviceId ? "SERVICE" : undefined,
      serviceType,
      addressLine1,
      addressLine2,
      suburb,
      state,
      postcode,
      serviceAreaStatus: serviceArea.status,
      serviceAreaCheckedAt: now,
      preferredDate,
      preferredTime,
      propertyType,
      bedrooms,
      bathrooms,
      notes,
      requestType: resolvedRequestType,
      submittedAnswers,
      estimateType: estimateSnapshot?.type,
      estimatedSubtotalCents:
        estimateSnapshot?.type === "ESTIMATE"
          ? estimateSnapshot.subtotal
          : undefined,
      estimatedTotalCents:
        estimateSnapshot?.type === "ESTIMATE"
          ? estimateSnapshot.total
          : undefined,
      estimateBreakdown:
        estimateSnapshot?.type === "ESTIMATE"
          ? estimateSnapshot.breakdown
          : undefined,
      hourlyRateCents:
        estimateSnapshot?.type === "HOURLY_CONFIGURATION"
          ? (estimateSnapshot.hourlyRateCents ?? undefined)
          : undefined,
      minimumHours:
        estimateSnapshot?.type === "HOURLY_CONFIGURATION"
          ? estimateSnapshot.minimumHours
          : undefined,
      maximumHours:
        estimateSnapshot?.type === "HOURLY_CONFIGURATION"
          ? estimateSnapshot.maximumHours
          : undefined,
      status: "NEW",
      createdAt: now,
      updatedAt: now,
    });

    await linkWebsiteQuote(ctx, args.sessionId, quoteRequestId, customerId);

    if (email) {
      await ctx.scheduler.runAfter(
        0,
        internal.emails.sendQuoteRequestReceived,
        {
          quoteRequestId,
          quoteReference: reference,
          customerId,
          to: email,
          customerFirstName: firstName,
          serviceName: serviceType,
          requestType: resolvedRequestType,
        },
      );
    }

    return { quoteRequestId, reference };
  },
});

export const createAdminQuote = mutation({
  args: adminQuoteFields,
  returns: v.id("quoteRequests"),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const prepared = await prepareAdminQuote(ctx, args);
    const byEmail = prepared.customer.email
      ? await ctx.db
          .query("customers")
          .withIndex("by_email", (index) =>
            index.eq("email", prepared.customer.email),
          )
          .first()
      : null;
    const byPhone = byEmail
      ? null
      : await ctx.db
          .query("customers")
          .withIndex("by_phone", (index) =>
            index.eq("phone", prepared.customer.phone),
          )
          .first();
    const existing = byEmail ?? byPhone;
    const now = Date.now();
    const customerId = existing
      ? existing._id
      : await ctx.db.insert("customers", {
          ...prepared.customer,
          status: "ACTIVE",
          source: "ADMIN",
          createdAt: now,
          updatedAt: now,
        });
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...prepared.customer,
        updatedAt: now,
      });
    }
    const reference = await allocateWorkReference(ctx);
    return ctx.db.insert("quoteRequests", {
      reference,
      customerId,
      source: "ADMIN",
      ...prepared.quote,
      status: "QUOTED",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateAdminQuote = mutation({
  args: {
    quoteRequestId: v.id("quoteRequests"),
    ...adminQuoteFields,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const existing = await ctx.db.get(args.quoteRequestId);
    if (!existing) throw new Error("Quote not found.");
    if (existing.convertedBookingId) {
      throw new Error("A converted quote cannot be edited.");
    }
    const prepared = await prepareAdminQuote(ctx, args);
    const now = Date.now();
    await ctx.db.patch(existing.customerId, {
      ...prepared.customer,
      updatedAt: now,
    });
    await ctx.db.patch(existing._id, {
      ...prepared.quote,
      source: existing.source ?? "ADMIN",
      updatedAt: now,
    });
    return null;
  },
});

export const deleteAdminQuote = mutation({
  args: { quoteRequestId: v.id("quoteRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const quote = await ctx.db.get(args.quoteRequestId);
    if (!quote) throw new Error("Quote not found.");
    if (quote.convertedBookingId) {
      throw new Error("A converted quote cannot be deleted.");
    }
    await ctx.db.delete(quote._id);
    return null;
  },
});

export function calculateQuotePaymentAmount(
  service: Doc<"services">,
  totalCents: number,
  paymentOption: "DEPOSIT" | "FULL",
) {
  if (paymentOption === "FULL") return totalCents;
  if (!service.depositType || service.depositValue === undefined) {
    throw new Error("Configure a deposit for this service before requesting one.");
  }
  const deposit =
    service.depositType === "FIXED"
      ? service.depositValue
      : Math.round((totalCents * service.depositValue) / 10_000);
  return Math.min(totalCents, Math.max(1, deposit));
}

export async function convertAcceptedQuoteRecord(
  ctx: MutationCtx,
  args: {
    quoteRequestId: Id<"quoteRequests">;
    paymentOption: "DEPOSIT" | "FULL" | "PAY_LATER";
    paymentMode: "STRIPE_CHECKOUT" | "PAY_LATER" | "MANUAL";
    amountPaidCents?: number;
    paymentMethod?: "STRIPE" | "BANK_TRANSFER" | "CASH";
    paymentIntentId?: string;
    checkoutSessionId?: string;
    paymentRequestKey?: string;
    createdByUserId?: Id<"users">;
    createdByName?: string;
    reference?: string;
    note?: string;
  },
) {
    const quote = await ctx.db.get(args.quoteRequestId);
    if (!quote) throw new Error("Quote not found.");
    if (quote.status !== "ACCEPTED") {
      throw new Error("Mark the quote as accepted before converting it.");
    }
    if (quote.convertedBookingId) {
      return quote.convertedBookingId;
    }
    if (!quote.serviceId) {
      throw new Error("Select a service before converting this quote.");
    }
    if (!quote.preferredDate || !quote.preferredTime) {
      throw new Error("Add a scheduled date and time before converting.");
    }
    const scheduled = new Date(`${quote.preferredDate}T12:00:00.000Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (Number.isNaN(scheduled.getTime()) || scheduled < today) {
      throw new Error("The scheduled date must be today or later.");
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(quote.preferredTime)) {
      throw new Error("Add a specific scheduled time before converting.");
    }
    if (quote.estimatedTotalCents === undefined) {
      throw new Error("Add a final quote total before converting.");
    }
    const [service, customer] = await Promise.all([
      ctx.db.get(quote.serviceId),
      ctx.db.get(quote.customerId),
    ]);
    if (!service) throw new Error("The selected service no longer exists.");

    const now = Date.now();
    const reference = quote.reference ?? (await allocateWorkReference(ctx));
    const paidAmount = args.amountPaidCents ?? 0;
    const paymentStatus =
      paidAmount >= quote.estimatedTotalCents
        ? ("PAID" as const)
        : paidAmount > 0
          ? ("DEPOSIT_PAID" as const)
          : ("UNPAID" as const);
    const bookingId = await ctx.db.insert("bookings", {
      reference,
      customerId: quote.customerId,
      serviceId: quote.serviceId,
      quoteRequestId: quote._id,
      agencyId: quote.agencyId,
      agencyAccountId: quote.agencyAccountId,
      source: quote.source === "AGENCY" ? "AGENCY" : "ADMIN",
      status: "CONFIRMED",
      paymentStatus,
      paymentOption: args.paymentOption,
      paymentMode: args.paymentMode,
      stripeCheckoutSessionId: args.checkoutSessionId,
      stripePaymentIntentId: args.paymentIntentId,
      paymentLedgerInitializedAt: paidAmount > 0 ? now : undefined,
      estimatedSubtotalCents: quote.estimatedSubtotalCents,
      estimatedTotalCents: quote.estimatedTotalCents,
      finalTotalCents: quote.estimatedTotalCents,
      depositAmountCents:
        args.paymentOption === "DEPOSIT" ? paidAmount : undefined,
      serviceAnswers: quote.submittedAnswers ?? [],
      estimateBreakdown: quote.estimateBreakdown ?? [
        { label: service.name, amount: quote.estimatedTotalCents },
      ],
      addressLine1: quote.addressLine1,
      addressLine2: quote.addressLine2,
      suburb: quote.suburb,
      state: quote.state,
      postcode: quote.postcode,
      scheduledDate: quote.preferredDate,
      scheduledTime: quote.preferredTime,
      notes: quote.notes,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(quote._id, {
      reference,
      convertedBookingId: bookingId,
      updatedAt: now,
    });
    await linkWebsiteBooking(ctx, {
      quoteId: quote._id,
      bookingId,
      customerId: quote.customerId,
    });
    const emailThread = await ctx.db
      .query("emailThreads")
      .withIndex("by_quote", (index) => index.eq("quoteId", quote._id))
      .unique();
    if (emailThread) {
      await ctx.db.patch(emailThread._id, {
        bookingId,
        activeContext: "BOOKING",
        updatedAt: now,
      });
    }
    if (paidAmount > 0 && args.paymentMethod && args.paymentRequestKey) {
      await ctx.db.insert("bookingPayments", {
        bookingId,
        kind: "INITIAL",
        status: "PAID",
        amountCents: paidAmount,
        requestKey: args.paymentRequestKey,
        paymentMethod: args.paymentMethod,
        paymentIntentId: args.paymentIntentId,
        checkoutSessionId: args.checkoutSessionId,
        createdByUserId: args.createdByUserId,
        createdByName: args.createdByName,
        reference: args.reference,
        note: args.note,
        paidAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (customer?.email) {
      await ctx.scheduler.runAfter(0, internal.emails.sendBookingConfirmation, {
        bookingId,
        bookingReference: reference,
        customerId: customer._id,
        to: customer.email,
        customerFirstName: customer.firstName,
        serviceName: service.name,
        scheduledDate: quote.preferredDate,
        scheduledTime: quote.preferredTime,
        address: [
          quote.addressLine1,
          quote.addressLine2,
          `${quote.suburb} ${quote.state} ${quote.postcode}`,
        ]
          .filter(Boolean)
          .join(", "),
        totalAmountCents: quote.estimatedTotalCents,
        amountPaidCents: paidAmount,
        paymentStatus,
          developmentPayment: false,
      });
    }
    return bookingId;
}

export const convertAcceptedQuoteToBooking = mutation({
  args: { quoteRequestId: v.id("quoteRequests") },
  returns: v.id("bookings"),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    return convertAcceptedQuoteRecord(ctx, {
      quoteRequestId: args.quoteRequestId,
      paymentOption: "PAY_LATER",
      paymentMode: "PAY_LATER",
    });
  },
});

export const recordManualPaymentAndConvert = mutation({
  args: {
    quoteRequestId: v.id("quoteRequests"),
    paymentOption: v.union(v.literal("DEPOSIT"), v.literal("FULL")),
    paymentMethod: v.union(v.literal("BANK_TRANSFER"), v.literal("CASH")),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.id("bookings"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const quote = await ctx.db.get(args.quoteRequestId);
    if (!quote?.serviceId || quote.estimatedTotalCents === undefined) {
      throw new Error("The accepted quote does not have a payable total.");
    }
    const service = await ctx.db.get(quote.serviceId);
    if (!service) throw new Error("The selected service no longer exists.");
    const amountPaidCents = calculateQuotePaymentAmount(
      service,
      quote.estimatedTotalCents,
      args.paymentOption,
    );
    const createdByName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      "Admin";
    return convertAcceptedQuoteRecord(ctx, {
      quoteRequestId: quote._id,
      paymentOption: args.paymentOption,
      paymentMode: "MANUAL",
      amountPaidCents,
      paymentMethod: args.paymentMethod,
      paymentRequestKey: `quote-manual:${quote._id}:${crypto.randomUUID()}`,
      createdByUserId: user._id,
      createdByName,
      reference: optionalText(args.reference, "Payment reference", 160),
      note: optionalText(args.note, "Payment note", 1000),
    });
  },
});

export const list = query({
  args: { status: v.optional(quoteStatus) },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);

    const quotes = args.status
      ? await ctx.db
          .query("quoteRequests")
          .withIndex("by_status", (index) => index.eq("status", args.status!))
          .order("desc")
          .take(100)
      : await ctx.db
          .query("quoteRequests")
          .withIndex("by_created_at")
          .order("desc")
          .take(100);

    return Promise.all(
      quotes.map(async (quote) => {
        const customer = await ctx.db.get(quote.customerId);
        return {
          _id: quote._id,
          reference: quote.reference,
          customerName: customer
            ? [customer.firstName, customer.lastName].filter(Boolean).join(" ")
            : "Unknown customer",
          phone: customer?.phone ?? "",
          email: customer?.email ?? "",
          serviceType: quote.serviceType,
          source: quote.source,
          pricingSource: quote.pricingSource,
          convertedBookingId: quote.convertedBookingId,
          requestType: quote.requestType,
          estimateType: quote.estimateType,
          estimatedTotalCents: quote.estimatedTotalCents,
          hourlyRateCents: quote.hourlyRateCents,
          suburb: quote.suburb,
          preferredDate: quote.preferredDate,
          status: quote.status,
          createdAt: quote.createdAt,
        };
      }),
    );
  },
});

export const get = query({
  args: { quoteRequestId: v.id("quoteRequests") },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const quote = await ctx.db.get(args.quoteRequestId);
    if (!quote) return null;
    const [customer, service, payments] = await Promise.all([
      ctx.db.get(quote.customerId),
      quote.serviceId ? ctx.db.get(quote.serviceId) : null,
      ctx.db
        .query("quotePayments")
        .withIndex("by_quote_and_created_at", (index) =>
          index.eq("quoteRequestId", quote._id),
        )
        .order("desc")
        .take(20),
    ]);
    return { ...quote, customer, service, payments };
  },
});

export const updateQuoteRequestStatus = mutation({
  args: {
    quoteRequestId: v.id("quoteRequests"),
    status: quoteStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const quote = await ctx.db.get(args.quoteRequestId);
    if (!quote) throw new Error("Quote request not found.");
    await ctx.db.patch(quote._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});
