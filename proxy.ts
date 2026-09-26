import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const proxy = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? clerkMiddleware()
  : () => NextResponse.next();

export default proxy;

export const config = {
  matcher: ['/admin(.*)', '/__clerk/(.*)'],
};
