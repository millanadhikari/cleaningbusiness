# Cleaning Business Platform

## Stack

- Next.js 16+
- TypeScript
- Tailwind CSS
- shadcn/ui
- Convex
- Clerk
- Vercel

Future:
- Stripe
- Twilio
- Expo / React Native cleaner app

## Architecture

This is a cleaning business management platform.

Phase 1 includes:

- Clerk authentication
- Convex backend
- Super Admin
- Admin users foundation
- Admin CRM dashboard
- Customers
- Quote Requests

Do NOT implement yet:

- Stripe
- Payments
- Invoices
- Customer portal
- Cleaner mobile app
- Twilio
- Rostering
- Timesheets
- Complex permissions
- Bookings unless required as a placeholder

## Roles

Initial roles:

- SUPER_ADMIN
- ADMIN

SUPER_ADMIN:
- Full access
- Can later invite/create admins
- Can activate/deactivate admins

ADMIN:
- Can manage customers
- Can manage quote requests
- Cannot manage Super Admins
- Cannot change system-level permissions

All authorization must be enforced in Convex.
Do not rely only on hidden UI elements.

## Authentication

Use Clerk for authentication.

Convex users should reference Clerk users using:

clerkUserId

Do not use Clerk Organizations for this project unless explicitly requested.

## User modelling

Keep authenticated users separate from business entities.

users:
- internal authenticated users
- SUPER_ADMIN
- ADMIN
- later CLEANER / CUSTOMER accounts

customers:
- business/customer records
- should NOT require Clerk login
- may optionally reference a userId later

cleaners:
- future table
- may reference userId when cleaner app is implemented

## Backend conventions

Use Convex queries and mutations.

Create authorization helpers such as:

- requireUser(ctx)
- requireSuperAdmin(ctx)
- requireRole(ctx, roles)

Every protected mutation/query must check authorization server-side.

Prefer indexed Convex queries.

Do not fetch whole tables and filter in JavaScript when an index is appropriate.

## Phase 1 entities

Initial tables:

- users
- customers
- quoteRequests
- activityLogs

Do not create unnecessary tables.

## Status conventions

Use explicit uppercase status values.

Users:

ACTIVE
INACTIVE

Quote Requests:

NEW
REVIEWING
QUOTED
ACCEPTED
DECLINED
EXPIRED

## Code conventions

- TypeScript only
- Avoid `any`
- Prefer small reusable components
- Prefer server-side authorization
- Use shadcn/ui where appropriate
- Keep components simple
- Don't introduce unnecessary dependencies
- Don't refactor unrelated files
- Do not redesign existing landing page unless requested
- Preserve existing project styling

## Workflow

Before changing code:

1. Inspect existing project structure.
2. Inspect package.json.
3. Check existing Clerk/Convex configuration.
4. Reuse existing components where possible.

After changes:

1. Run TypeScript/typecheck.
2. Run lint if configured.
3. Fix errors caused by the change.
4. Summarize files modified.
5. Mention any environment variables I need to add.

Do not perform large unrelated refactors.

## Domains

Production architecture:

Public website:
https://wedocleaning.com.au

Authenticated application:
https://app.wedocleaning.com.au

The public website is used for:
- marketing
- service pages
- quote requests
- contact

The app subdomain is used for:
- authentication
- admin CRM
- dashboards
- customers
- quotes
- bookings
- future customer portal

After successful staff authentication, users should enter the
authenticated application dashboard.

Do not hard-code production domains when relative application routes
such as `/dashboard` are appropriate.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
