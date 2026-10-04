import { auth } from '@clerk/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import { redirect } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { getConvexAuthToken } from '@/lib/convex-auth-token';

export default async function ContinuePage() {
  await auth.protect();
  const token = await getConvexAuthToken();
  const user = await fetchQuery(api.users.current, {}, { token: token ?? undefined });
  redirect(
    user.role === 'CLEANER'
      ? '/cleaner'
      : user.role === 'AGENCY_USER'
        ? '/agency'
        : '/admin',
  );
}
