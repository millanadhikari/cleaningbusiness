import { timingSafeEqual } from "node:crypto";
import { fetchAction } from "convex/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { publicConvexOptions } from "@/lib/convex-server";
import { requireGmailSuperAdmin } from "@/lib/gmail-route-auth";

const STATE_COOKIE = "wedo_google_oauth_state";

export const runtime = "nodejs";

function settingsRedirect(request: NextRequest, value: string, reason?: string) {
  const url = new URL("/admin/settings", request.url);
  url.searchParams.set("gmail", value);
  if (reason) url.searchParams.set("reason", reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

function statesMatch(received: string | null, stored: string | undefined) {
  if (!received || !stored) return false;
  const receivedBytes = Buffer.from(received);
  const storedBytes = Buffer.from(stored);
  return receivedBytes.length === storedBytes.length && timingSafeEqual(receivedBytes, storedBytes);
}

export async function GET(request: NextRequest) {
  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) return settingsRedirect(request, "error", "authorization_denied");
  if (!statesMatch(request.nextUrl.searchParams.get("state"), request.cookies.get(STATE_COOKIE)?.value)) {
    return settingsRedirect(request, "error", "invalid_state");
  }
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return settingsRedirect(request, "error", "missing_code");

  try {
    const { token } = await requireGmailSuperAdmin();
    await fetchAction(api.gmailActions.completeConnection, { code }, {
      ...publicConvexOptions(),
      token,
    });
    return settingsRedirect(request, "connected");
  } catch (error) {
    console.error("Gmail OAuth callback failed", error instanceof Error ? error.message : error);
    return settingsRedirect(request, "error", "connection_failed");
  }
}
