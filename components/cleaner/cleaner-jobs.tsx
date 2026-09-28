'use client';

import { useConvexAuth, useQuery } from 'convex/react';
import { ClipboardCheck, LoaderCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/convex/_generated/api';
import { CleanerJobCard } from './job-card';
import { cn } from '@/lib/utils';

type Filter = 'UPCOMING' | 'OFFERS' | 'COMPLETED';

export function CleanerJobs() {
  const { isAuthenticated } = useConvexAuth();
  const jobs = useQuery(api.cleanerPortal.listJobs, isAuthenticated ? {} : 'skip');
  const [filter, setFilter] = useState<Filter>('UPCOMING');
  const visible = useMemo(() => {
    if (!jobs) return [];
    const today = new Date().toISOString().slice(0, 10);
    if (filter === 'OFFERS') return jobs.filter((job) => job.assignmentStatus === 'OFFERED');
    if (filter === 'COMPLETED') return jobs.filter((job) => job.assignmentStatus === 'COMPLETED');
    return jobs.filter((job) => job.scheduledDate >= today && !['DECLINED', 'COMPLETED'].includes(job.assignmentStatus));
  }, [jobs, filter]);
  return <div className="space-y-5"><header><p className="text-sm text-slate-500">Your schedule</p><h1 className="mt-1 text-3xl font-extrabold tracking-[-0.04em]">Jobs</h1></header><div className="grid grid-cols-3 rounded-2xl bg-slate-200/70 p-1">{(['UPCOMING', 'OFFERS', 'COMPLETED'] as Filter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cn('h-10 rounded-xl text-xs font-bold transition', filter === item ? 'bg-white text-[#173c38] shadow-sm' : 'text-slate-500')}>{item === 'UPCOMING' ? 'Upcoming' : item === 'OFFERS' ? 'Offers' : 'Completed'}</button>)}</div>{jobs === undefined ? <div className="grid min-h-52 place-items-center"><LoaderCircle className="animate-spin text-[#087f70]" /></div> : visible.length ? <div className="grid gap-3">{visible.map((job) => <CleanerJobCard key={job.bookingId} job={job} />)}</div> : <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-10 text-center"><ClipboardCheck className="mx-auto size-8 text-slate-300" /><p className="mt-3 font-semibold">Nothing here yet</p><p className="mt-1 text-sm text-slate-500">Jobs matching this section will appear here.</p></div>}</div>;
}
