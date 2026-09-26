"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CalendarCheck,
  LoaderCircle,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QuoteStatusBadge, type QuoteStatus } from "./quote-status-badge";

const statuses: QuoteStatus[] = [
  "NEW",
  "REVIEWING",
  "QUOTED",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
];

function formatDate(value: number | string | undefined, includeTime = false) {
  if (!value) return "Not specified";
  const date =
    typeof value === "number" ? new Date(value) : new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6 text-slate-800">
        {value ?? "Not specified"}
      </dd>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

function formatAnswer(value: number | boolean | string | string[]) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function QuoteRequestDetail({
  quoteRequestId,
}: {
  quoteRequestId: Id<"quoteRequests">;
}) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const quote = useQuery(
    api.quoteRequests.get,
    isAuthenticated ? { quoteRequestId } : "skip",
  );
  const updateStatus = useMutation(api.quoteRequests.updateQuoteRequestStatus);
  const deleteQuote = useMutation(api.quoteRequests.deleteAdminQuote);
  const convertQuote = useMutation(
    api.quoteRequests.convertAcceptedQuoteToBooking,
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeAction, setActiveAction] = useState<"delete" | "convert" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function handleStatusChange(status: QuoteStatus) {
    setIsUpdating(true);
    setError(null);
    try {
      await updateStatus({ quoteRequestId, status });
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update the status.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDelete() {
    setActiveAction("delete");
    setError(null);
    try {
      await deleteQuote({ quoteRequestId });
      router.push("/admin/quotes");
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to delete the quote.",
      );
      setActiveAction(null);
    }
  }

  async function handleConvert() {
    setActiveAction("convert");
    setError(null);
    try {
      const bookingId = await convertQuote({ quoteRequestId });
      router.push(`/admin/bookings/${bookingId}`);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to convert the quote.",
      );
      setActiveAction(null);
    }
  }

  if (quote === undefined) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="size-4 animate-spin" />
        Loading quote request…
      </div>
    );
  }

  if (quote === null) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Quote request not found</CardTitle>
          <CardDescription>
            This request may have been removed or the link is invalid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/quotes">
              <ArrowLeft />
              Back to quotes
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const customerName = quote.customer
    ? [quote.customer.firstName, quote.customer.lastName]
        .filter(Boolean)
        .join(" ")
    : "Unknown customer";
  const address = [
    quote.addressLine1,
    quote.addressLine2,
    `${quote.suburb} ${quote.state} ${quote.postcode}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link href="/admin/quotes">
              <ArrowLeft />
              Back to quotes
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              {customerName}
            </h2>
            <QuoteStatusBadge status={quote.status} />
            {quote.requestType ? (
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                {quote.requestType === "CALLBACK_REQUEST"
                  ? "Callback requested"
                  : "Custom quote"}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Submitted {formatDate(quote.createdAt, true)}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <label className="space-y-1.5 text-sm font-medium text-slate-700">
            <span>Update status</span>
            <div className="flex items-center gap-2">
              <select
                value={quote.status}
                disabled={isUpdating}
                onChange={(event) =>
                  handleStatusChange(event.target.value as QuoteStatus)
                }
                className="h-10 min-w-44 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 disabled:opacity-60"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
              {isUpdating ? (
                <LoaderCircle className="size-4 animate-spin text-emerald-700" />
              ) : null}
            </div>
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            {quote.convertedBookingId ? (
              <Button asChild>
                <Link href={`/admin/bookings/${quote.convertedBookingId}`}>
                  <CalendarCheck /> View booking
                </Link>
              </Button>
            ) : (
              <Button
                onClick={handleConvert}
                disabled={quote.status !== "ACCEPTED" || activeAction !== null}
                title={
                  quote.status !== "ACCEPTED"
                    ? "Mark this quote as accepted first"
                    : undefined
                }
              >
                {activeAction === "convert" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <CalendarCheck />
                )}{" "}
                Convert to booking
              </Button>
            )}
            {quote.convertedBookingId ? (
              <Button variant="outline" disabled>
                <Pencil /> Edit
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href={`/admin/quotes/${quote._id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    Boolean(quote.convertedBookingId) || activeAction !== null
                  }
                  className="text-red-700 hover:text-red-800"
                >
                  <Trash2 /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this quote?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes the quote. The customer record will
                    remain available.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    Delete quote
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {error ? (
            <p
              role="alert"
              className="max-w-md text-right text-xs text-red-700"
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="gap-5 border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="font-semibold text-slate-900">{customerName}</p>
            {quote.customer ? (
              <>
                {quote.customer.email ? (
                  <a
                    href={`mailto:${quote.customer.email}`}
                    className="flex items-center gap-2 text-slate-600 hover:text-emerald-800"
                  >
                    <Mail className="size-4" />
                    {quote.customer.email}
                  </a>
                ) : (
                  <span className="flex items-center gap-2 text-slate-500">
                    <Mail className="size-4" />
                    No email provided
                  </span>
                )}
                <a
                  href={`tel:${quote.customer.phone}`}
                  className="flex items-center gap-2 text-slate-600 hover:text-emerald-800"
                >
                  <Phone className="size-4" />
                  {quote.customer.phone}
                </a>
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link href={`/admin/customers/${quote.customer._id}`}>
                    View customer
                  </Link>
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card className="gap-5 border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Service and location</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2">
              <DetailRow label="Service" value={quote.serviceType} />
              <DetailRow
                label="Preferred date"
                value={formatDate(quote.preferredDate)}
              />
              <DetailRow label="Preferred time" value={quote.preferredTime} />
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Address
                </dt>
                <dd className="mt-1.5 flex items-start gap-2 text-sm leading-6 text-slate-800">
                  <MapPin className="mt-1 size-4 shrink-0 text-emerald-700" />
                  {address}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {quote.estimateType ? (
          <Card className="gap-5 border-slate-200 shadow-sm lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Estimator snapshot</CardTitle>
              <CardDescription>
                This is the quote outcome shown when the request was submitted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {quote.estimateType === "ESTIMATE" ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    Estimated total
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-950">
                    {quote.estimatedTotalCents === undefined
                      ? "Not recorded"
                      : formatMoney(quote.estimatedTotalCents)}
                  </p>
                  {quote.estimateBreakdown?.length ? (
                    <div className="mt-5 space-y-2 border-t border-emerald-200 pt-4">
                      {quote.estimateBreakdown.map((item, index) => (
                        <div
                          key={`${item.label}-${index}`}
                          className="flex justify-between gap-4 text-sm"
                        >
                          <span className="text-emerald-900/70">
                            {item.label}
                          </span>
                          <strong className="text-emerald-950">
                            {formatMoney(item.amount)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : quote.estimateType === "CUSTOM_QUOTE_REQUIRED" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                  <p className="font-semibold text-amber-950">
                    Manual quote required
                  </p>
                  <p className="mt-1 text-sm text-amber-800">
                    No zero-dollar estimate was stored. Review the customer’s
                    requirements before pricing.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-5">
                  <p className="font-semibold text-sky-950">
                    Hourly configuration
                  </p>
                  <p className="mt-1 text-sm text-sky-800">
                    {quote.hourlyRateCents === undefined
                      ? "Hourly rate to be confirmed"
                      : `${formatMoney(quote.hourlyRateCents)} per hour`}
                    {quote.minimumHours
                      ? ` · Minimum ${quote.minimumHours} hours`
                      : ""}
                    {quote.maximumHours
                      ? ` · Maximum ${quote.maximumHours} hours`
                      : ""}
                  </p>
                </div>
              )}
              {quote.submittedAnswers?.length ? (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Submitted service answers
                  </h3>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    {quote.submittedAnswers.map((answer) => (
                      <div
                        key={answer.key}
                        className="rounded-xl bg-slate-50 p-4"
                      >
                        <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                          {answer.label}
                        </dt>
                        <dd className="mt-1.5 text-sm font-medium text-slate-800">
                          {formatAnswer(answer.value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card className="gap-5 border-slate-200 shadow-sm lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">
              Property and job details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-3">
              <DetailRow label="Property type" value={quote.propertyType} />
              <DetailRow label="Bedrooms" value={quote.bedrooms} />
              <DetailRow label="Bathrooms" value={quote.bathrooms} />
              <div className="sm:col-span-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Additional notes
                </dt>
                <dd className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  {quote.notes ?? "No additional notes."}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
