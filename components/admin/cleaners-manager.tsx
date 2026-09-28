'use client';

import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import {
  CalendarDays,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  UserRoundCheck,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useMemo, useState } from 'react';
import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';
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
  PersonCell,
} from './admin-list-layout';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Cleaner = Doc<'cleaners'>;
type Feedback = { kind: 'success' | 'error'; text: string } | null;

function fullName(cleaner: Cleaner) {
  return `${cleaner.firstName} ${cleaner.lastName}`;
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error
    ? error.message.replace(/^.*Uncaught Error:\s*/, '')
    : fallback;
}

export function CleanersManager() {
  const { isAuthenticated } = useConvexAuth();
  const cleaners = useQuery(api.cleaners.list, isAuthenticated ? {} : 'skip');
  const createCleaner = useMutation(api.cleaners.create);
  const updateCleaner = useMutation(api.cleaners.update);
  const removeCleaner = useMutation(api.cleaners.remove);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCleaner, setEditingCleaner] = useState<Cleaner | null>(null);
  const [deletingCleaner, setDeletingCleaner] = useState<Cleaner | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const filteredCleaners = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!cleaners) return [];
    return cleaners.filter((cleaner) =>
      (status === 'ALL' || cleaner.status === status) &&
      (!query ||
      [
        cleaner.firstName,
        cleaner.lastName,
        cleaner.email,
        cleaner.phone,
        cleaner.specialty,
        cleaner.engagementType,
        cleaner.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))),
    );
  }, [cleaners, search, status]);

  const pageCount = Math.max(1, Math.ceil(filteredCleaners.length / LIST_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleCleaners = filteredCleaners.slice(
    (safePage - 1) * LIST_PAGE_SIZE,
    safePage * LIST_PAGE_SIZE,
  );

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateStatus(value: string) {
    setStatus(value as typeof status);
    setPage(1);
  }

  function openCreate() {
    setEditingCleaner(null);
    setFeedback(null);
    setDialogOpen(true);
  }

  function openEdit(cleaner: Cleaner) {
    setEditingCleaner(cleaner);
    setFeedback(null);
    setDialogOpen(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const optional = (name: string) =>
      String(data.get(name) ?? '').trim() || undefined;
    const common = {
      firstName: String(data.get('firstName') ?? ''),
      lastName: String(data.get('lastName') ?? ''),
      email: optional('email'),
      phone: String(data.get('phone') ?? ''),
      specialty: optional('specialty'),
      engagementType: String(data.get('engagementType')) as
        | 'EMPLOYEE'
        | 'CONTRACTOR',
      notes: optional('notes'),
    };
    setIsSaving(true);
    setFeedback(null);
    try {
      if (editingCleaner) {
        await updateCleaner({
          cleanerId: editingCleaner._id,
          ...common,
          status: String(data.get('status')) as 'ACTIVE' | 'INACTIVE',
        });
        setFeedback({ kind: 'success', text: 'Cleaner details updated.' });
      } else {
        await createCleaner(common);
        setFeedback({ kind: 'success', text: 'Cleaner added to the team.' });
      }
      setDialogOpen(false);
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: readableError(error, 'Unable to save the cleaner.'),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingCleaner) return;
    setIsDeleting(true);
    setFeedback(null);
    try {
      const result = await removeCleaner({ cleanerId: deletingCleaner._id });
      const assignmentCopy = result.removedAssignments
        ? ` ${result.removedAssignments} booking assignment${result.removedAssignments === 1 ? '' : 's'} also removed.`
        : '';
      setFeedback({
        kind: 'success',
        text: `${fullName(deletingCleaner)} was deleted.${assignmentCopy}`,
      });
      setDeletingCleaner(null);
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: readableError(error, 'Unable to delete the cleaner.'),
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AdminListPage>
      <AdminListHeader
        icon={UserRoundCheck}
        label="People"
        title="Cleaning team"
        description="Manage cleaner contact details and availability for booking assignments."
        count={cleaners?.length}
        action={
          <Button type="button" onClick={openCreate}>
            <Plus /> Add cleaner
          </Button>
        }
      />

      {feedback ? (
        <p
          role="status"
          className={
            feedback.kind === 'success'
              ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800'
              : 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800'
          }
        >
          {feedback.text}
        </p>
      ) : null}

      <AdminListToolbar
        search={search}
        onSearch={updateSearch}
        placeholder="Search name, email, phone or specialty"
      >
        <FilterSelect label="Status" value={status} onChange={updateStatus}>
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </FilterSelect>
      </AdminListToolbar>

      {cleaners === undefined ? (
        <AdminLoading label="Loading cleaning team…" />
      ) : visibleCleaners.length ? (
        <AdminTableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cleaner</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Engagement</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleCleaners.map((cleaner) => {
                const availableDays = cleaner.availability?.filter((entry) => entry.available).length ?? 0;
                return (
                  <TableRow key={cleaner._id}>
                    <TableCell>
                      <Link href={`/admin/cleaners/${cleaner._id}`} className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                        <PersonCell name={fullName(cleaner)} detail={cleaner.specialty || 'General cleaning'} />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-56">
                        <p className="truncate text-slate-700">{cleaner.email || 'No email'}</p>
                        <p className="mt-1 text-xs text-slate-500">{cleaner.phone}</p>
                      </div>
                    </TableCell>
                    <TableCell>{cleaner.engagementType === 'EMPLOYEE' ? 'Employee' : 'Contractor'}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <CalendarDays className="size-4 text-emerald-700" />
                        {cleaner.availability ? `${availableDays} days` : 'Not set'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cleaner.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}>
                        {cleaner.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(cleaner)} aria-label={`Edit ${fullName(cleaner)}`}><Pencil /></Button>
                        <Button type="button" variant="ghost" size="icon" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setDeletingCleaner(cleaner)} aria-label={`Delete ${fullName(cleaner)}`}><Trash2 /></Button>
                        <Button asChild variant="ghost" size="icon"><Link href={`/admin/cleaners/${cleaner._id}`} aria-label={`Open ${fullName(cleaner)}`}><ChevronRight /></Link></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <AdminListPagination page={safePage} total={filteredCleaners.length} onPage={setPage} />
        </AdminTableCard>
      ) : (
        <AdminEmpty
          title={search || status !== 'ALL' ? 'No cleaners match these filters' : 'No cleaners added yet'}
          description={search || status !== 'ALL' ? 'Try another search or status.' : 'Add your first cleaner to begin assigning bookings.'}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCleaner ? 'Edit cleaner' : 'Add cleaner'}
            </DialogTitle>
            <DialogDescription>
              Store the contact and work details needed for scheduling. Login access will be added in phase two.
            </DialogDescription>
          </DialogHeader>
          <form key={editingCleaner?._id ?? 'new'} onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cleaner-first-name">First name</Label>
              <Input id="cleaner-first-name" name="firstName" defaultValue={editingCleaner?.firstName} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleaner-last-name">Last name</Label>
              <Input id="cleaner-last-name" name="lastName" defaultValue={editingCleaner?.lastName} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleaner-email">Email</Label>
              <Input id="cleaner-email" name="email" type="email" defaultValue={editingCleaner?.email} placeholder="cleaner@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleaner-phone">Phone</Label>
              <Input id="cleaner-phone" name="phone" type="tel" defaultValue={editingCleaner?.phone} placeholder="0400 000 000" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleaner-specialty">Specialty</Label>
              <Input id="cleaner-specialty" name="specialty" defaultValue={editingCleaner?.specialty} placeholder="End of lease cleaning" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleaner-engagement">Engagement</Label>
              <NativeSelect id="cleaner-engagement" name="engagementType" defaultValue={editingCleaner?.engagementType ?? 'EMPLOYEE'}>
                <option value="EMPLOYEE">Employee</option>
                <option value="CONTRACTOR">Contractor</option>
              </NativeSelect>
            </div>
            {editingCleaner ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cleaner-status">Status</Label>
                <NativeSelect id="cleaner-status" name="status" defaultValue={editingCleaner.status}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </NativeSelect>
              </div>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cleaner-notes">Internal notes</Label>
              <Textarea id="cleaner-notes" name="notes" defaultValue={editingCleaner?.notes} rows={4} placeholder="Skills, service areas or scheduling notes" />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <LoaderCircle className="animate-spin" /> : <UserRoundCheck />}
                {isSaving ? 'Saving…' : editingCleaner ? 'Save changes' : 'Add cleaner'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletingCleaner)} onOpenChange={(open) => !open && setDeletingCleaner(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cleaner?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingCleaner
                ? `${fullName(deletingCleaner)} will be removed from the team and from any assigned bookings. This cannot be undone.`
                : 'This cleaner will be permanently deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-700 text-white hover:bg-red-800"
            >
              {isDeleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
              {isDeleting ? 'Deleting…' : 'Delete cleaner'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminListPage>
  );
}
