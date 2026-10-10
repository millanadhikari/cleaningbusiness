"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Inbox,
  Link2,
  LoaderCircle,
  MailQuestion,
  RotateCcw,
  Search,
  UserRoundCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type InboxView = "likely" | "other" | "dismissed";

type ThreadSummary = {
  gmailThreadId: string;
  latestAt: number;
  messageCount: number;
  firstMessageId: Id<"unmatchedEmailMessages">;
  subject: string;
  from: string;
  preview: string;
  likelyCustomer: boolean;
  customerName?: string;
};

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function countLabel(value: number, capped: boolean) {
  return `${Math.min(value, 200)}${capped ? "+" : ""}`;
}

function ThreadConversation({ gmailThreadId }: { gmailThreadId: string }) {
  const messages = useQuery(api.gmail.getUnmatchedThread, { gmailThreadId });

  if (messages === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
        <LoaderCircle className="size-4 animate-spin" /> Loading conversation…
      </div>
    );
  }

  return (
    <div className="max-h-96 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
      {messages.map((message) => (
        <article key={message._id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
            <strong className="text-slate-700">{message.from}</strong>
            <time>{formatTimestamp(message.sentAt)}</time>
          </div>
          <p className="mt-2 whitespace-pre-wrap leading-6 text-slate-700">{message.bodyText}</p>
        </article>
      ))}
    </div>
  );
}

export function UnmatchedEmailInbox() {
  const { isAuthenticated } = useConvexAuth();
  const [view, setView] = useState<InboxView>("likely");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [attaching, setAttaching] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(25);
  const inbox = useQuery(
    api.gmail.getUnmatchedInbox,
    isAuthenticated ? { dismissed: view === "dismissed" } : "skip",
  );
  const exactReference = query.trim().toUpperCase();
  const exactTargets = useQuery(
    api.gmail.findEmailAttachTargets,
    isAuthenticated && /^WD\d{4,}$/.test(exactReference)
      ? { reference: exactReference }
      : "skip",
  );
  const attach = useMutation(api.gmail.attachUnmatchedThread);
  const setDismissed = useMutation(api.gmail.setUnmatchedThreadDismissed);

  const targets = useMemo(() => {
    if (!inbox) return [];
    const needle = query.trim().toLowerCase();
    const combined = [...(exactTargets ?? []), ...inbox.targets];
    return combined.filter((target, index) => {
      const firstOccurrence = combined.findIndex(
        (candidate) => candidate.type === target.type && candidate.id === target.id,
      ) === index;
      return firstOccurrence && (
        !needle || [target.reference, target.customerName, target.detail, target.type]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      );
    });
  }, [exactTargets, inbox, query]);

  const filteredThreads = useMemo(() => {
    if (!inbox) return [];
    if (view === "dismissed") return inbox.threads;
    return inbox.threads.filter((thread) =>
      view === "likely" ? thread.likelyCustomer : !thread.likelyCustomer,
    );
  }, [inbox, view]);

  function selectView(nextView: InboxView) {
    setView(nextView);
    setVisibleLimit(25);
    setExpanded({});
  }

  async function handleAttach(thread: ThreadSummary) {
    const selected = selection[thread.gmailThreadId];
    if (!selected) return;
    const separator = selected.indexOf(":");
    const type = selected.slice(0, separator);
    const id = selected.slice(separator + 1);
    setAttaching(thread.gmailThreadId);
    try {
      await attach({
        unmatchedMessageId: thread.firstMessageId,
        quoteId: type === "QUOTE" ? id as Id<"quoteRequests"> : undefined,
        bookingId: type === "BOOKING" ? id as Id<"bookings"> : undefined,
      });
      toast.success("Gmail thread attached. Future replies will route automatically.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Email thread could not be attached.");
    } finally {
      setAttaching(null);
    }
  }

  async function handleDismiss(thread: ThreadSummary, dismissed: boolean) {
    setUpdating(thread.gmailThreadId);
    try {
      await setDismissed({ gmailThreadId: thread.gmailThreadId, dismissed });
      toast.success(dismissed ? "Email moved to Dismissed." : "Email restored to the review queue.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Email could not be updated.");
    } finally {
      setUpdating(null);
    }
  }

  if (inbox === undefined) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
        <LoaderCircle className="size-4 animate-spin" /> Loading unmatched email…
      </div>
    );
  }

  const visibleThreads = filteredThreads.slice(0, visibleLimit);

  return (
    <div className="space-y-5">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MailQuestion className="size-5 text-amber-700" /> Unmatched Gmail replies
              </CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Review likely customer replies first. Other mail stays separate, and dismissed messages can be restored.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="bg-amber-50 text-amber-800">
              {countLabel(inbox.pendingCount, inbox.pendingCountCapped)} pending
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Unmatched email views">
            <Button type="button" size="sm" variant={view === "likely" ? "default" : "outline"} onClick={() => selectView("likely")}>
              <UserRoundCheck /> Likely customers
            </Button>
            <Button type="button" size="sm" variant={view === "other" ? "default" : "outline"} onClick={() => selectView("other")}>
              <Inbox /> Other mail
            </Button>
            <Button type="button" size="sm" variant={view === "dismissed" ? "default" : "outline"} onClick={() => selectView("dismissed")}>
              <Archive /> Dismissed ({countLabel(inbox.dismissedCount, inbox.dismissedCountCapped)})
            </Button>
          </div>
          {view !== "dismissed" ? (
            <label className="relative block max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter attachment targets by reference, customer, or address"
                className="pl-9"
              />
            </label>
          ) : null}
        </CardContent>
      </Card>

      {visibleThreads.length ? visibleThreads.map((thread) => {
        const isExpanded = Boolean(expanded[thread.gmailThreadId]);
        const isUpdating = updating === thread.gmailThreadId;
        return (
          <Card key={thread.gmailThreadId} className="border-slate-200 shadow-sm">
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {thread.likelyCustomer ? (
                      <Badge className="bg-emerald-50 text-emerald-800 hover:bg-emerald-50">Likely customer</Badge>
                    ) : (
                      <Badge variant="secondary">Other mail</Badge>
                    )}
                    {thread.customerName ? <span className="text-xs font-medium text-emerald-800">{thread.customerName}</span> : null}
                  </div>
                  <CardTitle className="truncate text-base">{thread.subject || "(No subject)"}</CardTitle>
                  <CardDescription className="mt-1">
                    {thread.from} · {thread.messageCount} message{thread.messageCount === 1 ? "" : "s"} · {formatTimestamp(thread.latestAt)}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setExpanded((current) => ({ ...current, [thread.gmailThreadId]: !isExpanded }))}
                  >
                    {isExpanded ? <ChevronUp /> : <ChevronDown />}
                    {isExpanded ? "Hide" : "View conversation"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isUpdating}
                    onClick={() => handleDismiss(thread, view !== "dismissed")}
                  >
                    {isUpdating ? <LoaderCircle className="animate-spin" /> : view === "dismissed" ? <RotateCcw /> : <Archive />}
                    {view === "dismissed" ? "Restore" : "Dismiss"}
                  </Button>
                </div>
              </div>
              {!isExpanded ? <p className="line-clamp-3 text-sm leading-6 text-slate-600">{thread.preview || "No text preview available."}</p> : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {isExpanded ? <ThreadConversation gmailThreadId={thread.gmailThreadId} /> : null}
              {view !== "dismissed" ? (
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <select
                    value={selection[thread.gmailThreadId] ?? ""}
                    onChange={(event) => setSelection((current) => ({ ...current, [thread.gmailThreadId]: event.target.value }))}
                    className="h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                    aria-label="Choose quote or booking"
                  >
                    <option value="">Choose the matching quote or booking</option>
                    {targets.map((target) => (
                      <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>
                        {target.type === "BOOKING" ? "Booking" : "Quote"} {target.reference} · {target.customerName} · {target.detail}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    onClick={() => handleAttach(thread)}
                    disabled={!selection[thread.gmailThreadId] || attaching === thread.gmailThreadId}
                  >
                    {attaching === thread.gmailThreadId ? <LoaderCircle className="animate-spin" /> : <Link2 />}
                    {attaching === thread.gmailThreadId ? "Attaching…" : "Attach thread"}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      }) : (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-12 text-center text-sm text-slate-500">
            {view === "likely"
              ? "No likely customer replies need review."
              : view === "other"
                ? "No other unmatched mail."
                : "No dismissed email threads."}
          </CardContent>
        </Card>
      )}

      {filteredThreads.length > visibleThreads.length ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => setVisibleLimit((current) => current + 25)}>
            Show 25 more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
