import { clerkMiddleware } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getProductionRedirectUrl } from '@/lib/production-host-routing';

function handleHostnameRouting(request: NextRequest) {
  const redirectUrl = getProductionRedirectUrl(request.nextUrl);

  return redirectUrl
    ? NextResponse.redirect(redirectUrl)
    : NextResponse.next();
}

const proxy = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? clerkMiddleware((_auth, request) => handleHostnameRouting(request))
  : handleHostnameRouting;

export default proxy;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/sitemap.xml',
    '/robots.txt',
  ],
};
