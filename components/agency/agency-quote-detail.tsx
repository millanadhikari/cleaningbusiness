'use client';

import { useMutation, useQuery } from 'convex/react';
import { ArrowLeft, CalendarCheck, LoaderCircle, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function money(cents: number | undefined) { return cents === undefined ? 'Pending review' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100); }
export function AgencyQuoteDetail({ quoteRequestId }: { quoteRequestId: Id<'quoteRequests'> }) {
  const quote = useQuery(api.agencyPortal.getQuote, { quoteRequestId });
  const bookQuote = useMutation(api.agencyPortal.bookExistingQuote);
  const router = useRouter();
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (quote === undefined) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[#087f70]" /></div>;
  if (!quote) return <p className="rounded-xl border bg-white p-8">Quote not found.</p>;
  const canBook = !quote.convertedBookingId && quote.estimateType === 'ESTIMATE' && quote.estimatedTotalCents !== undefined && Boolean(quote.preferredDate && quote.preferredTime) && quote.status !== 'DECLINED' && quote.status !== 'EXPIRED';
  async function confirmBooking() {
    setBooking(true); setError(null);
    try { const bookingId = await bookQuote({ quoteRequestId }); router.push(`/agency/jobs/${bookingId}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message.replace(/^.*Uncaught Error:\s*/, '') : 'Unable to book this quote.'); }
    finally { setBooking(false); }
  }
  return <div className="space-y-5"><header className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#087f70]">{quote.reference || 'Quote request'}</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">{quote.serviceType}</h1><div className="mt-3 flex gap-2"><Badge>{quote.status}</Badge><Badge variant="outline">{money(quote.estimatedTotalCents)}</Badge></div></div><Button asChild variant="outline" size="sm"><Link href="/agency/quotes"><ArrowLeft /> Quotes</Link></Button></header>{quote.convertedBookingId ? <div className="flex flex-col justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center"><div><p className="font-bold text-emerald-900">This quote is booked</p><p className="text-sm text-emerald-700">The job is confirmed and will be invoiced later.</p></div><Button asChild><Link href={`/agency/jobs/${quote.convertedBookingId}`}>View job</Link></Button></div> : canBook ? <div className="flex flex-col justify-between gap-3 rounded-2xl bg-[#173c38] p-5 sm:flex-row sm:items-center"><div><p className="font-bold" style={{ color: '#ffffff' }}>Ready to schedule?</p><p className="text-sm" style={{ color: '#eef7f4' }}>Confirm this job now. No payment is required; your agency will be invoiced later.</p></div><Button type="button" variant="secondary" disabled={booking} onClick={confirmBooking}>{booking ? <LoaderCircle className="animate-spin" /> : <CalendarCheck />}{booking ? 'Booking…' : 'Book job'}</Button></div> : null}{error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}<div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle>Property</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="flex gap-2"><MapPin className="size-4 text-[#087f70]" />{[quote.addressLine1, quote.addressLine2, quote.suburb, quote.state, quote.postcode].filter(Boolean).join(', ')}</p><Row label="Preferred date" value={quote.preferredDate || 'To be arranged'} /><Row label="Preferred time" value={quote.preferredTime || 'To be arranged'} /><Row label="Property type" value={quote.propertyType || 'Not specified'} /></CardContent></Card><Card><CardHeader><CardTitle>Property contact</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><Row label="Name" value={quote.customer ? [quote.customer.firstName, quote.customer.lastName].filter(Boolean).join(' ') : 'Unknown'} /><Row label="Phone" value={quote.customer?.phone || 'Not provided'} /><Row label="Email" value={quote.customer?.email || 'Not provided'} /></CardContent></Card></div>{quote.submittedAnswers?.length ? <Card><CardHeader><CardTitle>Service details</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{quote.submittedAnswers.map((answer) => <Row key={answer.key} label={answer.label} value={Array.isArray(answer.value) ? answer.value.join(', ') : typeof answer.value === 'boolean' ? answer.value ? 'Yes' : 'No' : String(answer.value)} />)}</CardContent></Card> : null}{quote.notes ? <Card><CardHeader><CardTitle>Notes</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm text-slate-600">{quote.notes}</p></CardContent></Card> : null}</div>;
}
function Row({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-medium text-slate-700">{value}</p></div>; }
