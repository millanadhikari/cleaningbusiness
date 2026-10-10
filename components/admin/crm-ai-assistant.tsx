"use client";

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { Bot, Check, ChevronDown, LoaderCircle, MessageSquarePlus, Send, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ContextType = "CUSTOMER" | "BOOKING" | "QUOTE" | "EMAIL_THREAD" | "ANALYTICS" | "DASHBOARD";
type Props = { contextType?: ContextType; contextId?: string; role: "ADMIN" | "SUPER_ADMIN" };

const suggestions: Record<ContextType, string[]> = {
  DASHBOARD: ["Show me tomorrow's bookings", "Which jobs need attention?", "Show pending booking change requests"],
  BOOKING: ["Summarise this booking", "Check the payment and outstanding balance", "Show pending changes", "Draft a customer email"],
  CUSTOMER: ["Summarise this customer", "Show recent bookings", "What is their outstanding balance?"],
  QUOTE: ["Summarise this quote", "Does this quote need action?", "Draft a follow-up email"],
  EMAIL_THREAD: ["Summarise this email thread", "Draft a reply", "Identify the customer's request"],
  ANALYTICS: ["Summarise this week", "Show conversion performance", "What changed operationally?"],
};

export function CrmAiAssistant({ contextType = "DASHBOARD", contextId, role }: Props) {
  const { isAuthenticated } = useConvexAuth();
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<Id<"crmAiSessions"> | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const createSession = useMutation(api.crmAiData.createSession);
  const cancelPending = useMutation(api.crmAiData.cancelPendingAction);
  const sendMessage = useAction(api.crmAi.sendMessage);
  const sessions = useQuery(api.crmAiData.listSessions, isAuthenticated ? {} : "skip");
  const activeSessionId = sessionId ?? sessions?.[0]?._id ?? null;
  const messages = useQuery(api.crmAiData.listMessages, isAuthenticated && activeSessionId ? { sessionId: activeSessionId } : "skip");
  const scrollRef = useRef<HTMLDivElement>(null);
  const quickPrompts = useMemo(() => suggestions[contextType], [contextType]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, sending]);

  async function newConversation() {
    const id = await createSession({ contextType, contextId });
    setSessionId(id); setShowHistory(false); setMessage("");
  }
  async function submit(content: string) {
    const clean = content.trim(); if (!clean || sending) return;
    setSending(true); setMessage("");
    try {
      let id = activeSessionId;
      if (!id) { id = await createSession({ contextType, contextId }); setSessionId(id); }
      await sendMessage({ sessionId: id, message: clean, contextType, contextId });
    } catch (error) { toast.error(error instanceof Error ? error.message : "WeDo AI could not respond."); setMessage(clean); }
    finally { setSending(false); }
  }
  async function onSubmit(event: FormEvent) { event.preventDefault(); await submit(message); }
  async function cancelAction() { if (!activeSessionId) return; await cancelPending({ sessionId: activeSessionId }); toast.info("Pending AI action cancelled."); }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-11 items-center gap-2 rounded-xl bg-[#076c63] px-4 text-[13px] font-semibold tracking-[-0.01em] text-[#f7fffc] shadow-[0_10px_28px_rgba(4,86,79,.26)] transition hover:-translate-y-0.5 hover:bg-[#055b54] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51b8aa] focus-visible:ring-offset-2"
        aria-label="Open WeDo AI"
      >
        <Sparkles className="size-4 text-white" />
        <span className="hidden sm:inline">Ask WeDo AI</span>
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-[#102f2c]/20 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-[60] flex w-full max-w-[440px] flex-col border-l border-[#d9e4e0] bg-[#f6f8f7] font-sans shadow-[-16px_0_45px_rgba(18,48,44,.14)] transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        <header className="bg-[#075f58] px-5 py-4 text-[#f7fffc]">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/12 text-white ring-1 ring-white/15">
              <Bot className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold leading-5 tracking-[-0.01em] text-white">WeDo AI</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#e5f4f0] ring-1 ring-white/15">
                  <span className="size-1.5 rounded-full bg-[#8de0ca]" /> Internal
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-4 text-[#d8ebe7]">
                CRM assistant · {role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-8 place-items-center rounded-lg text-[#e6f3f0] transition hover:bg-white/10 hover:text-white"
              aria-label="Close assistant"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="border-b border-[#dde7e3] bg-white px-4 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              className="flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-[#d9e4e0] bg-white px-3 text-[12px] font-medium text-[#354e4a] transition hover:border-[#a9c8c1] hover:bg-[#f8fbfa]"
              onClick={() => setShowHistory(value => !value)}
            >
              <span className="truncate">
                {activeSessionId && sessions?.find(row => row._id === activeSessionId)?.title || "Conversations"}
              </span>
              <ChevronDown className={cn("size-3.5 shrink-0 text-[#718681] transition", showHistory && "rotate-180")} />
            </button>
            <button
              type="button"
              onClick={newConversation}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-[#d9e4e0] bg-white px-3 text-[12px] font-semibold text-[#176b62] transition hover:border-[#a9c8c1] hover:bg-[#f1f8f5]"
            >
              <MessageSquarePlus className="size-3.5" /> New
            </button>
          </div>
          {showHistory ? (
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[#dce6e2] bg-white p-1.5 shadow-sm">
              {sessions?.length ? sessions.map(row => (
                <button
                  key={row._id}
                  type="button"
                  onClick={() => { setSessionId(row._id); setShowHistory(false); }}
                  className={cn(
                    "block w-full rounded-lg px-3 py-2 text-left transition",
                    row._id === activeSessionId ? "bg-[#e9f5f1]" : "hover:bg-[#f4f7f6]",
                  )}
                >
                  <span className="block truncate text-[12px] font-semibold text-[#28433f]">{row.title || "New conversation"}</span>
                  <span className="mt-0.5 block text-[10px] text-[#7b8c88]">
                    {new Date(row.lastMessageAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" })}
                  </span>
                </button>
              )) : <p className="p-3 text-[12px] text-[#71817d]">No previous conversations.</p>}
            </div>
          ) : null}
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {!messages?.length ? (
            <section className="rounded-2xl border border-[#dce8e4] bg-white p-4 shadow-[0_4px_14px_rgba(22,59,54,.04)]">
              <div className="flex items-center gap-2 text-[#176b62]">
                <Sparkles className="size-3.5" />
                <p className="text-[11px] font-bold uppercase tracking-[0.09em]">Suggested questions</p>
              </div>
              <p className="mt-2 text-[13px] font-semibold leading-5 text-[#253f3b]">What would you like to know?</p>
              <p className="mt-1 text-[12px] leading-[1.55] text-[#687b77]">
                Search CRM records, summarise operations, or prepare a customer reply.
              </p>
              <div className="mt-3 grid gap-2">
                {quickPrompts.map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submit(prompt)}
                    className="rounded-xl border border-[#dce7e3] bg-[#f8faf9] px-3 py-2.5 text-left text-[12px] font-medium leading-[1.45] text-[#36514c] transition hover:border-[#92bdb4] hover:bg-[#edf6f2] hover:text-[#0c625a]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {messages?.map(row => (
            <div key={row._id} className={cn("flex gap-2", row.role === "USER" && "justify-end")}>
              {row.role !== "USER" ? (
                <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg bg-[#e5f2ee] text-[#176b62]">
                  <Bot className="size-3.5" />
                </span>
              ) : null}
              <div
                className={cn(
                  "max-w-[84%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-[1.55] whitespace-pre-wrap shadow-sm",
                  row.role === "USER"
                    ? "rounded-br-md bg-[#076c63] text-[#f7fffc]"
                    : "rounded-bl-md border border-[#dde6e3] bg-white text-[#2f4541]",
                )}
              >
                <p>{row.content}</p>
                <time className={cn("mt-1.5 block text-[9px] font-medium", row.role === "USER" ? "text-white/70" : "text-[#899793]")}>
                  {new Date(row.createdAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" })}
                </time>
              </div>
            </div>
          ))}
          {sending ? (
            <div className="flex items-center gap-2 pl-9 text-[12px] text-[#6f807c]">
              <LoaderCircle className="size-3.5 animate-spin text-[#176b62]" /> Checking CRM data…
            </div>
          ) : null}
        </div>

        <div className="border-t border-[#dce6e2] bg-white p-3.5">
          {activeSessionId && sessions?.find(row => row._id === activeSessionId)?.pendingAction ? (
            <div className="mb-3 rounded-xl border border-[#efd69b] bg-[#fff9e9] p-3">
              <p className="text-[12px] font-semibold text-[#5d4718]">Internal note awaiting confirmation</p>
              <p className="mt-1 line-clamp-3 text-[11px] leading-[1.5] text-[#75602d]">
                {sessions.find(row => row._id === activeSessionId)?.pendingAction?.body}
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" onClick={() => submit("Confirm")} disabled={sending} className="h-8 bg-[#076c63] px-3 text-[11px] font-semibold text-white hover:bg-[#055b54]">
                  <Check className="size-3.5" /> Confirm
                </Button>
                <Button size="sm" variant="outline" onClick={cancelAction} className="h-8 px-3 text-[11px]">Cancel</Button>
              </div>
            </div>
          ) : null}
          <form onSubmit={onSubmit} className="flex items-end gap-2 rounded-xl border border-[#d7e2de] bg-[#f8faf9] p-1.5 focus-within:border-[#76aa9f] focus-within:ring-2 focus-within:ring-[#76aa9f]/15">
            <Textarea
              value={message}
              onChange={event => setMessage(event.target.value)}
              onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(message); } }}
              rows={2}
              maxLength={2000}
              placeholder="Ask about bookings, customers, quotes or email…"
              className="min-h-11 resize-none border-0 bg-transparent px-2 py-2 text-[13px] leading-5 text-[#2e4541] shadow-none placeholder:text-[#8a9995] focus-visible:ring-0"
            />
            <Button
              type="submit"
              size="icon"
              disabled={sending || !message.trim()}
              className="size-9 shrink-0 rounded-lg bg-[#076c63] text-white shadow-none hover:bg-[#055b54] disabled:bg-[#c8d7d3] disabled:text-white"
              aria-label="Send message"
            >
              <Send className="size-4" />
            </Button>
          </form>
          <p className="mt-2 text-center text-[9px] leading-4 text-[#8a9894]">Verify important details before taking action.</p>
        </div>
      </aside>
    </>
  );
}
