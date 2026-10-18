'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore } from 'react';

type GoogleAnalyticsProps = {
  measurementId: string;
};

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function isPublicWebsite(hostname: string) {
  return hostname === 'wedocleaning.com.au' || hostname === 'www.wedocleaning.com.au';
}

const subscribeToHostname = () => () => undefined;

export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname();
  const enabled = useSyncExternalStore(
    subscribeToHostname,
    () => isPublicWebsite(window.location.hostname),
    () => false,
  );
  const initialPageView = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    if (initialPageView.current) {
      initialPageView.current = false;
      return;
    }
    window.gtag?.('event', 'page_view', {
      page_location: window.location.href,
      page_path: pathname,
      page_title: document.title,
    });
  }, [enabled, pathname]);

  if (!enabled) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = window.gtag || gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
    </>
  );
}
