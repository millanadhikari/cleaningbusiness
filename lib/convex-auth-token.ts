import { auth } from '@clerk/nextjs/server';

export async function getConvexAuthToken() {
  const { getToken, sessionClaims } = await auth();
  const audience = sessionClaims?.aud;
  const usesConvexIntegration =
    audience === 'convex' ||
    (Array.isArray(audience) && audience.includes('convex'));

  return usesConvexIntegration
    ? getToken()
    : getToken({ template: 'convex' });
}
