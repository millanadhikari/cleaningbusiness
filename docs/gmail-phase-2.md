# Gmail Phase 2: inbound replies

## Production endpoint

`POST https://agreeable-possum-344.convex.site/google/gmail/push`

The Pub/Sub subscription must use the wrapped payload format. Do not enable payload unwrapping.

## Convex environment variables

Configure these on the `agreeable-possum-344` production deployment:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GMAIL_PUBSUB_TOPIC` (full topic name, such as `projects/PROJECT_ID/topics/gmail-push`)
- `GMAIL_PUBSUB_AUDIENCE` (`https://agreeable-possum-344.convex.site/google/gmail/push`)
- `GMAIL_PUBSUB_SERVICE_ACCOUNT` (the service account selected for authenticated push)

## Google Cloud setup

1. Enable the Gmail API and Pub/Sub API in the OAuth project's Google Cloud project.
2. Create the Pub/Sub topic used by `GMAIL_PUBSUB_TOPIC`.
3. Grant `gmail-api-push@system.gserviceaccount.com` the Pub/Sub Publisher role on that topic so Gmail can publish mailbox notifications.
4. Create or select a service account for authenticated Pub/Sub push.
5. Create a push subscription for the topic:
   - Endpoint: `https://agreeable-possum-344.convex.site/google/gmail/push`
   - Authentication: enabled with the selected push service account
   - Audience: `https://agreeable-possum-344.convex.site/google/gmail/push`
   - Payload unwrapping: off
6. Ensure the Pub/Sub service agent can mint identity tokens for the selected push service account. Grant Service Account Token Creator when the project does not already provide that permission.
7. Deploy the Convex functions and set all environment variables.
8. In CRM Settings, click **Renew reply sync** once (or reconnect Gmail). The daily cron renews it afterward.

## Runtime behavior

- Gmail watches only the `INBOX` label and the cron renews the watch every day at 15:00 UTC.
- A one-minute polling fallback advances Gmail history when Pub/Sub delivery is delayed or unavailable.
- Push JWTs are checked for Google signature, issuer, audience, verified email, and the configured service-account email.
- Valid pushes are acknowledged before Gmail history processing runs asynchronously.
- Expired history cursors trigger a full inbox recovery before the history cursor advances.
- Matching order is Gmail thread, RFC reply headers, then a `WD####` quote/booking reference in the subject.
- Messages without a confident match appear at `/admin/email/unmatched`.
