import { auth } from '@clerk/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { api } from '@/convex/_generated/api';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  const authState = await auth();
  const token = await authState.getToken();
  const user = await fetchQuery(
    api.users.current,
    {},
    { token: token ?? undefined },
  );

  return (
    <AdminShell user={user}>{children}</AdminShell>
  );
}
