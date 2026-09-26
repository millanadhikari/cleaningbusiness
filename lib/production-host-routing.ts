const PUBLIC_PRODUCTION_HOST = 'www.wedocleaning.com.au';
const APP_PRODUCTION_HOST = 'app.wedocleaning.com.au';

const APP_ROUTE_PREFIXES = ['/admin', '/sign-in', '/__clerk'];

function matchesRoutePrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getProductionRedirectUrl(requestUrl: URL): URL | null {
  const { hostname, pathname } = requestUrl;

  if (
    hostname === PUBLIC_PRODUCTION_HOST &&
    (matchesRoutePrefix(pathname, '/admin') ||
      matchesRoutePrefix(pathname, '/sign-in'))
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
