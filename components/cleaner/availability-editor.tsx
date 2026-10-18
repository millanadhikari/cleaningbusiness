'use client';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export type Day = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type AvailabilityEntry = { day: Day; available: boolean; startTime?: string; endTime?: string };
export const DAYS: Array<{ value: Day; label: string; short: string }> = [
  { value: 'MONDAY', label: 'Monday', short: 'Mon' }, { value: 'TUESDAY', label: 'Tuesday', short: 'Tue' },
  { value: 'WEDNESDAY', label: 'Wednesday', short: 'Wed' }, { value: 'THURSDAY', label: 'Thursday', short: 'Thu' },
  { value: 'FRIDAY', label: 'Friday', short: 'Fri' }, { value: 'SATURDAY', label: 'Saturday', short: 'Sat' },
  { value: 'SUNDAY', label: 'Sunday', short: 'Sun' },
];

export function normalizeAvailability(value?: AvailabilityEntry[]): AvailabilityEntry[] {
  return DAYS.map(({ value: day }) => value?.find((entry) => entry.day === day) ?? { day, available: false });
}

export function AvailabilityEditor({ value, onChange }: { value: AvailabilityEntry[]; onChange: (value: AvailabilityEntry[]) => void }) {
  function update(day: Day, changes: Partial<AvailabilityEntry>) {
    onChange(value.map((entry) => entry.day === day ? { ...entry, ...changes } : entry));
  }
  return <div className="divide-y divide-slate-100 rounded-[24px] bg-white px-4 shadow-sm">{DAYS.map(({ value: day, label }) => {
    const entry = value.find((item) => item.day === day)!;
    return <div key={day} className="py-4"><div className="flex items-center justify-between"><strong className="text-sm">{label}</strong><label className="flex items-center gap-2 text-xs text-slate-500"><Switch checked={entry.available} onCheckedChange={(checked) => update(day, { available: checked, startTime: checked ? entry.startTime ?? '08:00' : undefined, endTime: checked ? entry.endTime ?? '17:00' : undefined })} />{entry.available ? 'Available' : 'Off'}</label></div>{entry.available ? <div className="mt-3 flex items-center gap-2"><Input type="time" value={entry.startTime ?? ''} onChange={(event) => update(day, { startTime: event.target.value })} className="h-11 rounded-xl" /><span className="text-xs text-slate-400">to</span><Input type="time" value={entry.endTime ?? ''} onChange={(event) => update(day, { endTime: event.target.value })} className="h-11 rounded-xl" /></div> : null}</div>;
  })}</div>;
}
