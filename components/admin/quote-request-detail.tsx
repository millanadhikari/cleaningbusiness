"use client";

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Banknote,
  CalendarCheck,
  CreditCard,
  Download,
  FileText,
  LoaderCircle,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Send,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
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
import { EmailConversation } from "@/components/admin/email-conversation";
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
  const recordManualPayment = useMutation(
    api.quoteRequests.recordManualPaymentAndConvert,
  );
  const sendQuotePaymentLink = useAction(
    api.stripePayments.createQuoteCheckoutSession,
  );
  const generateQuotePdf = useAction(api.quoteDocuments.generateQuote);
  const sendQuotePdf = useAction(api.quoteDocuments.sendQuote);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeAction, setActiveAction] = useState<
    "delete" | "convert" | "payment-link" | "manual-payment" | null
  >(null);
  const [paymentOption, setPaymentOption] = useState<"DEPOSIT" | "FULL">(
    "FULL",
  );
  const [manualMethod, setManualMethod] = useState<
    "BANK_TRANSFER" | "CASH"
  >("BANK_TRANSFER");
  const [manualReference, setManualReference] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingQuotePdf, setIsGeneratingQuotePdf] = useState(false);
  const [isSendingQuotePdf, setIsSendingQuotePdf] = useState(false);

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

  async function handleSendPaymentLink() {
    setActiveAction("payment-link");
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await sendQuotePaymentLink({
        quoteRequestId,
        paymentOption,
        requestKey: crypto.randomUUID(),
      });
      setSuccessMessage(`Payment link sent to ${result.sentTo}.`);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to send the payment link.",
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function handleManualPayment() {
    setActiveAction("manual-payment");
    setError(null);
    setSuccessMessage(null);
    try {
      const bookingId = await recordManualPayment({
        quoteRequestId,
        paymentOption,
        paymentMethod: manualMethod,
        reference: manualReference.trim() || undefined,
        note: manualNote.trim() || undefined,
      });
      router.push(`/admin/bookings/${bookingId}`);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to record the payment and create the booking.",
      );
      setActiveAction(null);
    }
  }

  function downloadBase64Pdf(contentBase64: string, filename: string) {
    const binary = window.atob(contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/pdf" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function handleGenerateQuotePdf() {
    setIsGeneratingQuotePdf(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await generateQuotePdf({ quoteRequestId });
      downloadBase64Pdf(result.contentBase64, result.filename);
      setSuccessMessage(`Quote ${result.filename} generated.`);
    } catch (quoteError) {
      setError(
        quoteError instanceof Error
          ? quoteError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to generate the quote PDF.",
      );
    } finally {
      setIsGeneratingQuotePdf(false);
    }
  }

  async function handleSendQuotePdf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setIsSendingQuotePdf(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await sendQuotePdf({
        quoteRequestId,
        to: String(data.get("quoteEmail") ?? ""),
      });
      setSuccessMessage(
        `Quote emailed to ${result.sentTo} at ${formatDate(result.sentAt, true)}.`,
      );
    } catch (quoteError) {
      setError(
        quoteError instanceof Error
          ? quoteError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to send the quote PDF.",
      );
    } finally {
      setIsSendingQuotePdf(false);
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
  const canTakeDeposit = Boolean(
    quote.service?.depositType && quote.service.depositValue !== undefined,
  );
  const depositAmountCents =
    quote.estimatedTotalCents !== undefined && canTakeDeposit
      ? quote.service!.depositType === "FIXED"
        ? Math.min(quote.estimatedTotalCents, quote.service!.depositValue!)
        : Math.min(
            quote.estimatedTotalCents,
            Math.max(
              1,
              Math.round(
                (quote.estimatedTotalCents * quote.service!.depositValue!) /
                  10_000,
              ),
            ),
          )
      : undefined;
  const selectedPaymentAmount =
    paymentOption === "DEPOSIT"
      ? depositAmountCents
      : quote.estimatedTotalCents;
  const paidQuotePayment = quote.payments.find(
    (payment) => payment.status === "PAID",
  );

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
            {paidQuotePayment ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                {paidQuotePayment.paymentOption === "DEPOSIT"
                  ? "Deposit paid"
                  : "Paid in full"}{" "}
                · {formatMoney(paidQuotePayment.amountCents)}
              </span>
            ) : null}
            {quote.requestType ? (
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                {quote.requestType === "CALLBACK_REQUEST"
                  ? "Callback requested"
                  : "Custom quote"}
              </span>
            ) : null}
            {quote.source === "AI_CHAT" ? (
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                Created via AI chat
              </span>
            ) : null}
            {quote.serviceAreaStatus ? (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  quote.serviceAreaStatus === "IN_AREA"
                    ? "bg-emerald-50 text-emerald-800"
                    : quote.serviceAreaStatus === "CHECK_ADDRESS"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-red-50 text-red-700"
                }`}
              >
                {quote.serviceAreaStatus === "IN_AREA"
                  ? "Service area confirmed"
                  : quote.serviceAreaStatus === "CHECK_ADDRESS"
                    ? "Address check needed"
                    : "Outside service area"}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Reference {quote.reference ?? "Pending"} · Submitted{" "}
            {formatDate(quote.createdAt, true)}
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
                Create unpaid booking
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
          {successMessage ? (
            <p className="max-w-md text-right text-xs font-medium text-emerald-700">
              {successMessage}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="gap-5 border-emerald-200 shadow-sm lg:col-span-3">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="size-5 text-emerald-800" />
              <CardTitle className="text-base">Customer quote PDF</CardTitle>
            </div>
            <CardDescription>
              Download or email a branded PDF containing the customer, service,
              schedule, pricing and quote details. PDFs are generated from the
              latest saved quote and are not stored.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
            <div className="space-y-4">
              <div className="grid gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Reference
                  </p>
                  <strong className="mt-1 block text-sm text-slate-900">
                    {quote.reference ?? "Pending"}
                  </strong>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Service
                  </p>
                  <strong className="mt-1 block text-sm text-slate-900">
                    {quote.service?.name ?? quote.serviceType}
                  </strong>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Quoted total
                  </p>
                  <strong className="mt-1 block text-sm text-emerald-800">
                    {quote.estimatedTotalCents === undefined
                      ? "Not priced"
                      : formatMoney(quote.estimatedTotalCents)}
                  </strong>
                </div>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm leading-6 text-sky-900">
                The PDF asks the customer to call +61 401 356 937 and provide
                quote reference {quote.reference ?? "shown above"} when they are
                ready to book.
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerateQuotePdf}
                disabled={
                  isGeneratingQuotePdf ||
                  !quote.reference ||
                  quote.estimatedTotalCents === undefined
                }
              >
                {isGeneratingQuotePdf ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Download />
                )}
                {isGeneratingQuotePdf
                  ? "Generating…"
                  : "Download quote PDF"}
              </Button>
            </div>

            <div className="space-y-4 lg:border-l lg:border-slate-100 lg:pl-5">
              <form onSubmit={handleSendQuotePdf} className="space-y-3">
                <div className="space-y-2">
                  <label
                    htmlFor="quote-email"
                    className="text-sm font-medium text-slate-700"
                  >
                    Send quote to
                  </label>
                  <Input
                    id="quote-email"
                    name="quoteEmail"
                    type="email"
                    defaultValue={quote.customer?.email}
                    placeholder="customer@example.com"
                    required
                  />
                  <p className="text-xs leading-5 text-slate-500">
                    The recipient can be changed for this email without changing
                    the customer record.
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    isSendingQuotePdf ||
                    !quote.reference ||
                    quote.estimatedTotalCents === undefined
                  }
                >
                  {isSendingQuotePdf ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Send />
                  )}
                  {isSendingQuotePdf
                    ? "Generating and sending…"
                    : "Generate and send quote"}
                </Button>
              </form>

              {quote.quoteEmails.length ? (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Quote email history
                  </p>
                  {quote.quoteEmails.slice(0, 5).map((email) => (
                    <div
                      key={email._id}
                      className="rounded-xl bg-slate-50 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <strong className="min-w-0 truncate text-slate-700">
                          {email.to}
                        </strong>
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ${
                            email.status === "SENT"
                              ? "bg-emerald-100 text-emerald-800"
                              : email.status === "FAILED"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {email.status.charAt(0) +
                            email.status.slice(1).toLowerCase()}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-500">
                        {email.sentAt
                          ? `Sent ${formatDate(email.sentAt, true)}`
                          : `Attempted ${formatDate(email.createdAt, true)}`}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No quote PDF has been emailed yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {quote.convertedBookingId && quote.payments.length ? (
          <Card className="gap-5 border-emerald-200 bg-emerald-50/30 shadow-sm lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Payment received</CardTitle>
              <CardDescription>
                The online payment was confirmed and this quote was converted
                into a booking.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {quote.payments.map((payment) => (
                <div
                  key={payment._id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm"
                >
                  <div>
                    <strong className="text-slate-900">
                      {payment.paymentOption === "DEPOSIT"
                        ? "Deposit"
                        : "Full payment"}{" "}
                      · {formatMoney(payment.amountCents)}
                    </strong>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {payment.status === "PAID"
                        ? `Stripe payment confirmed ${formatDate(payment.paidAt, true)}`
                        : payment.sentTo
                          ? `Sent to ${payment.sentTo}`
                          : "Checkout payment request"}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    {payment.status.charAt(0) +
                      payment.status.slice(1).toLowerCase()}
                  </span>
                </div>
              ))}
              <Button asChild size="sm">
                <Link href={`/admin/bookings/${quote.convertedBookingId}`}>
                  <CalendarCheck /> View synchronized booking
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {quote.status === "ACCEPTED" &&
        !quote.convertedBookingId &&
        quote.estimatedTotalCents !== undefined ? (
          <Card className="gap-5 border-emerald-200 shadow-sm lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Payment and booking</CardTitle>
              <CardDescription>
                Send a secure Stripe payment link, or record a bank transfer or
                cash payment. A confirmed payment creates the booking and starts
                the booking workflow automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 sm:items-end">
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Payment amount</span>
                  <NativeSelect
                    value={paymentOption}
                    onChange={(event) =>
                      setPaymentOption(
                        event.target.value as "DEPOSIT" | "FULL",
                      )
                    }
                  >
                    {canTakeDeposit ? (
                      <option value="DEPOSIT">
                        Deposit
                        {depositAmountCents === undefined
                          ? ""
                          : ` — ${formatMoney(depositAmountCents)}`}
                      </option>
                    ) : null}
                    <option value="FULL">
                      Full amount — {formatMoney(quote.estimatedTotalCents)}
                    </option>
                  </NativeSelect>
                </label>
                <div className="rounded-lg bg-white px-4 py-3 ring-1 ring-slate-200">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Amount to record
                  </span>
                  <strong className="mt-1 block text-xl text-slate-950">
                    {selectedPaymentAmount === undefined
                      ? "Not configured"
                      : formatMoney(selectedPaymentAmount)}
                  </strong>
                </div>
              </div>

              {!quote.preferredDate || !quote.preferredTime ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Add a scheduled date and time to the quote before collecting
                  payment and creating its booking.
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-5">
                  <div className="flex items-center gap-2">
                    <CreditCard className="size-5 text-sky-800" />
                    <h3 className="font-semibold text-sky-950">
                      Online payment
                    </h3>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-sky-900/75">
                    Email a Stripe-hosted checkout link to the customer. The
                    signed webhook creates and confirms the booking after
                    payment succeeds.
                  </p>
                  <Button
                    type="button"
                    className="mt-4"
                    onClick={handleSendPaymentLink}
                    disabled={
                      activeAction !== null ||
                      !quote.customer?.email ||
                      !quote.preferredDate ||
                      !quote.preferredTime ||
                      selectedPaymentAmount === undefined
                    }
                  >
                    {activeAction === "payment-link" ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Send />
                    )}
                    {activeAction === "payment-link"
                      ? "Sending…"
                      : "Send payment link"}
                  </Button>
                  {!quote.customer?.email ? (
                    <p className="mt-2 text-xs text-amber-800">
                      Add a customer email before sending a link.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
                  <div className="flex items-center gap-2">
                    <Banknote className="size-5 text-emerald-800" />
                    <h3 className="font-semibold text-emerald-950">
                      Bank transfer or cash
                    </h3>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-emerald-900/75">
                    Record an offline payment and create the confirmed booking
                    in one step.
                  </p>
                  <div className="mt-4 grid gap-3">
                    <NativeSelect
                      value={manualMethod}
                      onChange={(event) =>
                        setManualMethod(
                          event.target.value as "BANK_TRANSFER" | "CASH",
                        )
                      }
                      aria-label="Manual payment method"
                    >
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="CASH">Cash</option>
                    </NativeSelect>
                    <Input
                      value={manualReference}
                      onChange={(event) => setManualReference(event.target.value)}
                      placeholder="Payment reference (optional)"
                      maxLength={160}
                    />
                    <Textarea
                      value={manualNote}
                      onChange={(event) => setManualNote(event.target.value)}
                      placeholder="Payment note (optional)"
                      rows={2}
                      maxLength={1000}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleManualPayment}
                      disabled={
                        activeAction !== null ||
                        !quote.preferredDate ||
                        !quote.preferredTime ||
                        selectedPaymentAmount === undefined
                      }
                    >
                      {activeAction === "manual-payment" ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <CalendarCheck />
                      )}
                      {activeAction === "manual-payment"
                        ? "Recording…"
                        : "Record payment and create booking"}
                    </Button>
                  </div>
                </div>
              </div>

              {quote.payments.length ? (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Online payment requests
                  </h3>
                  <div className="mt-3 space-y-2">
                    {quote.payments.map((payment) => (
                      <div
                        key={payment._id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm"
                      >
                        <div>
                          <strong className="text-slate-900">
                            {payment.paymentOption === "DEPOSIT"
                              ? "Deposit"
                              : "Full payment"}{" "}
                            · {formatMoney(payment.amountCents)}
                          </strong>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {payment.sentTo
                              ? `Sent to ${payment.sentTo}`
                              : "Checkout link preparation"}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {payment.status.charAt(0) +
                            payment.status.slice(1).toLowerCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <EmailConversation quoteId={quoteRequestId} className="lg:col-span-3" />

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
