import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://wedocleaning.com.au'),
  title: 'WeDo Cleaning Services | A Fresher Sydney Starts Here',
  description:
    'We do clean. You do life. Home, end of lease and commercial cleaning in Sydney, with care in every corner.',
  icons: { icon: '/favicon.svg' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const clerkConfigured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
  let content = children;

  if (clerkConfigured) {
    const { ConfiguredAuthProviders } = await import(
      '@/components/providers/configured-auth-providers'
    );
    content = <ConfiguredAuthProviders>{children}</ConfiguredAuthProviders>;
  }

  return (
    <html lang="en-AU">
      <body className="antialiased">{content}</body>
    </html>
  );
}
