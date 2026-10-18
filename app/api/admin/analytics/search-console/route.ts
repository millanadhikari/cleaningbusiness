import { auth } from '@clerk/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import { NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexAuthToken } from '@/lib/convex-auth-token';
import { publicConvexOptions } from '@/lib/convex-server';
import { getSearchConsoleDashboard } from '@/lib/search-console-analytics';

export const runtime = 'nodejs';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function validRange(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate || !DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
    return false;
  }
  const from = Date.parse(`${startDate}T00:00:00Z`);
  const to = Date.parse(`${endDate}T00:00:00Z`);
  return Number.isFinite(from) && Number.isFinite(to) &&
    new Date(from).toISOString().slice(0, 10) === startDate &&
    new Date(to).toISOString().slice(0, 10) === endDate &&
    from <= to && to - from < MAX_RANGE_DAYS * 86_400_000;
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const token = await getConvexAuthToken();
  if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    const user = await fetchQuery(api.users.currentAdmin, {}, {
      ...publicConvexOptions(),
      token,
    });
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Super Admin access required.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Super Admin access required.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  if (!validRange(startDate, endDate)) {
    return NextResponse.json({ error: 'Select a valid analytics date range.' }, { status: 400 });
  }

  const data = await getSearchConsoleDashboard(startDate!, endDate!);
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
