import { auth } from '@clerk/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import { redirect } from 'next/navigation';
import { AnalyticsDashboard } from '@/components/admin/analytics-dashboard';
import { api } from '@/convex/_generated/api';
import { getConvexAuthToken } from '@/lib/convex-auth-token';

export default async function AnalyticsPage() {
  await auth.protect();
  const token = await getConvexAuthToken();
  const currentUser = await fetchQuery(
    api.users.currentAdmin,
    {},
    { token: token ?? undefined },
  );
  if (currentUser.role !== 'SUPER_ADMIN') redirect('/admin');
  return <AnalyticsDashboard />;
}
