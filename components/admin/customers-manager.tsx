"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { ArrowUpRight, UsersRound } from "lucide-react";
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

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}
function label(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function CustomersManager() {
  const { isAuthenticated } = useConvexAuth();
  const customers = useQuery(api.customers.list, isAuthenticated ? {} : "skip");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    if (!customers) return [];
    const term = search.trim().toLowerCase();
    return customers.filter((customer) => {
      const name = [customer.firstName, customer.lastName]
        .filter(Boolean)
        .join(" ");
      return (
        (status === "ALL" || customer.status === status) &&
        (source === "ALL" || customer.source === source) &&
        (!term ||
          [name, customer.email, customer.phone].some((value) =>
            value?.toLowerCase().includes(term),
          ))
      );
    });
  }, [customers, search, source, status]);
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
        icon={UsersRound}
        label="Customer relationships"
        title="Customers"
        description="Find contact details, review enquiry history, and keep customer records organised."
        count={customers?.length}
      />
      <AdminListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search name, email or phone"
      >
        <FilterSelect label="Status" value={status} onChange={setStatus}>
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </FilterSelect>
        <FilterSelect label="Source" value={source} onChange={setSource}>
          <option value="ALL">All sources</option>
          <option value="WEBSITE">Website</option>
          <option value="PHONE">Phone</option>
          <option value="EMAIL">Email</option>
          <option value="ADMIN">Admin</option>
          <option value="REFERRAL">Referral</option>
          <option value="OTHER">Other</option>
        </FilterSelect>
      </AdminListToolbar>
      <AdminTableCard>
        {customers === undefined ? (
          <AdminLoading label="Loading customers…" />
        ) : filtered.length === 0 ? (
          <AdminEmpty
            title="No matching customers"
            description={
              search || status !== "ALL" || source !== "ALL"
                ? "Try changing your search or filters."
                : "Customer records will appear after the first enquiry."
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Quote requests</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((customer) => {
                  const name = [customer.firstName, customer.lastName]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <TableRow key={customer._id}>
                      <TableCell>
                        <PersonCell
                          name={name}
                          detail={customer.email ?? "No email address"}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {customer.phone}
                      </TableCell>
                      <TableCell>
                        {customer.source ? label(customer.source) : "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="bg-emerald-50 text-emerald-800"
                        >
                          {customer.quoteRequestCount}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            customer.status === "ACTIVE"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }
                        >
                          {label(customer.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-slate-500">
                        {formatDate(customer.createdAt)}
                      </TableCell>
                      <TableCell>
                        <RowAction>
                          <Link href={`/admin/customers/${customer._id}`}>
                            Open <ArrowUpRight />
                          </Link>
                        </RowAction>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
