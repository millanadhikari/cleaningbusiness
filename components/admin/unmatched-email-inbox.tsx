"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link2, LoaderCircle, MailQuestion, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function UnmatchedEmailInbox() {
  const { isAuthenticated } = useConvexAuth();
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [attaching, setAttaching] = useState<string | null>(null);
  const inbox = useQuery(api.gmail.getUnmatchedInbox, isAuthenticated ? {} : "skip");
  const exactReference = query.trim().toUpperCase();
  const exactTargets = useQuery(
    api.gmail.findEmailAttachTargets,
    isAuthenticated && /^WD\d{4,}$/.test(exactReference) ? { reference: exactReference } : "skip",
  );
  const attach = useMutation(api.gmail.attachUnmatchedThread);

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

  async function handleAttach(gmailThreadId: string, unmatchedMessageId: Id<"unmatchedEmailMessages">) {
    const selected = selection[gmailThreadId];
    if (!selected) return;
    const separator = selected.indexOf(":");
    const type = selected.slice(0, separator);
    const id = selected.slice(separator + 1);
    setAttaching(gmailThreadId);
    try {
      await attach({
        unmatchedMessageId,
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

  if (inbox === undefined) {
    return <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" /> Loading unmatched email…</div>;
  }

  return (
    <div className="space-y-5">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><MailQuestion className="size-5 text-amber-700" /> Unmatched Gmail replies</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                These replies could not be confidently matched by Gmail thread, reply headers, or a WD reference. Attach each Gmail thread to the correct quote or booking.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="bg-amber-50 text-amber-800">{inbox.threads.length} threads</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <label className="relative block max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter quotes or bookings by reference, customer, or address" className="pl-9" />
          </label>
        </CardContent>
      </Card>

      {inbox.threads.length ? inbox.threads.map((thread) => (
        <Card key={thread.gmailThreadId} className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{thread.messages.at(-1)?.subject ?? "(No subject)"}</CardTitle>
            <CardDescription>
              {thread.messages.length} message{thread.messages.length === 1 ? "" : "s"} · latest {formatTimestamp(thread.latestAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
              {thread.messages.map((message) => (
                <article key={message._id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                    <strong className="text-slate-700">{message.from}</strong>
                    <time>{formatTimestamp(message.sentAt)}</time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-6 text-slate-700">{message.bodyText}</p>
                </article>
              ))}
            </div>
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
                onClick={() => handleAttach(thread.gmailThreadId, thread.messages[0]._id)}
                disabled={!selection[thread.gmailThreadId] || attaching === thread.gmailThreadId}
              >
                {attaching === thread.gmailThreadId ? <LoaderCircle className="animate-spin" /> : <Link2 />}
                {attaching === thread.gmailThreadId ? "Attaching…" : "Attach thread"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )) : (
        <Card className="border-slate-200 shadow-sm"><CardContent className="py-12 text-center text-sm text-slate-500">No unmatched Gmail replies.</CardContent></Card>
      )}
    </div>
  );
}
