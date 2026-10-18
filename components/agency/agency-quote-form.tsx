'use client';

import { useMutation, useQuery } from 'convex/react';
import { ArrowLeft, CalendarCheck, FileText, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

type Answer = number | boolean | string | string[];
type Estimate =
  | { type: 'CUSTOM_QUOTE_REQUIRED' }
  | { type: 'HOURLY_CONFIGURATION'; currency: 'AUD'; hourlyRateCents: number | null; minimumHours?: number; maximumHours?: number }
  | { type: 'ESTIMATE'; currency: 'AUD'; subtotal: number; total: number; breakdown: Array<{ label: string; amount: number }>; paymentRequirement: 'FULL' | 'DEPOSIT_OR_FULL' | 'DEPOSIT_ONLY' | 'PAY_LATER'; depositAmountCents?: number };

const includedExtraKeys = new Set(['oven', 'slidingGlassDoors', 'smallBalcony']);

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function currentSydneyDate() {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function money(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);
}

function answerIsComplete(value: Answer | undefined) {
  if (value === undefined || value === '') return false;
  return !Array.isArray(value) || value.length > 0;
}

export function AgencyQuoteForm() {
  const router = useRouter();
  const services = useQuery(api.services.listActiveServices);
  const createQuote = useMutation(api.agencyPortal.createQuote);
  const createBooking = useMutation(api.agencyPortal.createInstantBooking);
  const [serviceId, setServiceId] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState<'QUOTE' | 'BOOK' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const questions = useQuery(api.services.getActiveServiceQuestions, serviceId ? { serviceId: serviceId as Id<'services'> } : 'skip');
  const effectiveAnswers = useMemo(() => {
    const next = { ...answers };
    for (const question of questions ?? []) {
      if (includedExtraKeys.has(question.key) && next[question.key] === undefined) {
        next[question.key] = 1;
      }
    }
    return next;
  }, [answers, questions]);
  const requiredAnswersComplete = Boolean(
    questions?.every((question) => !question.required || answerIsComplete(effectiveAnswers[question.key])) &&
    (effectiveAnswers.carpetSteam !== true || (typeof effectiveAnswers.carpetRooms === 'number' && effectiveAnswers.carpetRooms >= 1)),
  );
  const estimate = useQuery(
    api.services.calculateServiceEstimate,
    serviceId && requiredAnswersComplete ? { serviceId: serviceId as Id<'services'>, answers: effectiveAnswers } : 'skip',
  ) as Estimate | undefined;

  const availabilityRange = useMemo(() => {
    const fromDate = addDays(currentSydneyDate(), 1);
    return { fromDate, toDate: addDays(fromDate, 60) };
  }, []);
  const availability = useQuery(api.availability.listPublic, availabilityRange);
  const availableDates = useMemo(() => [...new Set((availability ?? []).map((slot) => slot.date))], [availability]);
  const effectiveDate = availableDates.includes(date) ? date : (availableDates[0] ?? '');
  const availableTimes = useMemo<string[]>(
    () => (availability ?? []).filter((slot) => slot.date === effectiveDate).map((slot) => slot.time),
    [availability, effectiveDate],
  );
  const effectiveTime = availableTimes.includes(time) ? time : (availableTimes[0] ?? '');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!serviceId) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value === 'BOOK' ? 'BOOK' : 'QUOTE';
    const data = new FormData(event.currentTarget);
    const optional = (name: string) => String(data.get(name) ?? '').trim() || undefined;
    const propertyType = typeof effectiveAnswers.propertyType === 'string' ? effectiveAnswers.propertyType : optional('propertyType');
    const bedrooms = typeof effectiveAnswers.bedrooms === 'number' ? effectiveAnswers.bedrooms : optional('bedrooms') === undefined ? undefined : Number(optional('bedrooms'));
    const bathrooms = typeof effectiveAnswers.bathrooms === 'number' ? effectiveAnswers.bathrooms : optional('bathrooms') === undefined ? undefined : Number(optional('bathrooms'));
    const payload = {
      firstName: String(data.get('firstName') ?? ''), lastName: optional('lastName'), email: optional('email'), phone: String(data.get('phone') ?? ''),
      serviceId: serviceId as Id<'services'>, answers: effectiveAnswers,
      addressLine1: String(data.get('addressLine1') ?? ''), addressLine2: optional('addressLine2'), suburb: String(data.get('suburb') ?? ''), state: String(data.get('state') ?? 'NSW'), postcode: String(data.get('postcode') ?? ''),
      preferredDate: effectiveDate || undefined, preferredTime: effectiveTime || undefined, propertyType, bedrooms, bathrooms, notes: optional('notes'),
    };
    setBusy(intent); setError(null);
    try {
      if (intent === 'BOOK') {
        const result = await createBooking(payload);
        router.push(`/agency/jobs/${result.bookingId}`);
      } else {
        const result = await createQuote(payload);
        router.push(`/agency/quotes/${result.quoteRequestId}`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message.replace(/^.*Uncaught Error:\s*/, '') : 'Unable to complete the request.');
    } finally { setBusy(null); }
  }

  const instantBookingAvailable = estimate?.type === 'ESTIMATE' && Boolean(effectiveDate && effectiveTime);
  const hasPropertyQuestion = questions?.some((question) => question.key === 'propertyType');
  const hasBedroomQuestion = questions?.some((question) => question.key === 'bedrooms');
  const hasBathroomQuestion = questions?.some((question) => question.key === 'bathrooms');

  return <div className="space-y-5">
    <header className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#087f70]">New quote</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Price and book a job</h1><p className="mt-2 text-sm text-slate-500">See the live price, save the quote, or confirm the job now and pay by invoice later.</p></div><Button asChild variant="outline" size="sm"><Link href="/agency/quotes"><ArrowLeft /> Back</Link></Button></header>
    <form onSubmit={submit} className="space-y-5">
      <Card><CardHeader><CardTitle>Property contact</CardTitle><CardDescription>The customer, tenant or property contact for this job.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Field label="First name *" name="firstName" required /><Field label="Last name" name="lastName" /><Field label="Phone *" name="phone" type="tel" required /><Field label="Email (optional)" name="email" type="email" /></CardContent></Card>
      <Card><CardHeader><CardTitle>Service and live price</CardTitle><CardDescription>The price uses the same rules as the customer estimator.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="serviceId">Service *</Label><NativeSelect id="serviceId" value={serviceId} onChange={(event) => { setServiceId(event.target.value); setAnswers({}); setError(null); }} required><option value="">Select a service</option>{services?.map((service) => <option key={service._id} value={service._id}>{service.name}</option>)}</NativeSelect></div>
        {questions?.map((question) => <Question key={question.key} question={question} value={effectiveAnswers[question.key]} onChange={(value) => setAnswers((current) => ({ ...current, [question.key]: value }))} />)}
        <div className="sm:col-span-2"><EstimatePanel estimate={estimate} ready={requiredAnswersComplete} loading={requiredAnswersComplete && estimate === undefined} /></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Property and appointment</CardTitle><CardDescription>Only currently available appointment times are shown.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Street address *" name="addressLine1" required /></div><div className="sm:col-span-2"><Field label="Address line 2" name="addressLine2" /></div><Field label="Suburb *" name="suburb" required />
        <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="state">State</Label><NativeSelect id="state" name="state" defaultValue="NSW">{['NSW', 'ACT', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT'].map((state) => <option key={state}>{state}</option>)}</NativeSelect></div><Field label="Postcode *" name="postcode" inputMode="numeric" pattern="[0-9]{4}" required /></div>
        <div className="space-y-2"><Label htmlFor="preferredDate">Available date *</Label><NativeSelect id="preferredDate" value={effectiveDate} onChange={(event) => { setDate(event.target.value); setTime(''); }} required><option value="">Select date</option>{availableDates.map((value) => <option key={value} value={value}>{new Date(`${value}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</option>)}</NativeSelect></div>
        <div className="space-y-2"><Label htmlFor="preferredTime">Available time *</Label><NativeSelect id="preferredTime" value={effectiveTime} onChange={(event) => setTime(event.target.value)} required><option value="">Select time</option>{availableTimes.map((value) => <option key={value} value={value}>{value}</option>)}</NativeSelect></div>
        {!hasPropertyQuestion ? <Field label="Property type" name="propertyType" placeholder="House, apartment, office…" /> : null}{!hasBedroomQuestion ? <Field label="Bedrooms" name="bedrooms" type="number" min="0" max="30" /> : null}{!hasBathroomQuestion ? <Field label="Bathrooms" name="bathrooms" type="number" min="0" max="30" /> : null}
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="notes">Access instructions and notes</Label><Textarea id="notes" name="notes" rows={5} placeholder="Key collection, vacate date, parking, building access or special requirements" /></div>
      </CardContent></Card>
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="submit" name="intent" value="QUOTE" variant="outline" size="lg" disabled={Boolean(busy) || !serviceId || !requiredAnswersComplete}>{busy === 'QUOTE' ? <LoaderCircle className="animate-spin" /> : <FileText />}{busy === 'QUOTE' ? 'Saving…' : 'Save quote'}</Button><Button type="submit" name="intent" value="BOOK" size="lg" disabled={Boolean(busy) || !instantBookingAvailable}>{busy === 'BOOK' ? <LoaderCircle className="animate-spin" /> : <CalendarCheck />}{busy === 'BOOK' ? 'Booking…' : 'Book job — invoice later'}</Button></div>
    </form>
  </div>;
}

function EstimatePanel({ estimate, ready, loading }: { estimate: Estimate | undefined; ready: boolean; loading: boolean }) {
  if (!ready) return <div className="rounded-2xl border border-dashed bg-slate-50 p-5 text-sm text-slate-500">Complete the required service details to see the price.</div>;
  if (loading) return <div className="flex items-center gap-2 rounded-2xl border bg-slate-50 p-5 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" /> Calculating live price…</div>;
  if (estimate?.type === 'ESTIMATE') return <div className="overflow-hidden rounded-2xl bg-[#173c38]"><div className="flex items-end justify-between gap-4 p-5"><div><p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#d9f5ec' }}>Instant agency price</p><p className="mt-2 text-3xl font-extrabold" style={{ color: '#ffffff' }}>{money(estimate.total)}</p></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold" style={{ color: '#ffffff' }}>Invoice later</span></div><div className="border-t border-white/10 px-5 py-4">{estimate.breakdown.map((line) => <div key={line.label} className="flex justify-between gap-4 py-1 text-sm"><span style={{ color: '#eef7f4' }}>{line.label}</span><strong style={{ color: '#ffffff' }}>{money(line.amount)}</strong></div>)}</div></div>;
  if (estimate?.type === 'HOURLY_CONFIGURATION') return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">This service is priced hourly{estimate.hourlyRateCents ? ` at ${money(estimate.hourlyRateCents)} per hour` : ''}. Save the quote for the team to confirm the total before booking.</div>;
  return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">This service needs a custom price. Save the quote and the WeDo Cleaning team will review it.</div>;
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) { return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} {...props} /></div>; }

type QuestionData = { key: string; label: string; type: 'NUMBER' | 'BOOLEAN' | 'SELECT' | 'MULTI_SELECT' | 'TEXT'; required: boolean; options?: string[] };
function Question({ question, value, onChange }: { question: QuestionData; value: Answer | undefined; onChange: (value: Answer) => void }) {
  const included = includedExtraKeys.has(question.key);
  return <div className="space-y-2"><div className="flex items-center justify-between gap-2"><Label htmlFor={`question-${question.key}`}>{question.label}{question.required ? ' *' : ''}</Label>{included ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">1 included</span> : null}</div>{question.type === 'BOOLEAN' ? <NativeSelect id={`question-${question.key}`} value={value === true ? 'true' : value === false ? 'false' : ''} onChange={(event) => onChange(event.target.value === 'true')} required={question.required}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></NativeSelect> : question.type === 'SELECT' ? <NativeSelect id={`question-${question.key}`} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} required={question.required}><option value="">Select</option>{question.options?.map((option) => <option key={option}>{option}</option>)}</NativeSelect> : question.type === 'MULTI_SELECT' ? <div className="space-y-2 rounded-xl border p-3">{question.options?.map((option) => { const selected = Array.isArray(value) && value.includes(option); return <label key={option} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected} onChange={(event) => { const current = Array.isArray(value) ? value : []; onChange(event.target.checked ? [...current, option] : current.filter((item) => item !== option)); }} />{option}</label>; })}</div> : <Input id={`question-${question.key}`} type={question.type === 'NUMBER' ? 'number' : 'text'} min={question.type === 'NUMBER' ? 0 : undefined} value={value === undefined ? '' : String(value)} onChange={(event) => onChange(question.type === 'NUMBER' ? Number(event.target.value) : event.target.value)} required={question.required} />}</div>;
}
