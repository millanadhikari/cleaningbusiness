"use client";

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowRight, BrainCircuit, CalendarPlus, CheckCheck, LoaderCircle, Mail, RefreshCw, Send, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type EmailConversationProps =
  | { quoteId: Id<"quoteRequests">; bookingId?: never; className?: string }
  | { bookingId: Id<"bookings">; quoteId?: never; className?: string };

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function EmailConversation(props: EmailConversationProps) {
  const { isAuthenticated } = useConvexAuth();
  const queryArgs = "quoteId" in props ? { quoteId: props.quoteId } : { bookingId: props.bookingId };
  const conversation = useQuery(api.gmail.getConversation, isAuthenticated ? queryArgs : "skip");
  const requestedDate = conversation?.thread?.analysis?.extractedRequestedDate;
  const availableSlots = useQuery(
    api.availability.listPublic,
    isAuthenticated && requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? { fromDate: requestedDate, toDate: requestedDate }
      : "skip",
  );
  const sendMessage = useAction(api.gmailActions.sendMessage);
  const markRead = useMutation(api.gmail.markConversationRead);
  const draftReply = useAction(api.emailAi.draftReply);
  const reviewInsight = useMutation(api.emailAi.reviewInsight);
  const retryAnalysis = useMutation(api.emailAi.retryAnalysis);
  const createFollowUp = useMutation(api.emailAi.createFollowUp);
  const createBookingRequest = useMutation(api.emailAi.createBookingRequestFromInsight);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState("Follow up on customer email");
  const [followUpDue, setFollowUpDue] = useState(() => new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 16));
  const [confirmRequest, setConfirmRequest] = useState<"RESCHEDULE" | "CANCELLATION" | null>(null);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversation?.recipient) return;
    setSending(true);
    try {
      await sendMessage({
        ...queryArgs,
        to: conversation.recipient,
        subject: conversation.thread?.subject ?? subject,
        bodyText,
      });
      setBodyText("");
      toast.success(conversation.thread ? "Reply sent through Gmail." : "Email sent through Gmail.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gmail could not send this email.");
    } finally {
      setSending(false);
    }
  }

  async function handleMarkRead() {
    setMarkingRead(true);
    try {
      await markRead(queryArgs);
      toast.success("Conversation marked as read.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Conversation could not be marked as read.");
    } finally {
      setMarkingRead(false);
    }
  }

  async function handleDraftReply() {
    if (!conversation?.thread) return;
    setDrafting(true);
    try {
      const result = await draftReply({ threadId: conversation.thread._id });
      setBodyText(result.draft);
      toast.success("AI reply draft added below. Review it before sending.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A reply draft could not be generated.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleReview(action: "DISMISS" | "CLOSE" | "REOPEN" | "HANDLED" | "PRIORITY", priority?: "URGENT" | "HIGH" | "NORMAL" | "LOW") {
    if (!conversation?.thread) return;
    setReviewing(true);
    try {
      await reviewInsight({ threadId: conversation.thread._id, action, priority });
      toast.success(priority ? "Email priority updated." : "Email insight updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The email insight could not be updated.");
    } finally {
      setReviewing(false);
    }
  }

  async function handleCreateFollowUp() {
    if (!conversation?.thread) return;
    const dueAt = Date.parse(followUpDue);
    if (!followUpTitle.trim() || !Number.isFinite(dueAt)) return;
    setReviewing(true);
    try {
      await createFollowUp({
        threadId: conversation.thread._id,
        title: followUpTitle,
        dueAt,
        idempotencyKey: `email:${conversation.thread._id}:${dueAt}:${followUpTitle.trim().toLowerCase()}`,
      });
      setShowFollowUp(false);
      toast.success("Follow-up created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The follow-up could not be created.");
    } finally {
      setReviewing(false);
    }
  }

  async function handleCreateBookingRequest() {
    if (!conversation?.thread || !confirmRequest) return;
    setReviewing(true);
    try {
      await createBookingRequest({
        threadId: conversation.thread._id,
        kind: confirmRequest,
        confirmed: true,
        idempotencyKey: `email-ai:${conversation.thread._id}:${conversation.thread.analysis?._id}:${confirmRequest}`,
      });
      toast.success(confirmRequest === "RESCHEDULE" ? "Booking change request created for staff review." : "Cancellation request created for staff review.");
      setConfirmRequest(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The request could not be created.");
    } finally {
      setReviewing(false);
    }
  }

  const recordId = queryArgs.quoteId ?? queryArgs.bookingId;

  return (
    <Card className={cn("gap-5 border-slate-200 shadow-sm", props.className)}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4 text-emerald-700" /> Email conversation
            </CardTitle>
            <CardDescription className="mt-1">
              Send from the connected company Gmail account. Transactional emails remain separate.
            </CardDescription>
          </div>
          {conversation?.connected ? (
            <div className="flex flex-wrap items-center gap-2">
              {conversation.thread?.unreadCount ? (
                <Badge className="bg-sky-100 text-sky-800">
                  {conversation.thread.unreadCount} unread
                </Badge>
              ) : null}
              <Badge className="bg-emerald-50 text-emerald-800">Gmail connected</Badge>
            </div>
          ) : (
            <Badge variant="secondary" className="bg-amber-50 text-amber-800">Gmail not connected</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {conversation === undefined ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <LoaderCircle className="size-4 animate-spin" /> Loading conversation…
          </div>
        ) : conversation.movedToBookingId ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <p>This conversation moved with the accepted quote and is now active on the booking.</p>
            <Button asChild variant="outline" size="sm" className="mt-3 bg-white">
              <Link href={`/admin/bookings/${conversation.movedToBookingId}`}>
                Open booking conversation <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {conversation.thread?.analysis ? (
              <section className="rounded-2xl border border-emerald-200 bg-[linear-gradient(135deg,#f3faf7,#ffffff)] p-4 shadow-sm" aria-label="AI email insight">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><BrainCircuit className="size-4" /></span>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">AI Insight</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="border-emerald-200 bg-white text-[10px] text-emerald-900">{conversation.thread.analysis.primaryIntent.replaceAll("_", " ")}</Badge>
                        <Badge className={cn("text-[10px]", conversation.thread.analysis.priority === "URGENT" ? "bg-red-100 text-red-800" : conversation.thread.analysis.priority === "HIGH" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700")}>{conversation.thread.analysis.priority}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{conversation.thread.status.replaceAll("_", " ")}</Badge>
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={() => handleReview("DISMISS")} disabled={reviewing} className="grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800" aria-label="Dismiss AI insight"><X className="size-4" /></button>
                </div>

                {conversation.thread.analysis.status === "FAILED" ? (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <span>AI analysis is temporarily unavailable. Gmail and normal email actions still work.</span>
                    <Button type="button" size="sm" variant="outline" className="h-8 bg-white" onClick={() => retryAnalysis({ analysisId: conversation.thread!.analysis!._id })}><RefreshCw /> Retry</Button>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 text-sm leading-6 text-slate-700">{conversation.thread.analysis.summary}</div>
                    {(conversation.thread.analysis.extractedRequestedDate || conversation.thread.analysis.extractedRequestedTime) ? (
                      <div className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-emerald-100">
                        Customer requested: {[conversation.thread.analysis.extractedRequestedDate, conversation.thread.analysis.extractedRequestedTime].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                    {conversation.thread.analysis.primaryIntent === "RESCHEDULE_REQUEST" && requestedDate ? (
                      <div className="mt-2 rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs text-sky-900">
                        <div className="font-semibold">Current availability for {requestedDate}</div>
                        <div className="mt-1">{availableSlots === undefined ? "Checking availability…" : availableSlots.length ? availableSlots.slice(0, 6).map(slot => slot.time).join(" · ") : "No public slots are currently available."}</div>
                        <div className="mt-1 text-[10px] text-sky-700">Availability is live and not reserved.</div>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" onClick={handleDraftReply} disabled={drafting} className="h-8 bg-emerald-700 text-xs text-white hover:bg-emerald-800">
                        {drafting ? <LoaderCircle className="animate-spin" /> : <Mail />} {drafting ? "Drafting…" : "Draft reply"}
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 bg-white text-xs" onClick={() => setShowFollowUp(value => !value)}><CalendarPlus /> Follow up</Button>
                      {conversation.thread.analysis.primaryIntent === "RESCHEDULE_REQUEST" && conversation.thread.bookingId ? (
                        <Button type="button" size="sm" variant="outline" className="h-8 bg-white text-xs" onClick={() => setConfirmRequest("RESCHEDULE")}>Create change request</Button>
                      ) : null}
                      {conversation.thread.analysis.primaryIntent === "CANCELLATION_REQUEST" && conversation.thread.bookingId ? (
                        <Button type="button" size="sm" variant="outline" className="h-8 border-red-200 bg-white text-xs text-red-700" onClick={() => setConfirmRequest("CANCELLATION")}>Prepare cancellation request</Button>
                      ) : null}
                      <select
                        aria-label="Email priority"
                        value={conversation.thread.analysis.priority}
                        disabled={reviewing}
                        onChange={(event) => handleReview("PRIORITY", event.target.value as "URGENT" | "HIGH" | "NORMAL" | "LOW")}
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                      >
                        <option value="URGENT">Urgent</option><option value="HIGH">High</option><option value="NORMAL">Normal</option><option value="LOW">Low</option>
                      </select>
                      <span className="text-[11px] text-slate-500">Suggested: {conversation.thread.analysis.suggestedAction?.replaceAll("_", " ") ?? "Staff review"}</span>
                    </div>
                    {showFollowUp ? (
                      <div className="mt-3 grid gap-2 rounded-xl border border-emerald-100 bg-white p-3 sm:grid-cols-[1fr_180px_auto]">
                        <Input value={followUpTitle} onChange={event => setFollowUpTitle(event.target.value)} maxLength={160} aria-label="Follow-up title" />
                        <Input type="datetime-local" value={followUpDue} onChange={event => setFollowUpDue(event.target.value)} aria-label="Follow-up due date" />
                        <Button type="button" size="sm" onClick={handleCreateFollowUp} disabled={reviewing}>Confirm follow-up</Button>
                      </div>
                    ) : null}
                    {confirmRequest ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                        <div className="font-semibold">Confirm {confirmRequest === "RESCHEDULE" ? "booking change" : "cancellation"} request</div>
                        <div className="mt-1 leading-5">This creates a pending staff-review request only. It will not change or cancel the booking{confirmRequest === "CANCELLATION" ? ", and any payment or refund still requires separate human review" : ""}.</div>
                        <div className="mt-2 flex gap-2">
                          <Button type="button" size="sm" className="h-8" onClick={handleCreateBookingRequest} disabled={reviewing}>Confirm request</Button>
                          <Button type="button" size="sm" variant="outline" className="h-8 bg-white" onClick={() => setConfirmRequest(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}
            {conversation.thread?.messages.length ? (
              <div className="max-h-[32rem] space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3 sm:p-4">
                {conversation.thread.unreadCount ? (
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={handleMarkRead} disabled={markingRead} className="bg-white">
                      {markingRead ? <LoaderCircle className="animate-spin" /> : <CheckCheck />}
                      {markingRead ? "Marking…" : "Mark all read"}
                    </Button>
                  </div>
                ) : null}
                {conversation.thread.messages.map((message) => (
                  <article
                    key={message._id}
                    className={cn(
                      "max-w-[92%] rounded-2xl border p-4 text-sm shadow-sm",
                      message.direction === "OUTBOUND" ? "ml-auto border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex min-w-0 items-center gap-2">
                        {message.isUnread ? <span className="size-2 shrink-0 rounded-full bg-sky-500" aria-label="Unread message" /> : null}
                        <strong className="truncate text-slate-700">
                          {message.direction === "OUTBOUND" ? message.senderName ?? "Admin" : message.from}
                        </strong>
                        {message.direction === "INBOUND" ? (
                          <Badge variant="secondary" className="bg-white text-[10px] text-slate-600">Customer</Badge>
                        ) : null}
                      </div>
                      <time dateTime={new Date(message.sentAt).toISOString()}>{formatTimestamp(message.sentAt)}</time>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap leading-6 text-slate-800">{message.bodyText}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                No Gmail messages have been sent for this record yet.
              </p>
            )}

            <form onSubmit={handleSend} className="space-y-4 border-t border-slate-100 pt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`email-to-${recordId}`}>To</Label>
                  <Input id={`email-to-${recordId}`} value={conversation.recipient ?? ""} placeholder="Customer email required" readOnly className="bg-slate-50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`email-subject-${recordId}`}>Subject</Label>
                  <Input
                    id={`email-subject-${recordId}`}
                    value={conversation.thread?.subject ?? subject}
                    onChange={(event) => setSubject(event.target.value)}
                    readOnly={Boolean(conversation.thread)}
                    className={conversation.thread ? "bg-slate-50" : undefined}
                    maxLength={300}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`email-body-${recordId}`}>{conversation.thread ? "Reply" : "Message"}</Label>
                <Textarea
                  id={`email-body-${recordId}`}
                  value={bodyText}
                  onChange={(event) => setBodyText(event.target.value)}
                  rows={6}
                  maxLength={100000}
                  placeholder={conversation.thread ? "Write a reply…" : "Write an email…"}
                  required
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={sending || !conversation.connected || !conversation.recipient}>
                  {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
                  {sending ? "Sending…" : conversation.thread ? "Send reply" : "Send email"}
                </Button>
              </div>
              {!conversation.recipient ? (
                <p className="text-xs text-amber-700">Add an email address to the customer record before sending.</p>
              ) : !conversation.connected ? (
                <p className="text-xs text-amber-700">A Super Admin must connect the company Gmail account in Settings.</p>
              ) : null}
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
