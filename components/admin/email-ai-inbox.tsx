"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { AlertTriangle, BrainCircuit, Check, Clock3, ExternalLink, Inbox, LoaderCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const filters = [
  ["ALL", "All"], ["NEEDS_ATTENTION", "Needs Attention"], ["URGENT", "Urgent"],
  ["WAITING_STAFF", "Waiting for Staff"], ["WAITING_CUSTOMER", "Waiting for Customer"],
  ["COMPLAINT", "Complaints"], ["RESCHEDULE_REQUEST", "Reschedule Requests"],
  ["CANCELLATION_REQUEST", "Cancellation Requests"], ["PAYMENT", "Payment Questions"],
] as const;

function when(value: number) {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function EmailAiInbox() {
  const { isAuthenticated } = useConvexAuth();
  const [filter, setFilter] = useState("ALL");
  const [updating, setUpdating] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const threads = useQuery(api.emailAi.getInbox, isAuthenticated ? { filter, limit: 50 } : "skip");
  const review = useMutation(api.emailAi.reviewInsight);
  const analyseRecent = useMutation(api.emailAi.analyseRecentUnprocessed);

  async function markHandled(threadId: Id<"emailThreads">) {
    setUpdating(String(threadId));
    try {
      await review({ threadId, action: "HANDLED" });
      toast.success("Email marked as handled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Email could not be updated.");
    } finally {
      setUpdating(null);
    }
  }

  async function handleAnalyseRecent() {
    setAnalysing(true);
    try {
      const result = await analyseRecent({});
      toast.success(result.queued ? `${result.queued} email${result.queued === 1 ? "" : "s"} queued for analysis.` : "Recent emails are already analysed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Recent emails could not be queued.");
    } finally {
      setAnalysing(false);
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><BrainCircuit className="size-5 text-emerald-700" /> AI-assisted email inbox</CardTitle>
            <CardDescription className="mt-1">Prioritised customer conversations. AI suggestions are advisory and never send or change bookings automatically.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={handleAnalyseRecent} disabled={analysing} className="bg-white">{analysing ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Analyse recent email</Button>
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-800"><Inbox /> {threads?.length ?? 0} conversations</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Email inbox filters">
          {filters.map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)} className={filter === value ? "bg-emerald-700 text-white hover:bg-emerald-800" : "bg-white"}>{label}</Button>
          ))}
        </div>
        {threads === undefined ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" /> Loading customer conversations…</div>
        ) : threads.length ? (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {threads.map(thread => {
              const href = thread.bookingId ? `/admin/bookings/${thread.bookingId}` : thread.quoteId ? `/admin/quotes/${thread.quoteId}` : undefined;
              return (
                <div key={thread._id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="truncate text-sm text-slate-900">{thread.customerName}</strong>
                      {thread.latestPriority ? <Badge className={cn("text-[10px]", thread.latestPriority === "URGENT" ? "bg-red-100 text-red-800" : thread.latestPriority === "HIGH" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700")}>{thread.latestPriority}</Badge> : null}
                      {thread.latestIntent ? <Badge variant="outline" className="text-[10px]">{thread.latestIntent.replaceAll("_", " ")}</Badge> : null}
                      {thread.unreadCount ? <Badge className="bg-sky-100 text-[10px] text-sky-800">{thread.unreadCount} unread</Badge> : null}
                    </div>
                    <div className="mt-1 truncate text-sm font-medium text-slate-700">{thread.subject}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{thread.aiSummary ?? "Awaiting AI analysis. The email remains available normally."}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1"><Clock3 className="size-3" /> {when(thread.lastMessageAt)}</span>
                      <span>{thread.status.replaceAll("_", " ")}</span>
                      {thread.linkedReference ? <span>{thread.linkedReference}</span> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {thread.needsAttention ? <Button type="button" size="sm" variant="outline" disabled={updating === String(thread._id)} onClick={() => markHandled(thread._id)}>{updating === String(thread._id) ? <LoaderCircle className="animate-spin" /> : <Check />} Mark handled</Button> : null}
                    {href ? <Button asChild size="sm"><Link href={href}>Open <ExternalLink /></Link></Button> : <Badge variant="outline" className="gap-1 text-amber-700"><AlertTriangle className="size-3" /> Unlinked</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">No conversations match this filter.</div>
        )}
      </CardContent>
    </Card>
  );
}
