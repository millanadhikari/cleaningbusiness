"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { ArrowUpRight, ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AdminEmpty,
  AdminListHeader,
  AdminListPage,
  AdminListPagination,
  AdminListToolbar,
  AdminLoading,
  AdminTableCard,
  FilterSelect,
  LIST_PAGE_SIZE,
  PersonCell,
  RowAction,
} from "./admin-list-layout";
import {
  formatQuoteStatus,
  QuoteStatusBadge,
  type QuoteStatus,
} from "./quote-status-badge";

const statuses: Array<{ label: string; value: QuoteStatus | "ALL" }> = [
  { label: "All statuses", value: "ALL" },
  { label: "New", value: "NEW" },
  { label: "Reviewing", value: "REVIEWING" },
  { label: "Quoted", value: "QUOTED" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Declined", value: "DECLINED" },
  { label: "Expired", value: "EXPIRED" },
];
function formatDate(value: number | string | undefined) {
  if (!value) return "Not specified";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(
    typeof value === "number" ? new Date(value) : new Date(`${value}T12:00:00`),
  );
}
function formatEstimate(quote: {
  estimateType?: "ESTIMATE" | "CUSTOM_QUOTE_REQUIRED" | "HOURLY_CONFIGURATION";
  estimatedTotalCents?: number;
  hourlyRateCents?: number;
}) {
  if (
    quote.estimateType === "ESTIMATE" &&
    quote.estimatedTotalCents !== undefined
  )
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(quote.estimatedTotalCents / 100);
  if (quote.estimateType === "CUSTOM_QUOTE_REQUIRED") return "Custom quote";
  if (quote.estimateType === "HOURLY_CONFIGURATION")
    return quote.hourlyRateCents === undefined
      ? "Rate to confirm"
      : `${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(quote.hourlyRateCents / 100)}/hr`;
  return "Legacy request";
}
function requestLabel(value: "CUSTOM_QUOTE" | "CALLBACK_REQUEST" | undefined) {
  return value === "CALLBACK_REQUEST"
    ? "Callback"
    : value === "CUSTOM_QUOTE"
      ? "Custom quote"
      : "Quote";
}

export function QuoteRequestsManager() {
  const { isAuthenticated } = useConvexAuth();
  const quotes = useQuery(
    api.quoteRequests.list,
    isAuthenticated ? {} : "skip",
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuoteStatus | "ALL">("ALL");
  const [requestType, setRequestType] = useState("ALL");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    if (!quotes) return [];
    const term = search.trim().toLowerCase();
    return quotes.filter(
      (quote) =>
        (status === "ALL" || quote.status === status) &&
        (requestType === "ALL" || quote.requestType === requestType) &&
        (!term ||
          [
            quote.customerName,
            quote.email,
            quote.serviceType,
            quote.suburb,
          ].some((value) => value?.toLowerCase().includes(term))),
    );
  }, [quotes, requestType, search, status]);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE)),
  );
  const pageRows = filtered.slice(
    (currentPage - 1) * LIST_PAGE_SIZE,
    currentPage * LIST_PAGE_SIZE,
  );
  return (
    <AdminListPage>
      <AdminListHeader
        icon={ClipboardList}
        label="Sales pipeline"
        title="Quote requests"
        description="Review new enquiries, follow up quickly, and keep every opportunity moving."
        count={quotes?.length}
        action={
          <Button asChild>
            <Link href="/admin/quotes/new">
              <Plus /> New quote
            </Link>
          </Button>
        }
      />
      <AdminListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search customer, service, suburb or email"
      >
        <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => setStatus(value as QuoteStatus | "ALL")}
        >
          {statuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Request"
          value={requestType}
          onChange={setRequestType}
        >
          <option value="ALL">All requests</option>
          <option value="CALLBACK_REQUEST">Callback</option>
          <option value="CUSTOM_QUOTE">Custom quote</option>
        </FilterSelect>
      </AdminListToolbar>
      <AdminTableCard>
        {quotes === undefined ? (
          <AdminLoading label="Loading quote requests…" />
        ) : filtered.length === 0 ? (
          <AdminEmpty
            title="No matching quote requests"
            description={
              status === "ALL" && !search
                ? "New website enquiries will appear here."
                : `Try changing the search or ${status === "ALL" ? "request" : formatQuoteStatus(status).toLowerCase()} filter.`
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>Estimate</TableHead>
                  <TableHead>Preferred</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((quote) => (
                  <TableRow key={quote._id}>
                    <TableCell>
                      <PersonCell
                        name={quote.customerName}
                        detail={quote.email}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-slate-800">
                        {quote.serviceType}
                      </span>
                      <small className="mt-1 block text-slate-500">
                        {quote.suburb}
                      </small>
                    </TableCell>
                    <TableCell>{requestLabel(quote.requestType)}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {formatEstimate(quote)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(quote.preferredDate)}
                    </TableCell>
                    <TableCell>
                      <QuoteStatusBadge status={quote.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-slate-500">
                      {formatDate(quote.createdAt)}
                    </TableCell>
                    <TableCell>
                      <RowAction>
                        <Link href={`/admin/quotes/${quote._id}`}>
                          Open <ArrowUpRight />
                        </Link>
                      </RowAction>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <AdminListPagination
              page={currentPage}
              total={filtered.length}
              onPage={setPage}
            />
          </>
        )}
      </AdminTableCard>
    </AdminListPage>
  );
}
