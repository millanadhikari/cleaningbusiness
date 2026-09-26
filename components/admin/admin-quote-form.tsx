"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowLeft, Calculator, LoaderCircle, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { AdminListHeader, AdminListPage } from "./admin-list-layout";

type AnswerValue = number | boolean | string | string[];
type PricingSource = "SERVICE" | "CUSTOM";

const states = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

function optionalString(data: FormData, name: string) {
  const value = String(data.get(name) ?? "").trim();
  return value || undefined;
}

function optionalNumber(data: FormData, name: string) {
  const value = optionalString(data, name);
  return value === undefined ? undefined : Number(value);
}

function centsFromDollars(value: string | undefined) {
  if (!value) return undefined;
  return Math.round(Number(value) * 100);
}

function inputValue(value: AnswerValue | undefined) {
  return typeof value === "string" || typeof value === "number" ? value : "";
}

export function AdminQuoteForm({
  quoteRequestId,
}: {
  quoteRequestId?: Id<"quoteRequests">;
}) {
  const { isAuthenticated } = useConvexAuth();
  const quote = useQuery(
    api.quoteRequests.get,
    isAuthenticated && quoteRequestId ? { quoteRequestId } : "skip",
  );

  if (!isAuthenticated || (quoteRequestId && quote === undefined)) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="size-4 animate-spin" /> Loading quote…
      </div>
    );
  }
  if (quoteRequestId && quote === null) {
    return <p className="text-sm text-red-700">Quote not found.</p>;
  }

  return (
    <AdminQuoteEditor
      key={quote?._id ?? "new"}
      quoteRequestId={quoteRequestId}
      quote={quote ?? undefined}
    />
  );
}

function AdminQuoteEditor({
  quoteRequestId,
  quote,
}: {
  quoteRequestId?: Id<"quoteRequests">;
  quote?: Doc<"quoteRequests"> & { customer: Doc<"customers"> | null };
}) {
  const router = useRouter();
  const services = useQuery(api.services.listAdminServices, {});
  const createQuote = useMutation(api.quoteRequests.createAdminQuote);
  const updateQuote = useMutation(api.quoteRequests.updateAdminQuote);
  const [serviceId, setServiceId] = useState(quote?.serviceId ?? "");
  const [pricingSource, setPricingSource] = useState<PricingSource>(
    quote?.pricingSource ?? "SERVICE",
  );
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(
    Object.fromEntries(
      (quote?.submittedAnswers ?? []).map((answer) => [
        answer.key,
        answer.value,
      ]),
    ),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questions = useQuery(
    api.services.getActiveServiceQuestions,
    serviceId ? { serviceId: serviceId as Id<"services"> } : "skip",
  );

  const customer = quote?.customer;
  const isEdit = Boolean(quoteRequestId);
  const isLocked = Boolean(quote?.convertedBookingId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!serviceId || isSaving) return;
    const data = new FormData(event.currentTarget);
    const payload = {
      firstName: String(data.get("firstName") ?? ""),
      lastName: optionalString(data, "lastName"),
      email: optionalString(data, "email"),
      phone: String(data.get("phone") ?? ""),
      serviceId: serviceId as Id<"services">,
      pricingSource,
      answers,
      customTotalCents:
        pricingSource === "CUSTOM"
          ? centsFromDollars(optionalString(data, "customTotal"))
          : undefined,
      addressLine1: String(data.get("addressLine1") ?? ""),
      addressLine2: optionalString(data, "addressLine2"),
      suburb: String(data.get("suburb") ?? ""),
      state: String(data.get("state") ?? ""),
      postcode: String(data.get("postcode") ?? ""),
      preferredDate: optionalString(data, "preferredDate"),
      preferredTime: optionalString(data, "preferredTime"),
      propertyType: optionalString(data, "propertyType"),
      bedrooms: optionalNumber(data, "bedrooms"),
      bathrooms: optionalNumber(data, "bathrooms"),
      notes: optionalString(data, "notes"),
    };
    setIsSaving(true);
    setError(null);
    try {
      if (quoteRequestId) {
        await updateQuote({ quoteRequestId, ...payload });
        router.push(`/admin/quotes/${quoteRequestId}`);
      } else {
        const id = await createQuote(payload);
        router.push(`/admin/quotes/${id}`);
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message.replace(/^.*Uncaught Error:\s*/, "")
          : "Unable to save the quote.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminListPage>
      <AdminListHeader
        icon={Calculator}
        label="Sales pipeline"
        title={isEdit ? "Edit quote" : "Create quote"}
        description={
          isEdit
            ? "Update the customer, scope, schedule, and quoted price."
            : "Create a tailored quote using service pricing or a custom total."
        }
        action={
          <Button asChild variant="outline">
            <Link
              href={
                quoteRequestId
                  ? `/admin/quotes/${quoteRequestId}`
                  : "/admin/quotes"
              }
            >
              <ArrowLeft /> Back
            </Link>
          </Button>
        }
      />

      {isLocked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This quote is locked because it has already been converted to a
          booking.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="rounded-[23px] border border-emerald-100 bg-white/95 p-6 shadow-[0_5px_24px_rgba(20,47,54,0.05)]">
          <h3 className="text-lg font-semibold text-slate-950">Customer</h3>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name *</Label>
              <Input
                id="firstName"
                name="firstName"
                defaultValue={customer?.firstName}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                name="lastName"
                defaultValue={customer?.lastName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={customer?.email}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={customer?.phone}
                placeholder="0412 345 678"
                required
              />
            </div>
          </div>
        </section>

        <section className="rounded-[23px] border border-emerald-100 bg-white/95 p-6 shadow-[0_5px_24px_rgba(20,47,54,0.05)]">
          <h3 className="text-lg font-semibold text-slate-950">
            Service and pricing
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Use the configured service rules, or override them with an agreed
            custom total.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="serviceId">Service *</Label>
              <NativeSelect
                id="serviceId"
                value={serviceId}
                onChange={(event) => {
                  setServiceId(event.target.value);
                  setAnswers({});
                }}
                required
              >
                <option value="">Select a service</option>
                {services
                  ?.filter((service) => service.status === "ACTIVE")
                  .map((service) => (
                    <option key={service._id} value={service._id}>
                      {service.name}
                    </option>
                  ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricingSource">Pricing *</Label>
              <NativeSelect
                id="pricingSource"
                value={pricingSource}
                onChange={(event) =>
                  setPricingSource(event.target.value as PricingSource)
                }
              >
                <option value="SERVICE">Calculate from service rules</option>
                <option value="CUSTOM">Custom quoted price</option>
              </NativeSelect>
            </div>
            {pricingSource === "CUSTOM" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="customTotal">Custom total (AUD) *</Label>
                <Input
                  id="customTotal"
                  name="customTotal"
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  defaultValue={
                    quote?.estimatedTotalCents === undefined
                      ? undefined
                      : (quote.estimatedTotalCents / 100).toFixed(2)
                  }
                  required
                />
              </div>
            ) : null}
            {questions?.map((question) => (
              <div key={question.key} className="space-y-2">
                <Label htmlFor={`answer-${question.key}`}>
                  {question.label}
                  {question.required && pricingSource === "SERVICE" ? " *" : ""}
                </Label>
                {question.type === "BOOLEAN" ? (
                  <NativeSelect
                    id={`answer-${question.key}`}
                    value={
                      answers[question.key] === true
                        ? "true"
                        : answers[question.key] === false
                          ? "false"
                          : ""
                    }
                    onChange={(event) =>
                      setAnswers((current) => {
                        if (!event.target.value) {
                          const next = { ...current };
                          delete next[question.key];
                          return next;
                        }
                        return {
                          ...current,
                          [question.key]: event.target.value === "true",
                        };
                      })
                    }
                    required={question.required && pricingSource === "SERVICE"}
                  >
                    <option value="">Select</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </NativeSelect>
                ) : question.type === "SELECT" ? (
                  <NativeSelect
                    id={`answer-${question.key}`}
                    value={String(answers[question.key] ?? "")}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.key]: event.target.value,
                      }))
                    }
                    required={question.required && pricingSource === "SERVICE"}
                  >
                    <option value="">Select</option>
                    {question.options?.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </NativeSelect>
                ) : question.type === "MULTI_SELECT" ? (
                  <div className="grid gap-2 rounded-xl border border-slate-200 p-3">
                    {question.options?.map((option) => {
                      const currentAnswer = answers[question.key];
                      const selected =
                        Array.isArray(currentAnswer) &&
                        currentAnswer.includes(option);
                      return (
                        <label
                          key={option}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) =>
                              setAnswers((current) => {
                                const previous = Array.isArray(
                                  current[question.key],
                                )
                                  ? (current[question.key] as string[])
                                  : [];
                                return {
                                  ...current,
                                  [question.key]: event.target.checked
                                    ? [...previous, option]
                                    : previous.filter(
                                        (item) => item !== option,
                                      ),
                                };
                              })
                            }
                          />
                          {option}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <Input
                    id={`answer-${question.key}`}
                    type={question.type === "NUMBER" ? "number" : "text"}
                    min={question.type === "NUMBER" ? 0 : undefined}
                    step={question.type === "NUMBER" ? 1 : undefined}
                    value={inputValue(answers[question.key])}
                    onChange={(event) =>
                      setAnswers((current) => {
                        if (!event.target.value) {
                          const next = { ...current };
                          delete next[question.key];
                          return next;
                        }
                        return {
                          ...current,
                          [question.key]:
                            question.type === "NUMBER"
                              ? Number(event.target.value)
                              : event.target.value,
                        };
                      })
                    }
                    required={question.required && pricingSource === "SERVICE"}
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[23px] border border-emerald-100 bg-white/95 p-6 shadow-[0_5px_24px_rgba(20,47,54,0.05)]">
          <h3 className="text-lg font-semibold text-slate-950">
            Location and schedule
          </h3>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="addressLine1">Address *</Label>
              <Input
                id="addressLine1"
                name="addressLine1"
                defaultValue={quote?.addressLine1}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="addressLine2">Address line 2</Label>
              <Input
                id="addressLine2"
                name="addressLine2"
                defaultValue={quote?.addressLine2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suburb">Suburb *</Label>
              <Input
                id="suburb"
                name="suburb"
                defaultValue={quote?.suburb}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="state">State *</Label>
                <NativeSelect
                  id="state"
                  name="state"
                  defaultValue={quote?.state ?? "NSW"}
                >
                  {states.map((state) => (
                    <option key={state}>{state}</option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="postcode">Postcode *</Label>
                <Input
                  id="postcode"
                  name="postcode"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  defaultValue={quote?.postcode}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredDate">Scheduled date</Label>
              <Input
                id="preferredDate"
                name="preferredDate"
                type="date"
                defaultValue={quote?.preferredDate}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredTime">Scheduled time</Label>
              <Input
                id="preferredTime"
                name="preferredTime"
                type="time"
                defaultValue={quote?.preferredTime}
              />
            </div>
          </div>
        </section>

        <section className="rounded-[23px] border border-emerald-100 bg-white/95 p-6 shadow-[0_5px_24px_rgba(20,47,54,0.05)]">
          <h3 className="text-lg font-semibold text-slate-950">Job details</h3>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="propertyType">Property type</Label>
              <Input
                id="propertyType"
                name="propertyType"
                defaultValue={quote?.propertyType}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bedrooms">Bedrooms</Label>
              <Input
                id="bedrooms"
                name="bedrooms"
                type="number"
                min="0"
                max="30"
                defaultValue={quote?.bedrooms}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bathrooms">Bathrooms</Label>
              <Input
                id="bathrooms"
                name="bathrooms"
                type="number"
                min="0"
                max="30"
                defaultValue={quote?.bathrooms}
              />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                rows={5}
                defaultValue={quote?.notes}
              />
            </div>
          </div>
        </section>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button
            type="submit"
            size="lg"
            disabled={isSaving || isLocked || !serviceId}
          >
            {isSaving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {isSaving ? "Saving…" : isEdit ? "Save changes" : "Create quote"}
          </Button>
        </div>
      </form>
    </AdminListPage>
  );
}
