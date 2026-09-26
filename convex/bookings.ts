import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireRole } from "./lib/auth";
import { calculateEstimateForService } from "./services";

const answerValue = v.union(
  v.number(),
  v.boolean(),
  v.string(),
  v.array(v.string()),
);
const paymentOption = v.union(
  v.literal("DEPOSIT"),
  v.literal("FULL"),
  v.literal("PAY_LATER"),
);

const mockCleaners = [
  {
    id: "mock-amelia",
    name: "Amelia Hart",
    specialty: "Residential specialist",
  },
  { id: "mock-daniel", name: "Daniel Kim", specialty: "End of lease team" },
  { id: "mock-priya", name: "Priya Shah", specialty: "Commercial cleaning" },
  {
    id: "mock-luca",
    name: "Luca Bennett",
    specialty: "Carpet and detail work",
  },
] as const;

const noteKind = v.union(v.literal("ADMIN_NOTE"), v.literal("JOB_NOTE"));

function validatePhotoUrls(values: string[] | undefined) {
  if (!values?.length) return undefined;
  if (values.length > 8) throw new Error("Add no more than eight photo links.");
  return values.map((value) => {
    const cleaned = value.trim();
    if (cleaned.length > 1000) throw new Error("A photo link is too long.");
    let parsed: URL;
    try {
      parsed = new URL(cleaned);
    } catch {
      throw new Error("Enter a valid photo link.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Photo links must use http or https.");
    }
    return cleaned;
  });
}

function requiredText(value: string, label: string, maxLength: number) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > maxLength) throw new Error(`${label} is too long.`);
  return cleaned;
}

function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
) {
  if (value === undefined) return undefined;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return undefined;
  if (cleaned.length > maxLength) throw new Error(`${label} is too long.`);
  return cleaned;
}

function normalizeEmail(value: string | undefined) {
  if (!value) return undefined;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Enter a valid email address.");
  }
  return email;
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^61[23478]\d{8}$/.test(digits)) return `+61${digits.slice(2)}`;
  if (/^0[23478]\d{8}$/.test(digits)) return `+61${digits.slice(1)}`;
  throw new Error("Enter a valid Australian phone number.");
}

function validateSchedule(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Select a valid requested date.");
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("Select a valid requested date.");
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (parsed < today) throw new Error("Requested date cannot be in the past.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Select a valid requested time.");
}

export const createWebsiteBooking = mutation({
  args: {
    submissionKey: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.string(),
    serviceId: v.id("services"),
    answers: v.record(v.string(), answerValue),
    addressLine1: v.string(),
    addressLine2: v.optional(v.string()),
    suburb: v.string(),
    state: v.string(),
    postcode: v.string(),
    scheduledDate: v.string(),
    scheduledTime: v.string(),
    paymentOption,
    notes: v.optional(v.string()),
  },
  returns: v.id("bookings"),
  handler: async (ctx, args) => {
    const submissionKey = args.submissionKey.trim();
    if (!/^[0-9a-f-]{36}$/i.test(submissionKey)) {
      throw new Error("The booking submission identifier is invalid.");
    }
    const existingSubmission = await ctx.db
      .query("bookings")
      .withIndex("by_submission_key", (index) =>
        index.eq("submissionKey", submissionKey),
      )
      .unique();
    if (existingSubmission) return existingSubmission._id;

    const service = await ctx.db.get(args.serviceId);
    if (!service || service.status !== "ACTIVE")
      throw new Error("Active service not found.");
    const estimate = await calculateEstimateForService(ctx, {
      serviceId: service._id,
      answers: args.answers,
    });
    if (estimate.type !== "ESTIMATE")
      throw new Error("This service cannot be booked with an instant total.");

    if (
      service.paymentRequirement === "FULL" &&
      args.paymentOption !== "FULL"
    ) {
      throw new Error("Full payment is required for this service.");
    }
    if (
      service.paymentRequirement === "DEPOSIT_ONLY" &&
      args.paymentOption !== "DEPOSIT"
    ) {
      throw new Error("A deposit is required for this service.");
    }
    if (
      service.paymentRequirement === "DEPOSIT_OR_FULL" &&
      args.paymentOption !== "DEPOSIT" &&
      args.paymentOption !== "FULL"
    ) {
      throw new Error("Select deposit or full payment.");
    }
    if (
      service.paymentRequirement === "PAY_LATER" &&
      args.paymentOption !== "PAY_LATER"
    ) {
      throw new Error("This service is configured for payment later.");
    }

    const firstName = requiredText(args.firstName, "First name", 80);
    const lastName = optionalText(args.lastName, "Last name", 80);
    const email = normalizeEmail(args.email);
    const phone = normalizePhone(args.phone);
    const addressLine1 = requiredText(args.addressLine1, "Address", 160);
    const addressLine2 = optionalText(args.addressLine2, "Address line 2", 160);
    const suburb = requiredText(args.suburb, "Suburb", 80);
    const state = requiredText(args.state, "State", 3).toUpperCase();
    const postcode = args.postcode.trim();
    const notes = optionalText(args.notes, "Notes", 2000);
    if (
      !new Set(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]).has(state)
    ) {
      throw new Error("Select a valid Australian state or territory.");
    }
    if (!/^\d{4}$/.test(postcode))
      throw new Error("Postcode must contain four digits.");
    validateSchedule(args.scheduledDate, args.scheduledTime);

    const questions = (
      await ctx.db
        .query("serviceQuestions")
        .withIndex("by_service", (index) => index.eq("serviceId", service._id))
        .collect()
    ).filter((question) => question.status === "ACTIVE");
    const serviceAnswers = questions
      .filter(
        (question) =>
          args.answers[question.key] !== undefined &&
          (question.key !== "carpetRooms" || args.answers.carpetSteam === true),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((question) => ({
        key: question.key,
        label: question.label,
        value: args.answers[question.key]!,
      }));

    const byEmail = email
      ? await ctx.db
          .query("customers")
          .withIndex("by_email", (index) => index.eq("email", email))
          .first()
      : null;
    const byPhone = byEmail
      ? null
      : await ctx.db
          .query("customers")
          .withIndex("by_phone", (index) => index.eq("phone", phone))
          .first();
    const existing = byEmail ?? byPhone;
    const now = Date.now();
    const customerId = existing
      ? existing._id
      : await ctx.db.insert("customers", {
          firstName,
          lastName,
          email,
          phone,
          status: "ACTIVE",
          source: "WEBSITE",
          createdAt: now,
          updatedAt: now,
        });
    if (existing) {
      await ctx.db.patch(existing._id, {
        firstName,
        lastName,
        ...(email ? { email } : {}),
        phone,
        updatedAt: now,
      });
    }

    const depositAmountCents =
      args.paymentOption === "DEPOSIT"
        ? estimate.depositAmountCents
        : undefined;
    if (args.paymentOption === "DEPOSIT" && depositAmountCents === undefined) {
      throw new Error("Deposit configuration is unavailable.");
    }

    const isPayLater = args.paymentOption === "PAY_LATER";
    const paymentStatus = "UNPAID" as const;
    const bookingId = await ctx.db.insert("bookings", {
      submissionKey,
      customerId,
      serviceId: service._id,
      source: "WEBSITE",
      status: isPayLater ? "CONFIRMED" : "PENDING_PAYMENT",
      paymentStatus,
      paymentOption: args.paymentOption,
      paymentMode: isPayLater ? "PAY_LATER" : "STRIPE_CHECKOUT",
      estimatedSubtotalCents: estimate.subtotal,
      estimatedTotalCents: estimate.total,
      finalTotalCents: estimate.total,
      depositAmountCents,
      serviceAnswers,
      estimateBreakdown: estimate.breakdown,
      addressLine1,
      addressLine2,
      suburb,
      state,
      postcode,
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      notes,
      createdAt: now,
      updatedAt: now,
    });

    const quoteRequestId = await ctx.db.insert("quoteRequests", {
      submissionKey,
      customerId,
      serviceId: service._id,
      source: "WEBSITE",
      pricingSource: "SERVICE",
      convertedBookingId: bookingId,
      serviceType: service.name,
      addressLine1,
      addressLine2,
      suburb,
      state,
      postcode,
      preferredDate: args.scheduledDate,
      preferredTime: args.scheduledTime,
      propertyType:
        typeof args.answers.propertyType === "string"
          ? args.answers.propertyType
          : undefined,
      bedrooms:
        typeof args.answers.bedrooms === "number"
          ? args.answers.bedrooms
          : undefined,
      bathrooms:
        typeof args.answers.bathrooms === "number"
          ? args.answers.bathrooms
          : undefined,
      notes,
      submittedAnswers: serviceAnswers,
      estimateType: "ESTIMATE",
      estimatedSubtotalCents: estimate.subtotal,
      estimatedTotalCents: estimate.total,
      estimateBreakdown: estimate.breakdown,
      status: isPayLater ? "ACCEPTED" : "QUOTED",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(bookingId, { quoteRequestId });

    const confirmationEmail = email ?? existing?.email;
    if (isPayLater && confirmationEmail) {
      await ctx.scheduler.runAfter(0, internal.emails.sendBookingConfirmation, {
        bookingId,
        customerId,
        to: confirmationEmail,
        customerFirstName: firstName,
        serviceName: service.name,
        scheduledDate: args.scheduledDate,
        scheduledTime: args.scheduledTime,
        address: [
          addressLine1,
          addressLine2,
          `${suburb} ${state} ${postcode}`,
        ]
          .filter(Boolean)
          .join(", "),
        totalAmountCents: estimate.total,
        amountPaidCents: 0,
        paymentStatus,
        developmentPayment: false,
      });
    }

    return bookingId;
  },
});

export const updateDetails = mutation({
  args: {
    bookingId: v.id("bookings"),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.string(),
    addressLine1: v.string(),
    addressLine2: v.optional(v.string()),
    suburb: v.string(),
    state: v.string(),
    postcode: v.string(),
    scheduledDate: v.string(),
    scheduledTime: v.string(),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found.");

    const firstName = requiredText(args.firstName, "First name", 80);
    const lastName = optionalText(args.lastName, "Last name", 80);
    const email = normalizeEmail(args.email);
    const phone = normalizePhone(args.phone);
    const addressLine1 = requiredText(args.addressLine1, "Address", 160);
    const addressLine2 = optionalText(args.addressLine2, "Address line 2", 160);
    const suburb = requiredText(args.suburb, "Suburb", 80);
    const state = requiredText(args.state, "State", 3).toUpperCase();
    const postcode = args.postcode.trim();
    const notes = optionalText(args.notes, "Notes", 2000);
    if (!new Set(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]).has(state)) {
      throw new Error("Select a valid Australian state or territory.");
    }
    if (!/^\d{4}$/.test(postcode)) throw new Error("Postcode must contain four digits.");
    validateSchedule(args.scheduledDate, args.scheduledTime);

    const now = Date.now();
    await ctx.db.patch(booking.customerId, {
      firstName,
      lastName,
      email,
      phone,
      updatedAt: now,
    });
    await ctx.db.patch(booking._id, {
      addressLine1,
      addressLine2,
      suburb,
      state,
      postcode,
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      notes,
      updatedAt: now,
    });
    return null;
  },
});

export const addPriceAdjustment = mutation({
  args: {
    bookingId: v.id("bookings"),
    description: v.string(),
    amountCents: v.number(),
  },
  returns: v.id("bookingAdjustments"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found.");
    const description = requiredText(args.description, "Adjustment description", 240);
    if (!Number.isSafeInteger(args.amountCents) || args.amountCents === 0) {
      throw new Error("Enter a valid non-zero adjustment amount.");
    }
    if (Math.abs(args.amountCents) > 1_000_000) {
      throw new Error("Adjustment amount is too large.");
    }

    const [adjustments, payments] = await Promise.all([
      ctx.db
        .query("bookingAdjustments")
        .withIndex("by_booking_and_created_at", (index) =>
          index.eq("bookingId", booking._id),
        )
        .collect(),
      ctx.db
        .query("bookingPayments")
        .withIndex("by_booking_and_created_at", (index) =>
          index.eq("bookingId", booking._id),
        )
        .collect(),
    ]);
    const existingTotal = adjustments.reduce(
      (total, adjustment) => total + adjustment.amountCents,
      0,
    );
    const originalTotal = booking.estimatedTotalCents ?? (booking.finalTotalCents - existingTotal);
    const revisedTotal = originalTotal + existingTotal + args.amountCents;
    if (revisedTotal < 0) throw new Error("The revised booking total cannot be negative.");
    const hasInitialRecord = payments.some((payment) => payment.kind === "INITIAL");
    const legacyPaid = booking.paymentLedgerInitializedAt || hasInitialRecord
      ? 0
      : booking.paymentStatus === "PAID"
        ? originalTotal
        : booking.paymentStatus === "DEPOSIT_PAID"
          ? (booking.depositAmountCents ?? 0)
          : 0;
    const amountPaidCents =
      legacyPaid +
      payments
        .filter((payment) => payment.status === "PAID")
        .reduce((total, payment) => total + payment.amountCents, 0);

    const authorName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      "Admin";
    const now = Date.now();
    const adjustmentId = await ctx.db.insert("bookingAdjustments", {
      bookingId: booking._id,
      description,
      amountCents: args.amountCents,
      authorUserId: user._id,
      authorName,
      createdAt: now,
    });
    await ctx.db.patch(booking._id, {
      finalTotalCents: revisedTotal,
      paymentStatus:
        amountPaidCents >= revisedTotal
          ? "PAID"
          : amountPaidCents > 0
            ? "DEPOSIT_PAID"
            : "UNPAID",
      updatedAt: now,
    });
    return adjustmentId;
  },
});

export const recordManualPayment = mutation({
  args: {
    bookingId: v.id("bookings"),
    amountCents: v.number(),
    paymentMethod: v.union(v.literal("BANK_TRANSFER"), v.literal("CASH")),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.id("bookingPayments"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found.");
    if (!Number.isSafeInteger(args.amountCents) || args.amountCents <= 0) {
      throw new Error("Enter a valid payment amount greater than zero.");
    }
    if (args.amountCents > 1_000_000) {
      throw new Error("Payment amount is too large.");
    }
    const reference = args.reference?.trim();
    const note = args.note?.trim();
    if (reference && reference.length > 160) {
      throw new Error("Payment reference must be 160 characters or fewer.");
    }
    if (note && note.length > 1000) {
      throw new Error("Payment note must be 1,000 characters or fewer.");
    }

    const [payments, adjustments] = await Promise.all([
      ctx.db
        .query("bookingPayments")
        .withIndex("by_booking_and_created_at", (index) =>
          index.eq("bookingId", booking._id),
        )
        .collect(),
      ctx.db
        .query("bookingAdjustments")
        .withIndex("by_booking_and_created_at", (index) =>
          index.eq("bookingId", booking._id),
        )
        .collect(),
    ]);
    const adjustmentsTotal = adjustments.reduce(
      (total, adjustment) => total + adjustment.amountCents,
      0,
    );
    const originalTotal =
      booking.estimatedTotalCents ?? booking.finalTotalCents - adjustmentsTotal;
    const hasInitialRecord = payments.some(
      (payment) => payment.kind === "INITIAL",
    );
    const legacyPaidCents =
      booking.paymentLedgerInitializedAt || hasInitialRecord
        ? 0
        : booking.paymentStatus === "PAID"
          ? originalTotal
          : booking.paymentStatus === "DEPOSIT_PAID"
            ? (booking.depositAmountCents ?? 0)
            : 0;
    const recordedPaidCents = payments
      .filter((payment) => payment.status === "PAID")
      .reduce((total, payment) => total + payment.amountCents, 0);
    const authorName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      "Admin";
    const now = Date.now();

    // Materialise the inferred amount on older bookings before the first new
    // ledger entry so future totals never depend on the booking status label.
    if (!booking.paymentLedgerInitializedAt && !hasInitialRecord && legacyPaidCents > 0) {
      await ctx.db.insert("bookingPayments", {
        bookingId: booking._id,
        kind: "INITIAL",
        status: "PAID",
        amountCents: legacyPaidCents,
        requestKey: `legacy-initial:${booking._id}`,
        paymentMethod: "STRIPE",
        paymentIntentId: booking.stripePaymentIntentId,
        paidAt: booking.updatedAt,
        createdAt: booking.createdAt,
        updatedAt: now,
      });
    }

    const paymentId = await ctx.db.insert("bookingPayments", {
      bookingId: booking._id,
      kind: "MANUAL",
      status: "PAID",
      amountCents: args.amountCents,
      requestKey: `manual:${crypto.randomUUID()}`,
      paymentMethod: args.paymentMethod,
      reference: reference || undefined,
      note: note || undefined,
      createdByUserId: user._id,
      createdByName: authorName,
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const amountPaidCents = legacyPaidCents + recordedPaidCents + args.amountCents;
    await ctx.db.patch(booking._id, {
      paymentLedgerInitializedAt: booking.paymentLedgerInitializedAt ?? now,
      paymentStatus:
        amountPaidCents >= booking.finalTotalCents
          ? "PAID"
          : amountPaidCents > 0
            ? "DEPOSIT_PAID"
            : "UNPAID",
      updatedAt: now,
    });
    const methodLabel =
      args.paymentMethod === "BANK_TRANSFER" ? "Bank transfer" : "Cash";
    const formattedAmount = new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(args.amountCents / 100);
    const details = [
      `${methodLabel} payment of ${formattedAmount} recorded.`,
      reference ? `Reference: ${reference}.` : undefined,
      note || undefined,
    ]
      .filter(Boolean)
      .join(" ");
    await ctx.db.insert("bookingNotes", {
      bookingId: booking._id,
      authorUserId: user._id,
      authorName,
      kind: "ADMIN_NOTE",
      body: details,
      createdAt: now,
    });
    return paymentId;
  },
});

export const listMockCleaners = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    return mockCleaners;
  },
});

export const setCleanerAssignment = mutation({
  args: {
    bookingId: v.id("bookings"),
    cleanerId: v.string(),
    assigned: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found.");
    if (!mockCleaners.some((cleaner) => cleaner.id === args.cleanerId)) {
      throw new Error("Cleaner is not available in the temporary roster.");
    }
    const current = booking.assignedCleanerIds ?? [];
    const assignedCleanerIds = args.assigned
      ? Array.from(new Set([...current, args.cleanerId]))
      : current.filter((id) => id !== args.cleanerId);
    await ctx.db.patch(booking._id, {
      assignedCleanerIds,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const addBookingNote = mutation({
  args: {
    bookingId: v.id("bookings"),
    kind: noteKind,
    body: v.string(),
    photoUrls: v.optional(v.array(v.string())),
  },
  returns: v.id("bookingNotes"),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found.");
    const body = requiredText(args.body, "Note", 4000);
    const photoUrls = validatePhotoUrls(args.photoUrls);
    const authorName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      "Admin";
    return ctx.db.insert("bookingNotes", {
      bookingId: booking._id,
      authorUserId: user._id,
      authorName,
      kind: args.kind,
      body,
      photoUrls,
      createdAt: Date.now(),
    });
  },
});

export const deleteBookingNote = mutation({
  args: { noteId: v.id("bookingNotes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found.");
    await ctx.db.delete(note._id);
    return null;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_created_at")
      .order("desc")
      .take(100);
    return Promise.all(
      bookings.map(async (booking) => {
        const [customer, service] = await Promise.all([
          ctx.db.get(booking.customerId),
          ctx.db.get(booking.serviceId),
        ]);
        return {
          ...booking,
          customerName: customer
            ? [customer.firstName, customer.lastName].filter(Boolean).join(" ")
            : "Unknown customer",
          serviceName: service?.name ?? "Unknown service",
        };
      }),
    );
  },
});

export const get = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return null;
    const [customer, service, bookingNotes, adjustments, payments] = await Promise.all([
      ctx.db.get(booking.customerId),
      ctx.db.get(booking.serviceId),
      ctx.db
        .query("bookingNotes")
        .withIndex("by_booking_and_created_at", (index) =>
          index.eq("bookingId", booking._id),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("bookingAdjustments")
        .withIndex("by_booking_and_created_at", (index) =>
          index.eq("bookingId", booking._id),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("bookingPayments")
        .withIndex("by_booking_and_created_at", (index) =>
          index.eq("bookingId", booking._id),
        )
        .order("desc")
        .take(100),
    ]);
    const assignedCleaners = (booking.assignedCleanerIds ?? [])
      .map((id) => mockCleaners.find((cleaner) => cleaner.id === id))
      .filter((cleaner) => cleaner !== undefined);
    const adjustmentsTotalCents = adjustments.reduce(
      (total, adjustment) => total + adjustment.amountCents,
      0,
    );
    const hasInitialPaymentRecord = payments.some(
      (payment) => payment.kind === "INITIAL",
    );
    const legacyPaidCents = booking.paymentLedgerInitializedAt || hasInitialPaymentRecord
      ? 0
      : booking.paymentStatus === "PAID"
        ? (booking.estimatedTotalCents ?? booking.finalTotalCents - adjustmentsTotalCents)
        : booking.paymentStatus === "DEPOSIT_PAID"
          ? (booking.depositAmountCents ?? 0)
          : 0;
    const amountPaidCents =
      legacyPaidCents +
      payments
        .filter((payment) => payment.status === "PAID")
        .reduce((total, payment) => total + payment.amountCents, 0);
    const originalTotalCents =
      booking.estimatedTotalCents ?? booking.finalTotalCents - adjustmentsTotalCents;
    return {
      ...booking,
      customer,
      service,
      bookingNotes,
      assignedCleaners,
      adjustments,
      payments,
      paymentSnapshot: {
        originalTotalCents,
        adjustmentsTotalCents,
        revisedTotalCents: booking.finalTotalCents,
        amountPaidCents,
        balanceDueCents: Math.max(0, booking.finalTotalCents - amountPaidCents),
        refundDueCents: Math.max(0, amountPaidCents - booking.finalTotalCents),
      },
    };
  },
});
