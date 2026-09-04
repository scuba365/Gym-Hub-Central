import React, { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  useListLeads,
  useCreateLead,
  useUpdateLead,
  useDeleteLead,
  getListLeadsQueryKey,
  useSyncLeadsFromGoteamup,
  usePromoteLeadToClient,
} from "@workspace/api-client-react";
import type { Lead, LeadStatus, LeadSource } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, Trash2, Phone, Mail, UserPlus, Search, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES: { value: LeadStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "qualified", label: "Qualified" },
  { value: "challenge_started", label: "Challenge Started" },
  { value: "converted", label: "Converted" },
  { value: "dropped_off", label: "Dropped Off" },
];

const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "qualified",
  "challenge_started",
  "converted",
  "dropped_off",
];

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  qualified: "Qualified",
  challenge_started: "Challenge Started",
  converted: "Converted",
  dropped_off: "Dropped Off",
};

const SOURCE_LABELS: Record<LeadSource, string> = {
  manual: "Manual",
  goteamup: "GoTeamUp",
  instagram: "Instagram",
  facebook: "Facebook",
  referral: "Referral",
  other: "Other",
};

const LEAD_SOURCES: LeadSource[] = [
  "manual",
  "goteamup",
  "instagram",
  "facebook",
  "referral",
  "other",
];

function statusColor(s: string): string {
  switch (s) {
    case "new":
      return "bg-muted text-muted-foreground border-border";
    case "qualified":
      return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
    case "challenge_started":
      return "bg-primary/20 text-primary border-primary/30";
    case "converted":
      return "bg-green-500/20 text-green-600 border-green-500/30";
    case "dropped_off":
      return "bg-destructive/20 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function sourceColor(s: string): string {
  switch (s) {
    case "goteamup":
      return "bg-primary/20 text-primary border-primary/30";
    case "instagram":
      return "bg-pink-500/20 text-pink-500 border-pink-500/30";
    case "facebook":
      return "bg-blue-500/20 text-blue-500 border-blue-500/30";
    case "referral":
      return "bg-purple-500/20 text-purple-500 border-purple-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

// ─── Empty form state ─────────────────────────────────────────────────────────

interface LeadForm {
  name: string;
  email: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  notes: string;
  goalText: string;
  followUpAt: string;
}

const EMPTY_FORM: LeadForm = {
  name: "",
  email: "",
  phone: "",
  source: "manual",
  status: "new",
  notes: "",
  goalText: "",
  followUpAt: "",
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Leads() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [activeStatus, setActiveStatus] = useState<LeadStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [deleteLead, setDeleteLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadForm>(EMPTY_FORM);

  const { data: leads = [], isLoading } = useListLeads();

  const createMutation = useCreateLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        setAddOpen(false);
        toast({ title: "Lead added" });
      },
      onError: () => toast({ title: "Failed to add lead", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        setEditLead(null);
        toast({ title: "Lead updated" });
      },
      onError: () => toast({ title: "Failed to update lead", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        setDeleteLead(null);
        toast({ title: "Lead deleted" });
      },
      onError: () => toast({ title: "Failed to delete lead", variant: "destructive" }),
    },
  });

  const syncMutation = useSyncLeadsFromGoteamup({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        toast({ title: `GoTeamUp sync: ${result.created} new, ${result.skipped} already existed` });
      },
      onError: () => toast({ title: "GoTeamUp sync failed", variant: "destructive" }),
    },
  });

  const promoteMutation = usePromoteLeadToClient({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        toast({ title: "Client created — redirecting…" });
        setTimeout(() => navigate(`/clients/${result.clientId}`), 800);
      },
      onError: (err: { message?: string }) =>
        toast({ title: err?.message ?? "Failed to create client", variant: "destructive" }),
    },
  });

  // Pre-populate form when opening edit dialog
  useEffect(() => {
    if (editLead) {
      setForm({
        name: editLead.name,
        email: editLead.email ?? "",
        phone: editLead.phone ?? "",
        source: (editLead.source as LeadSource) ?? "manual",
        status: (editLead.status as LeadStatus) ?? "new",
        notes: editLead.notes ?? "",
        goalText: editLead.goalText ?? "",
        followUpAt: editLead.followUpAt ?? "",
      });
    }
  }, [editLead]);

  // Clear form when add dialog closes
  useEffect(() => {
    if (!addOpen) setForm(EMPTY_FORM);
  }, [addOpen]);

  // Counts per status
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: leads.length };
    for (const l of leads) {
      map[l.status] = (map[l.status] ?? 0) + 1;
    }
    return map;
  }, [leads]);

  const today = new Date().toISOString().split("T")[0];

  const filtered = useMemo(() => {
    let list = activeStatus === "all" ? leads : leads.filter((l) => l.status === activeStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.email ?? "").toLowerCase().includes(q) ||
          (l.phone ?? "").toLowerCase().includes(q)
      );
    }
    // Overdue follow-ups first
    return [...list].sort((a, b) => {
      const aOverdue = a.followUpAt && a.followUpAt <= today ? 0 : 1;
      const bOverdue = b.followUpAt && b.followUpAt <= today ? 0 : 1;
      return aOverdue - bOverdue;
    });
  }, [leads, activeStatus, search, today]);

  function handleStatusChange(lead: Lead, status: LeadStatus) {
    updateMutation.mutate({ id: lead.id, data: { status } });
  }

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    createMutation.mutate({
      data: {
        name: form.name.trim(),
        email: form.email || null,
        phone: form.phone || null,
        source: form.source,
        status: form.status,
        notes: form.notes || null,
        goalText: form.goalText || null,
        followUpAt: form.followUpAt || null,
      },
    });
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editLead || !form.name.trim()) return;
    updateMutation.mutate({
      id: editLead.id,
      data: {
        name: form.name.trim(),
        email: form.email || null,
        phone: form.phone || null,
        source: form.source,
        status: form.status,
        notes: form.notes || null,
        goalText: form.goalText || null,
        followUpAt: form.followUpAt || null,
      },
    });
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Leads</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="gap-1"
          >
            <UserPlus className="h-4 w-4" />
            {syncMutation.isPending ? "Syncing…" : "Sync GoTeamUp"}
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" />
            Add Lead
          </Button>
        </div>
      </div>

      {/* Pipeline funnel stats */}
      <div className="flex flex-wrap gap-2 mb-4">
        {LEAD_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setActiveStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${statusColor(s)} ${activeStatus === s ? "ring-2 ring-offset-1 ring-primary/50" : ""}`}
          >
            {STATUS_LABELS[s]}: {counts[s] ?? 0}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone or email…"
          className="pl-9"
        />
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-border pb-0 overflow-x-auto">
        {STATUSES.map(({ value, label }) => (
          <TabButton
            key={value}
            active={activeStatus === value}
            onClick={() => setActiveStatus(value)}
          >
            {label}
            {counts[value] !== undefined && (
              <span className="ml-1.5 text-xs font-mono opacity-60">({counts[value]})</span>
            )}
          </TabButton>
        ))}
      </div>

      {/* Lead cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border rounded-xl text-muted-foreground gap-3">
          <UserPlus className="h-10 w-10 opacity-30" />
          <p className="text-sm">No leads in this stage</p>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            Add a lead
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onEdit={() => setEditLead(lead)}
              onDelete={() => setDeleteLead(lead)}
              onStatusChange={(s) => handleStatusChange(lead, s)}
              onPromote={() => promoteMutation.mutate({ id: lead.id })}
              promoting={promoteMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Add Lead dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4">
            <LeadFormFields form={form} onChange={setForm} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Adding…" : "Add Lead"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Lead dialog */}
      <Dialog open={!!editLead} onOpenChange={(open) => !open && setEditLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <LeadFormFields form={form} onChange={setForm} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditLead(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteLead} onOpenChange={(open) => !open && setDeleteLead(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteLead?.name}</strong>. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteLead && deleteMutation.mutate({ id: deleteLead.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function toWhatsAppHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `https://wa.me/${digits.replace("+", "")}`;
  const local = digits.replace(/^0/, "");
  return `https://wa.me/353${local}`;
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  onEdit,
  onDelete,
  onStatusChange,
  onPromote,
  promoting,
}: {
  lead: Lead;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: LeadStatus) => void;
  onPromote: () => void;
  promoting: boolean;
}) {
  const createdDate = lead.createdAt ? new Date(lead.createdAt).toLocaleDateString("en-IE") : null;
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = lead.followUpAt && lead.followUpAt <= today;
  const isDueToday = lead.followUpAt === today;

  return (
    <Card
      className={`relative cursor-pointer hover:border-primary/40 transition-colors ${isOverdue ? "border-yellow-500/50" : ""}`}
      onClick={onEdit}
    >
      <CardContent className="p-4 space-y-3">
        {/* Name + badges */}
        <div className="flex items-start justify-between gap-2">
          <p className="font-display font-semibold text-foreground leading-tight">{lead.name}</p>
          <Badge
            variant="outline"
            className={`text-xs shrink-0 ${sourceColor(lead.source)}`}
          >
            {SOURCE_LABELS[lead.source as LeadSource] ?? lead.source}
          </Badge>
        </div>

        {/* Contact */}
        <div className="space-y-1">
          {lead.phone && (
            <div className="flex items-center gap-2">
              <a
                href={`tel:${lead.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Phone className="h-3 w-3" />
                {lead.phone}
              </a>
              {toWhatsAppHref(lead.phone) && (
                <a
                  href={toWhatsAppHref(lead.phone)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-muted-foreground hover:text-green-500 transition-colors"
                  title="WhatsApp"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground truncate"
            >
              <Mail className="h-3 w-3" />
              {lead.email}
            </a>
          )}
        </div>

        {/* Notes preview */}
        {lead.goalText && (
          <p className="text-xs text-primary/70 italic line-clamp-1">🎯 {lead.goalText}</p>
        )}
        {lead.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2">{lead.notes}</p>
        )}

        {/* Follow-up date */}
        {lead.followUpAt && (
          <p className={`text-xs font-mono ${isOverdue ? "text-yellow-500 font-semibold" : "text-muted-foreground"}`}>
            {isDueToday ? "⚡ Follow up today" : isOverdue ? `⚠ Follow up: ${lead.followUpAt}` : `📅 Follow up: ${lead.followUpAt}`}
          </p>
        )}

        {/* Status selector + delete */}
        <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          <Select
            value={lead.status}
            onValueChange={(v) => onStatusChange(v as LeadStatus)}
          >
            <SelectTrigger className={`h-7 text-xs flex-1 border ${statusColor(lead.status)}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Promote to client */}
        {lead.status === "converted" && (
          <div onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs border-green-500/40 text-green-600 hover:bg-green-500/10"
              onClick={onPromote}
              disabled={promoting}
            >
              {promoting ? "Creating…" : "⬆ Create Client Record"}
            </Button>
          </div>
        )}

        {/* Date */}
        {createdDate && (
          <p className="text-xs font-mono text-muted-foreground/50 text-right">{createdDate}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Shared form fields ───────────────────────────────────────────────────────

function LeadFormFields({
  form,
  onChange,
}: {
  form: LeadForm;
  onChange: (f: LeadForm) => void;
}) {
  const set = (key: keyof LeadForm) => (val: string) => onChange({ ...form, [key]: val });

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="lead-name">Name *</Label>
        <Input
          id="lead-name"
          value={form.name}
          onChange={(e) => set("name")(e.target.value)}
          placeholder="Full name"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="lead-phone">Phone</Label>
          <Input
            id="lead-phone"
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
            placeholder="+353…"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lead-email">Email</Label>
          <Input
            id="lead-email"
            type="email"
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
            placeholder="email@example.com"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Source</Label>
          <Select value={form.source} onValueChange={(v) => set("source")(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status")(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="lead-goal">Goal</Label>
        <Input
          id="lead-goal"
          value={form.goalText}
          onChange={(e) => set("goalText")(e.target.value)}
          placeholder="What they want to achieve"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="lead-followup">Follow-up Date</Label>
        <Input
          id="lead-followup"
          type="date"
          value={form.followUpAt}
          onChange={(e) => set("followUpAt")(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="lead-notes">Notes</Label>
        <Textarea
          id="lead-notes"
          value={form.notes}
          onChange={(e) => set("notes")(e.target.value)}
          placeholder="Any additional notes…"
          rows={3}
        />
      </div>
    </>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide border-b-2 transition-colors whitespace-nowrap ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {children}
    </button>
  );
}
