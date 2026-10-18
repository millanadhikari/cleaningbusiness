import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalQuery } from "./_generated/server";
import { calculateEstimateForService } from "./services";

const answerValue = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.array(v.string()),
);

export async function activeService(ctx: QueryCtx | MutationCtx, input: string) {
  const value = input.trim();
  const id = ctx.db.normalizeId("services", value);
  const byId = id ? await ctx.db.get(id) : null;
  if (byId?.status === "ACTIVE") return byId;
  const bySlug = await ctx.db
    .query("services")
    .withIndex("by_slug", (index) => index.eq("slug", value.toLowerCase()))
    .unique();
  if (bySlug?.status === "ACTIVE") return bySlug;
  const services = await ctx.db
    .query("services")
    .withIndex("by_status_and_sort_order", (index) => index.eq("status", "ACTIVE"))
    .collect();
  return services.find((service) => service.name.toLowerCase() === value.toLowerCase()) ?? null;
}

async function questions(ctx: QueryCtx, service: Doc<"services">) {
  return (
    await ctx.db
      .query("serviceQuestions")
      .withIndex("by_service", (index) => index.eq("serviceId", service._id))
      .collect()
  )
    .filter((question) => question.status === "ACTIVE")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export const getServices = internalQuery({
  args: {},
  handler: async (ctx) => {
    const services = await ctx.db
      .query("services")
      .withIndex("by_status_and_sort_order", (index) => index.eq("status", "ACTIVE"))
      .order("asc")
      .collect();
    return services.map((service) => ({
      id: service._id,
      slug: service.slug,
      name: service.name,
      description: service.description ?? service.shortDescription ?? null,
      pricingModel: service.pricingModel,
      requiresInspection: service.requiresInspection ?? false,
    }));
  },
});

export const getServiceDetails = internalQuery({
  args: { service: v.string() },
  handler: async (ctx, args) => {
    const service = await activeService(ctx, args.service);
    if (!service) return { error: "Active service not found." };
    return {
      service: {
        id: service._id,
        slug: service.slug,
        name: service.name,
        description: service.description ?? service.shortDescription ?? null,
        pricingModel: service.pricingModel,
        requiresInspection: service.requiresInspection ?? false,
      },
      questions: (await questions(ctx, service)).map((question) => ({
        key: question.key,
        label: question.label,
        type: question.type,
        required: question.required,
        options: question.options,
      })),
    };
  },
});

export const getBusinessInfo = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("serviceAreaSettings")
      .withIndex("by_key", (index) => index.eq("key", "DEFAULT"))
      .unique();
    return {
      businessName: "We Do Cleaning Services",
      website: "https://wedocleaning.com.au",
      phone: "+61 401 356 937",
      serviceArea: settings
        ? {
            centre: settings.centreName,
            radiusKm: settings.radiusKm,
            note: "Exact availability must be confirmed from the customer's postcode.",
          }
        : null,
      operatingHours: null,
      policies: null,
    };
  },
});

export const calculateEstimate = internalQuery({
  args: {
    service: v.string(),
    answers: v.record(v.string(), answerValue),
  },
  handler: async (ctx, args) => {
    const service = await activeService(ctx, args.service);
    if (!service) return { status: "ERROR" as const, error: "Active service not found." };
    const serviceQuestions = await questions(ctx, service);
    const missing = serviceQuestions.filter((question) => {
      if (!question.required) return false;
      const value = args.answers[question.key];
      return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    });
    if (args.answers.carpetSteam === true) {
      const rooms = args.answers.carpetRooms;
      if (typeof rooms !== "number" || !Number.isInteger(rooms) || rooms < 1) {
        const carpetQuestion = serviceQuestions.find((question) => question.key === "carpetRooms");
        if (carpetQuestion && !missing.some((question) => question.key === "carpetRooms")) {
          missing.push(carpetQuestion);
        }
      }
    }
    if (missing.length) {
      return {
        status: "MISSING_INPUTS" as const,
        missing: missing.map((question) => ({
          key: question.key,
          label: question.label,
          type: question.type,
          options: question.options,
        })),
      };
    }
    try {
      const estimate = await calculateEstimateForService(ctx, {
        serviceId: service._id,
        answers: args.answers,
      });
      return {
        status: "OK" as const,
        service: { id: service._id, slug: service.slug, name: service.name },
        estimate,
        formattedTotal:
          estimate.type === "ESTIMATE"
            ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(estimate.total / 100)
            : null,
      };
    } catch (error) {
      return {
        status: "ERROR" as const,
        error: error instanceof Error ? error.message : "Estimate unavailable.",
      };
    }
  },
});
