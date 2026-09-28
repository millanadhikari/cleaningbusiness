'use client';

import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { CalendarDays, LoaderCircle, Save } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { AvailabilityEditor, normalizeAvailability, type AvailabilityEntry } from './availability-editor';

export function CleanerAvailability() {
  const { isAuthenticated } = useConvexAuth();
  const cleaner = useQuery(api.cleanerPortal.current, isAuthenticated ? {} : 'skip');
  const save = useMutation(api.cleanerPortal.updateAvailability);
  const [draft, setDraft] = useState<AvailabilityEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  if (!cleaner) return <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-[#087f70]" /></div>;
  const value = draft ?? normalizeAvailability(cleaner.availability);
  async function submit() { setSaving(true); setMessage(undefined); try { await save({ availability: value }); setMessage('Availability updated.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save.'); } finally { setSaving(false); } }
  return <div className="space-y-5"><header><span className="grid size-11 place-items-center rounded-2xl bg-emerald-50 text-[#087f70]"><CalendarDays /></span><h1 className="mt-4 text-3xl font-extrabold tracking-tight">Availability</h1><p className="mt-2 text-sm leading-6 text-slate-500">Keep this current so the admin team can assign suitable jobs.</p></header>{message ? <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}<AvailabilityEditor value={value} onChange={setDraft} /><Button className="h-13 w-full rounded-2xl" onClick={submit} disabled={saving}>{saving ? <LoaderCircle className="animate-spin" /> : <Save />}{saving ? 'Saving…' : 'Save availability'}</Button></div>;
}
