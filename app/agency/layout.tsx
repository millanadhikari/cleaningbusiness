import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';
import { AgencyShell } from '@/components/agency/agency-shell';

export default async function AgencyLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return <AgencyShell>{children}</AgencyShell>;
}
