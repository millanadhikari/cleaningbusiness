/* eslint-disable @next/next/no-img-element */
"use client";

import { useAction, useQuery } from "convex/react";
import { Camera, ImageIcon, LoaderCircle, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1920;

type PhotoType = "BEFORE" | "AFTER" | "ISSUE";
type AssignmentStatus = "OFFERED" | "ACCEPTED" | "DECLINED" | "IN_PROGRESS" | "COMPLETED";
type UploadState = {
  file: File;
  photoType: PhotoType;
  previewUrl: string;
  progress: number;
  status: "PREPARING" | "UPLOADING" | "CONFIRMING" | "SUCCESS" | "ERROR";
  error?: string;
};

function photoLabel(type: PhotoType) {
  if (type === "BEFORE") return "Before";
  if (type === "AFTER") return "After";
  return "Issue";
}

function compressedName(name: string) {
  const base = name.replace(/\.[^.]+$/, "") || "cleaning-photo";
  return `${base}.webp`;
}

async function compressPhoto(file: File) {
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 2 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encode = (quality: number) => new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    let blob = await encode(0.82);
    if (blob && blob.size > 2 * 1024 * 1024) blob = await encode(0.76);
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], compressedName(file.name), {
      type: "image/webp",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

function uploadDirectly(
  uploadUrl: string,
  contentType: string,
  file: File,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", contentType);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("The image upload failed. Please try again."));
    });
    request.addEventListener("error", () => reject(new Error("The image upload could not reach storage.")));
    request.addEventListener("abort", () => reject(new Error("The image upload was cancelled.")));
    request.send(file);
  });
}

export function CleanerPhotoGallery({
  bookingId,
  assignmentStatus,
  adminMode = false,
}: {
  bookingId: Id<"bookings">;
  assignmentStatus?: AssignmentStatus;
  adminMode?: boolean;
}) {
  const photos = useQuery(api.cleanerPhotos.listBookingPhotos, { bookingId });
  const requestUpload = useAction(api.cleanerPhotoStorage.requestCleanerPhotoUpload);
  const confirmUpload = useAction(api.cleanerPhotoStorage.confirmCleanerPhotoUpload);
  const getReadUrls = useAction(api.cleanerPhotoStorage.getCleanerPhotoReadUrls);
  const deletePhoto = useAction(api.cleanerPhotoStorage.deleteCleanerPhoto);
  const inputRef = useRef<HTMLInputElement>(null);
  const [requestedType, setRequestedType] = useState<PhotoType>("BEFORE");
  const [upload, setUpload] = useState<UploadState>();
  const [readUrls, setReadUrls] = useState<Record<string, string>>({});
  const [previewPhotoId, setPreviewPhotoId] = useState<Id<"cleanerPhotos">>();
  const [deletingPhotoId, setDeletingPhotoId] = useState<Id<"cleanerPhotos">>();
  const [galleryError, setGalleryError] = useState<string>();
  const canUpload = adminMode || assignmentStatus === "ACCEPTED" || assignmentStatus === "IN_PROGRESS";

  useEffect(() => {
    if (!photos?.length) {
      setReadUrls({});
      return;
    }
    let cancelled = false;
    const loadUrls = async () => {
      try {
        const signed = await getReadUrls({
          bookingId,
          photoIds: photos.map((photo) => photo.photoId),
        });
        if (!cancelled) {
          setReadUrls(Object.fromEntries(signed.map((item) => [item.photoId, item.url])));
        }
      } catch (error) {
        if (!cancelled) {
          setGalleryError(error instanceof Error ? error.message : "Photo previews could not be loaded.");
        }
      }
    };
    void loadUrls();
    const refresh = window.setInterval(loadUrls, 12 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [bookingId, getReadUrls, photos]);

  useEffect(() => () => {
    if (upload?.previewUrl) URL.revokeObjectURL(upload.previewUrl);
  }, [upload?.previewUrl]);

  const grouped = useMemo(() => ({
    BEFORE: photos?.filter((photo) => photo.photoType === "BEFORE") ?? [],
    AFTER: photos?.filter((photo) => photo.photoType === "AFTER") ?? [],
    ISSUE: photos?.filter((photo) => photo.photoType === "ISSUE") ?? [],
  }), [photos]);

  function choosePhoto(type: PhotoType) {
    setRequestedType(type);
    inputRef.current?.click();
  }

  async function beginUpload(type: PhotoType, originalFile: File) {
    if (!ALLOWED_TYPES.includes(originalFile.type as (typeof ALLOWED_TYPES)[number])) {
      setGalleryError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (originalFile.size > MAX_UPLOAD_BYTES) {
      setGalleryError("Images must be 10 MB or smaller before compression.");
      return;
    }
    setGalleryError(undefined);
    const previewUrl = URL.createObjectURL(originalFile);
    setUpload({ file: originalFile, photoType: type, previewUrl, progress: 0, status: "PREPARING" });
    try {
      const file = await compressPhoto(originalFile);
      const signed = await requestUpload({
        bookingId,
        photoType: type,
        contentType: file.type,
        sizeBytes: file.size,
        originalFileName: file.name,
      });
      setUpload((current) => current ? { ...current, status: "UPLOADING", progress: 0 } : current);
      await uploadDirectly(
        signed.uploadUrl,
        signed.requiredHeaders.contentType,
        file,
        (progress) => setUpload((current) => current ? { ...current, progress } : current),
      );
      setUpload((current) => current ? { ...current, status: "CONFIRMING", progress: 100 } : current);
      await confirmUpload({
        bookingId,
        storagePath: signed.storagePath,
        photoType: type,
        contentType: file.type,
        sizeBytes: file.size,
        originalFileName: file.name,
      });
      setUpload((current) => current ? { ...current, status: "SUCCESS", progress: 100 } : current);
    } catch (error) {
      setUpload((current) => current ? {
        ...current,
        status: "ERROR",
        error: error instanceof Error ? error.message : "The photo could not be uploaded.",
      } : current);
    }
  }

  async function removePhoto(photoId: Id<"cleanerPhotos">) {
    if (!window.confirm("Delete this photo? This cannot be undone.")) return;
    setDeletingPhotoId(photoId);
    setGalleryError(undefined);
    try {
      await deletePhoto({ photoId });
      setPreviewPhotoId(undefined);
    } catch (error) {
      setGalleryError(error instanceof Error ? error.message : "The photo could not be deleted.");
    } finally {
      setDeletingPhotoId(undefined);
    }
  }

  const previewPhoto = photos?.find((photo) => photo.photoId === previewPhotoId);

  return (
    <section className="rounded-[26px] bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-[#087f70]">
          <Camera className="size-5" />
        </div>
        <div>
          <h2 className="font-bold">Before &amp; after photos</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{adminMode ? "View and manage private photos for this booking." : "Document the property clearly. Photos are stored privately."}</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void beginUpload(requestedType, file);
        }}
      />

      {galleryError ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{galleryError}</p> : null}

      {upload ? (
        <div className={`mt-4 rounded-2xl border p-3 ${upload.status === "ERROR" ? "border-red-200 bg-red-50" : "border-emerald-100 bg-emerald-50/60"}`}>
          <div className="flex gap-3">
            <img src={upload.previewUrl} alt="Selected upload" className="size-16 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{upload.file.name}</p><p className="text-xs text-slate-500">{photoLabel(upload.photoType)} photo</p></div>
                {upload.status === "SUCCESS" ? <span className="text-xs font-bold text-emerald-700">Uploaded</span> : null}
              </div>
              {upload.status !== "ERROR" && upload.status !== "SUCCESS" ? <><Progress value={upload.progress} className="mt-3" /><p className="mt-1 text-[11px] text-slate-500">{upload.status === "PREPARING" ? "Preparing image…" : upload.status === "CONFIRMING" ? "Saving photo…" : `${upload.progress}% uploaded`}</p></> : null}
              {upload.error ? <p className="mt-2 text-xs text-red-700">{upload.error}</p> : null}
            </div>
          </div>
          {upload.status === "ERROR" ? <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" className="rounded-xl" onClick={() => void beginUpload(upload.photoType, upload.file)}><RotateCcw /> Retry</Button><Button size="sm" variant="ghost" onClick={() => setUpload(undefined)}>Dismiss</Button></div> : null}
        </div>
      ) : null}

      <div className="mt-5 space-y-6">
        {(["BEFORE", "AFTER", "ISSUE"] as PhotoType[]).map((type) => (
          <div key={type}>
            <div className="flex items-center justify-between gap-3">
              <div><h3 className="text-sm font-bold">{photoLabel(type)} photos</h3>{type === "ISSUE" ? <p className="text-[11px] text-slate-500">Damage, access problems, or anything requiring attention</p> : null}</div>
              {canUpload ? <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={Boolean(upload && !["SUCCESS", "ERROR"].includes(upload.status))} onClick={() => choosePhoto(type)}><UploadCloud /> Add</Button> : null}
            </div>
            {photos === undefined ? <div className="mt-3 grid h-24 place-items-center rounded-2xl bg-slate-50"><LoaderCircle className="animate-spin text-[#087f70]" /></div> : grouped[type].length ? <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">{grouped[type].map((photo) => <button key={photo.photoId} type="button" className="group relative aspect-square overflow-hidden rounded-2xl bg-slate-100 text-left" onClick={() => setPreviewPhotoId(photo.photoId)}>{readUrls[photo.photoId] ? <img src={readUrls[photo.photoId]} alt={`${photoLabel(type)} cleaning photo`} className="size-full object-cover transition group-hover:scale-105" /> : <span className="grid size-full place-items-center"><LoaderCircle className="size-5 animate-spin text-slate-300" /></span>}<span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-[10px] font-semibold text-white">{new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(photo.uploadedAt)}</span></button>)}</div> : <div className="mt-3 flex min-h-20 items-center gap-3 rounded-2xl border border-dashed border-slate-200 px-4 text-sm text-slate-400"><ImageIcon className="size-5" /> No {photoLabel(type).toLowerCase()} photos yet</div>}
          </div>
        ))}
      </div>

      {!canUpload ? <p className="mt-5 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">Photo uploads are available after accepting the job and before marking it complete.</p> : null}

      <Dialog open={Boolean(previewPhoto)} onOpenChange={(open) => !open && setPreviewPhotoId(undefined)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto p-4 sm:max-w-2xl">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>{previewPhoto ? `${photoLabel(previewPhoto.photoType)} photo` : "Photo"}</DialogTitle>
            <DialogDescription>{previewPhoto ? `Uploaded by ${previewPhoto.uploadedBy} on ${new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(previewPhoto.uploadedAt)}` : "Cleaning evidence photo"}</DialogDescription>
          </DialogHeader>
          {previewPhoto && readUrls[previewPhoto.photoId] ? <img src={readUrls[previewPhoto.photoId]} alt={`${photoLabel(previewPhoto.photoType)} cleaning photo preview`} className="max-h-[68vh] w-full rounded-2xl bg-slate-100 object-contain" /> : <div className="grid h-72 place-items-center"><LoaderCircle className="animate-spin text-[#087f70]" /></div>}
          {previewPhoto?.canDelete ? <Button variant="destructive" disabled={deletingPhotoId === previewPhoto.photoId} onClick={() => void removePhoto(previewPhoto.photoId)}>{deletingPhotoId === previewPhoto.photoId ? <LoaderCircle className="animate-spin" /> : <Trash2 />} Delete photo</Button> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
