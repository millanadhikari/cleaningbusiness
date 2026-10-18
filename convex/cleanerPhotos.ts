import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

const photoType = v.union(
  v.literal("BEFORE"),
  v.literal("AFTER"),
  v.literal("ISSUE"),
);

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

type PhotoType = Doc<"cleanerPhotos">["photoType"];
type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

function validateContentType(value: string): AllowedContentType {
  if (!ALLOWED_CONTENT_TYPES.includes(value as AllowedContentType)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  return value as AllowedContentType;
}

function validateSizeBytes(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("The image size is invalid.");
  }
  if (value > MAX_PHOTO_SIZE_BYTES) {
    throw new Error("Images must be 10 MB or smaller.");
  }
  return value;
}

function cleanOriginalFileName(value: string | undefined) {
  const cleaned = value?.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!cleaned) return undefined;
  return cleaned.slice(0, 160);
}

function storageDirectory(type: PhotoType) {
  if (type === "BEFORE") return "before";
  if (type === "AFTER") return "after";
  return "issues";
}

function storageExtension(contentType: AllowedContentType) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  return "webp";
}

function isExpectedStoragePath(
  storagePath: string,
  bookingId: Id<"bookings">,
  type: PhotoType,
  contentType: AllowedContentType,
) {
  const prefix = `bookings/${bookingId}/${storageDirectory(type)}/`;
  const extension = storageExtension(contentType);
  const filename = storagePath.slice(prefix.length);
  return storagePath.startsWith(prefix) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      filename.slice(0, -(extension.length + 1)),
    ) && filename.endsWith(`.${extension}`);
}

async function requirePhotoUploader(
  ctx: QueryCtx,
  bookingId: Id<"bookings">,
) {
  const user = await requireUser(ctx);
  const booking = await ctx.db.get(bookingId);
  if (!booking) throw new Error("Booking not found.");

  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
    return { user, cleaner: null, booking, assignment: null };
  }
  if (user.role !== "CLEANER") {
    throw new Error("You do not have permission to add booking photos.");
  }
  const cleaner = await ctx.db
    .query("cleaners")
    .withIndex("by_user", (index) => index.eq("userId", user._id))
    .unique();
  if (!cleaner || cleaner.status !== "ACTIVE") {
    throw new Error("Cleaner profile is unavailable or inactive.");
  }
  const assignment = await ctx.db
    .query("bookingCleanerAssignments")
    .withIndex("by_booking_and_cleaner", (index) =>
      index.eq("bookingId", bookingId).eq("cleanerId", cleaner._id),
    )
    .unique();
  if (!assignment) throw new Error("This job is not assigned to you.");
  if (booking.status !== "CONFIRMED") {
    throw new Error("Photos cannot be changed for this booking.");
  }
  const status = assignment.status ?? "ACCEPTED";
  if (status !== "ACCEPTED" && status !== "IN_PROGRESS") {
    throw new Error("Photos can only be added while this job is active.");
  }
  return { user, cleaner, booking, assignment };
}

async function requireBookingViewer(ctx: QueryCtx, bookingId: Id<"bookings">) {
  const user = await requireUser(ctx);
  const booking = await ctx.db.get(bookingId);
  if (!booking) throw new Error("Booking not found.");
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
    return { user, booking, cleaner: null, assignment: null };
  }
  if (user.role !== "CLEANER") {
    throw new Error("You do not have permission to view these photos.");
  }
  const cleaner = await ctx.db
    .query("cleaners")
    .withIndex("by_user", (index) => index.eq("userId", user._id))
    .unique();
  if (!cleaner || cleaner.status !== "ACTIVE") {
    throw new Error("Cleaner profile is unavailable or inactive.");
  }
  const assignment = await ctx.db
    .query("bookingCleanerAssignments")
    .withIndex("by_booking_and_cleaner", (index) =>
      index.eq("bookingId", bookingId).eq("cleanerId", cleaner._id),
    )
    .unique();
  if (!assignment) throw new Error("This job is not assigned to you.");
  return { user, booking, cleaner, assignment };
}

export const authorizeCleanerPhotoUpload = internalQuery({
  args: {
    bookingId: v.id("bookings"),
    photoType,
    contentType: v.string(),
    sizeBytes: v.number(),
    originalFileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePhotoUploader(ctx, args.bookingId);
    const contentType = validateContentType(args.contentType);
    return {
      bookingId: args.bookingId,
      photoType: args.photoType,
      contentType,
      sizeBytes: validateSizeBytes(args.sizeBytes),
      originalFileName: cleanOriginalFileName(args.originalFileName),
      directory: storageDirectory(args.photoType),
      extension: storageExtension(contentType),
    };
  },
});

export const authorizeCleanerPhotoConfirmation = internalQuery({
  args: {
    bookingId: v.id("bookings"),
    storagePath: v.string(),
    photoType,
    contentType: v.string(),
    sizeBytes: v.number(),
    originalFileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePhotoUploader(ctx, args.bookingId);
    const contentType = validateContentType(args.contentType);
    const sizeBytes = validateSizeBytes(args.sizeBytes);
    if (!isExpectedStoragePath(args.storagePath, args.bookingId, args.photoType, contentType)) {
      throw new Error("The uploaded image path is invalid.");
    }
    return {
      ...args,
      contentType,
      sizeBytes,
      originalFileName: cleanOriginalFileName(args.originalFileName),
    };
  },
});

export const confirmCleanerPhotoMetadata = internalMutation({
  args: {
    bookingId: v.id("bookings"),
    storagePath: v.string(),
    photoType,
    contentType: v.string(),
    sizeBytes: v.number(),
    originalFileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, cleaner } = await requirePhotoUploader(ctx, args.bookingId);
    const contentType = validateContentType(args.contentType);
    const sizeBytes = validateSizeBytes(args.sizeBytes);
    if (!isExpectedStoragePath(args.storagePath, args.bookingId, args.photoType, contentType)) {
      throw new Error("The uploaded image path is invalid.");
    }
    const existing = await ctx.db
      .query("cleanerPhotos")
      .withIndex("by_storage_path", (index) => index.eq("storagePath", args.storagePath))
      .unique();
    if (existing) {
      if (
        existing.bookingId !== args.bookingId ||
        existing.cleanerId !== cleaner?._id ||
        existing.cleanerUserId !== user._id ||
        existing.status !== "UPLOADED"
      ) {
        throw new Error("This image path has already been used.");
      }
      return existing._id;
    }
    const now = Date.now();
    return ctx.db.insert("cleanerPhotos", {
      bookingId: args.bookingId,
      cleanerId: cleaner?._id,
      cleanerUserId: user._id,
      storagePath: args.storagePath,
      photoType: args.photoType,
      contentType,
      sizeBytes,
      originalFileName: cleanOriginalFileName(args.originalFileName),
      status: "UPLOADED",
      uploadedAt: now,
      retentionHold: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listBookingPhotos = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const viewer = await requireBookingViewer(ctx, bookingId);
    const photos = await ctx.db
      .query("cleanerPhotos")
      .withIndex("by_booking", (index) => index.eq("bookingId", bookingId))
      .order("desc")
      .take(24);
    return Promise.all(
      photos
        .filter((photo) => photo.status === "UPLOADED")
        .sort((a, b) => b.uploadedAt - a.uploadedAt)
        .map(async (photo) => {
          const [cleaner, uploader] = await Promise.all([
            photo.cleanerId ? ctx.db.get(photo.cleanerId) : null,
            ctx.db.get(photo.cleanerUserId),
          ]);
          const cleanerCanDelete = Boolean(photo.cleanerId) &&
            viewer.cleaner?._id === photo.cleanerId &&
            viewer.assignment !== null &&
            viewer.booking.status === "CONFIRMED" &&
            ["ACCEPTED", "IN_PROGRESS"].includes(viewer.assignment.status ?? "ACCEPTED");
          const uploaderName = [uploader?.firstName, uploader?.lastName]
            .filter(Boolean)
            .join(" ");
          return {
            photoId: photo._id,
            photoType: photo.photoType,
            contentType: photo.contentType,
            sizeBytes: photo.sizeBytes,
            originalFileName: photo.originalFileName,
            uploadedAt: photo.uploadedAt,
            uploadedBy: cleaner
              ? `${cleaner.firstName} ${cleaner.lastName}`
              : uploaderName || uploader?.email || "Admin",
            canDelete: viewer.user.role === "SUPER_ADMIN" ||
              viewer.user.role === "ADMIN" || cleanerCanDelete,
          };
        }),
    );
  },
});

export const preparePhotoReads = internalQuery({
  args: {
    bookingId: v.id("bookings"),
    photoIds: v.array(v.id("cleanerPhotos")),
  },
  handler: async (ctx, args) => {
    await requireBookingViewer(ctx, args.bookingId);
    if (args.photoIds.length > 24) {
      throw new Error("Request up to 24 photo previews at a time.");
    }
    const uniquePhotoIds = [...new Set(args.photoIds)];
    const photos = await Promise.all(uniquePhotoIds.map((photoId) => ctx.db.get(photoId)));
    return photos.map((photo, index) => {
      if (!photo || photo.bookingId !== args.bookingId || photo.status !== "UPLOADED") {
        throw new Error("Photo not found.");
      }
      return { photoId: uniquePhotoIds[index], storagePath: photo.storagePath };
    });
  },
});

export const preparePhotoDeletion = internalQuery({
  args: { photoId: v.id("cleanerPhotos") },
  handler: async (ctx, { photoId }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.status !== "UPLOADED") throw new Error("Photo not found.");
    const viewer = await requireBookingViewer(ctx, photo.bookingId);
    const isAdmin = viewer.user.role === "SUPER_ADMIN" || viewer.user.role === "ADMIN";
    if (!isAdmin) {
      if (
        viewer.cleaner?._id !== photo.cleanerId ||
        viewer.booking.status !== "CONFIRMED" ||
        !viewer.assignment ||
        !["ACCEPTED", "IN_PROGRESS"].includes(viewer.assignment.status ?? "ACCEPTED")
      ) {
        throw new Error("This photo can no longer be deleted from the cleaner portal.");
      }
    }
    return { photoId: photo._id, storagePath: photo.storagePath };
  },
});

export const markPhotoDeleted = internalMutation({
  args: { photoId: v.id("cleanerPhotos") },
  handler: async (ctx, { photoId }) => {
    const user = await requireUser(ctx);
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.status === "DELETED") return null;
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN" && photo.cleanerUserId !== user._id) {
      throw new Error("You do not have permission to delete this photo.");
    }
    const now = Date.now();
    await ctx.db.patch(photo._id, {
      status: "DELETED",
      deletedAt: now,
      deletedByUserId: user._id,
      updatedAt: now,
    });
    return null;
  },
});
