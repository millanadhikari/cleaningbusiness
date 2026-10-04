'use client';

import { useAction, useMutation, useQuery } from 'convex/react';
import { ArrowLeft, Building2, Copy, KeyRound, LoaderCircle, Plus, Power, Save } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { AdminListHeader, AdminListPage, AdminLoading } from './admin-list-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Credentials = { username: string; temporaryPassword: string };

function readableError(error: unknown) {
  return error instanceof Error ? error.message.replace(/^.*Uncaught Error:\s*/, '') : 'The request could not be completed.';
}

function money(cents: number | undefined) {
  if (cents === undefined) return 'Pending';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);
}

export function AgencyDetail({ agencyId }: { agencyId: Id<'agencies'> }) {
  const data = useQuery(api.agencies.get, { agencyId });
  const updateAgency = useMutation(api.agencies.update);
  const createAccount = useAction(api.agencies.createAccount);
  const resetPassword = useAction(api.agencies.resetPassword);
  const setAccountStatus = useMutation(api.agencies.setAccountStatus);
  const [accountOpen, setAccountOpen] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  if (data === undefined) return <AdminLoading label="Loading agency…" />;
  if (!data) return <div className="rounded-2xl border bg-white p-8"><h2 className="text-xl font-bold">Agency not found</h2><Button asChild className="mt-4"><Link href="/admin/agencies">Back to agencies</Link></Button></div>;

  async function saveAgency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const optional = (name: string) => String(values.get(name) ?? '').trim() || undefined;
    setBusy(true); setFeedback(null);
    try {
      await updateAgency({ agencyId, name: String(values.get('name') ?? ''), branchName: optional('branchName'), phone: optional('phone'), address: optional('address'), notes: optional('notes'), status: String(values.get('status')) as 'ACTIVE' | 'INACTIVE' });
      setFeedback({ kind: 'success', text: 'Agency details updated.' });
    } catch (error) { setFeedback({ kind: 'error', text: readableError(error) }); } finally { setBusy(false); }
  }

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setFeedback(null);
    try {
      const result = await createAccount({ agencyId, username: String(values.get('username') ?? ''), teamName: String(values.get('teamName') ?? '') });
      form.reset(); setAccountOpen(false); setCredentials(result);
      setFeedback({ kind: 'success', text: 'Portal account created. Copy the credentials now.' });
    } catch (error) { setFeedback({ kind: 'error', text: readableError(error) }); } finally { setBusy(false); }
  }

  async function reset(accountId: Id<'agencyAccounts'>) {
    setBusy(true); setFeedback(null);
    try { setCredentials(await resetPassword({ accountId })); setFeedback({ kind: 'success', text: 'Password reset. All other sessions were signed out.' }); }
    catch (error) { setFeedback({ kind: 'error', text: readableError(error) }); }
    finally { setBusy(false); }
  }

  return <AdminListPage>
    <AdminListHeader icon={Building2} label="Agency partner" title={data.agency.name} description={data.agency.branchName || 'Manage portal access, quotes and jobs.'} action={<Button asChild variant="outline"><Link href="/admin/agencies"><ArrowLeft /> Agencies</Link></Button>} />
    {feedback ? <p role="status" className={feedback.kind === 'success' ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800' : 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800'}>{feedback.text}</p> : null}
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card><CardHeader><CardTitle>Agency profile</CardTitle><CardDescription>Operational details only. No agency email is required.</CardDescription></CardHeader><CardContent><form onSubmit={saveAgency} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="name">Agency name</Label><Input id="name" name="name" defaultValue={data.agency.name} required /></div>
        <div className="space-y-2"><Label htmlFor="branchName">Branch</Label><Input id="branchName" name="branchName" defaultValue={data.agency.branchName} /></div>
        <div className="space-y-2"><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" defaultValue={data.agency.phone} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="address">Address</Label><Input id="address" name="address" defaultValue={data.agency.address} /></div>
        <div className="space-y-2"><Label htmlFor="status">Status</Label><NativeSelect id="status" name="status" defaultValue={data.agency.status}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></NativeSelect></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="notes">Internal notes</Label><Textarea id="notes" name="notes" defaultValue={data.agency.notes} rows={4} /></div>
        <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />} Save details</Button></div>
      </form></CardContent></Card>

      <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Portal accounts</CardTitle><CardDescription>Issue separate usernames for each agency team.</CardDescription></div><Button size="sm" onClick={() => setAccountOpen(true)} disabled={data.agency.status !== 'ACTIVE'}><Plus /> Add login</Button></CardHeader><CardContent>
        {data.accounts.length ? <div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Team</TableHead><TableHead>Username</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{data.accounts.map((account) => <TableRow key={account._id}>
          <TableCell><strong>{account.teamName}</strong>{account.mustChangePassword ? <p className="text-xs text-amber-700">Password change required</p> : null}</TableCell><TableCell className="font-mono text-xs">{account.username}</TableCell><TableCell><Badge variant={account.status === 'ACTIVE' ? 'default' : 'secondary'}>{account.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge></TableCell><TableCell><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => reset(account._id)}><KeyRound /> Reset</Button><Button type="button" variant="ghost" size="icon" title={account.status === 'ACTIVE' ? 'Deactivate account' : 'Reactivate account'} onClick={() => setAccountStatus({ accountId: account._id, status: account.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}><Power /></Button></div></TableCell>
        </TableRow>)}</TableBody></Table></div> : <div className="rounded-xl border border-dashed p-8 text-center"><KeyRound className="mx-auto text-slate-300" /><p className="mt-3 font-semibold">No portal logins yet</p><p className="mt-1 text-sm text-slate-500">Add a team login to give this agency access.</p></div>}
      </CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Agency quotes</CardTitle><CardDescription>Requests submitted by all team accounts.</CardDescription></CardHeader><CardContent>{data.quotes.length ? <div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Customer</TableHead><TableHead>Service</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{data.quotes.map((quote) => <TableRow key={quote._id}><TableCell><Link className="font-semibold text-[#007c70]" href={`/admin/quotes/${quote._id}`}>{quote.reference || 'Quote'}</Link></TableCell><TableCell>{quote.customer ? [quote.customer.firstName, quote.customer.lastName].filter(Boolean).join(' ') : 'Unknown'}</TableCell><TableCell>{quote.serviceType}</TableCell><TableCell>{money(quote.estimatedTotalCents)}</TableCell><TableCell><Badge variant="outline">{quote.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div> : <p className="rounded-xl border border-dashed p-7 text-center text-sm text-slate-500">No agency quote requests yet.</p>}</CardContent></Card>

    <Card><CardHeader><CardTitle>Agency jobs</CardTitle><CardDescription>Bookings converted from this agency’s accepted quotes.</CardDescription></CardHeader><CardContent>{data.bookings.length ? <div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Property</TableHead><TableHead>Schedule</TableHead><TableHead>Payment</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{data.bookings.map((booking) => <TableRow key={booking._id}><TableCell><Link className="font-semibold text-[#007c70]" href={`/admin/bookings/${booking._id}`}>{booking.reference || 'Booking'}</Link></TableCell><TableCell>{booking.addressLine1}, {booking.suburb}</TableCell><TableCell>{booking.scheduledDate} · {booking.scheduledTime}</TableCell><TableCell>{booking.paymentStatus.replaceAll('_', ' ')}</TableCell><TableCell><Badge variant="outline">{booking.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div> : <p className="rounded-xl border border-dashed p-7 text-center text-sm text-slate-500">No agency jobs yet.</p>}</CardContent></Card>

    <Dialog open={accountOpen} onOpenChange={setAccountOpen}><DialogContent><form onSubmit={addAccount}><DialogHeader><DialogTitle>Create team login</DialogTitle><DialogDescription>The account will use a username and temporary password only.</DialogDescription></DialogHeader><div className="space-y-4 py-5"><div className="space-y-2"><Label htmlFor="teamName">Team name *</Label><Input id="teamName" name="teamName" placeholder="Property Management" required /></div><div className="space-y-2"><Label htmlFor="username">Username *</Label><Input id="username" name="username" placeholder="agency_branch_pm" autoCapitalize="none" autoCorrect="off" required /><p className="text-xs text-slate-500">4–32 lowercase letters, numbers, hyphens or underscores.</p></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setAccountOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Create login</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={Boolean(credentials)} onOpenChange={(open) => { if (!open) setCredentials(null); }}><DialogContent><DialogHeader><DialogTitle>Copy credentials now</DialogTitle><DialogDescription>The temporary password will not be shown again. Send it to the agency securely.</DialogDescription></DialogHeader>{credentials ? <div className="space-y-3 py-4"><Credential label="Username" value={credentials.username} /><Credential label="Temporary password" value={credentials.temporaryPassword} /></div> : null}<DialogFooter><Button onClick={() => setCredentials(null)}>I have saved the credentials</Button></DialogFooter></DialogContent></Dialog>
  </AdminListPage>;
}

function Credential({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="rounded-xl border bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">{label}</p><div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-sm font-bold text-slate-900">{value}</code><Button type="button" size="icon" variant="outline" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); }}><Copy /></Button></div>{copied ? <p className="mt-1 text-xs text-emerald-700">Copied</p> : null}</div>;
}
