'use client';

import { useAuth } from '@clerk/nextjs';
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { useCallback, type ReactNode } from 'react';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured.');
}

const convex = new ConvexReactClient(convexUrl);

function useClerkAuthForConvex() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        return await getToken({ skipCache: forceRefreshToken });
      } catch {
        return null;
      }
    },
    [getToken],
  );

  return {
    isLoading: !isLoaded,
    isAuthenticated: isSignedIn ?? false,
    fetchAccessToken,
  };
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useClerkAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}
