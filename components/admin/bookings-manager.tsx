"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { ArrowUpRight, CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
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

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}
function date(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}
function time(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(`2026-01-01T${value}:00`));
}
function label(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function BookingsManager() {
  const { isAuthenticated } = useConvexAuth();
  const bookings = useQuery(api.bookings.list, isAuthenticated ? {} : "skip");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [payment, setPayment] = useState("ALL");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    if (!bookings) return [];
    const term = search.trim().toLowerCase();
    return bookings.filter(
      (booking) =>
        (status === "ALL" || booking.status === status) &&
        (payment === "ALL" || booking.paymentStatus === payment) &&
        (!term ||
          [
            booking.customerName,
            booking.serviceName,
            booking.suburb,
            booking.scheduledDate,
          ].some((value) => value.toLowerCase().includes(term))),
    );
  }, [bookings, payment, search, status]);
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
        icon={CalendarCheck}
        label="Cleaning schedule"
        title="Bookings"
        description="Review confirmed cleans, requested times, and payment status in one place."
        count={bookings?.length}
      />
      <AdminListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search customer, service, suburb or date"
      >
        <FilterSelect
          label="Booking status"
          value={status}
          onChange={setStatus}
        >
          <option value="ALL">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PENDING_PAYMENT">Pending payment</option>
          <option value="CANCELLED">Cancelled</option>
        </FilterSelect>
        <FilterSelect label="Payment" value={payment} onChange={setPayment}>
          <option value="ALL">All payments</option>
          <option value="PAID">Paid</option>
          <option value="DEPOSIT_PAID">Deposit paid</option>
          <option value="UNPAID">Unpaid</option>
        </FilterSelect>
      </AdminListToolbar>
      <AdminTableCard>
        {bookings === undefined ? (
          <AdminLoading label="Loading bookings…" />
        ) : filtered.length === 0 ? (
          <AdminEmpty
            title="No matching bookings"
            description={
              search || status !== "ALL" || payment !== "ALL"
                ? "Try changing your search or filters."
                : "Confirmed website bookings will appear here."
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((booking) => (
                  <TableRow key={booking._id}>
                    <TableCell>
                      <PersonCell
                        name={booking.customerName}
                        detail={booking.suburb}
                      />
                    </TableCell>
                    <TableCell className="min-w-44 font-medium text-slate-800">
                      {booking.serviceName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <strong className="block font-medium text-slate-800">
                        {date(booking.scheduledDate)}
                      </strong>
                      <small className="mt-1 block text-slate-500">
                        {time(booking.scheduledTime)}
                      </small>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {money(booking.finalTotalCents)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="whitespace-nowrap bg-sky-50 text-sky-800"
                      >
                        {label(booking.paymentStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          booking.status === "CONFIRMED"
                            ? "bg-emerald-50 text-emerald-800"
                            : booking.status === "CANCELLED"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-800"
                        }
                      >
                        {label(booking.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{label(booking.source)}</TableCell>
                    <TableCell>
                      <RowAction>
                        <Link href={`/admin/bookings/${booking._id}`}>
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
