import { auth } from '@clerk/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { api } from '@/convex/_generated/api';
import { getConvexAuthToken } from '@/lib/convex-auth-token';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  const token = await getConvexAuthToken();
  const authenticatedUser = await fetchQuery(
    api.users.current,
    {},
    { token: token ?? undefined },
  );
  if (authenticatedUser.role === 'CLEANER') redirect('/cleaner');
  if (authenticatedUser.role === 'AGENCY_USER') redirect('/agency');
  const user = await fetchQuery(
    api.users.currentAdmin,
    {},
    { token: token ?? undefined },
  );

  return (
    <AdminShell user={user}>{children}</AdminShell>
  );
}
