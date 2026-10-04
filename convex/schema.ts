import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.union(
      v.literal("SUPER_ADMIN"),
      v.literal("ADMIN"),
      v.literal("CLEANER"),
      v.literal("AGENCY_USER"),
    ),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_email", ["email"]),
  gmailConnections: defineTable({
    email: v.string(),
    refreshToken: v.optional(v.string()),
    scope: v.string(),
    status: v.union(v.literal("ACTIVE"), v.literal("DISCONNECTED")),
    gmailHistoryId: v.optional(v.string()),
    watchExpiration: v.optional(v.number()),
    watchUpdatedAt: v.optional(v.number()),
    watchStatus: v.optional(v.union(v.literal("ACTIVE"), v.literal("ERROR"))),
    watchError: v.optional(v.string()),
    connectedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_email", ["email"]),
  emailThreads: defineTable({
    customerId: v.id("customers"),
    quoteId: v.optional(v.id("quoteRequests")),
    bookingId: v.optional(v.id("bookings")),
    activeContext: v.union(v.literal("QUOTE"), v.literal("BOOKING")),
    gmailThreadId: v.optional(v.string()),
    subject: v.string(),
    status: v.union(
      v.literal("OPEN"),
      v.literal("WAITING_CUSTOMER"),
      v.literal("WAITING_STAFF"),
      v.literal("CLOSED"),
    ),
    unreadCount: v.optional(v.number()),
    lastMessageAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_quote", ["quoteId"])
    .index("by_booking", ["bookingId"])
    .index("by_customer", ["customerId"])
    .index("by_gmail_thread", ["gmailThreadId"]),
  emailMessages: defineTable({
    threadId: v.id("emailThreads"),
    gmailMessageId: v.optional(v.string()),
    rfcMessageId: v.optional(v.string()),
    direction: v.union(v.literal("INBOUND"), v.literal("OUTBOUND")),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    bodyText: v.string(),
    bodyHtml: v.optional(v.string()),
    readAt: v.optional(v.number()),
    sentByUserId: v.optional(v.id("users")),
    sentAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_gmail_message", ["gmailMessageId"])
    .index("by_rfc_message", ["rfcMessageId"]),
  unmatchedEmailMessages: defineTable({
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
    receivedAt: v.number(),
  })
    .index("by_gmail_message", ["gmailMessageId"])
    .index("by_gmail_thread", ["gmailThreadId"])
    .index("by_received_at", ["receivedAt"]),
  adminInvitations: defineTable({
    email: v.string(),
    clerkInvitationId: v.string(),
    invitedByUserId: v.id("users"),
    status: v.union(v.literal("PENDING"), v.literal("ACCEPTED")),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"]),
  agencies: defineTable({
    name: v.string(),
    branchName: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_name", ["name"]),
  agencyAccounts: defineTable({
    agencyId: v.id("agencies"),
    userId: v.id("users"),
    username: v.string(),
    teamName: v.string(),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    mustChangePassword: v.boolean(),
    lastPasswordResetAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agency", ["agencyId"])
    .index("by_user", ["userId"])
    .index("by_username", ["username"]),
  customers: defineTable({
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.string(),
    stripeCustomerId: v.optional(v.string()),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    source: v.optional(
      v.union(
        v.literal("WEBSITE"),
        v.literal("PHONE"),
        v.literal("EMAIL"),
        v.literal("ADMIN"),
        v.literal("REFERRAL"),
        v.literal("AGENCY"),
        v.literal("OTHER"),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_phone", ["phone"])
    .index("by_created_at", ["createdAt"]),
  serviceAreaSettings: defineTable({
    key: v.literal("DEFAULT"),
    centreName: v.string(),
    radiusKm: v.number(),
    mode: v.union(v.literal("WARNING"), v.literal("ENFORCED")),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  serviceAreaPostcodeOverrides: defineTable({
    postcode: v.string(),
    status: v.union(
      v.literal("IN_AREA"),
      v.literal("CHECK_ADDRESS"),
      v.literal("OUTSIDE_AREA"),
    ),
    note: v.optional(v.string()),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_postcode", ["postcode"]),
  cleaners: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.string(),
    specialty: v.optional(v.string()),
    engagementType: v.union(
      v.literal("EMPLOYEE"),
      v.literal("CONTRACTOR"),
    ),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    availability: v.optional(
      v.array(
        v.object({
          day: v.union(
            v.literal("MONDAY"),
            v.literal("TUESDAY"),
            v.literal("WEDNESDAY"),
            v.literal("THURSDAY"),
            v.literal("FRIDAY"),
            v.literal("SATURDAY"),
            v.literal("SUNDAY"),
          ),
          available: v.boolean(),
          startTime: v.optional(v.string()),
          endTime: v.optional(v.string()),
        }),
      ),
    ),
    invitationSentAt: v.optional(v.number()),
    invitationEmail: v.optional(v.string()),
    clerkInvitationId: v.optional(v.string()),
    invitationExpiresAt: v.optional(v.number()),
    invitationAcceptedAt: v.optional(v.number()),
    userId: v.optional(v.id("users")),
    onboardingStatus: v.optional(
      v.union(
        v.literal("INVITED"),
        v.literal("IN_PROGRESS"),
        v.literal("COMPLETED"),
      ),
    ),
    onboardingCompletedAt: v.optional(v.number()),
    homeAddress: v.optional(v.string()),
    serviceArea: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"]),
  quoteRequests: defineTable({
    reference: v.optional(v.string()),
    submissionKey: v.optional(v.string()),
    customerId: v.id("customers"),
    serviceId: v.optional(v.id("services")),
    agencyId: v.optional(v.id("agencies")),
    agencyAccountId: v.optional(v.id("agencyAccounts")),
    source: v.optional(
      v.union(v.literal("WEBSITE"), v.literal("ADMIN"), v.literal("AGENCY")),
    ),
    pricingSource: v.optional(
      v.union(v.literal("SERVICE"), v.literal("CUSTOM")),
    ),
    convertedBookingId: v.optional(v.id("bookings")),
    serviceType: v.string(),
    addressLine1: v.string(),
    addressLine2: v.optional(v.string()),
    suburb: v.string(),
    state: v.string(),
    postcode: v.string(),
    serviceAreaStatus: v.optional(
      v.union(
        v.literal("IN_AREA"),
        v.literal("CHECK_ADDRESS"),
        v.literal("OUTSIDE_AREA"),
      ),
    ),
    serviceAreaCheckedAt: v.optional(v.number()),
    preferredDate: v.optional(v.string()),
    preferredTime: v.optional(v.string()),
    propertyType: v.optional(v.string()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    notes: v.optional(v.string()),
    submittedAnswers: v.optional(
      v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          value: v.union(
            v.number(),
            v.boolean(),
            v.string(),
            v.array(v.string()),
          ),
        }),
      ),
    ),
    estimateType: v.optional(
      v.union(
        v.literal("ESTIMATE"),
        v.literal("CUSTOM_QUOTE_REQUIRED"),
        v.literal("HOURLY_CONFIGURATION"),
      ),
    ),
    estimatedSubtotalCents: v.optional(v.number()),
    estimatedTotalCents: v.optional(v.number()),
    estimateBreakdown: v.optional(
      v.array(v.object({ label: v.string(), amount: v.number() })),
    ),
    hourlyRateCents: v.optional(v.number()),
    minimumHours: v.optional(v.number()),
    maximumHours: v.optional(v.number()),
    requestType: v.optional(
      v.union(v.literal("CUSTOM_QUOTE"), v.literal("CALLBACK_REQUEST")),
    ),
    status: v.union(
      v.literal("NEW"),
      v.literal("REVIEWING"),
      v.literal("QUOTED"),
      v.literal("ACCEPTED"),
      v.literal("DECLINED"),
      v.literal("EXPIRED"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_reference", ["reference"])
    .index("by_submission_key", ["submissionKey"])
    .index("by_status", ["status"])
    .index("by_customer", ["customerId"])
    .index("by_agency", ["agencyId"])
    .index("by_created_at", ["createdAt"]),
  quotePayments: defineTable({
    quoteRequestId: v.id("quoteRequests"),
    paymentOption: v.union(v.literal("DEPOSIT"), v.literal("FULL")),
    status: v.union(
      v.literal("PENDING"),
      v.literal("PAID"),
      v.literal("FAILED"),
      v.literal("EXPIRED"),
    ),
    amountCents: v.number(),
    requestKey: v.string(),
    checkoutSessionId: v.optional(v.string()),
    paymentIntentId: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdByName: v.string(),
    sentTo: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_quote_and_created_at", ["quoteRequestId", "createdAt"])
    .index("by_checkout_session", ["checkoutSessionId"])
    .index("by_request_key", ["requestKey"]),
  bookings: defineTable({
    reference: v.optional(v.string()),
    submissionKey: v.optional(v.string()),
    customerId: v.id("customers"),
    serviceId: v.id("services"),
    quoteRequestId: v.optional(v.id("quoteRequests")),
    agencyId: v.optional(v.id("agencies")),
    agencyAccountId: v.optional(v.id("agencyAccounts")),
    assignedCleanerIds: v.optional(v.array(v.string())),
    source: v.union(
      v.literal("WEBSITE"),
      v.literal("PHONE"),
      v.literal("ADMIN"),
      v.literal("REFERRAL"),
      v.literal("AGENCY"),
      v.literal("OTHER"),
    ),
    status: v.union(
      v.literal("PENDING_PAYMENT"),
      v.literal("CONFIRMED"),
      v.literal("CANCELLED"),
    ),
    paymentStatus: v.union(
      v.literal("UNPAID"),
      v.literal("DEPOSIT_PAID"),
      v.literal("PAID"),
    ),
    paymentOption: v.union(
      v.literal("DEPOSIT"),
      v.literal("FULL"),
      v.literal("PAY_LATER"),
    ),
    paymentMode: v.union(
      v.literal("DEVELOPMENT_MOCK"),
      v.literal("STRIPE_CHECKOUT"),
      v.literal("PAY_LATER"),
      v.literal("MANUAL"),
    ),
    stripeCheckoutSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    paymentLedgerInitializedAt: v.optional(v.number()),
    estimatedSubtotalCents: v.optional(v.number()),
    estimatedTotalCents: v.optional(v.number()),
    finalTotalCents: v.number(),
    depositAmountCents: v.optional(v.number()),
    serviceAnswers: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        value: v.union(
          v.number(),
          v.boolean(),
          v.string(),
          v.array(v.string()),
        ),
      }),
    ),
    estimateBreakdown: v.array(
      v.object({ label: v.string(), amount: v.number() }),
    ),
    addressLine1: v.string(),
    addressLine2: v.optional(v.string()),
    suburb: v.string(),
    state: v.string(),
    postcode: v.string(),
    serviceAreaStatus: v.optional(
      v.union(
        v.literal("IN_AREA"),
        v.literal("CHECK_ADDRESS"),
        v.literal("OUTSIDE_AREA"),
      ),
    ),
    serviceAreaCheckedAt: v.optional(v.number()),
    scheduledDate: v.string(),
    scheduledTime: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_reference", ["reference"])
    .index("by_submission_key", ["submissionKey"])
    .index("by_customer", ["customerId"])
    .index("by_agency", ["agencyId"])
    .index("by_status", ["status"])
    .index("by_status_and_scheduled_date", ["status", "scheduledDate"])
    .index("by_stripe_checkout_session_id", ["stripeCheckoutSessionId"])
    .index("by_scheduled_date", ["scheduledDate"])
    .index("by_created_at", ["createdAt"]),
  publicAvailabilityBlocks: defineTable({
    date: v.string(),
    time: v.optional(v.string()),
    reason: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_date", ["date"])
    .index("by_date_and_time", ["date", "time"]),
  bookingCleanerAssignments: defineTable({
    bookingId: v.id("bookings"),
    cleanerId: v.id("cleaners"),
    assignedByUserId: v.id("users"),
    assignedAt: v.number(),
    status: v.optional(
      v.union(
        v.literal("OFFERED"),
        v.literal("ACCEPTED"),
        v.literal("DECLINED"),
        v.literal("IN_PROGRESS"),
        v.literal("COMPLETED"),
      ),
    ),
    respondedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_booking", ["bookingId"])
    .index("by_cleaner", ["cleanerId"])
    .index("by_booking_and_cleaner", ["bookingId", "cleanerId"]),
  referenceCounters: defineTable({
    name: v.string(),
    currentValue: v.number(),
  }).index("by_name", ["name"]),
  stripeEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    status: v.union(v.literal("PROCESSED"), v.literal("IGNORED")),
    checkoutSessionId: v.optional(v.string()),
    bookingId: v.optional(v.id("bookings")),
    quoteRequestId: v.optional(v.id("quoteRequests")),
    createdAt: v.number(),
  }).index("by_event_id", ["eventId"]),
  blogs: defineTable({
    title: v.string(),
    slug: v.string(),
    excerpt: v.string(),
    content: v.string(),
    category: v.string(),
    authorName: v.string(),
    coverImageStorageId: v.optional(v.id("_storage")),
    coverImageUrl: v.optional(v.string()),
    coverImageAlt: v.string(),
    seoTitle: v.string(),
    seoDescription: v.string(),
    keywords: v.array(v.string()),
    status: v.union(v.literal("DRAFT"), v.literal("PUBLISHED")),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status_and_published_at", ["status", "publishedAt"])
    .index("by_updated_at", ["updatedAt"]),
  emailLogs: defineTable({
    type: v.union(
      v.literal("BOOKING_CONFIRMATION"),
      v.literal("QUOTE_REQUEST_RECEIVED"),
      v.literal("QUOTE_PAYMENT_LINK"),
      v.literal("BOOKING_PAYMENT_LINK"),
      v.literal("INVOICE"),
      v.literal("CLEANER_INVITATION"),
      v.literal("CLEANER_JOB_ASSIGNED"),
    ),
    to: v.string(),
    subject: v.string(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("SENT"),
      v.literal("FAILED"),
    ),
    customerId: v.optional(v.id("customers")),
    bookingId: v.optional(v.id("bookings")),
    quoteRequestId: v.optional(v.id("quoteRequests")),
    cleanerId: v.optional(v.id("cleaners")),
    providerMessageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_booking", ["bookingId"])
    .index("by_quote_request", ["quoteRequestId"])
    .index("by_customer", ["customerId"])
    .index("by_cleaner", ["cleanerId"])
    .index("by_created_at", ["createdAt"]),
  bookingNotes: defineTable({
    bookingId: v.id("bookings"),
    authorUserId: v.id("users"),
    authorName: v.string(),
    kind: v.union(v.literal("ADMIN_NOTE"), v.literal("JOB_NOTE")),
    body: v.string(),
    photoUrls: v.optional(v.array(v.string())),
    createdAt: v.number(),
  }).index("by_booking_and_created_at", ["bookingId", "createdAt"]),
  bookingAdjustments: defineTable({
    bookingId: v.id("bookings"),
    description: v.string(),
    amountCents: v.number(),
    authorUserId: v.id("users"),
    authorName: v.string(),
    createdAt: v.number(),
  }).index("by_booking_and_created_at", ["bookingId", "createdAt"]),
  bookingPayments: defineTable({
    bookingId: v.id("bookings"),
    kind: v.union(
      v.literal("INITIAL"),
      v.literal("BALANCE"),
      v.literal("MANUAL"),
    ),
    status: v.union(
      v.literal("PENDING"),
      v.literal("PAID"),
      v.literal("FAILED"),
      v.literal("EXPIRED"),
    ),
    amountCents: v.number(),
    requestKey: v.string(),
    createdByUserId: v.optional(v.id("users")),
    createdByName: v.optional(v.string()),
    checkoutSessionId: v.optional(v.string()),
    paymentIntentId: v.optional(v.string()),
    paymentMethod: v.optional(
      v.union(
        v.literal("STRIPE"),
        v.literal("BANK_TRANSFER"),
        v.literal("CASH"),
      ),
    ),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
    sentTo: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_booking_and_created_at", ["bookingId", "createdAt"])
    .index("by_checkout_session", ["checkoutSessionId"])
    .index("by_request_key", ["requestKey"]),
  services: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    pricingModel: v.union(
      v.literal("FIXED"),
      v.literal("HOURLY"),
      v.literal("RULE_BASED"),
      v.literal("CUSTOM_QUOTE"),
    ),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    requiresInspection: v.optional(v.boolean()),
    sortOrder: v.number(),
    paymentRequirement: v.union(
      v.literal("FULL"),
      v.literal("DEPOSIT_OR_FULL"),
      v.literal("DEPOSIT_ONLY"),
      v.literal("PAY_LATER"),
    ),
    depositType: v.optional(
      v.union(v.literal("FIXED"), v.literal("PERCENTAGE")),
    ),
    depositValue: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_sort_order", ["sortOrder"])
    .index("by_status_and_sort_order", ["status", "sortOrder"]),
  serviceQuestions: defineTable({
    serviceId: v.id("services"),
    key: v.string(),
    label: v.string(),
    type: v.union(
      v.literal("NUMBER"),
      v.literal("BOOLEAN"),
      v.literal("SELECT"),
      v.literal("MULTI_SELECT"),
      v.literal("TEXT"),
    ),
    required: v.boolean(),
    options: v.optional(v.array(v.string())),
    sortOrder: v.number(),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_service", ["serviceId"]),
  servicePricingRules: defineTable({
    serviceId: v.id("services"),
    name: v.string(),
    description: v.optional(v.string()),
    ruleType: v.union(
      v.literal("BASE_PRICE"),
      v.literal("FIXED_ADDON"),
      v.literal("PER_UNIT"),
      v.literal("PERCENTAGE"),
      v.literal("HOURLY_RATE"),
    ),
    questionKey: v.optional(v.string()),
    amount: v.number(),
    includedQuantity: v.optional(v.number()),
    minQuantity: v.optional(v.number()),
    maxQuantity: v.optional(v.number()),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_service", ["serviceId"])
    .index("by_service_and_status", ["serviceId", "status"]),
});
