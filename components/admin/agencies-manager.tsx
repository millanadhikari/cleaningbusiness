'use client';

import { useMutation, useQuery } from 'convex/react';
import { Building2, ChevronRight, LoaderCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useMemo, useState } from 'react';
import { api } from '@/convex/_generated/api';
import {
  AdminEmpty,
  AdminListHeader,
  AdminListPage,
  AdminListPagination,
  AdminListToolbar,
  AdminLoading,
  AdminTableCard,
  FilterSelect,
  LIST_PAGE_SIZE,
} from './admin-list-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/^.*Uncaught Error:\s*/, '') : 'Unable to save the agency.';
}

export function AgenciesManager() {
  const agencies = useQuery(api.agencies.list);
  const createAgency = useMutation(api.agencies.create);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    return (agencies ?? []).filter((agency) =>
      (status === 'ALL' || agency.status === status) &&
      (!value || [agency.name, agency.branchName, agency.phone, agency.address].filter(Boolean).some((field) => String(field).toLowerCase().includes(value))),
    );
  }, [agencies, search, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * LIST_PAGE_SIZE, currentPage * LIST_PAGE_SIZE);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const optional = (name: string) => String(data.get(name) ?? '').trim() || undefined;
    setSaving(true);
    setFeedback(null);
    try {
      await createAgency({
        name: String(data.get('name') ?? ''),
        branchName: optional('branchName'),
        phone: optional('phone'),
        address: optional('address'),
        notes: optional('notes'),
      });
      form.reset();
      setOpen(false);
      setFeedback('Agency created. Open it to add portal logins.');
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <AdminListPage>
    <AdminListHeader icon={Building2} label="Partners" title="Real estate agencies" description="Create agencies, issue team logins, and review their quotes and jobs." count={agencies?.length} action={<Button onClick={() => setOpen(true)}><Plus /> Add agency</Button>} />
    {feedback ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{feedback}</p> : null}
    <AdminListToolbar search={search} onSearch={(value) => { setSearch(value); setPage(1); }} placeholder="Search agency, branch, phone or address">
      <FilterSelect label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></FilterSelect>
    </AdminListToolbar>
    {agencies === undefined ? <AdminLoading label="Loading agencies…" /> : visible.length ? <>
      <AdminTableCard><Table><TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Portal accounts</TableHead><TableHead>Quotes</TableHead><TableHead>Upcoming jobs</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>
        {visible.map((agency) => <TableRow key={agency._id}>
          <TableCell><div><strong className="text-slate-900">{agency.name}</strong><p className="text-xs text-slate-500">{agency.branchName || agency.address || 'No branch details'}</p></div></TableCell>
          <TableCell>{agency.accountCount}</TableCell><TableCell>{agency.quoteCount}</TableCell><TableCell>{agency.upcomingJobCount}</TableCell>
          <TableCell><Badge variant={agency.status === 'ACTIVE' ? 'default' : 'secondary'}>{agency.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge></TableCell>
          <TableCell className="text-right"><Button asChild variant="ghost" size="icon"><Link href={`/admin/agencies/${agency._id}`} aria-label={`Open ${agency.name}`}><ChevronRight /></Link></Button></TableCell>
        </TableRow>)}
      </TableBody></Table></AdminTableCard>
      <AdminListPagination page={currentPage} total={filtered.length} onPage={setPage} />
    </> : <AdminEmpty title="No agencies found" description="Create the first real estate agency to issue portal credentials." />}

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl"><form onSubmit={submit}><DialogHeader><DialogTitle>Create real estate agency</DialogTitle><DialogDescription>No email address is required. Team logins are added after the agency is created.</DialogDescription></DialogHeader><div className="grid gap-4 py-5 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="agency-name">Agency name *</Label><Input id="agency-name" name="name" required autoFocus /></div>
      <div className="space-y-2"><Label htmlFor="agency-branch">Branch</Label><Input id="agency-branch" name="branchName" /></div>
      <div className="space-y-2"><Label htmlFor="agency-phone">Phone</Label><Input id="agency-phone" name="phone" type="tel" /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="agency-address">Business address</Label><Input id="agency-address" name="address" /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="agency-notes">Internal notes</Label><Textarea id="agency-notes" name="notes" rows={4} /></div>
    </div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" /> : <Plus />}{saving ? 'Creating…' : 'Create agency'}</Button></DialogFooter></form></DialogContent></Dialog>
  </AdminListPage>;
}
