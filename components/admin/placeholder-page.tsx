import { Clock3, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type PlaceholderPageProps = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
}: PlaceholderPageProps) {
  return (
    <Card className="max-w-3xl gap-0 border-slate-200/90 bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-6 py-6">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Icon className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg text-slate-950">{title}</CardTitle>
              <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                Coming soon
              </Badge>
            </div>
            <CardDescription className="mt-2 max-w-xl leading-6">
              {description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-3 px-6 py-6 text-sm text-slate-500">
        <Clock3 className="size-4 text-emerald-700" />
        This area is prepared for a future phase. No business data has been created.
      </CardContent>
    </Card>
  );
}
