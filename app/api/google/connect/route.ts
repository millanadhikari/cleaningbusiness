import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { NextResponse } from "next/server";
import { requireGmailSuperAdmin } from "@/lib/gmail-route-auth";

const STATE_COOKIE = "wedo_google_oauth_state";
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireGmailSuperAdmin();
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.redirect(new URL("/admin/settings?gmail=error&reason=not_configured", request.url));
    }
    const state = randomBytes(32).toString("base64url");
    const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const authorizationUrl = oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: GMAIL_SCOPES,
      state,
    });
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/google/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch {
    return new NextResponse("Super Admin access required.", { status: 403 });
  }
}
