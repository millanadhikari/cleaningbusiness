"use client";

import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Ban, CalendarDays, ChevronLeft, ChevronRight, Clock3, Filter, Plus, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const times = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

function displayTime(value: string) {
  return format(new Date(`2026-01-01T${value}:00`), "h:mm a");
}

function statusClasses(status: string) {
  if (status === "CANCELLED") return "border-slate-200 bg-slate-100 text-slate-500 line-through";
  if (status === "PENDING_PAYMENT") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-blue-200 bg-blue-50 text-blue-900";
}

export function AdminCalendar() {
  const { isAuthenticated } = useConvexAuth();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [cleanerId, setCleanerId] = useState<string>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [slotDate, setSlotDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [slotTime, setSlotTime] = useState("09:00");
  const [blockWholeDay, setBlockWholeDay] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const fromDate = format(gridStart, "yyyy-MM-dd");
  const toDate = format(gridEnd, "yyyy-MM-dd");
  const calendar = useQuery(api.calendar.month, isAuthenticated ? {
    fromDate,
    toDate,
    cleanerId: cleanerId === "ALL" ? undefined : cleanerId as Id<"cleaners">,
  } : "skip");
  const cleaners = useQuery(api.cleaners.listActive, isAuthenticated ? {} : "skip");
  const createBlock = useMutation(api.availability.createBlock);
  const removeBlock = useMutation(api.availability.removeBlock);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function openAvailability(date = format(addDays(new Date(), 1), "yyyy-MM-dd")) {
    const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
    setSlotDate(date < tomorrow ? tomorrow : date);
    setSlotTime("09:00");
    setBlockWholeDay(false);
    setNotes("");
    setDialogOpen(true);
  }

  async function saveAvailability() {
    setSaving(true);
    try {
      await createBlock({ date: slotDate, time: blockWholeDay ? undefined : slotTime, reason: notes || undefined });
      toast.success(blockWholeDay ? "Date blocked from customer bookings." : "Time blocked from customer bookings.");
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not block availability.");
    } finally {
      setSaving(false);
    }
  }

  async function hideAvailability(blockId: Id<"publicAvailabilityBlocks">) {
    try {
      await removeBlock({ blockId });
      toast.success("Availability restored in the estimator.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore availability.");
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"><CalendarDays className="size-4" /> Operations schedule</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Calendar</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">All standard appointment times are available from tomorrow. Block only the dates or times customers cannot book.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-md border bg-white px-3 shadow-xs">
            <Filter className="size-4 text-slate-400" />
            <NativeSelect aria-label="Filter by cleaner" value={cleanerId} onChange={(event) => setCleanerId(event.target.value)} className="h-7 min-w-40 border-0 p-0 pr-7 shadow-none focus-visible:ring-0">
              <option value="ALL">All cleaners</option>
              {cleaners?.map((cleaner) => <option key={cleaner._id} value={cleaner._id}>{cleaner.name}</option>)}
            </NativeSelect>
          </div>
          <Button onClick={() => openAvailability()} className="bg-slate-900 hover:bg-slate-800"><Ban /> Block availability</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setMonth((value) => subMonths(value, 1))} aria-label="Previous month"><ChevronLeft /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setMonth((value) => addMonths(value, 1))} aria-label="Next month"><ChevronRight /></Button>
            <h2 className="ml-1 text-lg font-semibold text-slate-900 sm:text-xl">{format(month, "MMMM yyyy")}</h2>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-blue-500" /> Job</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-amber-400" /> Pending payment</span>
            {cleanerId === "ALL" && <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-red-500" /> Customer unavailable</span>}
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {weekDays.map((day) => <div key={day} className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const jobs = calendar?.jobs.filter((job) => job.scheduledDate === dateKey) ?? [];
            const blocks = calendar?.blocks.filter((block) => block.date === dateKey) ?? [];
            return (
              <div key={dateKey} className={cn("group min-h-28 border-b border-r border-slate-100 p-1.5 sm:min-h-36 sm:p-2", !isSameMonth(day, month) && "bg-slate-50/70 text-slate-400")} onDoubleClick={() => openAvailability(dateKey)}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn("flex size-7 items-center justify-center rounded-full text-xs font-medium", isToday(day) && "bg-emerald-700 text-white")}>{format(day, "d")}</span>
                  {isSameMonth(day, month) && dateKey > format(new Date(), "yyyy-MM-dd") && cleanerId === "ALL" && <button type="button" onClick={() => openAvailability(dateKey)} className="flex size-6 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-700 group-hover:opacity-100" aria-label={`Block availability on ${format(day, "d MMMM")}`}><Plus className="size-3.5" /></button>}
                </div>
                <div className="space-y-1">
                  {jobs.slice(0, 3).map((job) => (
                    <Link key={job._id} href={`/admin/bookings/${job._id}`} className={cn("block truncate rounded border px-1.5 py-1 text-[10px] leading-tight transition hover:brightness-95 sm:text-xs", statusClasses(job.status))} title={`${displayTime(job.scheduledTime)} · ${job.customerName} · ${job.cleaners.map((cleaner) => cleaner.name).join(", ") || "Unassigned"}`}>
                      <strong>{displayTime(job.scheduledTime)}</strong> <span>{job.customerName}</span>
                      <span className="hidden truncate text-[10px] opacity-70 sm:block">{job.cleaners.map((cleaner) => cleaner.name).join(", ") || "Unassigned"}</span>
                    </Link>
                  ))}
                  {blocks.slice(0, Math.max(0, 3 - jobs.length)).map((block) => {
                    return <div key={block._id} className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-1 text-[10px] leading-tight text-red-800 sm:text-xs" title={block.reason ?? "Unavailable for customer bookings"}><span className="min-w-0 flex-1 truncate"><strong>{block.time ? displayTime(block.time) : "All day"}</strong> · unavailable</span><button type="button" onClick={() => hideAvailability(block._id)} className="text-red-500 hover:text-emerald-700" aria-label="Restore availability"><Trash2 className="size-3" /></button></div>;
                  })}
                  {jobs.length + blocks.length > 3 && <div className="pl-1 text-[10px] font-medium text-slate-500">+{jobs.length + blocks.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><CalendarDays className="size-4 text-blue-600" /> Jobs this view</div><p className="mt-2 text-2xl font-semibold">{calendar?.jobs.length ?? "—"}</p></div>
        <div className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><UserRound className="size-4 text-violet-600" /> Unassigned jobs</div><p className="mt-2 text-2xl font-semibold">{calendar?.jobs.filter((job) => job.cleaners.length === 0).length ?? "—"}</p></div>
        <div className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Clock3 className="size-4 text-red-600" /> Availability blocks</div><p className="mt-2 text-2xl font-semibold">{cleanerId === "ALL" ? (calendar?.blocks.length ?? "—") : "Filtered"}</p></div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Block customer availability</DialogTitle><DialogDescription>Standard times are bookable automatically from tomorrow. Add an exception for a whole day or one specific time.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="slot-date">Unavailable date</Label><Input id="slot-date" type="date" min={format(addDays(new Date(), 1), "yyyy-MM-dd")} value={slotDate} onChange={(event) => setSlotDate(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="slot-scope">Block</Label><NativeSelect id="slot-scope" value={blockWholeDay ? "DAY" : "TIME"} onChange={(event) => setBlockWholeDay(event.target.value === "DAY")} className="w-full"><option value="TIME">One time only</option><option value="DAY">The entire day</option></NativeSelect></div>
            {!blockWholeDay && <div className="space-y-2"><Label htmlFor="slot-time">Unavailable time</Label><NativeSelect id="slot-time" value={slotTime} onChange={(event) => setSlotTime(event.target.value)} className="w-full">{times.map((time) => <option key={time} value={time}>{displayTime(time)}</option>)}</NativeSelect></div>}
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="slot-notes">Reason (optional)</Label><Textarea id="slot-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="For example: public holiday or team meeting" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={saveAvailability} disabled={saving || !slotDate} className="bg-slate-900 hover:bg-slate-800">{saving ? "Saving…" : "Block availability"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
