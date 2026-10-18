import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireRole, requireSuperAdmin } from "./lib/auth";

const internalRoles = ["SUPER_ADMIN", "ADMIN"] as const;

const pricingModel = v.union(
  v.literal("FIXED"),
  v.literal("HOURLY"),
  v.literal("RULE_BASED"),
  v.literal("CUSTOM_QUOTE"),
);
const serviceStatus = v.union(v.literal("ACTIVE"), v.literal("INACTIVE"));
const paymentRequirement = v.union(
  v.literal("FULL"),
  v.literal("DEPOSIT_OR_FULL"),
  v.literal("DEPOSIT_ONLY"),
  v.literal("PAY_LATER"),
);
const depositType = v.union(v.literal("FIXED"), v.literal("PERCENTAGE"));
const questionType = v.union(
  v.literal("NUMBER"),
  v.literal("BOOLEAN"),
  v.literal("SELECT"),
  v.literal("MULTI_SELECT"),
  v.literal("TEXT"),
);
const ruleType = v.union(
  v.literal("BASE_PRICE"),
  v.literal("FIXED_ADDON"),
  v.literal("PER_UNIT"),
  v.literal("PERCENTAGE"),
  v.literal("HOURLY_RATE"),
);
const answerValue = v.union(
  v.number(),
  v.boolean(),
  v.string(),
  v.array(v.string()),
);

type PricingModel = Doc<"services">["pricingModel"];
type PaymentRequirement = Doc<"services">["paymentRequirement"];
type DepositType = NonNullable<Doc<"services">["depositType"]>;
export type ServiceAnswer = number | boolean | string | string[];
export type ServiceAnswers = Record<string, ServiceAnswer>;

function cleanRequired(value: string, label: string, maxLength = 160) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function cleanOptional(
  value: string | undefined,
  label: string,
  maxLength = 500,
) {
  if (value === undefined) return undefined;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return undefined;
  if (cleaned.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function normalizeSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug || slug.length > 100)
    throw new Error("Enter a valid service slug.");
  return slug;
}

function normalizeKey(value: string) {
  const key = value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!key || key.length > 80) throw new Error("Enter a valid question key.");
  return key;
}

function wholeNumber(value: number, label: string, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be a whole number of at least ${minimum}.`);
  }
  return value;
}

function optionalQuantity(value: number | undefined, label: string) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
  return value;
}

function validatePayment(
  requirement: PaymentRequirement,
  type: DepositType | undefined,
  value: number | undefined,
) {
  const needsDeposit =
    requirement === "DEPOSIT_ONLY" || requirement === "DEPOSIT_OR_FULL";

  if (!needsDeposit) return { depositType: undefined, depositValue: undefined };
  if (!type || value === undefined) {
    throw new Error(
      "Deposit type and value are required for this payment option.",
    );
  }
  wholeNumber(value, "Deposit value", 1);
  if (type === "PERCENTAGE" && value > 10_000) {
    throw new Error(
      "Percentage deposits use basis points and cannot exceed 10000.",
    );
  }
  return { depositType: type, depositValue: value };
}

async function ensureUniqueSlug(
  ctx: MutationCtx,
  slug: string,
  currentId?: Id<"services">,
) {
  const existing = await ctx.db
    .query("services")
    .withIndex("by_slug", (index) => index.eq("slug", slug))
    .first();
  if (existing && existing._id !== currentId) {
    throw new Error("A service with this slug already exists.");
  }
}

const serviceFields = {
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  shortDescription: v.optional(v.string()),
  pricingModel,
  status: serviceStatus,
  requiresInspection: v.optional(v.boolean()),
  sortOrder: v.number(),
  paymentRequirement,
  depositType: v.optional(depositType),
  depositValue: v.optional(v.number()),
};

export const listActiveServices = query({
  args: {},
  handler: async (ctx) => {
    const services = await ctx.db
      .query("services")
      .withIndex("by_status_and_sort_order", (index) =>
        index.eq("status", "ACTIVE"),
      )
      .order("asc")
      .collect();

    return services.map((service) => ({
      _id: service._id,
      name: service.name,
      slug: service.slug,
      shortDescription: service.shortDescription,
      pricingModel: service.pricingModel,
      requiresInspection: service.requiresInspection ?? false,
      sortOrder: service.sortOrder,
    }));
  },
});

export const getActiveServiceQuestions = query({
  args: { serviceId: v.id("services") },
  handler: async (ctx, args) => {
    const service = await ctx.db.get(args.serviceId);
    if (!service || service.status !== "ACTIVE") {
      throw new Error("Active service not found.");
    }
    const questions = await ctx.db
      .query("serviceQuestions")
      .withIndex("by_service", (index) => index.eq("serviceId", service._id))
      .collect();

    return questions
      .filter((question) => question.status === "ACTIVE")
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((question) => ({
        key: question.key,
        label: question.label,
        type: question.type,
        required: question.required,
        options: question.options,
        sortOrder: question.sortOrder,
      }));
  },
});

export const listAdminServices = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, [...internalRoles]);
    return ctx.db
      .query("services")
      .withIndex("by_sort_order")
      .order("asc")
      .collect();
  },
});

export const getAdminService = query({
  args: { serviceId: v.id("services") },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...internalRoles]);
    const service = await ctx.db.get(args.serviceId);
    if (!service) return null;
    const [questions, pricingRules] = await Promise.all([
      ctx.db
        .query("serviceQuestions")
        .withIndex("by_service", (index) => index.eq("serviceId", service._id))
        .collect(),
      ctx.db
        .query("servicePricingRules")
        .withIndex("by_service", (index) => index.eq("serviceId", service._id))
        .collect(),
    ]);
    return {
      service,
      questions: questions.sort((a, b) => a.sortOrder - b.sortOrder),
      pricingRules: pricingRules.sort((a, b) => a.sortOrder - b.sortOrder),
    };
  },
});

export const createService = mutation({
  args: serviceFields,
  handler: async (ctx, args) => {
    await requireRole(ctx, [...internalRoles]);
    const name = cleanRequired(args.name, "Name", 120);
    const slug = normalizeSlug(args.slug);
    await ensureUniqueSlug(ctx, slug);
    const payment = validatePayment(
      args.paymentRequirement,
      args.depositType,
      args.depositValue,
    );
    const now = Date.now();
    return ctx.db.insert("services", {
      ...args,
      ...payment,
      name,
      slug,
      description: cleanOptional(args.description, "Description", 2000),
      shortDescription: cleanOptional(
        args.shortDescription,
        "Short description",
        240,
      ),
      sortOrder: wholeNumber(args.sortOrder, "Sort order"),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateService = mutation({
  args: { serviceId: v.id("services"), ...serviceFields },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...internalRoles]);
    const existing = await ctx.db.get(args.serviceId);
    if (!existing) throw new Error("Service not found.");
    const slug = normalizeSlug(args.slug);
    await ensureUniqueSlug(ctx, slug, existing._id);
    const payment = validatePayment(
      args.paymentRequirement,
      args.depositType,
      args.depositValue,
    );
    const { serviceId, ...fields } = args;
    await ctx.db.patch(serviceId, {
      ...fields,
      ...payment,
      name: cleanRequired(args.name, "Name", 120),
      slug,
      description: cleanOptional(args.description, "Description", 2000),
      shortDescription: cleanOptional(
        args.shortDescription,
        "Short description",
        240,
      ),
      sortOrder: wholeNumber(args.sortOrder, "Sort order"),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setServiceStatus = mutation({
  args: { serviceId: v.id("services"), status: serviceStatus },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...internalRoles]);
    if (!(await ctx.db.get(args.serviceId)))
      throw new Error("Service not found.");
    await ctx.db.patch(args.serviceId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const createQuestion = mutation({
  args: {
    serviceId: v.id("services"),
    key: v.string(),
    label: v.string(),
    type: questionType,
    required: v.boolean(),
    options: v.optional(v.array(v.string())),
    sortOrder: v.number(),
    status: serviceStatus,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...internalRoles]);
    if (!(await ctx.db.get(args.serviceId)))
      throw new Error("Service not found.");
    const key = normalizeKey(args.key);
    const questions = await ctx.db
      .query("serviceQuestions")
      .withIndex("by_service", (index) => index.eq("serviceId", args.serviceId))
      .collect();
    if (questions.some((question) => question.key === key)) {
      throw new Error("Question keys must be unique within a service.");
    }
    const now = Date.now();
    return ctx.db.insert("serviceQuestions", {
      ...args,
      key,
      label: cleanRequired(args.label, "Question label", 160),
      options: args.options?.map((option) =>
        cleanRequired(option, "Option", 100),
      ),
      sortOrder: wholeNumber(args.sortOrder, "Sort order"),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateQuestion = mutation({
  args: {
    questionId: v.id("serviceQuestions"),
    key: v.string(),
    label: v.string(),
    type: questionType,
    required: v.boolean(),
    options: v.optional(v.array(v.string())),
    sortOrder: v.number(),
    status: serviceStatus,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...internalRoles]);
    const existing = await ctx.db.get(args.questionId);
    if (!existing) throw new Error("Question not found.");
    const key = normalizeKey(args.key);
    const siblings = await ctx.db
      .query("serviceQuestions")
      .withIndex("by_service", (index) =>
        index.eq("serviceId", existing.serviceId),
      )
      .collect();
    if (
      siblings.some(
        (question) => question._id !== existing._id && question.key === key,
      )
    ) {
      throw new Error("Question keys must be unique within a service.");
    }
    const { questionId, ...fields } = args;
    await ctx.db.patch(questionId, {
      ...fields,
      key,
      label: cleanRequired(args.label, "Question label", 160),
      options: args.options?.map((option) =>
        cleanRequired(option, "Option", 100),
      ),
      sortOrder: wholeNumber(args.sortOrder, "Sort order"),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setQuestionStatus = mutation({
  args: { questionId: v.id("serviceQuestions"), status: serviceStatus },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...internalRoles]);
    if (!(await ctx.db.get(args.questionId)))
      throw new Error("Question not found.");
    await ctx.db.patch(args.questionId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const createPricingRule = mutation({
  args: {
    serviceId: v.id("services"),
    name: v.string(),
    description: v.optional(v.string()),
    ruleType,
    questionKey: v.optional(v.string()),
    amount: v.number(),
    includedQuantity: v.optional(v.number()),
    minQuantity: v.optional(v.number()),
    maxQuantity: v.optional(v.number()),
    status: serviceStatus,
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...internalRoles]);
    if (!(await ctx.db.get(args.serviceId)))
      throw new Error("Service not found.");
    const minimum = optionalQuantity(args.minQuantity, "Minimum quantity");
    const maximum = optionalQuantity(args.maxQuantity, "Maximum quantity");
    const included = optionalQuantity(
      args.includedQuantity,
      "Included quantity",
    );
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      throw new Error(
        "Minimum quantity cannot be greater than maximum quantity.",
      );
    }
    const now = Date.now();
    return ctx.db.insert("servicePricingRules", {
      ...args,
      name: cleanRequired(args.name, "Rule name", 160),
      description: cleanOptional(args.description, "Description", 500),
      questionKey: args.questionKey
        ? normalizeKey(args.questionKey)
        : undefined,
      amount: wholeNumber(args.amount, "Amount"),
      includedQuantity: included,
      minQuantity: minimum,
      maxQuantity: maximum,
      sortOrder: wholeNumber(args.sortOrder, "Sort order"),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updatePricingRule = mutation({
  args: {
    ruleId: v.id("servicePricingRules"),
    name: v.string(),
    description: v.optional(v.string()),
    ruleType,
    questionKey: v.optional(v.string()),
    amount: v.number(),
    includedQuantity: v.optional(v.number()),
    minQuantity: v.optional(v.number()),
    maxQuantity: v.optional(v.number()),
    status: serviceStatus,
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...internalRoles]);
    if (!(await ctx.db.get(args.ruleId)))
      throw new Error("Pricing rule not found.");
    const minimum = optionalQuantity(args.minQuantity, "Minimum quantity");
    const maximum = optionalQuantity(args.maxQuantity, "Maximum quantity");
    const included = optionalQuantity(
      args.includedQuantity,
      "Included quantity",
    );
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      throw new Error(
        "Minimum quantity cannot be greater than maximum quantity.",
      );
    }
    const { ruleId, ...fields } = args;
    await ctx.db.patch(ruleId, {
      ...fields,
      name: cleanRequired(args.name, "Rule name", 160),
      description: cleanOptional(args.description, "Description", 500),
      questionKey: args.questionKey
        ? normalizeKey(args.questionKey)
        : undefined,
      amount: wholeNumber(args.amount, "Amount"),
      includedQuantity: included,
      minQuantity: minimum,
      maxQuantity: maximum,
      sortOrder: wholeNumber(args.sortOrder, "Sort order"),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setPricingRuleStatus = mutation({
  args: { ruleId: v.id("servicePricingRules"), status: serviceStatus },
  handler: async (ctx, args) => {
    await requireRole(ctx, [...internalRoles]);
    if (!(await ctx.db.get(args.ruleId)))
      throw new Error("Pricing rule not found.");
    await ctx.db.patch(args.ruleId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

const initialServices: Array<{
  name: string;
  slug: string;
  pricingModel: PricingModel;
  sortOrder: number;
}> = [
  {
    name: "House Cleaning",
    slug: "house-cleaning",
    pricingModel: "HOURLY",
    sortOrder: 10,
  },
  {
    name: "End of Lease Cleaning",
    slug: "end-of-lease-cleaning",
    pricingModel: "RULE_BASED",
    sortOrder: 20,
  },
  {
    name: "Office Cleaning",
    slug: "office-cleaning",
    pricingModel: "CUSTOM_QUOTE",
    sortOrder: 30,
  },
  {
    name: "Commercial Cleaning",
    slug: "commercial-cleaning",
    pricingModel: "CUSTOM_QUOTE",
    sortOrder: 40,
  },
  {
    name: "Carpet Cleaning",
    slug: "carpet-cleaning",
    pricingModel: "RULE_BASED",
    sortOrder: 50,
  },
  {
    name: "Window Cleaning",
    slug: "window-cleaning",
    pricingModel: "CUSTOM_QUOTE",
    sortOrder: 60,
  },
  {
    name: "Deep Cleaning",
    slug: "deep-cleaning",
    pricingModel: "RULE_BASED",
    sortOrder: 70,
  },
];

const initialQuestions: Array<{
  serviceSlug: string;
  key: string;
  label: string;
  type: Doc<"serviceQuestions">["type"];
  required: boolean;
  options?: string[];
  sortOrder: number;
}> = [
  {
    serviceSlug: "house-cleaning",
    key: "propertyType",
    label: "Property type",
    type: "SELECT",
    required: true,
    options: ["Single storey", "Double storey", "Apartment", "Townhouse"],
    sortOrder: 10,
  },
  {
    serviceSlug: "house-cleaning",
    key: "cleaningFrequency",
    label: "Cleaning frequency",
    type: "SELECT",
    required: true,
    options: ["One-off", "Weekly", "Fortnightly", "Monthly"],
    sortOrder: 20,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "propertyType",
    label: "Property type",
    type: "SELECT",
    required: true,
    options: ["Single storey", "Double storey", "Apartment", "Townhouse"],
    sortOrder: 10,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "bedrooms",
    label: "Bedrooms",
    type: "NUMBER",
    required: true,
    sortOrder: 20,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "bathrooms",
    label: "Bathrooms",
    type: "NUMBER",
    required: true,
    sortOrder: 30,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "furnished",
    label: "Is the property furnished?",
    type: "BOOLEAN",
    required: true,
    sortOrder: 40,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "oven",
    label: "Oven interior",
    type: "NUMBER",
    required: false,
    sortOrder: 50,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "carpetSteam",
    label: "Would you like carpet steam cleaning?",
    type: "BOOLEAN",
    required: false,
    sortOrder: 60,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "carpetRooms",
    label: "Carpeted rooms",
    type: "NUMBER",
    required: false,
    sortOrder: 70,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "slidingGlassDoors",
    label: "Sliding glass doors",
    type: "NUMBER",
    required: false,
    sortOrder: 80,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "smallBalcony",
    label: "Small balcony / deck / patio",
    type: "NUMBER",
    required: false,
    sortOrder: 90,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "upholsteryItems",
    label: "Upholstery refresh",
    type: "NUMBER",
    required: false,
    sortOrder: 100,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "microwaveInterior",
    label: "Microwave interior",
    type: "NUMBER",
    required: false,
    sortOrder: 110,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "fridgeInterior",
    label: "Fridge interior",
    type: "NUMBER",
    required: false,
    sortOrder: 120,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "outsideWindows",
    label: "Windows outside",
    type: "NUMBER",
    required: false,
    sortOrder: 130,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "windowBlinds",
    label: "Window blinds",
    type: "NUMBER",
    required: false,
    sortOrder: 140,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    key: "wallSpotCleaning",
    label: "Wall spot cleaning",
    type: "NUMBER",
    required: false,
    sortOrder: 150,
  },
  {
    serviceSlug: "carpet-cleaning",
    key: "carpetRooms",
    label: "Carpeted rooms",
    type: "NUMBER",
    required: true,
    sortOrder: 10,
  },
  {
    serviceSlug: "deep-cleaning",
    key: "bedrooms",
    label: "Bedrooms",
    type: "NUMBER",
    required: true,
    sortOrder: 10,
  },
  {
    serviceSlug: "deep-cleaning",
    key: "bathrooms",
    label: "Bathrooms",
    type: "NUMBER",
    required: true,
    sortOrder: 20,
  },
];

const initialRules: Array<{
  serviceSlug: string;
  name: string;
  description: string;
  ruleType: Doc<"servicePricingRules">["ruleType"];
  questionKey?: string;
  amount: number;
  includedQuantity?: number;
  minQuantity?: number;
  sortOrder: number;
}> = [
  {
    serviceSlug: "house-cleaning",
    name: "Standard hourly rate",
    description: "Migrated estimator configuration.",
    ruleType: "HOURLY_RATE",
    amount: 6000,
    minQuantity: 2,
    sortOrder: 10,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "End of lease base",
    description: "Migrated from the existing landing-page estimator.",
    ruleType: "BASE_PRICE",
    amount: 19900,
    sortOrder: 10,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "Bedrooms per room",
    description: "Migrated from the existing landing-page estimator.",
    ruleType: "PER_UNIT",
    questionKey: "bedrooms",
    amount: 5500,
    sortOrder: 20,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "Bathrooms",
    description: "Migrated from the existing landing-page estimator.",
    ruleType: "PER_UNIT",
    questionKey: "bathrooms",
    amount: 4500,
    sortOrder: 30,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "Oven interior",
    description: "One oven is included in the End of Lease Special.",
    ruleType: "PER_UNIT",
    questionKey: "oven",
    amount: 3500,
    includedQuantity: 1,
    sortOrder: 40,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "Carpeted rooms",
    description: "Migrated from the existing landing-page estimator.",
    ruleType: "PER_UNIT",
    questionKey: "carpetRooms",
    amount: 4500,
    sortOrder: 50,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "Sliding glass doors",
    description: "One set is included in the End of Lease Special.",
    ruleType: "PER_UNIT",
    questionKey: "slidingGlassDoors",
    amount: 2500,
    includedQuantity: 1,
    sortOrder: 60,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "Small balcony / deck / patio",
    description:
      "One small outdoor area is included in the End of Lease Special.",
    ruleType: "PER_UNIT",
    questionKey: "smallBalcony",
    amount: 3000,
    includedQuantity: 1,
    sortOrder: 70,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "Upholstery refresh",
    description: "Sofa or armchair fabric refresh.",
    ruleType: "PER_UNIT",
    questionKey: "upholsteryItems",
    amount: 5500,
    sortOrder: 80,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "Microwave interior",
    description: "Interior microwave clean.",
    ruleType: "PER_UNIT",
    questionKey: "microwaveInterior",
    amount: 2500,
    sortOrder: 90,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "Fridge interior",
    description: "Empty fridge interior clean.",
    ruleType: "PER_UNIT",
    questionKey: "fridgeInterior",
    amount: 4000,
    sortOrder: 100,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "Windows outside",
    description: "Reachable ground-floor exterior glass.",
    ruleType: "PER_UNIT",
    questionKey: "outsideWindows",
    amount: 3500,
    sortOrder: 110,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "Window blinds",
    description: "Venetian or roller blind detail clean.",
    ruleType: "PER_UNIT",
    questionKey: "windowBlinds",
    amount: 1800,
    sortOrder: 120,
  },
  {
    serviceSlug: "end-of-lease-cleaning",
    name: "Wall spot cleaning",
    description: "Targeted wall mark treatment.",
    ruleType: "PER_UNIT",
    questionKey: "wallSpotCleaning",
    amount: 2000,
    sortOrder: 130,
  },
];

export const seedInitialServices = mutation({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const inserted: string[] = [];
    const skipped: string[] = [];
    let seededQuestions = 0;
    let seededRules = 0;

    for (const item of initialServices) {
      let service = await ctx.db
        .query("services")
        .withIndex("by_slug", (index) => index.eq("slug", item.slug))
        .first();
      if (service) {
        skipped.push(item.slug);
      } else {
        const now = Date.now();
        const serviceId = await ctx.db.insert("services", {
          ...item,
          shortDescription: `${item.name} service configuration.`,
          status: "ACTIVE",
          requiresInspection: item.pricingModel === "CUSTOM_QUOTE",
          paymentRequirement: "PAY_LATER",
          createdAt: now,
          updatedAt: now,
        });
        service = await ctx.db.get(serviceId);
        inserted.push(item.slug);
      }

      if (!service) throw new Error(`Unable to seed ${item.name}.`);
      const [existingQuestions, existingRules] = await Promise.all([
        ctx.db
          .query("serviceQuestions")
          .withIndex("by_service", (index) =>
            index.eq("serviceId", service._id),
          )
          .collect(),
        ctx.db
          .query("servicePricingRules")
          .withIndex("by_service", (index) =>
            index.eq("serviceId", service._id),
          )
          .collect(),
      ]);
      for (const question of initialQuestions.filter(
        (candidate) => candidate.serviceSlug === item.slug,
      )) {
        if (existingQuestions.some((existing) => existing.key === question.key))
          continue;
        const now = Date.now();
        await ctx.db.insert("serviceQuestions", {
          serviceId: service._id,
          key: question.key,
          label: question.label,
          type: question.type,
          required: question.required,
          options: question.options,
          sortOrder: question.sortOrder,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        });
        seededQuestions += 1;
      }
      for (const rule of initialRules.filter(
        (candidate) => candidate.serviceSlug === item.slug,
      )) {
        if (existingRules.some((existing) => existing.name === rule.name))
          continue;
        const now = Date.now();
        await ctx.db.insert("servicePricingRules", {
          serviceId: service._id,
          name: rule.name,
          description: rule.description,
          ruleType: rule.ruleType,
          questionKey: rule.questionKey,
          amount: rule.amount,
          includedQuantity: rule.includedQuantity,
          minQuantity: rule.minQuantity,
          sortOrder: rule.sortOrder,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        });
        seededRules += 1;
      }
    }

    return { inserted, skipped, seededQuestions, seededRules };
  },
});

function answerIsSelected(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string")
    return value.trim().length > 0 && value !== "false";
  return Array.isArray(value) && value.length > 0;
}

function isMissingAnswer(value: ServiceAnswer | undefined) {
  if (value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function validateQuestionAnswer(
  question: Doc<"serviceQuestions">,
  value: ServiceAnswer | undefined,
) {
  if (question.required && isMissingAnswer(value)) {
    throw new Error(`${question.label} is required.`);
  }
  if (value === undefined) return;

  const validType =
    (question.type === "NUMBER" &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0) ||
    (question.type === "BOOLEAN" && typeof value === "boolean") ||
    (question.type === "TEXT" && typeof value === "string") ||
    (question.type === "SELECT" && typeof value === "string") ||
    (question.type === "MULTI_SELECT" &&
      Array.isArray(value) &&
      value.every((item) => typeof item === "string"));
  if (!validType) throw new Error(`${question.label} has an invalid answer.`);

  if (question.options?.length) {
    const selected = Array.isArray(value) ? value : [value];
    if (
      selected.some(
        (item) => typeof item !== "string" || !question.options!.includes(item),
      )
    ) {
      throw new Error(`${question.label} contains an invalid option.`);
    }
  }
}

export type ServiceEstimateResult =
  | { type: "CUSTOM_QUOTE_REQUIRED" }
  | {
      type: "HOURLY_CONFIGURATION";
      currency: "AUD";
      hourlyRateCents: number | null;
      minimumHours?: number;
      maximumHours?: number;
    }
  | {
      type: "ESTIMATE";
      currency: "AUD";
      subtotal: number;
      total: number;
      breakdown: Array<{ label: string; amount: number }>;
      paymentRequirement: PaymentRequirement;
      depositAmountCents?: number;
    };

function calculateDepositAmount(service: Doc<"services">, total: number) {
  if (
    (service.paymentRequirement !== "DEPOSIT_ONLY" &&
      service.paymentRequirement !== "DEPOSIT_OR_FULL") ||
    service.depositValue === undefined ||
    !service.depositType
  ) {
    return undefined;
  }
  const amount =
    service.depositType === "FIXED"
      ? service.depositValue
      : Math.round((total * service.depositValue) / 10_000);
  return Math.min(total, Math.max(1, amount));
}

export async function calculateEstimateForService(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  args: { serviceId: Id<"services">; answers: ServiceAnswers },
): Promise<ServiceEstimateResult> {
  const service = await ctx.db.get(args.serviceId);
  if (!service || service.status !== "ACTIVE") {
    throw new Error("Active service not found.");
  }

  const questions = (
    await ctx.db
      .query("serviceQuestions")
      .withIndex("by_service", (index) => index.eq("serviceId", service._id))
      .collect()
  ).filter((question) => question.status === "ACTIVE");
  const effectiveAnswers = { ...args.answers };
  const hasCarpetSteamChoice = questions.some(
    (question) => question.key === "carpetSteam",
  );
  if (hasCarpetSteamChoice) {
    if (effectiveAnswers.carpetSteam === true) {
      const carpetRooms = effectiveAnswers.carpetRooms;
      if (
        typeof carpetRooms !== "number" ||
        !Number.isInteger(carpetRooms) ||
        carpetRooms < 1
      ) {
        throw new Error(
          "Select at least one carpeted room for steam cleaning.",
        );
      }
    } else {
      delete effectiveAnswers.carpetRooms;
    }
  }
  for (const question of questions) {
    validateQuestionAnswer(question, effectiveAnswers[question.key]);
  }

  if (service.pricingModel === "CUSTOM_QUOTE") {
    return { type: "CUSTOM_QUOTE_REQUIRED" };
  }

  const rules = (
    await ctx.db
      .query("servicePricingRules")
      .withIndex("by_service_and_status", (index) =>
        index.eq("serviceId", service._id).eq("status", "ACTIVE"),
      )
      .collect()
  ).sort((a, b) => a.sortOrder - b.sortOrder);

  if (service.pricingModel === "HOURLY") {
    const hourlyRule = rules.find((rule) => rule.ruleType === "HOURLY_RATE");
    return {
      type: "HOURLY_CONFIGURATION",
      currency: "AUD",
      hourlyRateCents: hourlyRule?.amount ?? null,
      minimumHours: hourlyRule?.minQuantity,
      maximumHours: hourlyRule?.maxQuantity,
    };
  }

  const breakdown: Array<{ label: string; amount: number }> = [];
  let subtotal = 0;

  for (const rule of rules) {
    let lineAmount = 0;
    if (rule.ruleType === "BASE_PRICE") {
      lineAmount = rule.amount;
    } else if (rule.ruleType === "PER_UNIT" && rule.questionKey) {
      const answer = effectiveAnswers[rule.questionKey];
      let quantity =
        typeof answer === "number" && Number.isFinite(answer) ? answer : 0;
      if (rule.minQuantity !== undefined)
        quantity = Math.max(quantity, rule.minQuantity);
      if (rule.maxQuantity !== undefined)
        quantity = Math.min(quantity, rule.maxQuantity);
      const billableQuantity = Math.max(
        0,
        quantity - (rule.includedQuantity ?? 0),
      );
      lineAmount = Math.round(rule.amount * billableQuantity);
    } else if (
      rule.ruleType === "FIXED_ADDON" &&
      rule.questionKey &&
      answerIsSelected(effectiveAnswers[rule.questionKey])
    ) {
      lineAmount = rule.amount;
    } else if (rule.ruleType === "PERCENTAGE") {
      lineAmount = Math.round((subtotal * rule.amount) / 10_000);
    }

    if (lineAmount > 0) {
      subtotal += lineAmount;
      breakdown.push({ label: rule.name, amount: lineAmount });
    }
  }

  if (breakdown.length === 0) {
    return { type: "CUSTOM_QUOTE_REQUIRED" };
  }

  return {
    type: "ESTIMATE",
    subtotal,
    total: subtotal,
    currency: "AUD",
    breakdown,
    paymentRequirement: service.paymentRequirement,
    depositAmountCents: calculateDepositAmount(service, subtotal),
  };
}

export const calculateServiceEstimate = query({
  args: {
    serviceId: v.id("services"),
    answers: v.record(v.string(), answerValue),
  },
  handler: (ctx, args) => calculateEstimateForService(ctx, args),
});
