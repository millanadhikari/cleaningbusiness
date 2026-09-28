import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';
import { CleanerShell } from '@/components/cleaner/cleaner-shell';

export default async function CleanerLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return <CleanerShell>{children}</CleanerShell>;
}
