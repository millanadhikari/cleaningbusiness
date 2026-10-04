const PUBLIC_PRODUCTION_HOST = 'www.wedocleaning.com.au';
const APP_PRODUCTION_HOST = 'app.wedocleaning.com.au';

const APP_ROUTE_PREFIXES = [
  '/admin',
  '/api/google',
  '/auth/continue',
  '/sign-in',
  '/accept-invitation',
  '/admin-invitation-complete',
  '/cleaner-invitation',
  '/cleaner-invitation-complete',
  '/cleaner',
  '/__clerk',
];

function matchesRoutePrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getProductionRedirectUrl(requestUrl: URL): URL | null {
  const { hostname, pathname } = requestUrl;

  // Static assets must remain available on both production hosts. This also
  // allows Next Image on the app domain to fetch its local source image.
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/fonts/') ||
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return null;
  }

  if (
    hostname === PUBLIC_PRODUCTION_HOST &&
    (matchesRoutePrefix(pathname, '/admin') ||
      matchesRoutePrefix(pathname, '/sign-in') ||
      matchesRoutePrefix(pathname, '/accept-invitation') ||
      matchesRoutePrefix(pathname, '/admin-invitation-complete') ||
      matchesRoutePrefix(pathname, '/cleaner-invitation') ||
      matchesRoutePrefix(pathname, '/cleaner-invitation-complete') ||
      matchesRoutePrefix(pathname, '/cleaner'))
  ) {
    const redirectUrl = new URL(requestUrl);
    redirectUrl.protocol = 'https:';
    redirectUrl.hostname = APP_PRODUCTION_HOST;
    redirectUrl.port = '';
    return redirectUrl;
  }

  if (hostname !== APP_PRODUCTION_HOST) {
    return null;
  }

  const isBookingResult =
    matchesRoutePrefix(pathname, '/booking/success') ||
    (pathname === '/' && requestUrl.searchParams.has('checkout'));

  if (isBookingResult) {
    const redirectUrl = new URL(requestUrl);
    redirectUrl.protocol = 'https:';
    redirectUrl.hostname = PUBLIC_PRODUCTION_HOST;
    redirectUrl.port = '';
    return redirectUrl;
  }

  const isAppRoute = APP_ROUTE_PREFIXES.some((prefix) =>
    matchesRoutePrefix(pathname, prefix),
  );

  if (isAppRoute) {
    return null;
  }

  const redirectUrl = new URL(requestUrl);
  redirectUrl.pathname = '/admin';
  redirectUrl.search = '';
  redirectUrl.hash = '';
  return redirectUrl;
}
