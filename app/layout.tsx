import type { Metadata } from 'next';
import { GoogleAnalytics } from '@/components/analytics/google-analytics';
import { PublicHashNavigation } from '@/components/public-hash-navigation';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://wedocleaning.com.au'),
  title: 'WeDo Cleaning Services | A Fresher Sydney Starts Here',
  description:
    'We do clean. You do life. Home, end of lease and commercial cleaning in Sydney, with care in every corner.',
  icons: { icon: '/favicon.svg' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ga4MeasurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim();
  const clerkConfigured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
  let content = children;

  if (clerkConfigured) {
    const { ConfiguredAuthProviders } = await import(
      '@/components/providers/configured-auth-providers'
    );
    const { WebsiteAnalyticsTracker } = await import(
      '@/components/analytics/website-analytics-tracker'
    );
    content = (
      <ConfiguredAuthProviders>
        <WebsiteAnalyticsTracker />
        {children}
      </ConfiguredAuthProviders>
    );
  }

  return (
    <html lang="en-AU">
      <body className="antialiased">
        <PublicHashNavigation />
        {content}
        {ga4MeasurementId && /^G-[A-Z0-9]+$/i.test(ga4MeasurementId) ? (
          <GoogleAnalytics measurementId={ga4MeasurementId} />
        ) : null}
      </body>
    </html>
  );
}
