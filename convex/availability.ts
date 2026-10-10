import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireRole } from "./lib/auth";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DEFAULT_BOOKING_TIMES = [
  "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00",
] as const;

function validateDate(date: string) {
  if (!DATE_PATTERN.test(date)) throw new Error("Select a valid date.");
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Select a valid date.");
  }
}

function validateTime(time: string) {
  if (!TIME_PATTERN.test(time) || !DEFAULT_BOOKING_TIMES.includes(time as typeof DEFAULT_BOOKING_TIMES[number])) {
    throw new Error("Select a standard appointment time.");
  }
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function datesBetween(fromDate: string, toDate: string) {
  const dates: string[] = [];
  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    dates.push(date);
    if (dates.length > 180) throw new Error("Availability range is too large.");
  }
  return dates;
}

function currentSydneyDate() {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function bookingsForDates(ctx: QueryCtx | MutationCtx, fromDate: string, toDate: string) {
  return ctx.db.query("bookings").withIndex("by_scheduled_date", (index) =>
    index.gte("scheduledDate", fromDate).lte("scheduledDate", toDate),
  ).collect();
}

export async function listPublicSlots(ctx: QueryCtx | MutationCtx, requestedFromDate: string, toDate: string) {
    validateDate(requestedFromDate);
    validateDate(toDate);
    const firstAvailableDate = addDays(currentSydneyDate(), 1);
    const fromDate = requestedFromDate > firstAvailableDate ? requestedFromDate : firstAvailableDate;
    if (toDate < fromDate) return [];
    const [blocks, bookings] = await Promise.all([
      ctx.db.query("publicAvailabilityBlocks").withIndex("by_date", (index) =>
        index.gte("date", fromDate).lte("date", toDate),
      ).collect(),
      bookingsForDates(ctx, fromDate, toDate),
    ]);
    const occupied = new Set(bookings.filter((booking) => booking.status !== "CANCELLED").map((booking) => `${booking.scheduledDate}|${booking.scheduledTime}`));
    const blockedDays = new Set(blocks.filter((block) => !block.time).map((block) => block.date));
    const blockedTimes = new Set(blocks.filter((block) => block.time).map((block) => `${block.date}|${block.time}`));
    return datesBetween(fromDate, toDate).flatMap((date) => {
      if (blockedDays.has(date)) return [];
      return DEFAULT_BOOKING_TIMES
        .filter((time) => !blockedTimes.has(`${date}|${time}`) && !occupied.has(`${date}|${time}`))
        .map((time) => ({ date, time, capacity: 1, remaining: 1 }));
    });
}

export const listPublic = query({
  args: { fromDate: v.string(), toDate: v.string() },
  handler: (ctx, args) => listPublicSlots(ctx, args.fromDate, args.toDate),
});

export const createBlock = mutation({
  args: { date: v.string(), time: v.optional(v.string()), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    validateDate(args.date);
    if (args.time) validateTime(args.time);
    if (args.date <= currentSydneyDate()) throw new Error("Choose a future date.");
    const existing = await ctx.db.query("publicAvailabilityBlocks").withIndex("by_date_and_time", (index) =>
      index.eq("date", args.date).eq("time", args.time),
    ).unique();
    if (existing) return existing._id;
    return ctx.db.insert("publicAvailabilityBlocks", {
      date: args.date,
      time: args.time,
      reason: args.reason?.trim() || undefined,
      createdByUserId: user._id,
      createdAt: Date.now(),
    });
  },
});

export const removeBlock = mutation({
  args: { blockId: v.id("publicAvailabilityBlocks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const block = await ctx.db.get(args.blockId);
    if (block) await ctx.db.delete(block._id);
    return null;
  },
});

export async function ensurePublicSlotAvailable(
  ctx: MutationCtx,
  date: string,
  time: string,
  excludeBookingId?: string,
) {
  validateDate(date);
  validateTime(time);
  if (date <= currentSydneyDate()) throw new Error("Appointments are available from tomorrow.");
  const blocks = await ctx.db.query("publicAvailabilityBlocks").withIndex("by_date", (index) => index.eq("date", date)).collect();
  if (blocks.some((block) => !block.time || block.time === time)) {
    throw new Error("That appointment time is unavailable. Please choose another.");
  }
  const bookings = await bookingsForDates(ctx, date, date);
  if (bookings.some((booking) => booking._id !== excludeBookingId && booking.status !== "CANCELLED" && booking.scheduledTime === time)) {
    throw new Error("That appointment time has just been booked. Please choose another.");
  }
}
