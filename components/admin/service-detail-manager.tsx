"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Calculator,
  HelpCircle,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PricingModelBadge, ServiceStatusBadge } from "./service-badges";

type Message = { kind: "success" | "error"; text: string } | null;
type PricingModel = Doc<"services">["pricingModel"];
type PaymentRequirement = Doc<"services">["paymentRequirement"];
type QuestionType = Doc<"serviceQuestions">["type"];
type RuleType = Doc<"servicePricingRules">["ruleType"];

function optionalString(data: FormData, name: string) {
  const value = String(data.get(name) ?? "").trim();
  return value || undefined;
}

function optionalNumber(data: FormData, name: string) {
  const value = String(data.get(name) ?? "").trim();
  return value === "" ? undefined : Number(value);
}

function StatusMessage({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className={`text-sm ${message.kind === "success" ? "text-emerald-700" : "text-red-700"}`}
    >
      {message.text}
    </p>
  );
}

function ServiceDetailsForm({ service }: { service: Doc<"services"> }) {
  const updateService = useMutation(api.services.updateService);
  const [payment, setPayment] = useState<PaymentRequirement>(
    service.paymentRequirement,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const needsDeposit =
    payment === "DEPOSIT_ONLY" || payment === "DEPOSIT_OR_FULL";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    try {
      await updateService({
        serviceId: service._id,
        name: String(data.get("name") ?? ""),
        slug: String(data.get("slug") ?? ""),
        description: optionalString(data, "description"),
        shortDescription: optionalString(data, "shortDescription"),
        pricingModel: String(data.get("pricingModel")) as PricingModel,
        status: String(data.get("status")) as "ACTIVE" | "INACTIVE",
        requiresInspection: data.get("requiresInspection") === "on",
        sortOrder: Number(data.get("sortOrder")),
        paymentRequirement: payment,
        depositType: needsDeposit
          ? (String(data.get("depositType")) as "FIXED" | "PERCENTAGE")
          : undefined,
        depositValue: needsDeposit
          ? Number(data.get("depositValue"))
          : undefined,
      });
      setMessage({ kind: "success", text: "Service details saved." });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error ? error.message : "Unable to save service.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle>Service details</CardTitle>
        <CardDescription>
          Core catalogue, pricing model, and payment settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={service.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" name="slug" defaultValue={service.slug} required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="shortDescription">Short description</Label>
            <Input
              id="shortDescription"
              name="shortDescription"
              defaultValue={service.shortDescription}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={service.description}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pricingModel">Pricing model</Label>
            <NativeSelect
              id="pricingModel"
              name="pricingModel"
              defaultValue={service.pricingModel}
              className="w-full"
            >
              <option value="FIXED">Fixed</option>
              <option value="HOURLY">Hourly</option>
              <option value="RULE_BASED">Rule based</option>
              <option value="CUSTOM_QUOTE">Custom quote</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <NativeSelect
              id="status"
              name="status"
              defaultValue={service.status}
              className="w-full"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
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
              defaultValue={service.sortOrder}
              required
            />
          </div>
          <label className="flex items-center gap-3 self-end rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="requiresInspection"
              defaultChecked={service.requiresInspection}
              className="size-4 accent-emerald-700"
            />
            Requires inspection
          </label>
          <div className="space-y-2">
            <Label htmlFor="paymentRequirement">Payment requirement</Label>
            <NativeSelect
              id="paymentRequirement"
              name="paymentRequirement"
              value={payment}
              onChange={(event) =>
                setPayment(event.target.value as PaymentRequirement)
              }
              className="w-full"
            >
              <option value="PAY_LATER">Pay later</option>
              <option value="FULL">Full payment</option>
              <option value="DEPOSIT_OR_FULL">Deposit or full</option>
              <option value="DEPOSIT_ONLY">Deposit only</option>
            </NativeSelect>
          </div>
          {needsDeposit ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="depositType">Deposit type</Label>
                <NativeSelect
                  id="depositType"
                  name="depositType"
                  defaultValue={service.depositType ?? "FIXED"}
                  className="w-full"
                >
                  <option value="FIXED">Fixed amount (cents)</option>
                  <option value="PERCENTAGE">Percentage (basis points)</option>
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
                  defaultValue={service.depositValue}
                  required
                />
              </div>
            </>
          ) : null}
          <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row sm:items-center">
            <Button type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
              Save details
            </Button>
            <StatusMessage message={message} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function QuestionsManager({
  serviceId,
  questions,
}: {
  serviceId: Id<"services">;
  questions: Doc<"serviceQuestions">[];
}) {
  const createQuestion = useMutation(api.services.createQuestion);
  const updateQuestion = useMutation(api.services.updateQuestion);
  const setStatus = useMutation(api.services.setQuestionStatus);
  const [editing, setEditing] = useState<Doc<"serviceQuestions"> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const options = optionalString(data, "options")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const fields = {
      key: String(data.get("key") ?? ""),
      label: String(data.get("label") ?? ""),
      type: String(data.get("type")) as QuestionType,
      required: data.get("required") === "on",
      options: options?.length ? options : undefined,
      sortOrder: Number(data.get("sortOrder")),
      status: editing?.status ?? ("ACTIVE" as const),
    };
    try {
      if (editing) await updateQuestion({ questionId: editing._id, ...fields });
      else await createQuestion({ serviceId, ...fields });
      form.reset();
      setEditing(null);
      setShowForm(false);
      setMessage({
        kind: "success",
        text: editing ? "Question updated." : "Question added.",
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error ? error.message : "Unable to save question.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(question: Doc<"serviceQuestions">) {
    setMessage(null);
    try {
      await setStatus({
        questionId: question._id,
        status: question.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error ? error.message : "Unable to update question.",
      });
    }
  }

  function openEdit(question: Doc<"serviceQuestions">) {
    setEditing(question);
    setShowForm(true);
    setMessage(null);
  }
  function closeForm() {
    setEditing(null);
    setShowForm(false);
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Customer questions</CardTitle>
          <CardDescription>
            Fields the future estimator will ask for this service.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus />
          Add question
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <StatusMessage message={message} />
        {showForm ? (
          <form
            key={editing?._id ?? "new"}
            onSubmit={submit}
            className="grid gap-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 md:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="question-key">Key</Label>
              <Input
                id="question-key"
                name="key"
                defaultValue={editing?.key}
                placeholder="bedrooms"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-label">Label</Label>
              <Input
                id="question-label"
                name="label"
                defaultValue={editing?.label}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-type">Type</Label>
              <NativeSelect
                id="question-type"
                name="type"
                defaultValue={editing?.type ?? "NUMBER"}
                className="w-full"
              >
                <option value="NUMBER">Number</option>
                <option value="BOOLEAN">Yes / no</option>
                <option value="SELECT">Select</option>
                <option value="MULTI_SELECT">Multi-select</option>
                <option value="TEXT">Text</option>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-order">Sort order</Label>
              <Input
                id="question-order"
                name="sortOrder"
                type="number"
                min="0"
                step="1"
                defaultValue={editing?.sortOrder ?? (questions.length + 1) * 10}
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="question-options">
                Options{" "}
                <span className="font-normal text-slate-400">
                  (comma-separated)
                </span>
              </Label>
              <Input
                id="question-options"
                name="options"
                defaultValue={editing?.options?.join(", ")}
              />
            </div>
            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="required"
                defaultChecked={editing?.required}
                className="size-4 accent-emerald-700"
              />
              Required question
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeForm}>
                <X />
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
                {editing ? "Save question" : "Add question"}
              </Button>
            </div>
          </form>
        ) : null}
        {questions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-5 py-10 text-center">
            <HelpCircle className="mx-auto size-6 text-slate-400" />
            <p className="mt-3 text-sm text-slate-500">
              No questions configured.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {questions.map((question) => (
              <div
                key={question._id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">
                      {question.label}
                    </p>
                    <Badge variant="outline">
                      {question.type.replaceAll("_", " ")}
                    </Badge>
                    {question.required ? (
                      <Badge variant="secondary">Required</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {question.key} · order {question.sortOrder}
                  </p>
                </div>
                <ServiceStatusBadge status={question.status} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(question)}
                  >
                    <Pencil />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggle(question)}
                  >
                    {question.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PricingRulesManager({
  serviceId,
  rules,
}: {
  serviceId: Id<"services">;
  rules: Doc<"servicePricingRules">[];
}) {
  const createRule = useMutation(api.services.createPricingRule);
  const updateRule = useMutation(api.services.updatePricingRule);
  const setStatus = useMutation(api.services.setPricingRuleStatus);
  const [editing, setEditing] = useState<Doc<"servicePricingRules"> | null>(
    null,
  );
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const fields = {
      name: String(data.get("name") ?? ""),
      description: optionalString(data, "description"),
      ruleType: String(data.get("ruleType")) as RuleType,
      questionKey: optionalString(data, "questionKey"),
      amount: Number(data.get("amount")),
      includedQuantity: optionalNumber(data, "includedQuantity"),
      minQuantity: optionalNumber(data, "minQuantity"),
      maxQuantity: optionalNumber(data, "maxQuantity"),
      sortOrder: Number(data.get("sortOrder")),
      status: editing?.status ?? ("ACTIVE" as const),
    };
    try {
      if (editing) await updateRule({ ruleId: editing._id, ...fields });
      else await createRule({ serviceId, ...fields });
      form.reset();
      setEditing(null);
      setShowForm(false);
      setMessage({
        kind: "success",
        text: editing ? "Pricing rule updated." : "Pricing rule added.",
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save pricing rule.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: Doc<"servicePricingRules">) {
    setMessage(null);
    try {
      await setStatus({
        ruleId: rule._id,
        status: rule.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Unable to update rule.",
      });
    }
  }

  function openEdit(rule: Doc<"servicePricingRules">) {
    setEditing(rule);
    setShowForm(true);
    setMessage(null);
  }
  function closeForm() {
    setEditing(null);
    setShowForm(false);
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Pricing rules</CardTitle>
          <CardDescription>
            All amounts are stored in cents. Percentage amounts use basis points
            (1000 = 10%).
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus />
          Add rule
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <StatusMessage message={message} />
        {showForm ? (
          <form
            key={editing?._id ?? "new"}
            onSubmit={submit}
            className="grid gap-4 rounded-xl border border-amber-100 bg-amber-50/40 p-4 md:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                name="name"
                defaultValue={editing?.name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-type">Rule type</Label>
              <NativeSelect
                id="rule-type"
                name="ruleType"
                defaultValue={editing?.ruleType ?? "BASE_PRICE"}
                className="w-full"
              >
                <option value="BASE_PRICE">Base price</option>
                <option value="PER_UNIT">Per unit</option>
                <option value="FIXED_ADDON">Fixed add-on</option>
                <option value="PERCENTAGE">Percentage</option>
                <option value="HOURLY_RATE">Hourly rate</option>
              </NativeSelect>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="rule-description">Description</Label>
              <Input
                id="rule-description"
                name="description"
                defaultValue={editing?.description}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-key">Question key</Label>
              <Input
                id="rule-key"
                name="questionKey"
                defaultValue={editing?.questionKey}
                placeholder="bedrooms"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-amount">Amount (cents)</Label>
              <Input
                id="rule-amount"
                name="amount"
                type="number"
                min="0"
                step="1"
                defaultValue={editing?.amount ?? 0}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-included">Included quantity</Label>
              <Input
                id="rule-included"
                name="includedQuantity"
                type="number"
                min="0"
                step="1"
                defaultValue={editing?.includedQuantity}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-min">Minimum quantity</Label>
              <Input
                id="rule-min"
                name="minQuantity"
                type="number"
                min="0"
                step="any"
                defaultValue={editing?.minQuantity}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-max">Maximum quantity</Label>
              <Input
                id="rule-max"
                name="maxQuantity"
                type="number"
                min="0"
                step="any"
                defaultValue={editing?.maxQuantity}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-order">Sort order</Label>
              <Input
                id="rule-order"
                name="sortOrder"
                type="number"
                min="0"
                step="1"
                defaultValue={editing?.sortOrder ?? (rules.length + 1) * 10}
                required
              />
            </div>
            <div className="flex items-end justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeForm}>
                <X />
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
                {editing ? "Save rule" : "Add rule"}
              </Button>
            </div>
          </form>
        ) : null}
        {rules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-5 py-10 text-center">
            <Calculator className="mx-auto size-6 text-slate-400" />
            <p className="mt-3 text-sm text-slate-500">
              No pricing rules configured. Estimates will not show a price yet.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {rules.map((rule) => (
              <div
                key={rule._id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{rule.name}</p>
                    <Badge variant="outline">
                      {rule.ruleType.replaceAll("_", " ")}
                    </Badge>
                    {rule.includedQuantity ? (
                      <Badge variant="secondary">
                        {rule.includedQuantity} included
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {rule.questionKey ? `${rule.questionKey} · ` : ""}
                    {rule.amount.toLocaleString()} cents · order{" "}
                    {rule.sortOrder}
                  </p>
                </div>
                <ServiceStatusBadge status={rule.status} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(rule)}
                  >
                    <Pencil />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggle(rule)}
                  >
                    {rule.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ServiceDetailManager({
  serviceId,
}: {
  serviceId: Id<"services">;
}) {
  const { isAuthenticated } = useConvexAuth();
  const result = useQuery(
    api.services.getAdminService,
    isAuthenticated ? { serviceId } : "skip",
  );

  if (result === undefined)
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="size-4 animate-spin" />
        Loading service…
      </div>
    );
  if (result === null)
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Service not found</CardTitle>
          <CardDescription>
            The service may have been removed or the link is invalid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/services">
              <ArrowLeft />
              Back to services
            </Link>
          </Button>
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
          <Link href="/admin/services">
            <ArrowLeft />
            Back to services
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            {result.service.name}
          </h2>
          <ServiceStatusBadge status={result.service.status} />
          <PricingModelBadge model={result.service.pricingModel} />
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Configure service details, estimator questions, and server-side
          pricing rules.
        </p>
      </div>
      <ServiceDetailsForm
        key={`${result.service._id}-${result.service.updatedAt}`}
        service={result.service}
      />
      <QuestionsManager
        serviceId={result.service._id}
        questions={result.questions}
      />
      <PricingRulesManager
        serviceId={result.service._id}
        rules={result.pricingRules}
      />
    </div>
  );
}
