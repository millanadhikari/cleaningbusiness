import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import { ConvexClientProvider } from './convex-client-provider';

export function ConfiguredAuthProviders({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signInFallbackRedirectUrl="/admin"
      afterSignOutUrl="/sign-in"
    >
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ClerkProvider>
  );
}
