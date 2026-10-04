import { ServiceAreaSettings } from '@/components/admin/service-area-settings';
import { GmailSettings } from '@/components/admin/gmail-settings';

export default async function SettingsPage({ searchParams }: PageProps<'/admin/settings'>) {
  const params = await searchParams;
  const value = (key: string) => {
    const entry = params[key];
    return Array.isArray(entry) ? entry[0] : entry;
  };
  return (
    <>
      <GmailSettings oauthResult={value('gmail')} oauthReason={value('reason')} />
      <ServiceAreaSettings />
    </>
  );
}
