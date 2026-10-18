"use client";

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { Bot, Check, ChevronDown, LoaderCircle, MessageSquarePlus, Send, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  return text.split("**").flatMap((boldPart, boldIndex) =>
    boldPart.split(/(`[^`]+`)/g).filter(Boolean).map((part, codeIndex) => {
      const key = `${keyPrefix}-${boldIndex}-${codeIndex}`;
      const rendered = part.startsWith("`") && part.endsWith("`")
        ? <code className="rounded bg-[#edf4f1] px-1 py-0.5 font-mono text-[11px] text-[#28524b]">{part.slice(1, -1)}</code>
        : part;
      return boldIndex % 2 === 1
        ? <strong key={key} className="font-semibold text-[#173f3b]">{rendered}</strong>
        : <span key={key}>{rendered}</span>;
    }),
  );
}

function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.split("|").length >= 4;
}

function isTableDivider(line: string) {
  return line.replace(/[|:\s-]/g, "").length === 0;
}

function tableCells(line: string) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
}

function MessageContent({ content, plain = false }: { content: string; plain?: boolean }) {
  if (plain) return <div>{content}</div>;

  const normalised = content
    .replace(/\r\n?/g, "\n")
    .replace(/\s+-\s+(?=\*\*[^*]+\*\*:)/g, "\n- ")
    .trim();
  const lines = normalised.split("\n");
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    if (/^---+$/.test(line)) {
      blocks.push(<div key={`rule-${index}`} className="my-2 h-px bg-[#dfe9e5]" />);
      index += 1;
      continue;
    }

    if (isTableRow(line)) {
      const rows: string[][] = [];
      let cursor = index;
      while (cursor < lines.length && isTableRow(lines[cursor])) {
        if (!isTableDivider(lines[cursor])) rows.push(tableCells(lines[cursor]));
        cursor += 1;
      }
      const hasHeader = index + 1 < lines.length && isTableDivider(lines[index + 1]);
      blocks.push(
        <div key={`table-${index}`} className="my-2 overflow-x-auto rounded-lg border border-[#dbe7e3]">
          <table className="w-full border-collapse text-left text-[11px] leading-4">
            {hasHeader && rows[0] ? (
              <thead className="bg-[#edf6f2] text-[#28524b]">
                <tr>{rows[0].map((cell, cellIndex) => <th key={cellIndex} className="border-b border-[#d5e4df] px-2 py-1.5 font-semibold">{renderInlineMarkdown(cell, `th-${index}-${cellIndex}`)}</th>)}</tr>
              </thead>
            ) : null}
            <tbody className="divide-y divide-[#e8efec]">
              {rows.slice(hasHeader ? 1 : 0).map((row, rowIndex) => (
                <tr key={rowIndex} className="even:bg-[#f8faf9]">
                  {row.map((cell, cellIndex) => <td key={cellIndex} className="px-2 py-1.5 align-top text-[#405a55]">{renderInlineMarkdown(cell, `td-${index}-${rowIndex}-${cellIndex}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      index = cursor;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      let cursor = index;
      while (cursor < lines.length && /^[-*]\s+/.test(lines[cursor].trim())) {
        items.push(lines[cursor].trim().replace(/^[-*]\s+/, ""));
        cursor += 1;
      }
      blocks.push(
        <ul key={`list-${index}`} className="my-1.5 space-y-1 pl-4 marker:text-[#168675]">
          {items.map((item, itemIndex) => <li key={itemIndex} className="list-disc pl-0.5">{renderInlineMarkdown(item, `li-${index}-${itemIndex}`)}</li>)}
        </ul>,
      );
      index = cursor;
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      let cursor = index;
      while (cursor < lines.length && /^\d+[.)]\s+/.test(lines[cursor].trim())) {
        items.push(lines[cursor].trim().replace(/^\d+[.)]\s+/, ""));
        cursor += 1;
      }
      blocks.push(
        <ol key={`ordered-${index}`} className="my-1.5 space-y-1 pl-4 marker:font-semibold marker:text-[#168675]">
          {items.map((item, itemIndex) => <li key={itemIndex} className="list-decimal pl-0.5">{renderInlineMarkdown(item, `ordered-${index}-${itemIndex}`)}</li>)}
        </ol>,
      );
      index = cursor;
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      blocks.push(<div key={`heading-${index}`} className="mt-2 font-semibold text-[#173f3b]">{renderInlineMarkdown(line.replace(/^#{1,3}\s+/, ""), `heading-${index}`)}</div>);
    } else {
      blocks.push(<div key={`text-${index}`} className="my-1">{renderInlineMarkdown(line, `text-${index}`)}</div>);
    }
    index += 1;
  }

  return <div className="space-y-1">{blocks}</div>;
}

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
        className="fixed bottom-5 right-5 z-40 flex h-10 items-center gap-2 rounded-xl bg-[#076c63] px-3.5 text-[12px] font-semibold tracking-[-0.01em] !text-white shadow-[0_10px_28px_rgba(4,86,79,.26)] transition hover:-translate-y-0.5 hover:bg-[#055b54] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51b8aa] focus-visible:ring-offset-2 [&_svg]:!text-white"
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
          "fixed inset-y-0 right-0 z-[60] flex w-full max-w-[420px] flex-col border-l border-[#d9e4e0] bg-[#f6f8f7] font-sans shadow-[-16px_0_45px_rgba(18,48,44,.14)] transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        <header className="bg-[#075f58] px-4 py-2.5 text-white">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/12 text-white ring-1 ring-white/15">
              <Bot className="size-4 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div role="heading" aria-level={2} className="text-[14px] font-semibold leading-4 tracking-[-0.01em] !text-white">WeDo AI</div>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] !text-white ring-1 ring-white/20">
                  <span className="size-1.5 rounded-full bg-[#8de0ca]" /> Internal
                </span>
              </div>
              <div className="mt-0.5 text-[10px] leading-3.5 !text-[#e4f2ef]">
                CRM assistant · {role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-7 place-items-center rounded-lg !text-white transition hover:bg-white/15 [&_svg]:!text-white"
              aria-label="Close assistant"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="border-b border-[#dde7e3] bg-white px-3 py-2">
          <div className="flex gap-2">
            <button
              type="button"
              className="flex h-8 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-[#b8d2cc] bg-white px-2.5 text-[11px] font-semibold !text-[#24443f] transition hover:border-[#78aa9f] hover:bg-[#f1f8f5]"
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
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#8cb8af] bg-white px-2.5 text-[11px] font-semibold !text-[#075f58] transition hover:border-[#076c63] hover:bg-[#076c63] hover:!text-white [&_svg]:text-current"
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
              )) : <div className="p-3 text-[12px] text-[#71817d]">No previous conversations.</div>}
            </div>
          ) : null}
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
          {!messages?.length ? (
            <section className="rounded-2xl border border-[#dce8e4] bg-white p-4 shadow-[0_4px_14px_rgba(22,59,54,.04)]">
              <div className="flex items-center gap-2 text-[#176b62]">
                <Sparkles className="size-3.5" />
                <div className="text-[11px] font-bold uppercase tracking-[0.09em]">Suggested questions</div>
              </div>
              <div className="mt-2 text-[13px] font-semibold leading-5 text-[#253f3b]">What would you like to know?</div>
              <div className="mt-1 text-[12px] leading-[1.55] text-[#687b77]">
                Search CRM records, summarise operations, or prepare a customer reply.
              </div>
              <div className="mt-3 grid gap-2">
                {quickPrompts.map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submit(prompt)}
                    className="rounded-xl border border-[#a8c9c1] bg-white px-3 py-2.5 text-left text-[12px] font-semibold leading-[1.45] !text-[#24443f] transition hover:border-[#076c63] hover:bg-[#076c63] hover:!text-white"
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
                    ? "rounded-br-md bg-[#076c63] !text-white [&_*]:!text-white"
                    : "rounded-bl-md border border-[#dde6e3] bg-white text-[#2f4541]",
                )}
              >
                <MessageContent content={row.content} plain={row.role === "USER"} />
                <time className={cn("mt-1.5 block text-[9px] font-medium", row.role === "USER" ? "!text-[#dcefeb]" : "text-[#899793]")}>
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

        <div className="border-t border-[#dce6e2] bg-white p-2.5">
          {activeSessionId && sessions?.find(row => row._id === activeSessionId)?.pendingAction ? (
            <div className="mb-2 rounded-xl border border-[#efd69b] bg-[#fff9e9] p-2.5">
              <div className="text-[12px] font-semibold text-[#5d4718]">Internal note awaiting confirmation</div>
              <div className="mt-1 line-clamp-3 text-[11px] leading-[1.5] text-[#75602d]">
                {sessions.find(row => row._id === activeSessionId)?.pendingAction?.body}
              </div>
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" onClick={() => submit("Confirm")} disabled={sending} className="h-7 bg-[#076c63] px-2.5 text-[10px] font-semibold !text-white hover:bg-[#055b54] [&_svg]:!text-white">
                  <Check className="size-3.5" /> Confirm
                </Button>
                <Button size="sm" variant="outline" onClick={cancelAction} className="h-7 border-[#b8d2cc] px-2.5 text-[10px] !text-[#24443f]">Cancel</Button>
              </div>
            </div>
          ) : null}
          <form onSubmit={onSubmit} className="flex items-end gap-1.5 rounded-xl border border-[#9ebfb8] bg-white p-1 focus-within:border-[#076c63] focus-within:ring-2 focus-within:ring-[#76aa9f]/15">
            <Textarea
              value={message}
              onChange={event => setMessage(event.target.value)}
              onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(message); } }}
              rows={1}
              maxLength={2000}
              placeholder="Ask about bookings, customers, quotes or email…"
              className="min-h-9 max-h-24 resize-none border-0 bg-transparent px-2 py-1.5 text-[12px] leading-5 !text-[#203d38] shadow-none placeholder:!text-[#667b76] focus-visible:ring-0"
            />
            <Button
              type="submit"
              size="icon"
              disabled={sending || !message.trim()}
              className="size-8 shrink-0 rounded-lg bg-[#076c63] !text-white shadow-none hover:bg-[#055b54] disabled:bg-[#c8d7d3] disabled:!text-white [&_svg]:!text-white"
              aria-label="Send message"
            >
              <Send className="size-4" />
            </Button>
          </form>
          <div className="mt-1 text-center text-[8px] leading-3 text-[#71827e]">Verify important details before taking action.</div>
        </div>
      </aside>
    </>
  );
}
