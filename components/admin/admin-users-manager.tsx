'use client';

import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { LoaderCircle, MailPlus, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type FormMessage = { kind: 'error' | 'success'; text: string } | null;

export function AdminUsersManager() {
  const { isAuthenticated } = useConvexAuth();
  const users = useQuery(
    api.users.listInternalUsers,
    isAuthenticated ? {} : 'skip',
  );
  const inviteAdmin = useAction(api.adminInvitations.inviteAdmin);
  const setAdminStatus = useMutation(api.users.setAdminStatus);
  const [isInviting, setIsInviting] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<Id<'users'> | null>(null);
  const [message, setMessage] = useState<FormMessage>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function handleInviteAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsInviting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const result = await inviteAdmin({
        email: String(formData.get('email') ?? ''),
        appOrigin: window.location.origin,
      });
      form.reset();
      setMessage({
        kind: 'success',
        text: `Invitation sent to ${result.email}.`,
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Unable to send the invitation.',
      });
    } finally {
      setIsInviting(false);
    }
  }

  async function handleStatusChange(
    userId: Id<'users'>,
    status: 'ACTIVE' | 'INACTIVE',
  ) {
    setUpdatingUserId(userId);
    setStatusError(null);

    try {
      await setAdminStatus({ userId, status });
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? error.message
          : 'Unable to update the admin status.',
      );
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-emerald-950">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />
        <p className="text-sm leading-6">
          Invite staff by email, then control whether they can access the
          internal application after they accept.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-950">Invite an admin</h2>
          <p className="mt-1 text-sm text-slate-500">
            They will receive a secure Clerk invitation and create their own
            account.
          </p>
        </div>

        <form onSubmit={handleInviteAdmin} className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="admin@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row sm:items-center">
            <Button type="submit" disabled={isInviting}>
              {isInviting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <MailPlus />
              )}
              Send invitation
            </Button>
            {message ? (
              <p
                role="status"
                className={`text-sm ${message.kind === 'success' ? 'text-emerald-700' : 'text-red-700'}`}
              >
                {message.text}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-950">Internal users</h2>
          <p className="mt-1 text-sm text-slate-500">
            Super Admin accounts are protected from changes on this screen.
          </p>
          {statusError ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {statusError}
            </p>
          ) : null}
        </div>

        {users === undefined ? (
          <div className="flex items-center gap-2 px-6 py-10 text-sm text-slate-500">
            <LoaderCircle className="size-4 animate-spin" />
            Loading users…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="pr-6 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const name = [user.firstName, user.lastName]
                  .filter(Boolean)
                  .join(' ');
                const isProtected = user.role === 'SUPER_ADMIN';
                const isUpdating = updatingUserId === user._id;
                const nextStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

                return (
                  <TableRow key={user._id}>
                    <TableCell className="pl-6">
                      <div className="font-medium text-slate-900">
                        {name || user.email || 'Unnamed admin'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {user.email || user.clerkUserId}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.status === 'ACTIVE' ? 'secondary' : 'outline'}
                        className={
                          user.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'text-slate-500'
                        }
                      >
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {new Intl.DateTimeFormat('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }).format(user.createdAt)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isProtected || isUpdating}
                        onClick={() => handleStatusChange(user._id, nextStatus)}
                      >
                        {isUpdating ? (
                          <LoaderCircle className="animate-spin" />
                        ) : user.status === 'ACTIVE' ? (
                          'Deactivate'
                        ) : (
                          'Activate'
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
