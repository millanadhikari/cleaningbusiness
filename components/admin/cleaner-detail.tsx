'use client';

import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  Save,
  Send,
  UserRoundCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

type Day = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
type Availability = { day: Day; available: boolean; startTime?: string; endTime?: string };
type Feedback = { kind: 'success' | 'error'; text: string } | null;

const DAYS: Array<{ value: Day; label: string }> = [
  { value: 'MONDAY', label: 'Monday' },
  { value: 'TUESDAY', label: 'Tuesday' },
  { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'THURSDAY', label: 'Thursday' },
  { value: 'FRIDAY', label: 'Friday' },
  { value: 'SATURDAY', label: 'Saturday' },
  { value: 'SUNDAY', label: 'Sunday' },
];

function normalizeAvailability(stored: Availability[] | undefined): Availability[] {
  return DAYS.map(({ value }) => stored?.find((entry) => entry.day === value) ?? { day: value, available: false });
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message.replace(/^.*Uncaught Error:\s*/, '') : fallback;
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hours, minutes));
}

export function CleanerDetail({ cleanerId }: { cleanerId: Id<'cleaners'> }) {
  const { isAuthenticated } = useConvexAuth();
  const details = useQuery(api.cleaners.getDetails, isAuthenticated ? { cleanerId } : 'skip');
  const updateAvailability = useMutation(api.cleaners.updateAvailability);
  const sendInvitation = useAction(api.cleaners.sendInvitation);
  const [availability, setAvailability] = useState<Availability[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function updateDay(day: Day, changes: Partial<Availability>) {
    setAvailability((current) => normalizeAvailability(current ?? details?.cleaner.availability).map((entry) => entry.day === day ? { ...entry, ...changes } : entry));
  }

  async function handleSaveAvailability() {
    setIsSaving(true);
    setFeedback(null);
    try {
      await updateAvailability({ cleanerId, availability: normalizeAvailability(availability ?? details?.cleaner.availability) });
      setFeedback({ kind: 'success', text: 'Availability saved.' });
    } catch (error) {
      setFeedback({ kind: 'error', text: readableError(error, 'Unable to save availability.') });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSendInvitation() {
    setIsSending(true);
    setFeedback(null);
    try {
      await sendInvitation({ cleanerId, appOrigin: window.location.origin });
      setFeedback({ kind: 'success', text: 'Invitation email sent.' });
    } catch (error) {
      setFeedback({ kind: 'error', text: readableError(error, 'Unable to send the invitation.') });
    } finally {
      setIsSending(false);
    }
  }

  if (details === undefined) {
    return <div className="grid min-h-72 place-items-center text-sm text-slate-500"><span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Loading cleaner…</span></div>;
  }
  if (details === null) {
    return <div className="space-y-4"><Button asChild variant="outline"><Link href="/admin/cleaners"><ArrowLeft /> Back to team</Link></Button><p>Cleaner not found.</p></div>;
  }

  const { cleaner, upcomingJobs } = details;
  const name = `${cleaner.firstName} ${cleaner.lastName}`;
  const visibleAvailability = normalizeAvailability(availability ?? cleaner.availability);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost"><Link href="/admin/cleaners"><ArrowLeft /> Cleaning team</Link></Button>
        <Badge variant="secondary" className={cleaner.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}>{cleaner.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge>
      </div>

      <header className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid size-14 place-items-center rounded-2xl bg-[#007c70] text-lg font-bold text-white">{cleaner.firstName[0]}{cleaner.lastName[0]}</span>
            <div><p className="text-sm font-medium text-emerald-700">Cleaner profile</p><h1 className="text-2xl font-bold text-[#173c38] sm:text-3xl">{name}</h1><p className="mt-1 text-sm text-slate-500">{cleaner.specialty || 'General cleaning'}</p></div>
          </div>
          <Button type="button" onClick={handleSendInvitation} disabled={!cleaner.email || isSending}>
            {isSending ? <LoaderCircle className="animate-spin" /> : <Send />}
            {cleaner.invitationSentAt ? 'Resend invitation' : 'Send invitation'}
          </Button>
        </div>
      </header>

      {feedback ? <p role="status" className={feedback.kind === 'success' ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800' : 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800'}>{feedback.text}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="space-y-5 rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm">
          <div><h2 className="text-lg font-semibold text-[#173c38]">Cleaner details</h2><p className="mt-1 text-sm text-slate-500">Contact and engagement information.</p></div>
          <div className="space-y-4 text-sm">
            <p className="flex items-center gap-3"><Mail className="size-4 text-emerald-700" />{cleaner.email ? <a className="hover:text-emerald-800" href={`mailto:${cleaner.email}`}>{cleaner.email}</a> : <span className="text-slate-400">No email added</span>}</p>
            <p className="flex items-center gap-3"><Phone className="size-4 text-emerald-700" /><a className="hover:text-emerald-800" href={`tel:${cleaner.phone}`}>{cleaner.phone}</a></p>
            <p className="flex items-center gap-3"><BriefcaseBusiness className="size-4 text-emerald-700" />{cleaner.engagementType === 'EMPLOYEE' ? 'Employee' : 'Contractor'}</p>
          </div>
          {cleaner.notes ? <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Internal notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{cleaner.notes}</p></div> : null}
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-900">
            <p className="flex items-center gap-2 font-semibold"><UserRoundCheck className="size-4" /> Invitation status</p>
            <p className="mt-2 leading-6">{cleaner.invitationSentAt ? `Last sent to ${cleaner.invitationEmail ?? cleaner.email} on ${new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(cleaner.invitationSentAt)}.` : cleaner.email ? 'No invitation has been sent yet.' : 'Add an email address from the team list before inviting this cleaner.'}</p>
            <p className="mt-2 text-xs text-emerald-800">The secure link creates the cleaner login and opens their mobile onboarding.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-[#173c38]"><CalendarDays className="size-5 text-emerald-700" /> Weekly availability</h2><p className="mt-1 text-sm text-slate-500">Set the usual working window for each day.</p></div><Button type="button" onClick={handleSaveAvailability} disabled={isSaving}>{isSaving ? <LoaderCircle className="animate-spin" /> : <Save />}{isSaving ? 'Saving…' : 'Save availability'}</Button></div>
          <div className="mt-5 divide-y divide-slate-100">
            {DAYS.map(({ value, label }) => {
              const entry = visibleAvailability.find((item) => item.day === value) ?? { day: value, available: false };
              return <div key={value} className="grid gap-3 py-3 sm:grid-cols-[120px_90px_1fr] sm:items-center"><strong className="text-sm text-slate-700">{label}</strong><label className="flex items-center gap-2 text-sm text-slate-600"><Switch checked={entry.available} onCheckedChange={(checked) => updateDay(value, { available: checked, startTime: checked ? entry.startTime ?? '08:00' : undefined, endTime: checked ? entry.endTime ?? '17:00' : undefined })} />{entry.available ? 'Available' : 'Off'}</label><div className="flex items-center gap-2"><Input type="time" value={entry.startTime ?? ''} onChange={(event) => updateDay(value, { startTime: event.target.value })} disabled={!entry.available} aria-label={`${label} start time`} /><span className="text-slate-400">to</span><Input type="time" value={entry.endTime ?? ''} onChange={(event) => updateDay(value, { endTime: event.target.value })} disabled={!entry.available} aria-label={`${label} finish time`} /></div></div>;
            })}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm">
        <div><h2 className="flex items-center gap-2 text-lg font-semibold text-[#173c38]"><CalendarDays className="size-5 text-emerald-700" /> Upcoming jobs</h2><p className="mt-1 text-sm text-slate-500">Confirmed and pending bookings assigned to this cleaner.</p></div>
        {upcomingJobs.length ? <div className="mt-5 grid gap-3">{upcomingJobs.map((job) => <Link key={job._id} href={`/admin/bookings/${job._id}`} className="grid gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/30 md:grid-cols-[1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-[#173c38]">{job.serviceName}</strong><Badge variant="secondary">{job.status === 'CONFIRMED' ? 'Confirmed' : 'Pending payment'}</Badge><Badge variant="outline">{job.paymentStatus.replace('_', ' ').toLowerCase()}</Badge></div><p className="mt-1 text-sm text-slate-600">{job.customerName} · {job.reference ?? 'Booking'}</p><p className="mt-2 flex items-start gap-2 text-xs text-slate-500"><MapPin className="mt-0.5 size-3.5 shrink-0" />{job.address}</p></div><div className="flex items-center gap-2 text-sm font-medium text-emerald-800"><Clock3 className="size-4" />{formatDate(job.scheduledDate)} at {formatTime(job.scheduledTime)}</div></Link>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center"><CheckCircle2 className="mx-auto size-7 text-slate-300" /><p className="mt-3 font-medium text-slate-700">No upcoming jobs assigned</p><p className="mt-1 text-sm text-slate-500">Jobs will appear here when this cleaner is assigned to a booking.</p></div>}
      </section>
    </div>
  );
}
