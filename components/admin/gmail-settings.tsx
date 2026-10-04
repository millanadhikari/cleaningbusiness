"use client";

import { useAction, useConvexAuth, useQuery } from "convex/react";
import { AlertTriangle, CircleCheck, Link2, Link2Off, LoaderCircle, Mail, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const resultMessages: Record<string, string> = {
  connected: "Company Gmail connected successfully.",
  authorization_denied: "Google authorization was cancelled.",
  invalid_state: "The connection request expired or could not be verified. Please try again.",
  missing_code: "Google did not return an authorization code. Please try again.",
  connection_failed: "Gmail could not be connected. Check the OAuth and Convex environment settings.",
  not_configured: "Gmail OAuth environment variables are not configured on the app.",
};

export function GmailSettings({ oauthResult, oauthReason }: { oauthResult?: string; oauthReason?: string }) {
  const { isAuthenticated } = useConvexAuth();
  const status = useQuery(api.gmail.getConnectionStatus, isAuthenticated ? {} : "skip");
  const disconnect = useAction(api.gmailActions.disconnect);
  const refreshWatch = useAction(api.gmailActions.refreshWatch);
  const [busy, setBusy] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);

  async function handleDisconnect() {
    setBusy(true);
    try {
      await disconnect({});
      toast.success("Company Gmail disconnected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gmail could not be disconnected.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshWatch() {
    setWatchBusy(true);
    try {
      await refreshWatch({});
      toast.success("Incoming Gmail reply sync renewed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Incoming Gmail sync could not be renewed.");
    } finally {
      setWatchBusy(false);
    }
  }

  const resultKey = oauthResult === "connected" ? "connected" : oauthReason;

  return (
    <section className="p-4 pb-0 sm:p-6 sm:pb-0 lg:p-8 lg:pb-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"><Mail className="size-4" /> Company email</div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-950">Gmail connection</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Staff use this shared connection for quote and booking conversations. Existing transactional email remains unchanged.
            </p>
          </div>
          {status === undefined ? (
            <LoaderCircle className="size-5 animate-spin text-slate-400" />
          ) : status.connected ? (
            <Badge className="bg-emerald-50 text-emerald-800"><CircleCheck /> Connected</Badge>
          ) : (
            <Badge variant="secondary" className="bg-slate-100 text-slate-700"><Link2Off /> Disconnected</Badge>
          )}
        </div>

        {resultKey && resultMessages[resultKey] ? (
          <p className={`mt-4 rounded-xl px-4 py-3 text-sm ${oauthResult === "connected" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            {resultMessages[resultKey]}
          </p>
        ) : null}

        {status?.connected && status.watchStatus === "ERROR" ? (
          <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">Incoming Gmail replies are not syncing.</p>
              <p className="mt-1 text-xs leading-5">{status.watchError ?? "The Gmail inbox watch could not be renewed. Check the Pub/Sub configuration."}</p>
            </div>
          </div>
        ) : null}

        {status ? (
          <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">
                {status.canManage && status.email ? status.email : status.connected ? "Company Gmail connected" : "Company Gmail is not connected"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {status.canManage ? "Only Super Admins can change this connection." : "Contact a Super Admin to change the company Gmail account."}
              </p>
              {status.watchStatus === "ACTIVE" && status.watchExpiration ? (
                <p className="mt-1 text-xs text-emerald-700">
                  Incoming reply sync active · renews daily · current watch expires {new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(status.watchExpiration))}
                </p>
              ) : null}
            </div>
            {status.canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant={status.connected ? "outline" : "default"}>
                  <a href="/api/google/connect">{status.connected ? <RefreshCw /> : <Link2 />}{status.connected ? "Reconnect Gmail" : "Connect Gmail"}</a>
                </Button>
                {status.connected ? (
                  <Button type="button" variant="outline" onClick={handleRefreshWatch} disabled={watchBusy}>
                    {watchBusy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                    {watchBusy ? "Renewing sync…" : "Renew reply sync"}
                  </Button>
                ) : null}
                {status.connected ? (
                  <Button type="button" variant="outline" onClick={handleDisconnect} disabled={busy} className="text-red-700">
                    {busy ? <LoaderCircle className="animate-spin" /> : <Link2Off />}{busy ? "Disconnecting…" : "Disconnect"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
