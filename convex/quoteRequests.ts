import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";
import { calculateEstimateForService } from "./services";

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

type AnswerValue = number | boolean | string | string[];

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

type AdminQuoteInput = {
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

async function prepareAdminQuote(ctx: MutationCtx, args: AdminQuoteInput) {
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
  returns: v.id("quoteRequests"),
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
    if (existingSubmission) return existingSubmission._id;

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
    const quoteRequestId = await ctx.db.insert("quoteRequests", {
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

    if (email) {
      await ctx.scheduler.runAfter(
        0,
        internal.emails.sendQuoteRequestReceived,
        {
          quoteRequestId,
          customerId,
          to: email,
          customerFirstName: firstName,
          serviceName: serviceType,
          requestType: resolvedRequestType,
        },
      );
    }

    return quoteRequestId;
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
    return ctx.db.insert("quoteRequests", {
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

export const convertAcceptedQuoteToBooking = mutation({
  args: { quoteRequestId: v.id("quoteRequests") },
  returns: v.id("bookings"),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const quote = await ctx.db.get(args.quoteRequestId);
    if (!quote) throw new Error("Quote not found.");
    if (quote.status !== "ACCEPTED") {
      throw new Error("Mark the quote as accepted before converting it.");
    }
    if (quote.convertedBookingId) {
      throw new Error("This quote has already been converted.");
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
    const bookingId = await ctx.db.insert("bookings", {
      customerId: quote.customerId,
      serviceId: quote.serviceId,
      quoteRequestId: quote._id,
      source: "ADMIN",
      status: "CONFIRMED",
      paymentStatus: "UNPAID",
      paymentOption: "PAY_LATER",
        paymentMode: "PAY_LATER",
      estimatedSubtotalCents: quote.estimatedSubtotalCents,
      estimatedTotalCents: quote.estimatedTotalCents,
      finalTotalCents: quote.estimatedTotalCents,
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
      convertedBookingId: bookingId,
      updatedAt: now,
    });
    if (customer?.email) {
      await ctx.scheduler.runAfter(0, internal.emails.sendBookingConfirmation, {
        bookingId,
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
        amountPaidCents: 0,
        paymentStatus: "UNPAID",
          developmentPayment: false,
      });
    }
    return bookingId;
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
    const customer = await ctx.db.get(quote.customerId);
    return { ...quote, customer };
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
