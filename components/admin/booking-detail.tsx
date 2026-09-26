"use client";

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileText,
  ImageIcon,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import styles from "./booking-detail.module.css";

const cardClass =
  styles.card;

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

function date(value: string | number, withTime = false) {
  const parsed =
    typeof value === "number" ? new Date(value) : new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(parsed);
}

function time(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(`2026-01-01T${value}:00`));
}

function label(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function answer(value: number | boolean | string | string[]) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function BookingDetail({ bookingId }: { bookingId: Id<"bookings"> }) {
  const { isAuthenticated } = useConvexAuth();
  const booking = useQuery(
    api.bookings.get,
    isAuthenticated ? { bookingId } : "skip",
  );
  const cleaners = useQuery(
    api.bookings.listMockCleaners,
    isAuthenticated ? {} : "skip",
  );
  const setAssignment = useMutation(api.bookings.setCleanerAssignment);
  const addNote = useMutation(api.bookings.addBookingNote);
  const deleteNote = useMutation(api.bookings.deleteBookingNote);
  const updateDetails = useMutation(api.bookings.updateDetails);
  const addPriceAdjustment = useMutation(api.bookings.addPriceAdjustment);
  const recordManualPayment = useMutation(api.bookings.recordManualPayment);
  const createBalanceCheckout = useAction(
    api.stripePayments.createBalanceCheckoutSession,
  );
  const [selectedCleaner, setSelectedCleaner] = useState("");
  const [assignmentBusy, setAssignmentBusy] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [deletingNote, setDeletingNote] = useState<Id<"bookingNotes"> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);
  const [isSavingManualPayment, setIsSavingManualPayment] = useState(false);
  const [isSendingPaymentLink, setIsSendingPaymentLink] = useState(false);

  async function handleUpdateDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const optional = (name: string) =>
      String(data.get(name) ?? "").trim() || undefined;
    setIsSavingDetails(true);
    setError(null);
    setMessage(null);
    try {
      await updateDetails({
        bookingId,
        firstName: String(data.get("firstName") ?? ""),
        lastName: optional("lastName"),
        email: optional("email"),
        phone: String(data.get("phone") ?? ""),
        addressLine1: String(data.get("addressLine1") ?? ""),
        addressLine2: optional("addressLine2"),
        suburb: String(data.get("suburb") ?? ""),
        state: String(data.get("state") ?? ""),
        postcode: String(data.get("postcode") ?? ""),
        scheduledDate: String(data.get("scheduledDate") ?? ""),
        scheduledTime: String(data.get("scheduledTime") ?? ""),
        notes: optional("notes"),
      });
      setMessage("Booking and customer details updated.");
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to update the booking.",
      );
    } finally {
      setIsSavingDetails(false);
    }
  }

  async function handleAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = Math.abs(Number(data.get("amount")));
    const direction = String(data.get("direction") ?? "INCREASE");
    setIsSavingAdjustment(true);
    setError(null);
    setMessage(null);
    try {
      await addPriceAdjustment({
        bookingId,
        description: String(data.get("description") ?? ""),
        amountCents: Math.round(amount * 100) * (direction === "DEDUCT" ? -1 : 1),
      });
      form.reset();
      setMessage("Price adjustment added. The payment snapshot has been updated.");
    } catch (adjustmentError) {
      setError(
        adjustmentError instanceof Error
          ? adjustmentError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to add the price adjustment.",
      );
    } finally {
      setIsSavingAdjustment(false);
    }
  }

  async function handleManualPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = Number(data.get("manualPaymentAmount"));
    setIsSavingManualPayment(true);
    setError(null);
    setMessage(null);
    try {
      await recordManualPayment({
        bookingId,
        amountCents: Math.round(amount * 100),
        paymentMethod: String(data.get("paymentMethod")) as
          | "BANK_TRANSFER"
          | "CASH",
        reference: String(data.get("paymentReference") ?? "").trim() || undefined,
        note: String(data.get("paymentNote") ?? "").trim() || undefined,
      });
      form.reset();
      setMessage("Manual payment recorded. The payment snapshot has been updated.");
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to record the payment.",
      );
    } finally {
      setIsSavingManualPayment(false);
    }
  }

  async function handleSendPaymentLink() {
    setIsSendingPaymentLink(true);
    setError(null);
    setMessage(null);
    try {
      const result = await createBalanceCheckout({
        bookingId,
        requestKey: crypto.randomUUID(),
      });
      setMessage(`Payment link emailed to ${result.sentTo}.`);
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to send the payment link.",
      );
    } finally {
      setIsSendingPaymentLink(false);
    }
  }

  async function changeAssignment(cleanerId: string, assigned: boolean) {
    setAssignmentBusy(cleanerId);
    setError(null);
    try {
      await setAssignment({ bookingId, cleanerId, assigned });
      if (assigned) setSelectedCleaner("");
    } catch (assignmentError) {
      setError(
        assignmentError instanceof Error
          ? assignmentError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to update the assigned team.",
      );
    } finally {
      setAssignmentBusy(null);
    }
  }

  async function handleAddNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const photoUrls = String(data.get("photoUrls") ?? "")
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);
    setIsSavingNote(true);
    setError(null);
    try {
      await addNote({
        bookingId,
        kind: String(data.get("kind")) as "ADMIN_NOTE" | "JOB_NOTE",
        body: String(data.get("body") ?? ""),
        photoUrls: photoUrls.length ? photoUrls : undefined,
      });
      form.reset();
    } catch (noteError) {
      setError(
        noteError instanceof Error
          ? noteError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to save the note.",
      );
    } finally {
      setIsSavingNote(false);
    }
  }

  async function handleDeleteNote(noteId: Id<"bookingNotes">) {
    setDeletingNote(noteId);
    setError(null);
    try {
      await deleteNote({ noteId });
    } catch (noteError) {
      setError(
        noteError instanceof Error
          ? noteError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to delete the note.",
      );
    } finally {
      setDeletingNote(null);
    }
  }

  if (booking === undefined) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="size-4 animate-spin" /> Loading booking…
      </div>
    );
  }

  if (!booking) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Booking not found</CardTitle>
          <CardDescription>The booking link may be invalid.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/bookings">
              <ArrowLeft /> Back to bookings
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const customerName = booking.customer
    ? [booking.customer.firstName, booking.customer.lastName]
        .filter(Boolean)
        .join(" ")
    : "Unknown customer";
  const address = [
    booking.addressLine1,
    booking.addressLine2,
    `${booking.suburb} ${booking.state} ${booking.postcode}`,
  ]
    .filter(Boolean)
    .join(", ");
  const assignedIds = new Set(booking.assignedCleanerIds ?? []);
  const availableCleaners =
    cleaners?.filter((cleaner) => !assignedIds.has(cleaner.id)) ?? [];

  return (
    <div className={styles.workspace}>
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/bookings">
          <ArrowLeft /> Back to bookings
        </Link>
      </Button>

      <header className={styles.header}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge className="bg-emerald-50 text-emerald-800">
                {label(booking.status)}
              </Badge>
              <Badge variant="secondary">
                {label(booking.paymentStatus)}
              </Badge>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Booking details
            </h2>
            <p className={styles.reference}>
              {booking.service?.name ?? "Unknown service"} · Reference{" "}
              {booking._id}
            </p>
          </div>
          <div className={styles.scheduleSummary}>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-white/10">
                <CalendarDays className="size-5" />
              </span>
              <div>
                  <small>Scheduled date</small>
                  <p>
                  {date(booking.scheduledDate)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-white/10">
                <Clock3 className="size-5" />
              </span>
              <div>
                  <small>Arrival time</small>
                  <p>
                  {time(booking.scheduledTime)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <Card className={cardClass}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Save className="size-4 text-emerald-700" /> Edit booking details
          </CardTitle>
          <CardDescription>
            Update customer contact details, job address, schedule and instructions. The accepted quote remains unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateDetails} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="booking-first-name">First name</Label>
              <Input id="booking-first-name" name="firstName" defaultValue={booking.customer?.firstName} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-last-name">Last name</Label>
              <Input id="booking-last-name" name="lastName" defaultValue={booking.customer?.lastName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-email">Email</Label>
              <Input id="booking-email" name="email" type="email" defaultValue={booking.customer?.email} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-phone">Phone</Label>
              <Input id="booking-phone" name="phone" type="tel" defaultValue={booking.customer?.phone} required />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="booking-address-1">Street address</Label>
              <Input id="booking-address-1" name="addressLine1" defaultValue={booking.addressLine1} required />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="booking-address-2">Address line 2</Label>
              <Input id="booking-address-2" name="addressLine2" defaultValue={booking.addressLine2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-suburb">Suburb</Label>
              <Input id="booking-suburb" name="suburb" defaultValue={booking.suburb} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-state">State</Label>
              <NativeSelect id="booking-state" name="state" defaultValue={booking.state}>
                {['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'].map((value) => <option key={value} value={value}>{value}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-postcode">Postcode</Label>
              <Input id="booking-postcode" name="postcode" inputMode="numeric" defaultValue={booking.postcode} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-date">Scheduled date</Label>
              <Input id="booking-date" name="scheduledDate" type="date" defaultValue={booking.scheduledDate} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-time">Arrival time</Label>
              <Input id="booking-time" name="scheduledTime" type="time" defaultValue={booking.scheduledTime} required />
            </div>
            <div className="space-y-2 md:col-span-2 lg:col-span-3">
              <Label htmlFor="booking-original-notes">Job instructions</Label>
              <Textarea id="booking-original-notes" name="notes" rows={3} defaultValue={booking.notes} />
            </div>
            <div className="flex items-end justify-end">
              <Button type="submit" disabled={isSavingDetails}>
                {isSavingDetails ? <LoaderCircle className="animate-spin" /> : <Save />}
                {isSavingDetails ? "Saving…" : "Save details"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className={styles.columns}>
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UsersRound className="size-4 text-emerald-700" /> Customer details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className={styles.customer}>
                  <span className={styles.avatar}>{initials(customerName)}</span>
                  <p className="text-base font-semibold text-slate-950">
                  {customerName}
                  </p>
                </div>
                {booking.customer?.email ? (
                  <a
                    className="flex items-center gap-2 text-slate-600 hover:text-emerald-800"
                    href={`mailto:${booking.customer.email}`}
                  >
                    <Mail className="size-4" />
                    {booking.customer.email}
                  </a>
                ) : null}
                {booking.customer?.phone ? (
                  <a
                    className="flex items-center gap-2 text-slate-600 hover:text-emerald-800"
                    href={`tel:${booking.customer.phone}`}
                  >
                    <Phone className="size-4" />
                    {booking.customer.phone}
                  </a>
                ) : null}
                <p className="flex items-start gap-2 border-t border-slate-100 pt-3 leading-6 text-slate-600">
                  <MapPin className="mt-1 size-4 shrink-0 text-emerald-700" />
                  {address}
                </p>
              </CardContent>
            </Card>

            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-emerald-700" /> Booking information
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Service
                  </p>
                  <p className="mt-1 font-semibold">
                    {booking.service?.name ?? "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Source
                  </p>
                  <p className="mt-1 font-semibold">{label(booking.source)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Created
                  </p>
                  <p className="mt-1 font-semibold">
                    {date(booking.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Total
                  </p>
                  <p className="mt-1 font-semibold">
                    {money(booking.finalTotalCents)}
                  </p>
                </div>
                {booking.quoteRequestId ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="col-span-2"
                  >
                    <Link href={`/admin/quotes/${booking.quoteRequestId}`}>
                      <FileText /> View source quote
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><CalendarDays /> Planning schedule</CardTitle>
              <CardDescription>The booking cycle and scheduled cleaning visit.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className={styles.timeline}>
                <li>
                  <span className={styles.dot}><Check /></span>
                  <time className={styles.timestamp}>{date(booking.createdAt, true)}</time>
                  <div className={styles.event}>
                    <h3>Booking created</h3>
                    <p>{booking.quoteRequestId ? "Created from an accepted quote" : "Booking received"} · {label(booking.source)}</p>
                  </div>
                </li>
                <li>
                  <span className={styles.dot}><CalendarDays /></span>
                  <time className={styles.timestamp}>{date(booking.scheduledDate)} · {time(booking.scheduledTime)}</time>
                  <div className={styles.visit}>
                    <div className={styles.visitTitle}><h3>{booking.service?.name ?? "Cleaning visit"}</h3><Badge variant="secondary">{label(booking.status)}</Badge></div>
                    <div className={styles.visitGrid}>
                      <div><span><UsersRound /> Assigned team</span><p>{booking.assignedCleaners.map((cleaner) => cleaner.name).join(", ") || "Awaiting assignment"}</p></div>
                      <div><span><Clock3 /> Arrival</span><p>{time(booking.scheduledTime)}</p></div>
                      <div><span><MapPin /> Location</span><p>{address}</p></div>
                    </div>
                  </div>
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRoundCheck className="size-4 text-emerald-700" /> Assigned
                cleaners
              </CardTitle>
              <CardDescription>
                Assign one or more cleaners or contractors from the demo roster.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <NativeSelect
                  aria-label="Cleaner or contractor"
                  value={selectedCleaner}
                  onChange={(event) => setSelectedCleaner(event.target.value)}
                  className="sm:max-w-sm"
                >
                  <option value="">Select cleaner or contractor</option>
                  {availableCleaners.map((cleaner) => (
                    <option key={cleaner.id} value={cleaner.id}>
                      {cleaner.name} — {cleaner.specialty}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  type="button"
                  disabled={!selectedCleaner || assignmentBusy !== null}
                  onClick={() => changeAssignment(selectedCleaner, true)}
                >
                  {assignmentBusy === selectedCleaner ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Plus />
                  )}{" "}
                  Assign cleaner
                </Button>
              </div>
              {booking.assignedCleaners.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {booking.assignedCleaners.map((cleaner) => (
                    <div
                      key={cleaner.id}
                      className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-800 text-xs font-bold text-white">
                        {initials(cleaner.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {cleaner.name}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {cleaner.specialty}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Unassign ${cleaner.name}`}
                        disabled={assignmentBusy !== null}
                        onClick={() => changeAssignment(cleaner.id, false)}
                        className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-red-700 disabled:opacity-50"
                      >
                        {assignmentBusy === cleaner.id ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <X className="size-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 py-7 text-center">
                  <UsersRound className="mx-auto size-6 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    No cleaners assigned
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Choose one or more people from the mock roster.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4 text-emerald-700" /> Booking notes
              </CardTitle>
              <CardDescription>
                Internal updates and cleaner-facing job instructions, with
                author and timestamp history.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <form
                onSubmit={handleAddNote}
                className="grid gap-4 rounded-2xl border border-emerald-100 bg-[#f7fbf8] p-4 sm:grid-cols-[180px_1fr] sm:p-5"
              >
                <div className="space-y-2">
                  <Label htmlFor="note-kind">Note type</Label>
                  <NativeSelect id="note-kind" name="kind">
                    <option value="ADMIN_NOTE">Internal admin note</option>
                    <option value="JOB_NOTE">Job note for cleaner</option>
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="note-body">Note</Label>
                  <Textarea
                    id="note-body"
                    name="body"
                    rows={3}
                    placeholder="Access details, customer requests, job instructions or follow-up…"
                    required
                  />
                </div>
                <div className="space-y-2 sm:col-start-2">
                  <Label htmlFor="photo-urls">
                    Photo links{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </Label>
                  <Textarea
                    id="photo-urls"
                    name="photoUrls"
                    rows={2}
                    placeholder="Paste one image link per line"
                  />
                  <p className="text-xs text-slate-500">
                    Links stay attached to this note. Direct uploads can replace
                    this when storage and cleaner accounts are added.
                  </p>
                </div>
                <div className="flex justify-end sm:col-start-2">
                  <Button type="submit" disabled={isSavingNote}>
                    {isSavingNote ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Send />
                    )}
                    {isSavingNote ? "Saving…" : "Add note"}
                  </Button>
                </div>
              </form>

              {booking.bookingNotes.length ? (
                <div className="space-y-3">
                  {booking.bookingNotes.map((note) => (
                    <article
                      key={note._id}
                      className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5"
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#123f3a] text-xs font-bold text-white">
                          {initials(note.authorName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{note.authorName}</p>
                            <Badge
                              variant="secondary"
                              className={
                                note.kind === "JOB_NOTE"
                                  ? "bg-amber-50 text-amber-800"
                                  : "bg-slate-100 text-slate-700"
                              }
                            >
                              {note.kind === "JOB_NOTE"
                                ? "Job note"
                                : "Internal note"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {date(note.createdAt, true)}
                          </p>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {note.body}
                          </p>
                          {note.photoUrls?.length ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {note.photoUrls.map((url, index) => (
                                <a
                                  key={`${url}-${index}`}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                                >
                                  <ImageIcon className="size-4" /> Photo{" "}
                                  {index + 1}
                                  <ExternalLink className="size-3" />
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              type="button"
                              aria-label="Delete note"
                              className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent size="sm">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete note?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This permanently removes the note and its saved
                                photo links.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                disabled={deletingNote === note._id}
                                onClick={() => handleDeleteNote(note._id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center">
                  <FileText className="mx-auto size-6 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    No notes yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    The first note will appear here with its author and
                    timestamp.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="text-base">Service checklist</CardTitle>
              <CardDescription>
                Captured from the booking or source quote
              </CardDescription>
            </CardHeader>
            <CardContent>
              {booking.serviceAnswers.length ? (
                <dl className="space-y-3">
                  {booking.serviceAnswers.map((item) => (
                    <div
                      key={item.key}
                      className="flex gap-3 rounded-xl bg-slate-50 p-3"
                    >
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                        <Check className="size-3" />
                      </span>
                      <div>
                        <dt className="text-xs font-semibold text-slate-500">
                          {item.label}
                        </dt>
                        <dd className="mt-1 text-sm font-medium">
                          {answer(item.value)}
                        </dd>
                      </div>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-slate-500">
                  No service answers were recorded.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="size-4 text-emerald-700" /> Price adjustments
              </CardTitle>
              <CardDescription>
                Increase the price for added work or deduct an amount when work is removed. Previous entries remain in the audit trail.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleAdjustment} className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="space-y-2">
                  <Label htmlFor="adjustment-description">Change description</Label>
                  <Input id="adjustment-description" name="description" placeholder="e.g. Add oven cleaning" required />
                </div>
                <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
                  <div className="space-y-2">
                    <Label htmlFor="adjustment-direction">Change type</Label>
                    <NativeSelect id="adjustment-direction" name="direction" defaultValue="INCREASE">
                      <option value="INCREASE">Increase price</option>
                      <option value="DEDUCT">Deduct from price</option>
                    </NativeSelect>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adjustment-amount">Amount (AUD)</Label>
                    <Input id="adjustment-amount" name="amount" type="number" min="0.01" step="0.01" placeholder="50.00" required />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isSavingAdjustment}>
                  {isSavingAdjustment ? <LoaderCircle className="animate-spin" /> : <Plus />}
                  {isSavingAdjustment ? "Adding…" : "Add adjustment"}
                </Button>
              </form>
              {booking.adjustments.length ? (
                <div className="space-y-2">
                  {booking.adjustments.map((adjustment) => (
                    <div key={adjustment._id} className="rounded-xl border border-slate-100 p-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <strong>{adjustment.description}</strong>
                        <strong className={adjustment.amountCents > 0 ? "text-amber-700" : "text-emerald-700"}>
                          {adjustment.amountCents > 0 ? "+" : ""}{money(adjustment.amountCents)}
                        </strong>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {adjustment.authorName} · {date(adjustment.createdAt, true)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No price changes recorded.</p>
              )}
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="size-4 text-emerald-700" /> Payment snapshot
              </CardTitle>
              <CardDescription>Live totals from the original quote, adjustments and Stripe payments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Original accepted total</span>
                <strong>{money(booking.paymentSnapshot.originalTotalCents)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Price adjustments</span>
                <strong>{booking.paymentSnapshot.adjustmentsTotalCents > 0 ? "+" : ""}{money(booking.paymentSnapshot.adjustmentsTotalCents)}</strong>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-3">
                <span className="text-slate-500">Revised booking total</span>
                <strong>{money(booking.paymentSnapshot.revisedTotalCents)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recorded paid</span>
                <strong>{money(booking.paymentSnapshot.amountPaidCents)}</strong>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-3">
                <span className="font-medium">Remaining</span>
                <strong className="text-emerald-800">
                  {money(booking.paymentSnapshot.balanceDueCents)}
                </strong>
              </div>
              {booking.paymentSnapshot.refundDueCents > 0 ? (
                <div className="flex justify-between rounded-xl bg-amber-50 p-3 text-amber-800">
                  <span className="font-medium">Refund due</span>
                  <strong>{money(booking.paymentSnapshot.refundDueCents)}</strong>
                </div>
              ) : null}
              {booking.paymentSnapshot.balanceDueCents > 0 ? (
                <Button
                  type="button"
                  className="mt-2 w-full"
                  disabled={isSendingPaymentLink || !booking.customer?.email}
                  onClick={handleSendPaymentLink}
                >
                  {isSendingPaymentLink ? <LoaderCircle className="animate-spin" /> : <Mail />}
                  {isSendingPaymentLink ? "Creating and sending…" : "Email payment link"}
                </Button>
              ) : booking.paymentSnapshot.refundDueCents > 0 ? (
                <p className="rounded-xl bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-800">
                  The customer has overpaid. Issue the displayed refund through the original Stripe payment.
                </p>
              ) : (
                <p className="rounded-xl bg-emerald-50 p-3 text-xs font-medium leading-5 text-emerald-800">
                  This booking is fully paid.
                </p>
              )}
              {!booking.customer?.email ? (
                <p className="text-xs text-amber-700">Add a customer email before sending a payment link.</p>
              ) : null}
              <form onSubmit={handleManualPayment} className="space-y-3 border-t border-slate-100 pt-4">
                <div>
                  <p className="font-semibold text-slate-800">Record payment received</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Use this for cash or a bank transfer received outside Stripe.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="manual-payment-method">Payment method</Label>
                    <NativeSelect id="manual-payment-method" name="paymentMethod" defaultValue="BANK_TRANSFER">
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="CASH">Cash on site</option>
                    </NativeSelect>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-payment-amount">Amount (AUD)</Label>
                    <Input
                      id="manual-payment-amount"
                      name="manualPaymentAmount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="100.00"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-reference">Reference (optional)</Label>
                  <Input id="payment-reference" name="paymentReference" placeholder="Bank reference or receipt number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-note">Note (optional)</Label>
                  <Textarea id="payment-note" name="paymentNote" placeholder="Payment details or context" rows={2} />
                </div>
                <Button type="submit" variant="outline" className="w-full" disabled={isSavingManualPayment}>
                  {isSavingManualPayment ? <LoaderCircle className="animate-spin" /> : <DollarSign />}
                  {isSavingManualPayment ? "Recording…" : "Record payment"}
                </Button>
              </form>
              {booking.payments.length ? (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Payment history</p>
                  {booking.payments.map((payment) => (
                    <div key={payment._id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3">
                      <div>
                        <p className="font-medium">
                          {payment.kind === "INITIAL"
                            ? "Initial payment"
                            : payment.kind === "MANUAL"
                              ? label(payment.paymentMethod ?? "Manual payment")
                              : "Balance request"}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">{date(payment.createdAt, true)} · {label(payment.status)}</p>
                        {payment.reference ? (
                          <p className="mt-1 text-xs text-slate-500">Reference: {payment.reference}</p>
                        ) : null}
                        {payment.note ? (
                          <p className="mt-1 text-xs text-slate-500">{payment.note}</p>
                        ) : null}
                      </div>
                      <strong>{money(payment.amountCents)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="text-base">Original job notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {booking.notes ||
                  "No notes were supplied when the booking was created."}
              </p>
              <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                Job notes marked for cleaners are ready for the future cleaner
                portal. Photo links stay attached to their timeline entry.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
