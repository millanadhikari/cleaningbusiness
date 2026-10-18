"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { AlertTriangle, MapPin, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Status = "IN_AREA" | "CHECK_ADDRESS" | "OUTSIDE_AREA";

const labels: Record<Status, string> = {
  IN_AREA: "In area",
  CHECK_ADDRESS: "Check address",
  OUTSIDE_AREA: "Outside area",
};

function statusClass(status: Status) {
  if (status === "IN_AREA") return "bg-emerald-50 text-emerald-800";
  if (status === "CHECK_ADDRESS") return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-700";
}

export function ServiceAreaSettings() {
  const { isAuthenticated } = useConvexAuth();
  const configuration = useQuery(api.serviceAreas.getConfiguration, isAuthenticated ? {} : "skip");
  const updateSettings = useMutation(api.serviceAreas.updateSettings);
  const upsertOverride = useMutation(api.serviceAreas.upsertOverride);
  const removeOverride = useMutation(api.serviceAreas.removeOverride);
  const [postcode, setPostcode] = useState("");
  const [status, setStatus] = useState<Status>("IN_AREA");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const overrides = useMemo(() => {
    const term = search.trim().toLowerCase();
    return configuration?.overrides.filter((item) =>
      !term || item.postcode.includes(term) || item.note?.toLowerCase().includes(term),
    ) ?? [];
  }, [configuration?.overrides, search]);

  async function saveConfiguration(formData: FormData) {
    setSaving(true);
    try {
      await updateSettings({
        centreName: String(formData.get("centreName") ?? ""),
        radiusKm: Number(formData.get("radiusKm")),
        mode: String(formData.get("mode")) as "WARNING" | "ENFORCED",
      });
      toast.success("Service-area settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function addOverride() {
    if (!/^\d{4}$/.test(postcode)) {
      toast.error("Enter a four-digit postcode.");
      return;
    }
    setSaving(true);
    try {
      await upsertOverride({ postcode, status, note: note || undefined });
      setPostcode("");
      setNote("");
      toast.success("Postcode override saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save override.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOverride(overrideId: Id<"serviceAreaPostcodeOverrides">) {
    try {
      await removeOverride({ overrideId });
      toast.success("Postcode returned to its default classification.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove override.");
    }
  }

  if (!configuration) {
    return <div className="p-8 text-sm text-slate-500">Loading service-area settings…</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"><MapPin className="size-4" /> Business coverage</div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Service area</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Control which postcodes can make an instant booking. Customers outside the standard area can still request a call.</p>
      </div>

      <div className={configuration.settings.mode === "WARNING" ? "rounded-xl border border-amber-200 bg-amber-50 p-4" : "rounded-xl border border-emerald-200 bg-emerald-50 p-4"}>
        <div className="flex gap-3">
          {configuration.settings.mode === "WARNING" ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" /> : <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />}
          <div><strong className="text-sm text-slate-900">{configuration.settings.mode === "WARNING" ? "Warning mode is active" : "Booking enforcement is active"}</strong><p className="mt-1 text-sm text-slate-600">{configuration.settings.mode === "WARNING" ? "Customers are shown their area result, but instant booking remains available while you verify the postcode list." : "Only postcodes classified as In area can complete an instant booking."}</p></div>
        </div>
      </div>

      <form action={saveConfiguration} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5"><h2 className="text-lg font-semibold text-slate-900">Coverage rules</h2><p className="mt-1 text-sm text-slate-500">Phase 1 uses a fixed 40 km postcode-centroid list around Sydney CBD. Use postcode overrides for exceptions.</p></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="centreName">Centre location</Label><Input id="centreName" name="centreName" defaultValue={configuration.settings.centreName} required /></div>
          <div className="space-y-2"><Label htmlFor="radiusKm">Standard radius (km)</Label><Input id="radiusKm" name="radiusKm" type="number" value={40} readOnly className="bg-slate-50" /></div>
          <div className="space-y-2"><Label htmlFor="mode">Customer booking mode</Label><NativeSelect id="mode" name="mode" defaultValue={configuration.settings.mode} className="w-full"><option value="WARNING">Warning only</option><option value="ENFORCED">Enforce service area</option></NativeSelect></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-xs text-slate-500">Default list: {configuration.defaults.inArea} accepted and {configuration.defaults.checkAddress} boundary postcodes.</p><Button type="submit" disabled={saving} className="bg-emerald-700 hover:bg-emerald-800">{saving ? "Saving…" : "Save settings"}</Button></div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5"><h2 className="text-lg font-semibold text-slate-900">Postcode overrides</h2><p className="mt-1 text-sm text-slate-500">Explicit overrides take priority over the generated 40 km list.</p></div>
        <div className="grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-[140px_190px_1fr_auto] md:items-end">
          <div className="space-y-2"><Label htmlFor="overridePostcode">Postcode</Label><Input id="overridePostcode" inputMode="numeric" maxLength={4} value={postcode} onChange={(event) => setPostcode(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2000" /></div>
          <div className="space-y-2"><Label htmlFor="overrideStatus">Classification</Label><NativeSelect id="overrideStatus" value={status} onChange={(event) => setStatus(event.target.value as Status)} className="w-full"><option value="IN_AREA">In area</option><option value="CHECK_ADDRESS">Check address</option><option value="OUTSIDE_AREA">Outside area</option></NativeSelect></div>
          <div className="space-y-2"><Label htmlFor="overrideNote">Internal note</Label><Input id="overrideNote" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason for this override" /></div>
          <Button type="button" onClick={addOverride} disabled={saving}><Plus /> Save override</Button>
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-lg border px-3"><Search className="size-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search override postcode or note" className="border-0 shadow-none focus-visible:ring-0" /></div>
        <div className="mt-4 overflow-hidden rounded-xl border">
          <Table>
            <TableHeader><TableRow><TableHead>Postcode</TableHead><TableHead>Classification</TableHead><TableHead>Note</TableHead><TableHead className="w-14"><span className="sr-only">Remove</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {overrides.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-slate-500">No matching postcode overrides.</TableCell></TableRow> : overrides.map((item) => <TableRow key={item._id}><TableCell className="font-semibold">{item.postcode}</TableCell><TableCell><Badge variant="secondary" className={statusClass(item.status)}>{labels[item.status]}</Badge></TableCell><TableCell className="text-slate-500">{item.note ?? "—"}</TableCell><TableCell><Button type="button" variant="ghost" size="icon-sm" onClick={() => deleteOverride(item._id)} aria-label={`Remove override for ${item.postcode}`}><Trash2 className="text-red-600" /></Button></TableCell></TableRow>)}
            </TableBody>
          </Table>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Initial postcode centroids are based on the Australian Postcodes &amp; Suburbs dataset. Boundary postcodes should be confirmed using the customer’s full address.</p>
      </section>
    </div>
  );
}
