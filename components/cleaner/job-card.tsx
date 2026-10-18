import { Clock3, MapPin } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export type CleanerJob = {
  bookingId: string;
  reference?: string;
  serviceName: string;
  customerName: string;
  scheduledDate: string;
  scheduledTime: string;
  addressLine1: string;
  suburb: string;
  assignmentStatus: string;
};

export function formatJobDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

export function CleanerJobCard({ job }: { job: CleanerJob }) {
  return <Link href={`/cleaner/jobs/${job.bookingId}`} className="block rounded-[24px] bg-white p-4 shadow-[0_8px_28px_rgba(23,60,56,0.06)] active:scale-[0.99]">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#087f70]">{job.reference ?? 'Assigned job'}</p><h3 className="mt-1 font-bold">{job.serviceName}</h3><p className="mt-1 text-sm text-slate-500">{job.customerName}</p></div><Badge className="rounded-full bg-emerald-50 text-[#087f70] hover:bg-emerald-50">{job.assignmentStatus.replace('_', ' ').toLowerCase()}</Badge></div>
    <div className="mt-4 grid gap-2 rounded-2xl bg-[#f5f7f6] p-3 text-xs text-slate-600"><p className="flex items-center gap-2"><Clock3 className="size-4 text-[#087f70]" />{formatJobDate(job.scheduledDate)} · {job.scheduledTime}</p><p className="flex items-center gap-2"><MapPin className="size-4 text-[#087f70]" />{job.addressLine1}, {job.suburb}</p></div>
  </Link>;
}
