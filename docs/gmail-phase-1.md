# Gmail integration — Phase 1

Phase 1 connects one company Gmail account to the CRM and stores outbound quote and booking conversations. It does not implement Gmail push notifications, Pub/Sub, or inbound reply synchronization. Existing Resend transactional email is unchanged.

## Runtime configuration

Set the following server-only variables in both the Next.js/Vercel environment and the Convex deployment:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=https://app.wedocleaning.com.au/api/google/callback`

None of these values may use a `NEXT_PUBLIC_` prefix.

The Google OAuth client must have the production callback above as an authorized redirect URI. Enable the Gmail API and configure the OAuth consent screen for the requested `gmail.modify` and `gmail.send` scopes. If the app remains in Google testing mode, add the company Gmail address as a test user.

## Token security boundary

The Gmail refresh token is stored in Convex because this project does not currently have a secret-encryption/key-management utility. It is never returned by a public query or to a client component: only internal Convex queries and mutations used by the server-side Gmail action can access it. Disconnecting clears the stored refresh token and attempts to revoke the Google grant.

This is an intentional Phase 1 limitation, not client-side encryption. Before broader production rollout, add application-level encryption backed by a managed key service and migrate stored refresh tokens.

## Deployment note

`convex/gmailActions.ts` is a Node action because it uses Google's official Node.js API client. Convex deployment/code generation therefore needs a supported Node.js release (20, 22, or 24). This repository targets Node 22.
