'use client';

import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { ArrowLeft, Check, Clock3, DollarSign, LoaderCircle, MapPin, Navigation, Phone, Play, Send, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatJobDate } from './job-card';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(cents / 100);
}

export function CleanerJobDetail({ bookingId }: { bookingId: Id<'bookings'> }) {
  const { isAuthenticated } = useConvexAuth();
  const job = useQuery(api.cleanerPortal.getJob, isAuthenticated ? { bookingId } : 'skip');
  const respond = useMutation(api.cleanerPortal.respondToJob);
  const updateProgress = useMutation(api.cleanerPortal.updateJobProgress);
  const addNote = useMutation(api.cleanerPortal.addJobNote);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label); setMessage(undefined);
    try { await action(); setMessage('Updated successfully.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update this job.'); } finally { setBusy(undefined); }
  }
  if (job === undefined) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[#087f70]" /></div>;
  if (!job) return <p>Job not found.</p>;
  const address = [job.addressLine1, job.addressLine2, job.suburb, job.state, job.postcode].filter(Boolean).join(', ');
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const status = job.assignmentStatus;
  return <div className="space-y-5"><Link href="/cleaner/jobs" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500"><ArrowLeft className="size-4" /> Back to jobs</Link><header><p className="text-xs font-bold uppercase tracking-wider text-[#087f70]">{job.reference ?? 'Assigned job'}</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">{job.serviceName}</h1><p className="mt-1 text-sm text-slate-500">{job.customerName}</p></header>
    {message ? <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
    <section className="rounded-[26px] bg-[#173c38] p-5"><p className="flex items-center gap-3 text-sm" style={{ color: '#ffffff' }}><Clock3 className="size-5" style={{ color: '#ffffff' }} />{formatJobDate(job.scheduledDate)} at {job.scheduledTime}</p><p className="mt-4 flex items-start gap-3 text-sm leading-6" style={{ color: '#ffffff' }}><MapPin className="mt-0.5 size-5 shrink-0" style={{ color: '#ffffff' }} />{address}</p><a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-5 flex h-11 items-center justify-center gap-2 rounded-2xl bg-white font-bold text-[#173c38]"><Navigation className="size-4" /> Open directions</a></section>
    {status === 'OFFERED' ? <section className="grid grid-cols-2 gap-3"><Button variant="outline" className="h-12 rounded-2xl" disabled={Boolean(busy)} onClick={() => run('decline', () => respond({ bookingId, response: 'DECLINED' }))}>Decline</Button><Button className="h-12 rounded-2xl" disabled={Boolean(busy)} onClick={() => run('accept', () => respond({ bookingId, response: 'ACCEPTED' }))}>{busy === 'accept' ? <LoaderCircle className="animate-spin" /> : <Check />} Accept job</Button></section> : null}
    {status === 'ACCEPTED' ? <Button className="h-12 w-full rounded-2xl" disabled={Boolean(busy)} onClick={() => run('start', () => updateProgress({ bookingId, status: 'IN_PROGRESS' }))}>{busy === 'start' ? <LoaderCircle className="animate-spin" /> : <Play />} Start job</Button> : null}
    {status === 'IN_PROGRESS' ? <Button className="h-12 w-full rounded-2xl" disabled={Boolean(busy)} onClick={() => run('complete', () => updateProgress({ bookingId, status: 'COMPLETED' }))}>{busy === 'complete' ? <LoaderCircle className="animate-spin" /> : <Check />} Mark job complete</Button> : null}
    <section className="rounded-[26px] bg-white p-5 shadow-sm"><h2 className="font-bold">Customer details</h2><div className="mt-4 space-y-3 rounded-2xl bg-[#f5f7f6] p-4"><p className="flex items-center gap-3 text-sm"><UserRound className="size-4 text-[#087f70]" /><span><small className="block text-xs text-slate-400">Full name</small><strong>{job.customerName}</strong></span></p>{job.customerPhone ? <a href={`tel:${job.customerPhone}`} className="flex items-center gap-3 text-sm"><Phone className="size-4 text-[#087f70]" /><span><small className="block text-xs text-slate-400">Phone number</small><strong className="text-[#087f70]">{job.customerPhone}</strong></span></a> : <p className="flex items-center gap-3 text-sm text-slate-500"><Phone className="size-4" />No phone number available</p>}</div></section>
    <section className="rounded-[26px] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-bold"><DollarSign className="size-5 text-[#087f70]" />Payment snapshot</p><p className="mt-1 text-xs text-slate-500">Customer payment status for this job</p></div><span className={job.paymentSnapshot.balanceDueCents === 0 ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700' : job.paymentSnapshot.amountPaidCents > 0 ? 'rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700' : 'rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700'}>{job.paymentSnapshot.balanceDueCents === 0 ? 'Paid' : job.paymentSnapshot.amountPaidCents > 0 ? 'Part paid' : 'Unpaid'}</span></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#f5f7f6] p-3"><small className="text-xs text-slate-400">Job total</small><strong className="mt-1 block text-lg">{formatCurrency(job.paymentSnapshot.totalCents)}</strong></div><div className="rounded-2xl bg-emerald-50 p-3"><small className="text-xs text-emerald-700">Amount paid</small><strong className="mt-1 block text-lg text-emerald-800">{formatCurrency(job.paymentSnapshot.amountPaidCents)}</strong></div></div><div className={job.paymentSnapshot.balanceDueCents > 0 ? 'mt-3 flex items-center justify-between rounded-2xl bg-amber-50 p-4' : 'mt-3 flex items-center justify-between rounded-2xl bg-emerald-50 p-4'}><span className="text-sm font-semibold">Customer still owes</span><strong className={job.paymentSnapshot.balanceDueCents > 0 ? 'text-xl text-amber-800' : 'text-xl text-emerald-800'}>{formatCurrency(job.paymentSnapshot.balanceDueCents)}</strong></div></section>
    <section className="rounded-[26px] bg-white p-5 shadow-sm"><h2 className="font-bold">Job details</h2>{job.notes ? <div className="mt-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Admin instructions</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{job.notes}</p></div> : null}<div className="mt-4 space-y-2">{job.serviceAnswers.map((answer) => <div key={answer.key} className="flex justify-between gap-4 border-t border-slate-100 pt-2 text-sm"><span className="text-slate-500">{answer.label}</span><strong className="text-right">{Array.isArray(answer.value) ? answer.value.join(', ') : String(answer.value)}</strong></div>)}</div></section>
    <section className="rounded-[26px] bg-white p-5 shadow-sm"><h2 className="font-bold">Job notes</h2><p className="mt-1 text-xs text-slate-500">Add progress or handover information for the admin team.</p><Textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-4 min-h-24 rounded-2xl" placeholder="What should the team know?" /><Button className="mt-3 w-full rounded-2xl" disabled={!note.trim() || Boolean(busy)} onClick={() => run('note', async () => { await addNote({ bookingId, body: note }); setNote(''); })}>{busy === 'note' ? <LoaderCircle className="animate-spin" /> : <Send />} Add note</Button>{job.jobNotes.length ? <div className="mt-4 space-y-3">{job.jobNotes.map((item) => <div key={item._id} className="rounded-2xl bg-[#f5f7f6] p-3"><p className="text-sm leading-6">{item.body}</p><p className="mt-2 text-[11px] text-slate-400">{new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(item.createdAt)}</p></div>)}</div> : null}</section>
  </div>;
}
