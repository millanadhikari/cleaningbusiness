import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { requireRole } from "./lib/auth";

const roles = ["SUPER_ADMIN", "ADMIN"] as const;
const contextType = v.union(
  v.literal("CUSTOMER"), v.literal("BOOKING"), v.literal("QUOTE"),
  v.literal("EMAIL_THREAD"), v.literal("ANALYTICS"), v.literal("DASHBOARD"),
);
type ToolArgs = Record<string, unknown>;

function text(args: ToolArgs, key: string) {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function numberValue(args: ToolArgs, key: string) {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function limit(args: ToolArgs) { return Math.min(25, Math.max(1, Math.floor(numberValue(args, "limit") ?? 10))); }
function date(value: string | undefined, fallback: string) {
  const selected = value ?? fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selected) || Number.isNaN(Date.parse(`${selected}T12:00:00Z`))) throw new Error("Use dates in YYYY-MM-DD format.");
  return selected;
}
function today() { return new Date().toISOString().slice(0, 10); }
function money(cents: number) { return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100); }
function userName(user: Doc<"users">) { return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Admin"; }

async function paidCents(ctx: QueryCtx, booking: Doc<"bookings">) {
  const [payments, adjustments] = await Promise.all([
    ctx.db.query("bookingPayments").withIndex("by_booking_and_created_at", q => q.eq("bookingId", booking._id)).collect(),
    ctx.db.query("bookingAdjustments").withIndex("by_booking_and_created_at", q => q.eq("bookingId", booking._id)).collect(),
  ]);
  const adjustmentsTotal = adjustments.reduce((sum, row) => sum + row.amountCents, 0);
  const hasInitial = payments.some(row => row.kind === "INITIAL");
  const legacyPaid = booking.paymentLedgerInitializedAt || hasInitial ? 0
    : booking.paymentStatus === "PAID" ? (booking.estimatedTotalCents ?? booking.finalTotalCents - adjustmentsTotal)
      : booking.paymentStatus === "DEPOSIT_PAID" ? (booking.depositAmountCents ?? 0) : 0;
  return legacyPaid + payments.filter(row => row.status === "PAID").reduce((sum, row) => sum + row.amountCents, 0);
}

async function bookingView(ctx: QueryCtx, booking: Doc<"bookings">) {
  const [customer, service, changes, notes, thread, paid] = await Promise.all([
    ctx.db.get(booking.customerId), ctx.db.get(booking.serviceId),
    ctx.db.query("bookingChangeRequests").withIndex("by_booking_and_status", q => q.eq("bookingId", booking._id).eq("status", "PENDING")).take(10),
    ctx.db.query("bookingNotes").withIndex("by_booking_and_created_at", q => q.eq("bookingId", booking._id)).order("desc").take(5),
    ctx.db.query("emailThreads").withIndex("by_booking", q => q.eq("bookingId", booking._id)).first(),
    paidCents(ctx, booking),
  ]);
  return {
    id: booking._id, reference: booking.reference ?? String(booking._id),
    customer: customer ? { id: customer._id, name: [customer.firstName, customer.lastName].filter(Boolean).join(" "), email: customer.email, phone: customer.phone } : null,
    service: service?.name ?? "Unknown service", scheduledDate: booking.scheduledDate, scheduledTime: booking.scheduledTime,
    status: booking.status, paymentStatus: booking.paymentStatus, finalTotal: money(booking.finalTotalCents),
    amountPaid: money(paid), outstanding: money(Math.max(0, booking.finalTotalCents - paid)), outstandingCents: Math.max(0, booking.finalTotalCents - paid),
    location: [booking.suburb, booking.state, booking.postcode].join(" "),
    recentNotes: notes.map(note => ({ kind: note.kind, body: note.body.slice(0, 500), createdAt: note.createdAt })),
    pendingChanges: changes.map(row => ({ type: row.type, requestedChanges: row.requestedChanges, reason: row.reason, createdAt: row.createdAt })),
    communication: thread ? { threadId: thread._id, subject: thread.subject, status: thread.status, lastMessageAt: thread.lastMessageAt, unreadCount: thread.unreadCount ?? 0 } : null,
  };
}

async function emailThread(ctx: QueryCtx, args: ToolArgs) {
  let thread: Doc<"emailThreads"> | null = null;
  const threadId = text(args, "emailThreadId");
  const bookingId = text(args, "bookingId");
  const quoteId = text(args, "quoteId");
  if (threadId) { const id = ctx.db.normalizeId("emailThreads", threadId); if (id) thread = await ctx.db.get(id); }
  if (!thread && bookingId) { const id = ctx.db.normalizeId("bookings", bookingId); if (id) thread = await ctx.db.query("emailThreads").withIndex("by_booking", q => q.eq("bookingId", id)).first(); }
  if (!thread && quoteId) { const id = ctx.db.normalizeId("quoteRequests", quoteId); if (id) thread = await ctx.db.query("emailThreads").withIndex("by_quote", q => q.eq("quoteId", id)).first(); }
  if (!thread) return { status: "NOT_FOUND" as const };
  const messages = await ctx.db.query("emailMessages").withIndex("by_thread", q => q.eq("threadId", thread!._id)).order("desc").take(20);
  return {
    status: "OK" as const,
    thread: { id: thread._id, subject: thread.subject, status: thread.status, bookingId: thread.bookingId, quoteId: thread.quoteId },
    untrustedCustomerContent: true,
    messages: messages.reverse().map(message => ({ direction: message.direction, from: message.from.slice(0, 254), to: message.to.slice(0, 254), sentAt: message.sentAt, body: message.bodyText.slice(0, 2000) })),
  };
}

export const createSession = mutation({
  args: { contextType: v.optional(contextType), contextId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, [...roles]); const now = Date.now();
    const sessionId = await ctx.db.insert("crmAiSessions", { userId: user._id, role: user.role as "SUPER_ADMIN" | "ADMIN", currentContextType: args.contextType, currentContextId: args.contextId?.slice(0, 100), status: "ACTIVE", createdAt: now, updatedAt: now, lastMessageAt: now });
    await ctx.db.insert("crmAiAuditLogs", { userId: user._id, sessionId, tool: "session", eventType: "CRM_AI_SESSION_STARTED", success: true, createdAt: now });
    return sessionId;
  },
});

export const listSessions = query({
  args: {}, handler: async ctx => { const user = await requireRole(ctx, [...roles]); return ctx.db.query("crmAiSessions").withIndex("by_user_and_last_message", q => q.eq("userId", user._id)).order("desc").take(20); },
});
export const listMessages = query({
  args: { sessionId: v.id("crmAiSessions") }, handler: async (ctx, args) => { const user = await requireRole(ctx, [...roles]); const session = await ctx.db.get(args.sessionId); if (!session || session.userId !== user._id) throw new Error("Conversation not found."); const rows = await ctx.db.query("crmAiMessages").withIndex("by_session_and_created_at", q => q.eq("sessionId", args.sessionId)).order("desc").take(60); return rows.filter(row => row.role !== "TOOL").reverse(); },
});
export const cancelPendingAction = mutation({
  args: { sessionId: v.id("crmAiSessions") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, [...roles]);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== user._id) throw new Error("Conversation not found.");
    await ctx.db.patch(session._id, { pendingAction: undefined, updatedAt: Date.now() });
    return null;
  },
});

export const prepareTurn = internalMutation({
  args: { sessionId: v.id("crmAiSessions"), message: v.string(), contextType: v.optional(contextType), contextId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, [...roles]); const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== user._id || session.status !== "ACTIVE") throw new Error("Conversation not found.");
    const content = args.message.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 2000); if (!content) throw new Error("Enter a message.");
    const now = Date.now(); const windowStart = session.messageWindowStartedAt ?? now; const sameWindow = now - windowStart < 60_000; const count = sameWindow ? (session.messageCount ?? 0) : 0;
    if (count >= 12) throw new Error("Please wait a moment before sending another message.");
    const recent = await ctx.db.query("crmAiMessages").withIndex("by_session_and_created_at", q => q.eq("sessionId", session._id)).order("desc").take(41);
    if (recent.filter(row => row.role === "USER").length >= 40) throw new Error("Start a new conversation to continue.");
    const normalised = content.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
    const explicitConfirmation = /^(confirm|confirmed|yes confirm|yes please confirm|add note|add the note)$/.test(normalised);
    await ctx.db.insert("crmAiMessages", { sessionId: session._id, role: "USER", content, createdAt: now });
    await ctx.db.patch(session._id, { currentContextType: args.contextType ?? session.currentContextType, currentContextId: args.contextId?.slice(0, 100) ?? session.currentContextId, messageWindowStartedAt: sameWindow ? windowStart : now, messageCount: count + 1, title: session.title ?? content.slice(0, 70), updatedAt: now, lastMessageAt: now });
    return { user: { id: user._id, role: user.role }, session: { id: session._id, contextType: args.contextType ?? session.currentContextType, contextId: args.contextId ?? session.currentContextId }, pendingAction: session.pendingAction, explicitConfirmation, messages: recent.reverse().filter(row => row.role !== "TOOL").map(row => ({ role: row.role, content: row.content })).concat({ role: "USER" as const, content }) };
  },
});

export const storeAssistant = internalMutation({ args: { sessionId: v.id("crmAiSessions"), content: v.string() }, handler: async (ctx, args) => { const user = await requireRole(ctx, [...roles]); const session = await ctx.db.get(args.sessionId); if (!session || session.userId !== user._id) throw new Error("Conversation not found."); const now = Date.now(); await ctx.db.insert("crmAiMessages", { sessionId: session._id, role: "ASSISTANT", content: args.content.trim().slice(0, 5000), createdAt: now }); await ctx.db.patch(session._id, { updatedAt: now, lastMessageAt: now }); } });
export const storeTool = internalMutation({ args: { sessionId: v.id("crmAiSessions"), toolName: v.string(), toolCallId: v.string(), content: v.string(), success: v.boolean(), entityType: v.optional(v.string()), entityId: v.optional(v.string()) }, handler: async (ctx, args) => { const user = await requireRole(ctx, [...roles]); const session = await ctx.db.get(args.sessionId); if (!session || session.userId !== user._id) throw new Error("Conversation not found."); const now = Date.now(); await ctx.db.insert("crmAiMessages", { sessionId: session._id, role: "TOOL", content: args.content.slice(0, 8000), toolName: args.toolName.slice(0, 80), toolCallId: args.toolCallId.slice(0, 160), createdAt: now }); await ctx.db.insert("crmAiAuditLogs", { userId: user._id, sessionId: session._id, tool: args.toolName.slice(0, 80), eventType: args.toolName === "draftEmailReply" ? "CRM_AI_DRAFT_EMAIL_CREATED" : "CRM_AI_TOOL_USED", entityType: args.entityType?.slice(0, 40), entityId: args.entityId?.slice(0, 100), success: args.success, errorCode: args.success ? undefined : "TOOL_FAILED", createdAt: now }); } });

export const prepareInternalNote = internalMutation({
  args: { sessionId: v.id("crmAiSessions"), bookingId: v.string(), body: v.string() }, handler: async (ctx, args) => { const user = await requireRole(ctx, [...roles]); const session = await ctx.db.get(args.sessionId); if (!session || session.userId !== user._id) throw new Error("Conversation not found."); const bookingId = ctx.db.normalizeId("bookings", args.bookingId); const booking = bookingId ? await ctx.db.get(bookingId) : null; if (!booking) throw new Error("Booking not found."); const body = args.body.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 2000); if (!body) throw new Error("Note content is required."); await ctx.db.patch(session._id, { pendingAction: { toolName: "addInternalNote", entityType: "BOOKING", entityId: String(booking._id), body, preparedAt: Date.now() }, updatedAt: Date.now() }); return { status: "CONFIRMATION_REQUIRED" as const, bookingReference: booking.reference ?? String(booking._id), note: body, instruction: "Ask the user to confirm with the Confirm button. The note has not been added." }; },
});

export const confirmPendingAction = internalMutation({
  args: { sessionId: v.id("crmAiSessions") }, handler: async (ctx, args) => { const user = await requireRole(ctx, [...roles]); const session = await ctx.db.get(args.sessionId); if (!session || session.userId !== user._id) throw new Error("Conversation not found."); const pending = session.pendingAction; if (!pending || Date.now() - pending.preparedAt > 10 * 60_000) { await ctx.db.patch(session._id, { pendingAction: undefined }); return { status: "NO_PENDING_ACTION" as const }; } const bookingId = ctx.db.normalizeId("bookings", pending.entityId); const booking = bookingId ? await ctx.db.get(bookingId) : null; if (!booking) throw new Error("Booking no longer exists."); await ctx.db.insert("bookingNotes", { bookingId: booking._id, authorUserId: user._id, authorName: userName(user), kind: "ADMIN_NOTE", body: pending.body, source: "CRM_AI", createdAt: Date.now() }); await ctx.db.patch(session._id, { pendingAction: undefined, updatedAt: Date.now() }); await ctx.db.insert("crmAiAuditLogs", { userId: user._id, sessionId: session._id, tool: "addInternalNote", eventType: "CRM_AI_NOTE_CREATED", entityType: "BOOKING", entityId: String(booking._id), success: true, createdAt: Date.now() }); return { status: "SUCCESS" as const, bookingReference: booking.reference ?? String(booking._id) }; },
});

export const executeReadTool = internalQuery({
  args: { sessionId: v.id("crmAiSessions"), toolName: v.string(), argsJson: v.string() },
  handler: async (ctx, input) => {
    const user = await requireRole(ctx, [...roles]); const session = await ctx.db.get(input.sessionId); if (!session || session.userId !== user._id) throw new Error("Conversation not found.");
    let args: ToolArgs = {}; try { const parsed: unknown = JSON.parse(input.argsJson); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as ToolArgs; } catch { throw new Error("Invalid tool input."); }
    const tool = input.toolName;
    if (["getAnalyticsSummary", "getConversionSummary", "getTrafficSummary", "getGa4Summary", "getSeoSummary"].includes(tool) && user.role !== "SUPER_ADMIN") throw new Error("Super Admin access required.");
    if (tool === "searchCustomers") { const needle = (text(args, "query") ?? "").toLowerCase(); if (needle.length < 2) throw new Error("Enter at least two characters to search customers."); let rows: Doc<"customers">[] = []; if (needle.includes("@")) { const exact = await ctx.db.query("customers").withIndex("by_email", q => q.eq("email", needle)).first(); if (exact) rows = [exact]; } else { rows = await ctx.db.query("customers").withIndex("by_created_at").order("desc").take(100); rows = rows.filter(row => [row.firstName, row.lastName, row.email, row.phone].filter(Boolean).join(" ").toLowerCase().includes(needle)); } return rows.slice(0, limit(args)).map(row => ({ id: row._id, name: [row.firstName, row.lastName].filter(Boolean).join(" "), email: row.email, phone: row.phone, status: row.status })); }
    if (tool === "getCustomerSummary" || tool === "getCustomerHistory") { const raw = text(args, "customerId") ?? (session.currentContextType === "CUSTOMER" ? session.currentContextId : undefined); const id = raw ? ctx.db.normalizeId("customers", raw) : null; const customer = id ? await ctx.db.get(id) : null; if (!customer) return { status: "NOT_FOUND" }; const [quotes, bookings, threads] = await Promise.all([ctx.db.query("quoteRequests").withIndex("by_customer", q => q.eq("customerId", customer._id)).order("desc").take(10), ctx.db.query("bookings").withIndex("by_customer", q => q.eq("customerId", customer._id)).order("desc").take(10), ctx.db.query("emailThreads").withIndex("by_customer", q => q.eq("customerId", customer._id)).take(10)]); const bookingSummaries = await Promise.all(bookings.map(row => bookingView(ctx, row))); return { customer: { id: customer._id, name: [customer.firstName, customer.lastName].filter(Boolean).join(" "), email: customer.email, phone: customer.phone, status: customer.status }, quotes: quotes.map(row => ({ id: row._id, reference: row.reference, service: row.serviceType, status: row.status, total: row.estimatedTotalCents ? money(row.estimatedTotalCents) : undefined, createdAt: row.createdAt })), bookings: bookingSummaries, recentEmailActivity: threads.sort((a,b) => b.lastMessageAt-a.lastMessageAt).slice(0,5).map(row => ({ id: row._id, subject: row.subject, status: row.status, lastMessageAt: row.lastMessageAt })) }; }
    if (tool === "getBookingSummary") { const rawId = text(args, "bookingId") ?? (session.currentContextType === "BOOKING" ? session.currentContextId : undefined); const ref = text(args, "bookingReference"); let booking: Doc<"bookings"> | null = null; if (rawId) { const id = ctx.db.normalizeId("bookings", rawId); if (id) booking = await ctx.db.get(id); } if (!booking && ref) booking = await ctx.db.query("bookings").withIndex("by_reference", q => q.eq("reference", ref.toUpperCase())).first(); return booking ? bookingView(ctx, booking) : { status: "NOT_FOUND" }; }
    if (tool === "searchBookings" || tool === "getUpcomingBookings" || tool === "getOutstandingPayments") { const from = date(text(args, "fromDate"), tool === "getUpcomingBookings" ? today() : "1970-01-01"); const to = date(text(args, "toDate"), tool === "getUpcomingBookings" ? new Date(Date.now()+7*86400000).toISOString().slice(0,10) : "9999-12-31"); if (from > to) throw new Error("The start date must be before the end date."); let rows = await ctx.db.query("bookings").withIndex("by_scheduled_date", q => q.gte("scheduledDate", from).lte("scheduledDate", to)).take(100); const status = text(args, "status"); const queryText = text(args, "query")?.toLowerCase(); const customerId = text(args, "customerId"); const serviceId = text(args, "serviceId"); if (status) rows = rows.filter(row => row.status === status); else if (tool === "getUpcomingBookings") rows = rows.filter(row => row.status !== "CANCELLED"); if (customerId) rows = rows.filter(row => String(row.customerId) === customerId); if (serviceId) rows = rows.filter(row => String(row.serviceId) === serviceId); let views = await Promise.all(rows.slice(0, 50).map(row => bookingView(ctx, row))); if (queryText) views = views.filter(row => [row.reference, row.service, row.customer?.name, row.customer?.email, row.customer?.phone].filter(Boolean).join(" ").toLowerCase().includes(queryText)); const minimum = Math.max(0, numberValue(args, "minimumOutstandingCents") ?? (tool === "getOutstandingPayments" ? 1 : 0)); return views.filter(row => row.outstandingCents >= minimum).slice(0, limit(args)); }
    if (tool === "searchQuotes") { let rows = await ctx.db.query("quoteRequests").withIndex("by_created_at").order("desc").take(100); const status = text(args,"status"), customerId=text(args,"customerId"), needle=text(args,"query")?.toLowerCase(), from=text(args,"fromDate"), to=text(args,"toDate"); rows=rows.filter(row => (!status||row.status===status)&&(!customerId||String(row.customerId)===customerId)&&(!needle||(row.reference??"").toLowerCase().includes(needle))&&(!from||new Date(row.createdAt).toISOString().slice(0,10)>=from)&&(!to||new Date(row.createdAt).toISOString().slice(0,10)<=to)); return rows.slice(0,limit(args)).map(row=>({id:row._id,reference:row.reference,service:row.serviceType,status:row.status,preferredDate:row.preferredDate,total:row.estimatedTotalCents?money(row.estimatedTotalCents):undefined,createdAt:row.createdAt})); }
    if (tool === "getQuoteSummary") { const raw=text(args,"quoteId")??(session.currentContextType==="QUOTE"?session.currentContextId:undefined), ref=text(args,"quoteReference"); let quote: Doc<"quoteRequests"> | null = null; if(raw){const id=ctx.db.normalizeId("quoteRequests",raw);if(id)quote=await ctx.db.get(id);} if(!quote&&ref) quote=await ctx.db.query("quoteRequests").withIndex("by_reference",q=>q.eq("reference",ref.toUpperCase())).first(); if(!quote)return{status:"NOT_FOUND"}; const customer=await ctx.db.get(quote.customerId); return{id:quote._id,reference:quote.reference,status:quote.status,service:quote.serviceType,customer:customer?{id:customer._id,name:[customer.firstName,customer.lastName].filter(Boolean).join(" "),email:customer.email,phone:customer.phone}:null,preferredDate:quote.preferredDate,preferredTime:quote.preferredTime,location:[quote.suburb,quote.state,quote.postcode].join(" "),estimatedTotal:quote.estimatedTotalCents?money(quote.estimatedTotalCents):undefined,notes:quote.notes?.slice(0,1000)}; }
    if (tool === "getPendingBookingChangeRequests") { const rows=await ctx.db.query("bookingChangeRequests").withIndex("by_created_at").order("desc").take(100); return Promise.all(rows.filter(row=>row.status==="PENDING").slice(0,limit(args)).map(async row=>{const booking=await ctx.db.get(row.bookingId); return{id:row._id,type:row.type,bookingId:row.bookingId,bookingReference:booking?.reference,status:row.status,requestedChanges:row.requestedChanges,reason:row.reason,createdAt:row.createdAt};})); }
    if (tool === "getServicePerformance") { const from=date(text(args,"fromDate"),today()), to=date(text(args,"toDate"),today()); const bookings=await ctx.db.query("bookings").withIndex("by_scheduled_date",q=>q.gte("scheduledDate",from).lte("scheduledDate",to)).take(500); const services=await ctx.db.query("services").collect(); const names=new Map(services.map(row=>[String(row._id),row.name])); const result=new Map<string,{service:string;bookings:number;valueCents:number}>(); for(const booking of bookings){const key=String(booking.serviceId), current=result.get(key)??{service:names.get(key)??"Unknown",bookings:0,valueCents:0};current.bookings++;current.valueCents+=booking.finalTotalCents;result.set(key,current);} return Array.from(result.values()).map(row=>({...row,value:money(row.valueCents)})).sort((a,b)=>b.bookings-a.bookings); }
    if (tool === "getEmailThread" || tool === "summarizeEmailThreadData" || tool === "draftEmailReply") { const merged={...args}; if(!text(merged,"emailThreadId")&&session.currentContextType==="EMAIL_THREAD")merged.emailThreadId=session.currentContextId; if(!text(merged,"bookingId")&&session.currentContextType==="BOOKING")merged.bookingId=session.currentContextId; if(!text(merged,"quoteId")&&session.currentContextType==="QUOTE")merged.quoteId=session.currentContextId; return {...await emailThread(ctx,merged), draftOnly:tool==="draftEmailReply", objective:text(args,"objective")?.slice(0,500)}; }
    if (tool === "getRecentCRMActivity") { const take=limit(args); const [bookings,quotes,changes,threads]=await Promise.all([ctx.db.query("bookings").withIndex("by_created_at").order("desc").take(take),ctx.db.query("quoteRequests").withIndex("by_created_at").order("desc").take(take),ctx.db.query("bookingChangeRequests").withIndex("by_created_at").order("desc").take(take),ctx.db.query("emailThreads").collect()]); return{bookings:bookings.map(row=>({id:row._id,reference:row.reference,status:row.status,createdAt:row.createdAt})),quotes:quotes.map(row=>({id:row._id,reference:row.reference,status:row.status,createdAt:row.createdAt})),changeRequests:changes.map(row=>({id:row._id,type:row.type,status:row.status,createdAt:row.createdAt})),emailThreads:threads.sort((a,b)=>b.lastMessageAt-a.lastMessageAt).slice(0,take).map(row=>({id:row._id,subject:row.subject,status:row.status,lastMessageAt:row.lastMessageAt}))}; }
    if (["getAnalyticsSummary","getConversionSummary","getTrafficSummary"].includes(tool)) { const fromDate=date(text(args,"fromDate"),new Date(Date.now()-6*86400000).toISOString().slice(0,10)), toDate=date(text(args,"toDate"),today()); const from=Date.parse(`${fromDate}T00:00:00Z`),to=Date.parse(`${toDate}T23:59:59Z`); const [sessions,quotes,bookings,payments]=await Promise.all([ctx.db.query("websiteSessions").withIndex("by_created_at",q=>q.gte("createdAt",from).lte("createdAt",to)).collect(),ctx.db.query("quoteRequests").withIndex("by_created_at",q=>q.gte("createdAt",from).lte("createdAt",to)).collect(),ctx.db.query("bookings").withIndex("by_created_at",q=>q.gte("createdAt",from).lte("createdAt",to)).collect(),ctx.db.query("bookingPayments").withIndex("by_paid_at",q=>q.gte("paidAt",from).lte("paidAt",to)).collect()]); const revenue=payments.filter(row=>row.status==="PAID").reduce((sum,row)=>sum+row.amountCents,0); return{source:"Convex first-party business analytics",range:{fromDate,toDate},visitors:sessions.length,quotes:quotes.length,bookings:bookings.length,collectedRevenue:money(revenue),visitorToQuotePercent:sessions.length?Math.round(quotes.length/sessions.length*10000)/100:0,quoteToBookingPercent:quotes.length?Math.round(bookings.length/quotes.length*10000)/100:0,note:"Do not merge these figures with GA4 or Search Console."}; }
    if (tool === "getGa4Summary") return { source:"Google Analytics 4", status:"AVAILABLE_IN_ANALYTICS_DASHBOARD", note:"GA4 is fetched through the protected Next.js Analytics API. Open /admin/analytics for current GA4 metrics; they are not merged with Convex business totals." };
    if (tool === "getSeoSummary") return { source:"Google Search Console", status:"AVAILABLE_IN_ANALYTICS_DASHBOARD", note:"Search Console is fetched through the protected Next.js Analytics API. Open /admin/analytics for current SEO metrics; they are not merged with Convex or GA4 totals." };
    throw new Error("Tool is not allowed.");
  },
});
