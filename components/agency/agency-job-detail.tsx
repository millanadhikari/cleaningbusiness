'use client';

import { useQuery } from 'convex/react';
import { ArrowLeft, CalendarDays, LoaderCircle, MapPin, Phone } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function money(cents: number) { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100); }
export function AgencyJobDetail({ bookingId }: { bookingId: Id<'bookings'> }) {
  const job = useQuery(api.agencyPortal.getJob, { bookingId });
  if (job === undefined) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[#087f70]" /></div>;
  if (!job) return <p className="rounded-xl border bg-white p-8">Job not found.</p>;
  return <div className="space-y-5"><header className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#087f70]">{job.reference || 'Booking'}</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">{job.service?.name || 'Cleaning job'}</h1><div className="mt-3 flex flex-wrap gap-2"><Badge>{job.status.replaceAll('_', ' ')}</Badge><Badge variant="outline">{job.paymentStatus.replaceAll('_', ' ')}</Badge></div></div><Button asChild variant="outline" size="sm"><Link href="/agency/jobs"><ArrowLeft /> Jobs</Link></Button></header><div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle>Schedule and property</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><p className="flex gap-2"><CalendarDays className="size-4 text-[#087f70]" />{job.scheduledDate} at {job.scheduledTime}</p><p className="flex gap-2"><MapPin className="size-4 text-[#087f70]" />{[job.addressLine1, job.addressLine2, job.suburb, job.state, job.postcode].filter(Boolean).join(', ')}</p>{job.notes ? <p className="rounded-xl bg-slate-50 p-3 text-slate-600">{job.notes}</p> : null}</CardContent></Card><Card><CardHeader><CardTitle>Property contact</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><Row label="Name" value={job.customer ? [job.customer.firstName, job.customer.lastName].filter(Boolean).join(' ') : 'Unknown'} /><p className="flex items-center gap-2 font-medium"><Phone className="size-4 text-[#087f70]" />{job.customer?.phone || 'Not provided'}</p></CardContent></Card></div><Card><CardHeader><CardTitle>Payment snapshot</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><Money label="Job total" value={job.paymentSnapshot.totalCents} /><Money label="Paid" value={job.paymentSnapshot.amountPaidCents} /><Money label="Balance due" value={job.paymentSnapshot.balanceDueCents} emphasis /></CardContent></Card>{job.serviceAnswers.length ? <Card><CardHeader><CardTitle>Service details</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{job.serviceAnswers.map((answer) => <Row key={answer.key} label={answer.label} value={Array.isArray(answer.value) ? answer.value.join(', ') : typeof answer.value === 'boolean' ? answer.value ? 'Yes' : 'No' : String(answer.value)} />)}</CardContent></Card> : null}</div>;
}
function Row({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-medium text-slate-700">{value}</p></div>; }
function Money({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) { return <div className={emphasis ? 'rounded-xl bg-emerald-50 p-4' : 'rounded-xl bg-slate-50 p-4'}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{money(value)}</p></div>; }
