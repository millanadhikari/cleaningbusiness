"use node";

import { createHash, createSign, randomUUID } from "node:crypto";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";

const photoType = v.union(
  v.literal("BEFORE"),
  v.literal("AFTER"),
  v.literal("ISSUE"),
);

type SignedMethod = "PUT" | "GET" | "HEAD" | "DELETE";
type PreparedUpload = {
  bookingId: Id<"bookings">;
  photoType: "BEFORE" | "AFTER" | "ISSUE";
  contentType: string;
  sizeBytes: number;
  originalFileName?: string;
  directory: string;
  extension: string;
};
type UploadAuthorization = {
  uploadUrl: string;
  storagePath: string;
  requiredHeaders: { contentType: string };
  expiresAt: number;
};
type PreparedPhotoRead = { photoId: Id<"cleanerPhotos">; storagePath: string };
type SignedPhotoRead = { photoId: Id<"cleanerPhotos">; url: string; expiresAt: number };

function storageConfiguration() {
  const rawBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  const clientEmail = process.env.GCP_STORAGE_CLIENT_EMAIL?.trim();
  const rawPrivateKey = process.env.GCP_STORAGE_PRIVATE_KEY?.trim();
  if (!rawBucket || !clientEmail || !rawPrivateKey) {
    throw new Error("Photo storage is not configured.");
  }
  const bucket = rawBucket
    .replace(/^gs:\/\//, "")
    .replace(/^https:\/\/storage\.googleapis\.com\//, "")
    .replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9._-]+$/i.test(bucket)) {
    throw new Error("Photo storage bucket configuration is invalid.");
  }
  const privateKey = rawPrivateKey
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\n/g, "\n");
  return { bucket, clientEmail, privateKey };
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodePath(value: string) {
  return value.split("/").map(encodeRfc3986).join("/");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function signedStorageUrl(input: {
  method: SignedMethod;
  storagePath: string;
  expiresInSeconds: number;
  contentType?: string;
}) {
  const { bucket, clientEmail, privateKey } = storageConfiguration();
  const now = new Date();
  const requestTimestamp = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const dateStamp = requestTimestamp.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/storage/goog4_request`;
  const headers: Record<string, string> = { host: "storage.googleapis.com" };
  if (input.contentType) headers["content-type"] = input.contentType;
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join("");
  const query: Record<string, string> = {
    "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
    "X-Goog-Credential": `${clientEmail}/${credentialScope}`,
    "X-Goog-Date": requestTimestamp,
    "X-Goog-Expires": String(input.expiresInSeconds),
    "X-Goog-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.entries(query)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
  const canonicalUri = `/${encodePath(bucket)}/${encodePath(input.storagePath)}`;
  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "GOOG4-RSA-SHA256",
    requestTimestamp,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = createSign("RSA-SHA256")
    .update(stringToSign)
    .sign(privateKey, "hex");
  return `https://storage.googleapis.com${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signature}`;
}

export const requestCleanerPhotoUpload = action({
  args: {
    bookingId: v.id("bookings"),
    photoType,
    contentType: v.string(),
    sizeBytes: v.number(),
    originalFileName: v.optional(v.string()),
  },
  returns: v.object({
    uploadUrl: v.string(),
    storagePath: v.string(),
    requiredHeaders: v.object({ contentType: v.string() }),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args): Promise<UploadAuthorization> => {
    const prepared: PreparedUpload = await ctx.runQuery(
      internal.cleanerPhotos.authorizeCleanerPhotoUpload,
      args,
    );
    const storagePath: string = `bookings/${prepared.bookingId}/${prepared.directory}/${randomUUID()}.${prepared.extension}`;
    const expiresInSeconds = 8 * 60;
    return {
      uploadUrl: signedStorageUrl({
        method: "PUT",
        storagePath,
        expiresInSeconds,
        contentType: prepared.contentType,
      }),
      storagePath,
      requiredHeaders: { contentType: prepared.contentType },
      expiresAt: Date.now() + expiresInSeconds * 1000,
    };
  },
});

export const confirmCleanerPhotoUpload = action({
  args: {
    bookingId: v.id("bookings"),
    storagePath: v.string(),
    photoType,
    contentType: v.string(),
    sizeBytes: v.number(),
    originalFileName: v.optional(v.string()),
  },
  returns: v.object({ photoId: v.id("cleanerPhotos") }),
  handler: async (ctx, args): Promise<{ photoId: Id<"cleanerPhotos"> }> => {
    const prepared = await ctx.runQuery(
      internal.cleanerPhotos.authorizeCleanerPhotoConfirmation,
      args,
    );
    const verificationUrl = signedStorageUrl({
      method: "HEAD",
      storagePath: prepared.storagePath,
      expiresInSeconds: 2 * 60,
    });
    const response = await fetch(verificationUrl, { method: "HEAD" });
    if (!response.ok) {
      throw new Error("The uploaded image could not be verified. Please upload it again.");
    }
    const storedContentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    const storedSize = Number(response.headers.get("content-length"));
    if (storedContentType !== prepared.contentType || storedSize !== prepared.sizeBytes) {
      throw new Error("The stored image does not match the approved upload.");
    }
    const photoId = await ctx.runMutation(
      internal.cleanerPhotos.confirmCleanerPhotoMetadata,
      prepared,
    );
    return { photoId };
  },
});

export const getCleanerPhotoReadUrls = action({
  args: {
    bookingId: v.id("bookings"),
    photoIds: v.array(v.id("cleanerPhotos")),
  },
  returns: v.array(v.object({
    photoId: v.id("cleanerPhotos"),
    url: v.string(),
    expiresAt: v.number(),
  })),
  handler: async (ctx, args): Promise<SignedPhotoRead[]> => {
    const photos: PreparedPhotoRead[] = await ctx.runQuery(
      internal.cleanerPhotos.preparePhotoReads,
      args,
    );
    const expiresInSeconds = 15 * 60;
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    return photos.map((photo) => ({
      photoId: photo.photoId,
      url: signedStorageUrl({
        method: "GET",
        storagePath: photo.storagePath,
        expiresInSeconds,
      }),
      expiresAt,
    }));
  },
});

export const deleteCleanerPhoto = action({
  args: { photoId: v.id("cleanerPhotos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prepared = await ctx.runQuery(internal.cleanerPhotos.preparePhotoDeletion, args);
    const deleteUrl = signedStorageUrl({
      method: "DELETE",
      storagePath: prepared.storagePath,
      expiresInSeconds: 2 * 60,
    });
    const response = await fetch(deleteUrl, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      throw new Error("The image could not be deleted from storage. Please try again.");
    }
    await ctx.runMutation(internal.cleanerPhotos.markPhotoDeleted, {
      photoId: prepared.photoId,
    });
    return null;
  },
});
