import { auth } from '@clerk/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { api } from '@/convex/_generated/api';
import { getConvexAuthToken } from '@/lib/convex-auth-token';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  const token = await getConvexAuthToken();
  const user = await fetchQuery(
    api.users.current,
    {},
    { token: token ?? undefined },
  );

  return (
    <AdminShell user={user}>{children}</AdminShell>
  );
}
