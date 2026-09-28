import { auth } from '@clerk/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import { PlatformUsageOverview } from '@/components/admin/platform-usage-overview';
import { api } from '@/convex/_generated/api';
import { getConvexAuthToken } from '@/lib/convex-auth-token';

export default async function PlatformUsagePage() {
  await auth.protect();
  const token = await getConvexAuthToken();
  const currentUser = await fetchQuery(
    api.users.currentAdmin,
    {},
    { token: token ?? undefined },
  );

  if (currentUser.role !== 'SUPER_ADMIN') {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8">
        <h1 className="text-2xl font-semibold text-amber-950">Access restricted</h1>
        <p className="mt-3 text-sm leading-6 text-amber-800">
          Platform usage and provider configuration are available only to the Super Admin.
        </p>
      </section>
    );
  }

  return <PlatformUsageOverview />;
}
