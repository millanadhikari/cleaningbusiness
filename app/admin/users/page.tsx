import { auth } from '@clerk/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import { AdminUsersManager } from '@/components/admin/admin-users-manager';
import { api } from '@/convex/_generated/api';

export default async function AdminUsersPage() {
  await auth.protect();

  const { getToken } = await auth();
  const token = await getToken();
  const currentUser = await fetchQuery(
    api.users.current,
    {},
    { token: token ?? undefined },
  );

  if (currentUser.role !== 'SUPER_ADMIN') {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8">
        <h1 className="text-2xl font-semibold text-amber-950">Access restricted</h1>
        <p className="mt-3 text-sm leading-6 text-amber-800">
          Only a Super Admin can manage internal admin accounts.
        </p>
      </section>
    );
  }

  return <AdminUsersManager />;
}
