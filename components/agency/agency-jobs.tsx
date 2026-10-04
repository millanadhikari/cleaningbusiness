'use client';

import { useQuery } from 'convex/react';
import { BriefcaseBusiness, CalendarDays, LoaderCircle, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api } from '@/convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/native-select';

function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

export function AgencyJobs() {
  const jobs = useQuery(api.agencyPortal.listJobs);
  const [filter, setFilter] = useState('UPCOMING');
  const visible = useMemo(() => (jobs ?? []).filter((job) => filter === 'ALL' || (filter === 'UPCOMING' ? job.status !== 'CANCELLED' && job.scheduledDate >= today() : filter === 'COMPLETED' ? job.status !== 'CANCELLED' && job.scheduledDate < today() : job.status === filter)), [jobs, filter]);
  if (!jobs) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[#087f70]" /></div>;
  return <div className="space-y-5"><header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-[#087f70]">Schedule</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Agency jobs</h1><p className="mt-2 text-sm text-slate-500">Upcoming, pending and completed cleaning jobs.</p></div><NativeSelect className="w-full sm:w-52" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="UPCOMING">Upcoming</option><option value="PENDING_PAYMENT">Pending payment</option><option value="CONFIRMED">Confirmed</option><option value="COMPLETED">Past jobs</option><option value="CANCELLED">Cancelled</option><option value="ALL">All jobs</option></NativeSelect></header>{visible.length ? <div className="grid gap-3">{visible.map((job) => <Link key={job._id} href={`/agency/jobs/${job._id}`} className="rounded-[20px] border border-[#dce8e3] bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-bold">{job.service?.name || 'Cleaning service'} <span className="font-normal text-slate-400">· {job.reference}</span></p><p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><MapPin className="size-4 text-[#087f70]" />{job.addressLine1}, {job.suburb}</p><p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><CalendarDays className="size-4 text-[#087f70]" />{job.scheduledDate} at {job.scheduledTime}</p></div><div className="flex flex-col items-end gap-2"><Badge variant="outline">{job.status.replaceAll('_', ' ')}</Badge><span className="text-xs font-semibold text-slate-500">{job.paymentStatus.replaceAll('_', ' ')}</span></div></div></Link>)}</div> : <div className="rounded-[20px] border border-dashed bg-white p-10 text-center"><BriefcaseBusiness className="mx-auto text-slate-300" /><p className="mt-3 font-semibold">No jobs in this view</p></div>}</div>;
}
