'use client';

import { useMutation } from 'convex/react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { api } from '@/convex/_generated/api';
import {
  browserContext,
  getWebsiteSessionId,
  isTrackablePublicPage,
} from '@/lib/website-analytics';

export function WebsiteAnalyticsTracker() {
  const pathname = usePathname();
  const trackPageView = useMutation(api.websiteAnalytics.trackPageView);
  const touchSession = useMutation(api.websiteAnalytics.touchSession);
  const landingPage = useRef<string | null>(null);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!isTrackablePublicPage(pathname) || lastPath.current === pathname) return;
    const sessionId = getWebsiteSessionId();
    if (!sessionId) return;
    landingPage.current ??= pathname;
    lastPath.current = pathname;
    const params = new URLSearchParams(window.location.search);
    void trackPageView({
      sessionId,
      page: pathname,
      landingPage: landingPage.current,
      referrer: document.referrer || undefined,
      source: params.get('utm_source') || undefined,
      medium: params.get('utm_medium') || undefined,
      campaign: params.get('utm_campaign') || undefined,
      term: params.get('utm_term') || undefined,
      content: params.get('utm_content') || undefined,
      ...browserContext(),
    }).catch(() => undefined);
  }, [pathname, trackPageView]);

  useEffect(() => {
    if (!isTrackablePublicPage(pathname)) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const sessionId = getWebsiteSessionId();
      if (sessionId) void touchSession({ sessionId, page: pathname }).catch(() => undefined);
    }, 120_000);
    return () => window.clearInterval(interval);
  }, [pathname, touchSession]);

  return null;
}
