"use client";

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowRight, CheckCheck, LoaderCircle, Mail, Send } from "lucide-react";
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
  const sendMessage = useAction(api.gmailActions.sendMessage);
  const markRead = useMutation(api.gmail.markConversationRead);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

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
