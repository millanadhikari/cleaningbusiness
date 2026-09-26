import { CalendarDays } from 'lucide-react';
import { PlaceholderPage } from '@/components/admin/placeholder-page';

export default function CalendarPage() {
  return (
    <PlaceholderPage
      title="Calendar"
      description="A shared operational calendar will be added alongside booking management in a later phase."
      icon={CalendarDays}
    />
  );
}
