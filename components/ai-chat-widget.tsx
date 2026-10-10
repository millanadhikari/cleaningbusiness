"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Bot, MessageCircle, Plus, Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { getWebsiteSessionId } from "@/lib/website-analytics";
import styles from "./ai-chat-widget.module.css";

const STORAGE_KEY = "wdc_ai_chat_session";
const quickActions = ["Get a quote", "Book a cleaning", "Ask a question", "Talk to a person"];

function chatSessionId() {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function AiChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ensureSession = useMutation(api.chat.ensureSession);
  const sendMessage = useAction(api.chat.sendMessage);
  const trackEvent = useMutation(api.websiteAnalytics.trackEvent);
  const messages = useQuery(api.chat.listMessages, sessionId ? { sessionId } : "skip");
  const hidden = ["/admin", "/agency", "/cleaner", "/sign-in", "/accept-invitation", "/api"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setSessionId(chatSessionId()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    void ensureSession({ sessionId, websiteSessionId: getWebsiteSessionId() }).catch(() => undefined);
  }, [ensureSession, sessionId]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (hidden) return null;

  async function submit(value: string) {
    const message = value.trim();
    if (!sessionId || !message || sending) return;
    setInput("");
    setError("");
    setSending(true);
    try {
      await sendMessage({
        sessionId,
        websiteSessionId: getWebsiteSessionId(),
        message: message.slice(0, 1200),
        page: pathname,
      });
    } catch (cause) {
      setInput(message);
      setError(cause instanceof Error ? cause.message : "Message failed. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function newConversation() {
    const created = crypto.randomUUID();
    try { localStorage.setItem(STORAGE_KEY, created); } catch {}
    setSessionId(created);
    setInput("");
    setError("");
  }

  function openChat() {
    setOpen(true);
    const websiteSessionId = getWebsiteSessionId();
    if (websiteSessionId) {
      void trackEvent({ sessionId: websiteSessionId, page: pathname, eventType: "AI_CHAT_OPENED" }).catch(() => undefined);
    }
  }

  return (
    <>
      {!open ? (
        <button type="button" className={styles.launcher} onClick={openChat} aria-label="Open virtual assistant">
          <MessageCircle /><span>Ask WeDo</span>
        </button>
      ) : (
        <section className={styles.panel} role="dialog" aria-modal="false" aria-label="We Do Cleaning Assistant">
          <header className={styles.header}>
            <span className={styles.avatar}><Bot /></span>
            <div className={styles.title}><strong>We Do Cleaning Assistant</strong><small><i className={styles.status} />Virtual Assistant</small></div>
            <button type="button" className={styles.iconButton} onClick={newConversation} aria-label="Start new conversation"><Plus /></button>
            <button type="button" className={styles.iconButton} onClick={() => setOpen(false)} aria-label="Close assistant"><X /></button>
          </header>
          <div className={styles.messages} ref={scrollRef} aria-live="polite">
            {!messages?.length ? <><p className={styles.welcome}>Hi! I can answer questions about our cleaning services and help calculate an estimate. What can I help with?</p><div className={styles.quick}>{quickActions.map((label) => <button key={label} type="button" onClick={() => void submit(label)}>{label}</button>)}</div></> : null}
            {messages?.map((message) => <div key={message.id} className={`${styles.bubble} ${message.role === "USER" ? styles.user : styles.assistant}`}>{message.content}<time className={styles.time}>{new Date(message.createdAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</time></div>)}
            {sending ? <div className={`${styles.bubble} ${styles.assistant} ${styles.typing}`} aria-label="Assistant is typing"><i /><i /><i /></div> : null}
            {error ? <p className={styles.error}>{error} <button type="button" onClick={() => void submit(input)}>Retry</button></p> : null}
          </div>
          <form className={styles.composer} onSubmit={(event: FormEvent) => { event.preventDefault(); void submit(input); }}>
            <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} maxLength={1200} rows={1} placeholder="Ask about a service or estimate…" aria-label="Message" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(input); } }} />
            <button className={styles.send} type="submit" disabled={!input.trim() || sending} aria-label="Send message"><Send /></button>
          </form>
          <div className={styles.footer}>AI can make mistakes. Prices are only shown from our live estimator.</div>
        </section>
      )}
    </>
  );
}
