'use client';

import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import {
  BriefcaseBusiness,
  LoaderCircle,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRoundCheck,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';
import { AdminListHeader, AdminListPage } from './admin-list-layout';
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

type Cleaner = Doc<'cleaners'>;
type Feedback = { kind: 'success' | 'error'; text: string } | null;

function fullName(cleaner: Cleaner) {
  return `${cleaner.firstName} ${cleaner.lastName}`;
}

function initials(cleaner: Cleaner) {
  return `${cleaner.firstName[0] ?? ''}${cleaner.lastName[0] ?? ''}`.toUpperCase();
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCleaner, setEditingCleaner] = useState<Cleaner | null>(null);
  const [deletingCleaner, setDeletingCleaner] = useState<Cleaner | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const filteredCleaners = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!cleaners || !query) return cleaners ?? [];
    return cleaners.filter((cleaner) =>
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
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [cleaners, search]);

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

      <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#dfe9e3] bg-white p-3 shadow-sm">
        <Search className="ml-1 size-4 text-slate-400" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search cleaners by name, email, phone or specialty"
          aria-label="Search cleaners"
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>

      {cleaners === undefined ? (
        <div className="flex min-h-52 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
          <LoaderCircle className="size-4 animate-spin" /> Loading team…
        </div>
      ) : filteredCleaners.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCleaners.map((cleaner) => (
            <article
              key={cleaner._id}
              className="flex min-h-64 flex-col rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-[0_5px_24px_rgba(20,47,54,0.03)]"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#007c70] text-sm font-bold text-white">
                  {initials(cleaner)}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-[#173c38]">
                    {fullName(cleaner)}
                  </h3>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {cleaner.specialty || 'General cleaning'}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={
                    cleaner.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }
                >
                  {cleaner.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="mt-5 space-y-2.5 text-sm text-slate-600">
                {cleaner.email ? (
                  <a href={`mailto:${cleaner.email}`} className="flex items-center gap-2 hover:text-emerald-800">
                    <Mail className="size-4 text-emerald-700" />
                    <span className="truncate">{cleaner.email}</span>
                  </a>
                ) : (
                  <p className="flex items-center gap-2 text-slate-400">
                    <Mail className="size-4" /> No email added
                  </p>
                )}
                <a href={`tel:${cleaner.phone}`} className="flex items-center gap-2 hover:text-emerald-800">
                  <Phone className="size-4 text-emerald-700" /> {cleaner.phone}
                </a>
                <p className="flex items-center gap-2">
                  <BriefcaseBusiness className="size-4 text-emerald-700" />
                  {cleaner.engagementType === 'EMPLOYEE' ? 'Employee' : 'Contractor'}
                </p>
              </div>

              {cleaner.notes ? (
                <p className="mt-4 line-clamp-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  {cleaner.notes}
                </p>
              ) : null}

              <div className="mt-auto flex gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => openEdit(cleaner)}>
                  <Pencil /> Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-red-700 hover:bg-red-50 hover:text-red-800"
                  onClick={() => setDeletingCleaner(cleaner)}
                  aria-label={`Delete ${fullName(cleaner)}`}
                >
                  <Trash2 />
                </Button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <UserRoundCheck className="mx-auto size-8 text-slate-300" />
          <h3 className="mt-4 font-semibold text-slate-800">
            {search ? 'No cleaners match your search' : 'No cleaners added yet'}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            {search
              ? 'Try another name, contact detail or specialty.'
              : 'Add your first cleaner to begin assigning bookings.'}
          </p>
        </div>
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
