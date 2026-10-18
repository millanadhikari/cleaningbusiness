"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  ConciergeBell,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  PaymentRequirementBadge,
  PricingModelBadge,
  ServiceStatusBadge,
} from "./service-badges";
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
  RowAction,
} from "./admin-list-layout";

type PricingModel = "FIXED" | "HOURLY" | "RULE_BASED" | "CUSTOM_QUOTE";
type PaymentRequirement =
  "FULL" | "DEPOSIT_OR_FULL" | "DEPOSIT_ONLY" | "PAY_LATER";

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || undefined;
}

export function ServicesManager() {
  const { isAuthenticated } = useConvexAuth();
  const services = useQuery(
    api.services.listAdminServices,
    isAuthenticated ? {} : "skip",
  );
  const createService = useMutation(api.services.createService);
  const setStatus = useMutation(api.services.setServiceStatus);
  const [showCreate, setShowCreate] = useState(false);
  const [payment, setPayment] = useState<PaymentRequirement>("PAY_LATER");
  const [isSaving, setIsSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<Id<"services"> | null>(null);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatusFilter] = useState("ALL");
  const [pricing, setPricing] = useState("ALL");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!services) return [];
    const term = search.trim().toLowerCase();
    return services.filter(
      (service) =>
        (status === "ALL" || service.status === status) &&
        (pricing === "ALL" || service.pricingModel === pricing) &&
        (!term ||
          [service.name, service.slug, service.shortDescription].some((value) =>
            value?.toLowerCase().includes(term),
          )),
    );
  }, [pricing, search, services, status]);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE)),
  );
  const pageRows = filtered.slice(
    (currentPage - 1) * LIST_PAGE_SIZE,
    currentPage * LIST_PAGE_SIZE,
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const requirement = String(
      data.get("paymentRequirement"),
    ) as PaymentRequirement;
    const needsDeposit =
      requirement === "DEPOSIT_ONLY" || requirement === "DEPOSIT_OR_FULL";

    try {
      await createService({
        name: String(data.get("name") ?? ""),
        slug: String(data.get("slug") ?? ""),
        shortDescription: optionalString(data, "shortDescription"),
        description: optionalString(data, "description"),
        pricingModel: String(data.get("pricingModel")) as PricingModel,
        status: "ACTIVE",
        requiresInspection: data.get("requiresInspection") === "on",
        sortOrder: Number(data.get("sortOrder")),
        paymentRequirement: requirement,
        depositType: needsDeposit
          ? (String(data.get("depositType")) as "FIXED" | "PERCENTAGE")
          : undefined,
        depositValue: needsDeposit
          ? Number(data.get("depositValue"))
          : undefined,
      });
      form.reset();
      setPayment("PAY_LATER");
      setShowCreate(false);
      setMessage({ kind: "success", text: "Service created." });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error ? error.message : "Unable to create service.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStatus(
    serviceId: Id<"services">,
    current: "ACTIVE" | "INACTIVE",
  ) {
    setUpdatingId(serviceId);
    setMessage(null);
    try {
      await setStatus({
        serviceId,
        status: current === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error ? error.message : "Unable to update service.",
      });
    } finally {
      setUpdatingId(null);
    }
  }

  const depositRequired =
    payment === "DEPOSIT_ONLY" || payment === "DEPOSIT_OR_FULL";

  return (
    <AdminListPage>
      <AdminListHeader
        icon={ConciergeBell}
        label="Service catalogue"
        title="Services"
        description="Configure what customers can book, how each service is priced, and its payment requirements."
        count={services?.length}
        action={
          <Button onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? <X /> : <Plus />}
            {showCreate ? "Close" : "Create service"}
          </Button>
        }
      />

      {message ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${message.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
        >
          {message.text}
        </div>
      ) : null}

      {showCreate ? (
        <section className="rounded-[23px] border border-emerald-100 bg-white/95 p-6 shadow-[0_5px_24px_rgba(20,47,54,0.05)]">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-950">
              Create a service
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Pricing rules and questions can be added after the service is
              created.
            </p>
          </div>
          <form onSubmit={handleCreate} className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                name="slug"
                placeholder="service-name"
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="shortDescription">Short description</Label>
              <Input
                id="shortDescription"
                name="shortDescription"
                maxLength={240}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricingModel">Pricing model</Label>
              <NativeSelect
                id="pricingModel"
                name="pricingModel"
                className="w-full"
              >
                <option value="FIXED">Fixed</option>
                <option value="HOURLY">Hourly</option>
                <option value="RULE_BASED">Rule based</option>
                <option value="CUSTOM_QUOTE">Custom quote</option>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort order</Label>
              <Input
                id="sortOrder"
                name="sortOrder"
                type="number"
                min="0"
                step="1"
                defaultValue="100"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentRequirement">Payment requirement</Label>
              <NativeSelect
                id="paymentRequirement"
                name="paymentRequirement"
                className="w-full"
                value={payment}
                onChange={(event) =>
                  setPayment(event.target.value as PaymentRequirement)
                }
              >
                <option value="PAY_LATER">Pay later</option>
                <option value="FULL">Full payment</option>
                <option value="DEPOSIT_OR_FULL">Deposit or full</option>
                <option value="DEPOSIT_ONLY">Deposit only</option>
              </NativeSelect>
            </div>
            <label className="flex items-center gap-3 self-end rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="requiresInspection"
                className="size-4 accent-emerald-700"
              />
              Requires inspection
            </label>
            {depositRequired ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="depositType">Deposit type</Label>
                  <NativeSelect
                    id="depositType"
                    name="depositType"
                    className="w-full"
                  >
                    <option value="FIXED">Fixed amount (cents)</option>
                    <option value="PERCENTAGE">
                      Percentage (basis points)
                    </option>
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="depositValue">Deposit value</Label>
                  <Input
                    id="depositValue"
                    name="depositValue"
                    type="number"
                    min="1"
                    step="1"
                    required
                  />
                </div>
              </>
            ) : null}
            <div className="md:col-span-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Plus />
                )}
                Create service
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <AdminListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search service name, slug or description"
      >
        <FilterSelect label="Status" value={status} onChange={setStatusFilter}>
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </FilterSelect>
        <FilterSelect label="Pricing" value={pricing} onChange={setPricing}>
          <option value="ALL">All pricing models</option>
          <option value="FIXED">Fixed</option>
          <option value="HOURLY">Hourly</option>
          <option value="RULE_BASED">Rule based</option>
          <option value="CUSTOM_QUOTE">Custom quote</option>
        </FilterSelect>
      </AdminListToolbar>

      <AdminTableCard>
        {services === undefined ? (
          <AdminLoading label="Loading services…" />
        ) : filtered.length === 0 ? (
          <AdminEmpty
            title="No matching services"
            description={
              search || status !== "ALL" || pricing !== "ALL"
                ? "Try changing your search or filters."
                : "Create a service to start configuring the catalogue."
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Pricing model</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((service) => (
                  <TableRow key={service._id}>
                    <TableCell>
                      <p className="font-medium text-slate-900">
                        {service.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        /{service.slug}
                      </p>
                    </TableCell>
                    <TableCell>
                      <PricingModelBadge model={service.pricingModel} />
                    </TableCell>
                    <TableCell>
                      <PaymentRequirementBadge
                        requirement={service.paymentRequirement}
                      />
                    </TableCell>
                    <TableCell>
                      <ServiceStatusBadge status={service.status} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{service.sortOrder}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={updatingId === service._id}
                          onClick={() =>
                            toggleStatus(service._id, service.status)
                          }
                        >
                          {updatingId === service._id ? (
                            <LoaderCircle className="animate-spin" />
                          ) : service.status === "ACTIVE" ? (
                            "Deactivate"
                          ) : (
                            "Activate"
                          )}
                        </Button>
                        <RowAction>
                          <Link href={`/admin/services/${service._id}`}>
                            Manage <ArrowUpRight />
                          </Link>
                        </RowAction>
                      </div>
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
