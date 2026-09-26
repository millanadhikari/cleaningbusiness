'use client';

import { useMutation } from 'convex/react';
import { CheckCircle2, LoaderCircle, Send } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useRef, useState } from 'react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const serviceTypes = [
  'House Cleaning',
  'End of Lease Cleaning',
  'Office Cleaning',
  'Commercial Cleaning',
  'Carpet Cleaning',
  'Window Cleaning',
  'Deep Cleaning',
  'Other',
];

const australianStates = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

function optionalString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  return value || undefined;
}

function optionalNumber(formData: FormData, name: string) {
  const value = optionalString(formData, name);
  return value === undefined ? undefined : Number(value);
}

const fieldClassName = 'h-11 bg-white';
const selectClassName =
  'h-11 w-full rounded-md border border-input bg-white px-3 text-sm text-slate-900 shadow-xs outline-none transition-[color,box-shadow] focus:border-ring focus:ring-[3px] focus:ring-ring/50';

export function QuoteRequestForm() {
  const submitQuote = useMutation(api.quoteRequests.submit);
  const submissionKey = useRef<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const phone = String(formData.get('phone') ?? '').trim();
    const postcode = String(formData.get('postcode') ?? '').trim();

    if (!/^(?:\+?61|0)[\d\s()-]{8,14}$/.test(phone)) {
      setError('Enter a valid Australian phone number.');
      return;
    }
    if (!/^\d{4}$/.test(postcode)) {
      setError('Postcode must contain four digits.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      submissionKey.current ??= crypto.randomUUID();
      await submitQuote({
        submissionKey: submissionKey.current,
        firstName: String(formData.get('firstName') ?? ''),
        lastName: optionalString(formData, 'lastName'),
        email: String(formData.get('email') ?? ''),
        phone,
        serviceType: String(formData.get('serviceType') ?? ''),
        addressLine1: String(formData.get('addressLine1') ?? ''),
        addressLine2: optionalString(formData, 'addressLine2'),
        suburb: String(formData.get('suburb') ?? ''),
        state: String(formData.get('state') ?? ''),
        postcode,
        propertyType: optionalString(formData, 'propertyType'),
        bedrooms: optionalNumber(formData, 'bedrooms'),
        bathrooms: optionalNumber(formData, 'bathrooms'),
        preferredDate: optionalString(formData, 'preferredDate'),
        preferredTime: optionalString(formData, 'preferredTime'),
        notes: optionalString(formData, 'notes'),
      });
      setIsComplete(true);
      form.reset();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message.replace(/^.*Uncaught Error:\s*/, '')
          : 'We could not submit your request. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isComplete) {
    return (
      <div className="flex min-h-[520px] flex-col items-center justify-center px-6 py-14 text-center sm:px-12">
        <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="size-8" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Request received
        </p>
        <h2 className="mt-3 max-w-lg text-3xl font-semibold tracking-tight text-slate-950">
          Thanks, your quote request has been received.
        </h2>
        <p className="mt-4 max-w-md text-sm leading-7 text-slate-600">
          Our team will review the details and contact you to confirm the scope,
          availability and next steps.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/">Return to home</Link>
          </Button>
          <Button type="button" variant="outline" onClick={() => setIsComplete(false)}>
            Submit another request
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="divide-y divide-slate-100">
      <section className="grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
        <h2 className="col-span-full mb-1 text-lg font-semibold text-slate-950">
          Your details
        </h2>
        <div className="space-y-2">
          <Label htmlFor="firstName">First name *</Label>
          <Input id="firstName" name="firstName" className={fieldClassName} autoComplete="given-name" maxLength={80} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" className={fieldClassName} autoComplete="family-name" maxLength={80} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input id="email" name="email" type="email" className={fieldClassName} autoComplete="email" maxLength={254} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone *</Label>
          <Input id="phone" name="phone" type="tel" className={fieldClassName} autoComplete="tel" placeholder="0412 345 678" maxLength={20} required />
        </div>
      </section>

      <section className="grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
        <h2 className="col-span-full mb-1 text-lg font-semibold text-slate-950">
          Service and location
        </h2>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="serviceType">Service type *</Label>
          <select id="serviceType" name="serviceType" className={selectClassName} defaultValue="" required>
            <option value="" disabled>Select a service</option>
            {serviceTypes.map((service) => <option key={service}>{service}</option>)}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="addressLine1">Address line 1 *</Label>
          <Input id="addressLine1" name="addressLine1" className={fieldClassName} autoComplete="address-line1" maxLength={160} required />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="addressLine2">Address line 2</Label>
          <Input id="addressLine2" name="addressLine2" className={fieldClassName} autoComplete="address-line2" maxLength={160} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="suburb">Suburb *</Label>
          <Input id="suburb" name="suburb" className={fieldClassName} autoComplete="address-level2" maxLength={80} required />
        </div>
        <div className="grid grid-cols-[1fr_1.2fr] gap-4">
          <div className="space-y-2">
            <Label htmlFor="state">State *</Label>
            <select id="state" name="state" className={selectClassName} defaultValue="NSW" required>
              {australianStates.map((state) => <option key={state}>{state}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="postcode">Postcode *</Label>
            <Input id="postcode" name="postcode" className={fieldClassName} inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{4}" maxLength={4} placeholder="2000" required />
          </div>
        </div>
      </section>

      <section className="grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
        <h2 className="col-span-full mb-1 text-lg font-semibold text-slate-950">
          Job details
        </h2>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="propertyType">Property type</Label>
          <Input id="propertyType" name="propertyType" className={fieldClassName} placeholder="House, apartment, office…" maxLength={80} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bedrooms">Bedrooms</Label>
          <Input id="bedrooms" name="bedrooms" type="number" className={fieldClassName} min={0} max={30} step={1} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bathrooms">Bathrooms</Label>
          <Input id="bathrooms" name="bathrooms" type="number" className={fieldClassName} min={0} max={30} step={1} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preferredDate">Preferred date</Label>
          <Input id="preferredDate" name="preferredDate" type="date" className={fieldClassName} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preferredTime">Preferred time</Label>
          <Input id="preferredTime" name="preferredTime" className={fieldClassName} placeholder="Morning, afternoon, or a time" maxLength={80} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Additional notes</Label>
          <Textarea id="notes" name="notes" className="min-h-28 bg-white" placeholder="Tell us about access, parking, priorities or anything else we should know." maxLength={2000} />
        </div>
      </section>

      <div className="flex flex-col gap-4 bg-slate-50/80 p-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-8">
        <p className="max-w-lg text-xs leading-5 text-slate-500">
          We’ll only use these details to review your cleaning request and contact you about the quote.
        </p>
        <Button type="submit" size="lg" disabled={isSubmitting} className="min-w-44">
          {isSubmitting ? <LoaderCircle className="animate-spin" /> : <Send />}
          {isSubmitting ? 'Sending request…' : 'Request my quote'}
        </Button>
        {error ? (
          <p role="alert" className="text-sm font-medium text-red-700 sm:basis-full">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
