'use client';

import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { ArrowRight, Check, LoaderCircle, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { api } from '@/convex/_generated/api';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AvailabilityEditor, normalizeAvailability, type AvailabilityEntry } from './availability-editor';

export function CleanerOnboarding() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const cleaner = useQuery(api.cleanerPortal.current, isAuthenticated ? {} : 'skip');
  const complete = useMutation(api.cleanerPortal.completeOnboarding);
  const [step, setStep] = useState(1);
  const [availability, setAvailability] = useState<AvailabilityEntry[]>(normalizeAvailability());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      await complete({
        phone: String(data.get('phone') ?? ''), homeAddress: String(data.get('homeAddress') ?? ''),
        serviceArea: String(data.get('serviceArea') ?? ''), emergencyContactName: String(data.get('emergencyContactName') ?? ''),
        emergencyContactPhone: String(data.get('emergencyContactPhone') ?? ''), availability,
      });
      router.replace('/cleaner');
    } catch (value) { setError(value instanceof Error ? value.message : 'Unable to complete onboarding.'); setSaving(false); }
  }
  if (!cleaner) return <div className="grid min-h-[70dvh] place-items-center"><LoaderCircle className="animate-spin text-[#087f70]" /></div>;
  if (step === 1) return <div className="flex min-h-[85dvh] flex-col"><BrandLogo /><div className="my-auto"><span className="grid size-14 place-items-center rounded-2xl bg-emerald-50 text-[#087f70]"><Sparkles /></span><p className="mt-7 text-sm font-bold text-[#087f70]">Welcome to WeDo</p><h1 className="mt-2 text-4xl font-extrabold tracking-[-0.05em]">Hi {cleaner.firstName}, let’s set up your workspace.</h1><p className="mt-4 text-base leading-7 text-slate-600">Confirm your details and tell us when you are available. It only takes a few minutes.</p></div><Button className="h-14 rounded-2xl text-base" onClick={() => { setAvailability(normalizeAvailability(cleaner.availability)); setStep(2); }}>Get started <ArrowRight /></Button></div>;
  return <form onSubmit={submit} className="space-y-6"><div><div className="mb-5 flex items-center justify-between"><BrandLogo /><span className="text-xs font-bold text-slate-400">Step 2 of 2</span></div><h1 className="text-3xl font-extrabold tracking-tight">Your details</h1><p className="mt-2 text-sm leading-6 text-slate-500">This information is private and only available to authorised staff.</p></div>{error ? <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<section className="space-y-4 rounded-[26px] bg-white p-5 shadow-sm"><div className="space-y-2"><Label htmlFor="phone">Mobile number</Label><Input id="phone" name="phone" defaultValue={cleaner.phone} required className="h-12 rounded-2xl" /></div><div className="space-y-2"><Label htmlFor="homeAddress">Home address</Label><Input id="homeAddress" name="homeAddress" defaultValue={cleaner.homeAddress} required className="h-12 rounded-2xl" /></div><div className="space-y-2"><Label htmlFor="serviceArea">Preferred service area</Label><Input id="serviceArea" name="serviceArea" defaultValue={cleaner.serviceArea} placeholder="e.g. Parramatta and nearby suburbs" required className="h-12 rounded-2xl" /></div><div className="space-y-2"><Label htmlFor="emergencyName">Emergency contact</Label><Input id="emergencyName" name="emergencyContactName" defaultValue={cleaner.emergencyContactName} required className="h-12 rounded-2xl" /></div><div className="space-y-2"><Label htmlFor="emergencyPhone">Emergency contact phone</Label><Input id="emergencyPhone" name="emergencyContactPhone" defaultValue={cleaner.emergencyContactPhone} required className="h-12 rounded-2xl" /></div></section><div><h2 className="text-lg font-bold">Weekly availability</h2><p className="mb-3 mt-1 text-sm text-slate-500">You can update this later.</p><AvailabilityEditor value={availability} onChange={setAvailability} /></div><Button type="submit" className="h-14 w-full rounded-2xl text-base" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" /> : <Check />}{saving ? 'Saving…' : 'Finish setup'}</Button></form>;
}
