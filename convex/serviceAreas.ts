import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireRole } from "./lib/auth";
import {
  defaultSydneyPostcodeStatus,
  defaultSydneyServiceAreaCounts,
  type ServiceAreaStatus,
} from "./lib/sydneyServiceArea";

const statusValidator = v.union(
  v.literal("IN_AREA"),
  v.literal("CHECK_ADDRESS"),
  v.literal("OUTSIDE_AREA"),
);

function normalizePostcode(value: string) {
  const postcode = value.trim();
  if (!/^\d{4}$/.test(postcode)) throw new Error("Enter a valid four-digit postcode.");
  return postcode;
}

export async function assessPostcode(ctx: QueryCtx | MutationCtx, value: string) {
  const postcode = normalizePostcode(value);
  const [settings, override] = await Promise.all([
    ctx.db.query("serviceAreaSettings").withIndex("by_key", (index) => index.eq("key", "DEFAULT")).unique(),
    ctx.db.query("serviceAreaPostcodeOverrides").withIndex("by_postcode", (index) => index.eq("postcode", postcode)).unique(),
  ]);
  const status: ServiceAreaStatus = override?.status ?? defaultSydneyPostcodeStatus(postcode);
  const mode = settings?.mode ?? "WARNING";
  return {
    postcode,
    status,
    mode,
    canInstantBook: status === "IN_AREA" || mode === "WARNING",
    source: override ? ("OVERRIDE" as const) : ("DEFAULT_40KM" as const),
    centreName: settings?.centreName ?? "Sydney CBD",
    radiusKm: settings?.radiusKm ?? 40,
  };
}

export const checkPostcode = query({
  args: { postcode: v.string() },
  handler: (ctx, args) => assessPostcode(ctx, args.postcode),
});

export const getConfiguration = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const [settings, overrides] = await Promise.all([
      ctx.db.query("serviceAreaSettings").withIndex("by_key", (index) => index.eq("key", "DEFAULT")).unique(),
      ctx.db.query("serviceAreaPostcodeOverrides").collect(),
    ]);
    return {
      settings: {
        centreName: settings?.centreName ?? "Sydney CBD",
        radiusKm: settings?.radiusKm ?? 40,
        mode: settings?.mode ?? ("WARNING" as const),
      },
      defaults: defaultSydneyServiceAreaCounts,
      overrides: overrides.sort((a, b) => a.postcode.localeCompare(b.postcode)),
    };
  },
});

export const updateSettings = mutation({
  args: {
    centreName: v.string(),
    radiusKm: v.number(),
    mode: v.union(v.literal("WARNING"), v.literal("ENFORCED")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const centreName = args.centreName.trim();
    if (!centreName || centreName.length > 100) throw new Error("Enter a valid centre name.");
    if (args.radiusKm !== 40) {
      throw new Error("Phase 1 uses the generated 40 km postcode list. Use postcode overrides for exceptions.");
    }
    const existing = await ctx.db.query("serviceAreaSettings").withIndex("by_key", (index) => index.eq("key", "DEFAULT")).unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { centreName, radiusKm: args.radiusKm, mode: args.mode, updatedByUserId: user._id, updatedAt: now });
    } else {
      await ctx.db.insert("serviceAreaSettings", { key: "DEFAULT", centreName, radiusKm: args.radiusKm, mode: args.mode, updatedByUserId: user._id, createdAt: now, updatedAt: now });
    }
    return null;
  },
});

export const upsertOverride = mutation({
  args: { postcode: v.string(), status: statusValidator, note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const postcode = normalizePostcode(args.postcode);
    const note = args.note?.trim() || undefined;
    const existing = await ctx.db.query("serviceAreaPostcodeOverrides").withIndex("by_postcode", (index) => index.eq("postcode", postcode)).unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { status: args.status, note, updatedByUserId: user._id, updatedAt: now });
    } else {
      await ctx.db.insert("serviceAreaPostcodeOverrides", { postcode, status: args.status, note, updatedByUserId: user._id, createdAt: now, updatedAt: now });
    }
    return null;
  },
});

export const removeOverride = mutation({
  args: { overrideId: v.id("serviceAreaPostcodeOverrides") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const override = await ctx.db.get(args.overrideId);
    if (override) await ctx.db.delete(override._id);
    return null;
  },
});
