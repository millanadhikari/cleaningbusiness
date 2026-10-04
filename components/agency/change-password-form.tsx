'use client';

import { useUser } from '@clerk/nextjs';
import { useMutation } from 'convex/react';
import { KeyRound, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ChangePasswordForm() {
  const { user } = useUser();
  const finish = useMutation(api.agencyPortal.markPasswordChanged);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get('currentPassword') ?? '');
    const newPassword = String(data.get('newPassword') ?? '');
    const confirmPassword = String(data.get('confirmPassword') ?? '');
    if (newPassword !== confirmPassword) { setError('The new passwords do not match.'); return; }
    setBusy(true); setError(null);
    try {
      await user.updatePassword({ currentPassword, newPassword, signOutOfOtherSessions: true });
      await finish({});
      router.replace('/agency');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to change the password.'); } finally { setBusy(false); }
  }
  return <Card className="rounded-[24px]"><CardHeader><span className="mb-2 grid size-11 place-items-center rounded-xl bg-emerald-50 text-[#087f70]"><KeyRound /></span><CardTitle>Create your private password</CardTitle><CardDescription>The temporary password can only be used for initial access. Choose a new password to continue.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="currentPassword">Temporary password</Label><Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required /></div><div className="space-y-2"><Label htmlFor="newPassword">New password</Label><Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></div><div className="space-y-2"><Label htmlFor="confirmPassword">Confirm new password</Label><Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></div>{error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}<Button className="w-full" size="lg" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <KeyRound />}{busy ? 'Updating…' : 'Set password and continue'}</Button></form></CardContent></Card>;
}
