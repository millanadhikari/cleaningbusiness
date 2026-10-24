import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";

const reminderKind = v.union(v.literal("24_HOURS"), v.literal("2_HOURS"));
const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function sydneyParts(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function sydneyDateTimeToTimestamp(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Booking schedule is invalid.");
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = targetUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = sydneyParts(candidate);
    const representedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    candidate = targetUtc - (representedUtc - candidate);
  }
  const resolved = sydneyParts(candidate);
  if (
    resolved.year !== String(year).padStart(4, "0") ||
    resolved.month !== String(month).padStart(2, "0") ||
    resolved.day !== String(day).padStart(2, "0") ||
    resolved.hour !== String(hour).padStart(2, "0") ||
    resolved.minute !== String(minute).padStart(2, "0")
  ) {
    throw new Error("Booking schedule could not be resolved in Australia/Sydney.");
  }
  return candidate;
}

async function cancelScheduledReminder(
  ctx: MutationCtx,
  scheduleId: Doc<"bookingCleanerAssignments">["reminder24hScheduleId"],
) {
  if (!scheduleId) return;
  try {
    await ctx.scheduler.cancel(scheduleId);
  } catch {
    // Completed or concurrently executing reminder schedules no longer need cancellation.
  }
}

async function clearReminderSchedules(
  ctx: MutationCtx,
  assignment: Doc<"bookingCleanerAssignments">,
) {
  await cancelScheduledReminder(ctx, assignment.reminder24hScheduleId);
  await cancelScheduledReminder(ctx, assignment.reminder2hScheduleId);
  await ctx.db.patch(assignment._id, {
    reminder24hScheduleId: undefined,
    reminder2hScheduleId: undefined,
    reminderScheduleKey: undefined,
  });
}

async function syncAssignment(
  ctx: MutationCtx,
  assignment: Doc<"bookingCleanerAssignments">,
) {
  const booking = await ctx.db.get(assignment.bookingId);
  const assignmentActive = assignment.status === "ACCEPTED" || assignment.status === "IN_PROGRESS";
  if (!booking || booking.status === "CANCELLED" || !assignmentActive) {
    await clearReminderSchedules(ctx, assignment);
    return;
  }

  const scheduleKey = `${booking.scheduledDate}T${booking.scheduledTime}`;
  if (assignment.reminderScheduleKey === scheduleKey) return;
  await cancelScheduledReminder(ctx, assignment.reminder24hScheduleId);
  await cancelScheduledReminder(ctx, assignment.reminder2hScheduleId);

  const jobStartsAt = sydneyDateTimeToTimestamp(booking.scheduledDate, booking.scheduledTime);
  const now = Date.now();
  let reminder24hScheduleId;
  let reminder2hScheduleId;
  if (jobStartsAt - DAY_MS > now) {
    reminder24hScheduleId = await ctx.scheduler.runAt(
      jobStartsAt - DAY_MS,
      internal.jobReminders.deliverReminder,
      { assignmentId: assignment._id, expectedScheduleKey: scheduleKey, kind: "24_HOURS" },
    );
  }
  if (jobStartsAt > now) {
    reminder2hScheduleId = await ctx.scheduler.runAt(
      Math.max(now + 1_000, jobStartsAt - TWO_HOURS_MS),
      internal.jobReminders.deliverReminder,
      { assignmentId: assignment._id, expectedScheduleKey: scheduleKey, kind: "2_HOURS" },
    );
  }
  await ctx.db.patch(assignment._id, {
    reminder24hScheduleId,
    reminder2hScheduleId,
    reminderScheduleKey: scheduleKey,
  });
}

export const syncAssignmentReminders = internalMutation({
  args: { assignmentId: v.id("bookingCleanerAssignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return null;
    await syncAssignment(ctx, assignment);
    return null;
  },
});

export const rescheduleBookingReminders = internalMutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("bookingCleanerAssignments")
      .withIndex("by_booking", (index) => index.eq("bookingId", args.bookingId))
      .collect();
    for (const assignment of assignments) await syncAssignment(ctx, assignment);
    return { updated: assignments.length };
  },
});

export const syncCleanerReminders = internalMutation({
  args: { cleanerId: v.id("cleaners") },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("bookingCleanerAssignments")
      .withIndex("by_cleaner", (index) => index.eq("cleanerId", args.cleanerId))
      .collect();
    const active = assignments.filter((assignment) =>
      assignment.status === "ACCEPTED" || assignment.status === "IN_PROGRESS",
    );
    for (const assignment of active) await syncAssignment(ctx, assignment);
    return { updated: active.length };
  },
});

export const deliverReminder = internalMutation({
  args: {
    assignmentId: v.id("bookingCleanerAssignments"),
    expectedScheduleKey: v.string(),
    kind: reminderKind,
  },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || !["ACCEPTED", "IN_PROGRESS"].includes(assignment.status ?? "")) return null;
    const [booking, cleaner] = await Promise.all([
      ctx.db.get(assignment.bookingId),
      ctx.db.get(assignment.cleanerId),
    ]);
    if (!booking || booking.status === "CANCELLED" || !cleaner?.userId || cleaner.status !== "ACTIVE") {
      return null;
    }
    const scheduleKey = `${booking.scheduledDate}T${booking.scheduledTime}`;
    if (scheduleKey !== args.expectedScheduleKey || assignment.reminderScheduleKey !== scheduleKey) {
      return null;
    }
    const isSoon = args.kind === "2_HOURS";
    await ctx.scheduler.runAfter(0, internal.notifications.createNotification, {
      recipientUserId: cleaner.userId,
      type: "JOB_REMINDER",
      title: isSoon ? "Job starts soon" : "Job tomorrow",
      body: `Booking ${booking.reference ?? String(booking._id)} starts ${isSoon ? "in about 2 hours" : "in about 24 hours"} at ${booking.scheduledTime}.`,
      entityType: "BOOKING",
      entityId: String(booking._id),
      deepLink: `/cleaner/jobs/${booking._id}`,
      priority: isSoon ? "HIGH" : "NORMAL",
      dedupeKey: `job-reminder:${assignment._id}:${args.kind}:${scheduleKey}`,
    });
    return null;
  },
});
