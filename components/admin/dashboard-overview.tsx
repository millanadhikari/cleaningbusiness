"use client";

import { useConvexAuth, useQuery } from "convex/react";
import {
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  UsersRound,
  Wallet,
  LoaderCircle,
  Sparkles,
  CheckCheck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { QuoteStatusBadge } from "./quote-status-badge";
import styles from "./dashboard-overview.module.css";

function dateLabel(
  value: number | string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) {
  return new Intl.DateTimeFormat("en-AU", {
    ...options,
    timeZone: "UTC",
  }).format(typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value);
}
function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function Panel({
  title,
  subtitle,
  href,
  children,
  className = "",
}: {
  title: string;
  subtitle: string;
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`${styles.panel} ${className}`}>
      <div className={styles.panelHeading}>
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {href ? (
          <Link
            href={href}
            className={styles.viewAll}
            aria-label={`View all ${title.toLowerCase()}`}
          >
            View all <ArrowUpRight size={13} />
          </Link>
        ) : null}
      </div>
      {children}
    </Card>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className={styles.empty}>
      <Sparkles size={22} />
      <p>{children}</p>
    </div>
  );
}

export function DashboardOverview() {
  const { isAuthenticated } = useConvexAuth();
  const summary = useQuery(
    api.dashboard.summary,
    isAuthenticated ? {} : "skip",
  );
  if (!summary)
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="size-4 animate-spin" />
        Loading dashboard…
      </div>
    );
  const activity = summary.weeklyActivity;
  const weeklyTotal = activity.reduce((total, day) => total + day.quotes, 0);
  const newCustomers = activity.reduce(
    (total, day) => total + day.customers,
    0,
  );
  const peak = Math.max(1, ...activity.map((day) => day.quotes));
  const accepted =
    summary.weeklyQuoteStatuses.find((item) => item.status === "ACCEPTED")
      ?.count ?? 0;
  const metrics = [
    {
      label: "New quote requests",
      value: summary.newQuoteRequestCount,
      detail: "Ready for your attention",
      icon: ClipboardList,
      tone: styles.brandTeal,
      href: "/admin/quotes",
    },
    {
      label: "Total customers",
      value: summary.totalCustomerCount,
      detail: `${newCustomers} added in the last 7 days`,
      icon: UsersRound,
      tone: styles.brandGreen,
      href: "/admin/customers",
    },
    {
      label: "Upcoming bookings",
      value: summary.upcomingBookingCount,
      detail: "Confirmed on your schedule",
      icon: CalendarDays,
      tone: styles.brandYellow,
      href: "/admin/bookings",
    },
    {
      label: "Revenue",
      value: "$0",
      detail: "Revenue tracking coming soon",
      icon: Wallet,
      tone: styles.brandLime,
      href: undefined,
    },
  ];
  return (
    <div className={styles.dashboard}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>
            <Sparkles size={13} />
            YOUR BUSINESS, AT A GLANCE
          </div>
          <h2>A clearer view of your day.</h2>
          <p>Every enquiry, every customer, every upcoming clean.</p>
        </div>
        <span className={styles.live}>
          <span />
          Live overview
        </span>
      </div>
      <section className={styles.metrics} aria-label="Business metrics">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const content = (
            <>
              <div className={styles.metricTop}>
                <span>{metric.label}</span>
                <span className={`${styles.metricIcon} ${metric.tone}`}>
                  <Icon size={17} />
                </span>
              </div>
              <div className={styles.metricValue}>
                {metric.value}
                {metric.href ? (
                  <ArrowUpRight size={17} />
                ) : (
                  <span className={styles.soon}>Coming soon</span>
                )}
              </div>
              <p>{metric.detail}</p>
            </>
          );
          return metric.href ? (
            <Link
              className={styles.metric}
              href={metric.href}
              key={metric.label}
            >
              {content}
            </Link>
          ) : (
            <div className={styles.metric} key={metric.label}>
              {content}
            </div>
          );
        })}
      </section>
      <div className={styles.analytics}>
        <Panel
          title="Enquiry activity"
          subtitle="Daily quote requests · last 7 days (UTC)"
          href="/admin/quotes"
          className={styles.activity}
        >
          <div className={styles.chartSummary}>
            <span className={`${styles.metricIcon} ${styles.brandTeal}`}>
              <ClipboardList size={17} />
            </span>
            <strong>{weeklyTotal}</strong>
            <span>enquiries this week</span>
            <span className={styles.chartLegend}>
              <i />
              Quote requests
            </span>
          </div>
          <div
            className={styles.barChart}
            role="img"
            aria-label={activity
              .map((day) => `${day.date}: ${day.quotes} quote requests`)
              .join("; ")}
          >
            {activity.map((day) => (
              <div className={styles.barColumn} key={day.date}>
                <span className={styles.barValue}>{day.quotes}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.bar}
                    style={{ height: `${(day.quotes / peak) * 100}%` }}
                  />
                </div>
                <span>{dateLabel(day.date, { weekday: "short" })}</span>
              </div>
            ))}
          </div>
          <div className={styles.chartFoot}>
            <span>
              {dateLabel(activity[0].date)} — {dateLabel(activity[6].date)}
            </span>
            <span>
              {weeklyTotal
                ? "A little attention goes a long way."
                : "Your first enquiry will appear here."}
            </span>
          </div>
        </Panel>
        <Panel
          title="Quote progress"
          subtitle="Current status of enquiries from the last 7 days"
          href="/admin/quotes"
        >
          <div className={styles.progressOverview}>
            <div
              className={styles.donut}
              style={{
                background: `conic-gradient(#007c70 ${weeklyTotal ? (accepted / weeklyTotal) * 100 : 0}%, #e5eee9 0)`,
              }}
            >
              <div>
                <strong>
                  {weeklyTotal
                    ? `${Math.round((accepted / weeklyTotal) * 100)}%`
                    : "—"}
                </strong>
                <span>accepted</span>
              </div>
            </div>
            <div className={styles.progressNumbers}>
              <span>
                <strong>{weeklyTotal}</strong>Total enquiries
              </span>
              <span>
                <strong>{accepted}</strong>Accepted quotes
              </span>
            </div>
          </div>
          <div className={styles.statusList}>
            {summary.weeklyQuoteStatuses.map((item) => (
              <div key={item.status}>
                <span>
                  {item.status.charAt(0) + item.status.slice(1).toLowerCase()}
                </span>
                <div className={styles.statusTrack}>
                  <span
                    style={{
                      width: `${weeklyTotal ? (item.count / weeklyTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Upcoming cleans"
          subtitle="Your next confirmed bookings"
          href="/admin/bookings"
        >
          {summary.upcomingBookings.length ? (
            <div className={styles.schedule}>
              {summary.upcomingBookings.map((booking) => (
                <Link
                  href={`/admin/bookings/${booking._id}`}
                  key={booking._id}
                  className={styles.booking}
                >
                  <div className={styles.dateTile}>
                    <span>
                      {dateLabel(booking.scheduledDate, { month: "short" })}
                    </span>
                    <strong>
                      {dateLabel(booking.scheduledDate, { day: "numeric" })}
                    </strong>
                  </div>
                  <div className={styles.bookingInfo}>
                    <strong>{booking.customerName}</strong>
                    <span>{booking.serviceName}</span>
                    <small>{booking.scheduledTime} · Confirmed</small>
                  </div>
                  <ArrowUpRight size={15} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty>
              No upcoming bookings. Confirmed cleans will appear here.
            </Empty>
          )}
          <Link className={styles.panelFooter} href="/admin/bookings">
            Open booking schedule <ArrowRight size={14} />
          </Link>
        </Panel>
      </div>
      <div className={styles.records}>
        <Panel
          title="Recent quote requests"
          subtitle="A closer look at your latest opportunities"
          href="/admin/quotes"
        >
          {summary.recentQuotes.length ? (
            <Table className={styles.table}>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service / location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>
                    <span className="sr-only">Open quote</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.recentQuotes.map((quote) => (
                  <TableRow key={quote._id}>
                    <TableCell>
                      <Link
                        className={styles.person}
                        href={`/admin/quotes/${quote._id}`}
                      >
                        <span className={styles.avatar}>
                          {initials(quote.customerName)}
                        </span>
                        <strong>{quote.customerName}</strong>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className={styles.serviceName}>
                        {quote.serviceType}
                      </span>
                      <span className={styles.secondary}>{quote.suburb}</span>
                    </TableCell>
                    <TableCell>
                      <QuoteStatusBadge status={quote.status} />
                    </TableCell>
                    <TableCell className={styles.dateCell}>
                      {dateLabel(quote.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Link
                        className={styles.rowAction}
                        href={`/admin/quotes/${quote._id}`}
                        aria-label={`Open quote for ${quote.customerName}`}
                      >
                        <ArrowUpRight size={15} />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty>No quote requests yet.</Empty>
          )}
          <div className={styles.tableFoot}>
            <span>
              Showing the latest {summary.recentQuotes.length} enquiries
            </span>
            <span>
              <CheckCheck size={14} />
              Up to date
            </span>
          </div>
        </Panel>
        <Panel
          title="Recent customers"
          subtitle="The people behind your business"
          href="/admin/customers"
        >
          <div className={styles.customerTotal}>
            <span className={`${styles.metricIcon} ${styles.brandGreen}`}>
              <UsersRound size={18} />
            </span>
            <strong>{summary.totalCustomerCount}</strong>
            <span>customer records</span>
          </div>
          {summary.recentCustomers.length ? (
            <div className={styles.customers}>
              {summary.recentCustomers.map((customer) => (
                <Link
                  className={styles.customer}
                  href={`/admin/customers/${customer._id}`}
                  key={customer._id}
                >
                  <span className={styles.avatar}>
                    {initials(customer.name)}
                  </span>
                  <div>
                    <strong>{customer.name}</strong>
                    <span>{customer.email ?? customer.phone}</span>
                  </div>
                  <ArrowUpRight size={15} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty>No customers yet.</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}
