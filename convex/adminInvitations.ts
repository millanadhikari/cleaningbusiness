import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action } from './_generated/server';

const INVITATION_LIFETIME_DAYS = 30;
const INVITATION_LIFETIME_MS =
  INVITATION_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

function getClerkSecretKey() {
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      'Admin invitations are not configured. Add CLERK_SECRET_KEY to the Convex deployment.',
    );
  }

  return secretKey;
}

type ClerkInvitationResponse = {
  id: string;
};

type ClerkUserResponse = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email_address_id: string | null;
  email_addresses: Array<{
    id: string;
    email_address: string;
    verification: { status: string } | null;
  }>;
};

async function clerkRequest<Response>(path: string, init?: RequestInit) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getClerkSecretKey()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('Clerk API request failed', response.status, details);
    throw new Error('Clerk could not complete the admin invitation request.');
  }

  return (await response.json()) as Response;
}

function getInvitationRedirectUrl(appOrigin: string) {
  let url: URL;

  try {
    url = new URL(appOrigin);
  } catch {
    throw new Error('The application URL is invalid.');
  }

  const isProductionApp = url.hostname === 'app.wedocleaning.com.au';
  const isPreview = url.hostname.endsWith('.vercel.app');
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const hasSafeProtocol = url.protocol === 'https:' || (isLocal && url.protocol === 'http:');

  if ((!isProductionApp && !isPreview && !isLocal) || !hasSafeProtocol) {
    throw new Error('Admin invitations can only be sent from an approved app URL.');
  }

  return new URL('/accept-invitation', url.origin).toString();
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  if (!/^\S+@\S+\.\S+$/.test(normalized)) {
    throw new Error('Enter a valid email address.');
  }

  return normalized;
}

export const inviteAdmin = action({
  args: {
    email: v.string(),
    appOrigin: v.string(),
  },
  returns: v.object({ email: v.string() }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const redirectUrl = getInvitationRedirectUrl(args.appOrigin);
    const invitedByUserId = await ctx.runQuery(
      internal.users.assertCanInviteAdmin,
      { email },
    );

    let invitation: ClerkInvitationResponse;

    try {
      invitation = await clerkRequest<ClerkInvitationResponse>('/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email_address: email,
          redirect_url: redirectUrl,
          expires_in_days: INVITATION_LIFETIME_DAYS,
          ignore_existing: true,
          notify: true,
          public_metadata: {
            wedoRole: 'ADMIN',
          },
        }),
      });
    } catch (error) {
      console.error('Clerk admin invitation failed', error);
      throw new Error('Clerk could not send the invitation. Please try again.');
    }

    await ctx.runMutation(internal.users.recordAdminInvitation, {
      email,
      clerkInvitationId: invitation.id,
      invitedByUserId,
      expiresAt: Date.now() + INVITATION_LIFETIME_MS,
    });

    return { email };
  },
});

export const completeAdminInvitation = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error('Sign in with the invited account to continue.');
    }

    const clerkUser = await clerkRequest<ClerkUserResponse>(
      `/users/${encodeURIComponent(identity.subject)}`,
    );
    const primaryEmail = clerkUser.email_addresses.find(
      (emailAddress) => emailAddress.id === clerkUser.primary_email_address_id,
    );

    if (!primaryEmail || primaryEmail.verification?.status !== 'verified') {
      throw new Error('The invited email address must be verified before continuing.');
    }

    await ctx.runMutation(internal.users.provisionInvitedAdmin, {
      clerkUserId: clerkUser.id,
      firstName: clerkUser.first_name ?? undefined,
      lastName: clerkUser.last_name ?? undefined,
      email: normalizeEmail(primaryEmail.email_address),
    });

    return null;
  },
});
