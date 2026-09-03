import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetClient,
  useGetClientScans,
  useGetClientAttendance,
  useUpdateClient,
  useDeleteClient,
  useGenerateClientInsight,
  useGenerateCheckinDraft,
  useListCheckinDrafts,
  useUpdateCheckinDraft,
  useGenerateMacroTargets,
  useUpdateClientMacros,
  getGetClientQueryKey,
  getGetClientScansQueryKey,
  getGetClientAttendanceQueryKey,
  getListClientsQueryKey,
  getListCheckinDraftsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, subDays } from "date-fns";
import {
  ArrowLeft,
  Save,
  Activity,
  Dumbbell,
  Utensils,
  Scale,
  Calendar,
  Sparkles,
  MessageSquare,
  Copy,
  Check,
  Trash2,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  Cell
} from "recharts";
import { startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

export default function ClientDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: client, isLoading: clientLoading } = useGetClient(id, {
    query: { enabled: !!id, queryKey: getGetClientQueryKey(id) }
  });

  const { data: scans, isLoading: scansLoading } = useGetClientScans(id, {
    query: { enabled: !!id, queryKey: getGetClientScansQueryKey(id) }
  });

  const { data: attendance, isLoading: attendanceLoading } = useGetClientAttendance(id, {
    query: { enabled: !!id, queryKey: getGetClientAttendanceQueryKey(id) }
  });

  const { data: checkinDrafts, isLoading: draftsLoading } = useListCheckinDrafts(id, {
    query: { enabled: !!id, queryKey: getListCheckinDraftsQueryKey(id) },
  });

  const [, navigate] = useLocation();
  const updateMutation = useUpdateClient();
  const deleteMutation = useDeleteClient();
  const insightMutation = useGenerateClientInsight();
  const checkinMutation = useGenerateCheckinDraft();
  const updateDraftMutation = useUpdateCheckinDraft();
  const macroAiMutation = useGenerateMacroTargets();
  const macroManualMutation = useUpdateClientMacros();

  // Local state for editable fields
  const [goals, setGoals] = useState("");
  const [notes, setNotes] = useState("");
  const [needsMealPlan, setNeedsMealPlan] = useState(false);
  const [birthday, setBirthday] = useState("");
  const initialized = useRef(false);

  // Macro local state
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const macrosInitialized = useRef(false);

  // Copy state per draft
  const [copiedDraftId, setCopiedDraftId] = useState<number | null>(null);

  useEffect(() => {
    if (client && !initialized.current) {
      setGoals(client.goals || "");
      setNotes(client.notes || "");
      setNeedsMealPlan(client.needsMealPlan || false);
      setBirthday(client.birthday || "");
      initialized.current = true;
    }
  }, [client]);

  useEffect(() => {
    if (client && !macrosInitialized.current) {
      setCalories(client.dailyCalorieTarget != null ? String(Math.round(client.dailyCalorieTarget)) : "");
      setProtein(client.proteinTargetG != null ? String(Math.round(client.proteinTargetG)) : "");
      setCarbs(client.carbsTargetG != null ? String(Math.round(client.carbsTargetG)) : "");
      setFat(client.fatTargetG != null ? String(Math.round(client.fatTargetG)) : "");
      macrosInitialized.current = true;
    }
  }, [client]);

  const handleSave = () => {
    updateMutation.mutate({
      id,
      data: { goals, notes, needsMealPlan, birthday: birthday || null }
    }, {
      onSuccess: () => {
        toast({ title: "Client Updated", description: "Changes saved successfully." });
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Failed to save changes." });
      }
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        navigate("/");
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Failed to delete client." });
      },
    });
  };

  const handleGenerateInsight = () => {
    insightMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(id) });
        toast({ title: "Insight generated" });
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to generate insight";
        toast({ variant: "destructive", title: "Error", description: msg });
      },
    });
  };

  const handleGenerateCheckin = () => {
    checkinMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCheckinDraftsQueryKey(id) });
        toast({ title: "Check-in draft created" });
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to generate draft";
        toast({ variant: "destructive", title: "Error", description: msg });
      },
    });
  };

  const handleDraftStatus = (draftId: number, status: "sent" | "dismissed") => {
    updateDraftMutation.mutate(
      { id, draftId, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCheckinDraftsQueryKey(id) });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Failed to update draft." });
        },
      }
    );
  };

  const handleCopyDraft = (text: string, draftId: number) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedDraftId(draftId);
      setTimeout(() => setCopiedDraftId(null), 2000);
    });
  };

  const handleSuggestMacros = () => {
    macroAiMutation.mutate({ id }, {
      onSuccess: (data) => {
        setCalories(data.dailyCalorieTarget != null ? String(Math.round(data.dailyCalorieTarget)) : "");
        setProtein(data.proteinTargetG != null ? String(Math.round(data.proteinTargetG)) : "");
        setCarbs(data.carbsTargetG != null ? String(Math.round(data.carbsTargetG)) : "");
        setFat(data.fatTargetG != null ? String(Math.round(data.fatTargetG)) : "");
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(id) });
        toast({ title: "Macro targets suggested" });
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to suggest macros";
        toast({ variant: "destructive", title: "Error", description: msg });
      },
    });
  };

  const handleSaveMacros = () => {
    macroManualMutation.mutate({
      id,
      data: {
        dailyCalorieTarget: calories ? Number(calories) : null,
        proteinTargetG: protein ? Number(protein) : null,
        carbsTargetG: carbs ? Number(carbs) : null,
        fatTargetG: fat ? Number(fat) : null,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        toast({ title: "Macro targets saved" });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Failed to save macros." });
      },
    });
  };

  const getInitials = (name: string) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
  };

  // InBody chart data
  const chartData = useMemo(() => {
    if (!scans || scans.length === 0) return [];
    return [...scans]
      .sort((a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime())
      .map(s => ({
        date: format(parseISO(s.scannedAt), "MMM d"),
        weight: s.weightKg,
        bodyFat: s.bodyFatPct,
        muscle: s.muscleMassKg
      }));
  }, [scans]);

  // Weekly attendance chart data (last 4 weeks) with drop detection
  const weeklyAttendanceData = useMemo(() => {
    const today = new Date();
    const weeks = Array.from({ length: 4 }, (_, i) => {
      const weekOffset = 3 - i;
      const weekStart = startOfWeek(subDays(today, weekOffset * 7), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const label = i === 3 ? "This week" : i === 2 ? "Last week" : `${weekOffset}w ago`;
      const count = (attendance || []).filter(r => {
        if (!r.date) return false;
        try {
          return isWithinInterval(parseISO(r.date), { start: weekStart, end: weekEnd });
        } catch {
          return false;
        }
      }).length;
      return { week: label, sessions: count, weekStart };
    });

    const avg = weeks.reduce((sum, w) => sum + w.sessions, 0) / weeks.length;

    return weeks.map(w => {
      const dropPct = avg > 0 ? Math.round(((avg - w.sessions) / avg) * 100) : 0;
      const isDropWeek = avg >= 1 && w.sessions < avg * 0.6;
      return { ...w, avg, dropPct: Math.max(0, dropPct), isDropWeek };
    });
  }, [attendance]);

  const AttendanceTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: typeof weeklyAttendanceData[0] }>; label?: string }) => {
    if (!active || !payload || !payload.length) return null;
    const entry = payload[0].payload;
    return (
      <div className="rounded border px-3 py-2 text-xs font-mono shadow-md"
        style={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}>
        <p className="font-bold mb-1">{label}</p>
        <p>{entry.sessions} session{entry.sessions !== 1 ? "s" : ""}</p>
        {entry.isDropWeek && (
          <p className="mt-1 font-semibold" style={{ color: "#f59e0b" }}>
            ▼ {entry.dropPct}% below 4-week avg
          </p>
        )}
      </div>
    );
  };

  const draftStatusColor: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-primary/20 text-primary border-primary/30",
    dismissed: "bg-destructive/10 text-destructive border-destructive/30",
  };

  if (clientLoading) {
    return (
      <div className="container mx-auto p-4 max-w-5xl">
        <Skeleton className="h-8 w-24 mb-6" />
        <Skeleton className="h-40 w-full mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="container mx-auto p-4 text-center mt-20">
        <h2 className="text-2xl font-bold">Client Not Found</h2>
        <Link href="/">
          <Button className="mt-4">Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const isDisengaged = client.engagementStatus === "disengaged";
  const hasScans = scans && scans.length > 0;

  return (
    <div className="container mx-auto p-4 max-w-6xl pb-20">
      <div className="flex items-center justify-between mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Operations
          </Button>
        </Link>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4 mr-1" /> Delete Client
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {client?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the client and all associated scans, attendance records, and check-in drafts. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className={`flex flex-col md:flex-row gap-6 mb-8 items-start md:items-center justify-between ${isDisengaged ? 'opacity-80' : ''}`}>
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 border-2 border-border">
            <AvatarImage src={client.photoUrl || ""} />
            <AvatarFallback className="bg-secondary text-secondary-foreground font-mono text-xl">
              {getInitials(client.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-4xl font-display font-bold tracking-tight uppercase">{client.name}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className={`font-mono uppercase ${
                client.engagementStatus === 'active' ? 'bg-primary/20 text-primary border-primary/30' :
                client.engagementStatus === 'at_risk' ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' :
                'bg-destructive/20 text-destructive border-destructive/30'
              }`}>
                {client.engagementStatus.replace("_", " ")}
              </Badge>
              <span className="text-xs font-mono text-muted-foreground">ID: {client.id}</span>
              {client.phone && (() => {
                const digits = client.phone.replace(/[^\d+]/g, "");
                const wa = digits.startsWith("+")
                  ? `https://wa.me/${digits.replace("+", "")}`
                  : `https://wa.me/353${digits.replace(/^0/, "")}`;
                return (
                  <a href={wa} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs font-mono text-green-500/70 hover:text-green-500 transition-colors">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                  </a>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-3 px-6 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Weekly Avg</p>
              <p className="text-2xl font-mono text-primary">{client.weeklyAttendanceAvg?.toFixed(1) || "0.0"}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-3 px-6 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Compliance</p>
              <p className="text-2xl font-mono text-primary">{client.workoutCompliancePct || 0}%</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column - Editable Settings + AI cards */}
        <div className="space-y-6">
          <Card className="bg-card border-border shadow-md">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-display uppercase tracking-wider text-muted-foreground flex items-center">
                <Utensils className="mr-2 h-4 w-4" /> Operational Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="meal-plan" className="font-mono text-xs uppercase cursor-pointer">Requires Meal Plan</Label>
                <Switch
                  id="meal-plan"
                  checked={needsMealPlan}
                  onCheckedChange={setNeedsMealPlan}
                />
              </div>

              <div className="space-y-2 pt-2">
                <Label htmlFor="birthday" className="font-mono text-xs uppercase">Birthday</Label>
                <Input
                  id="birthday"
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  className="font-mono text-sm bg-background border-border"
                />
              </div>

              <div className="space-y-2 pt-2">
                <Label htmlFor="goals" className="font-mono text-xs uppercase">Primary Goals</Label>
                <Textarea
                  id="goals"
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  className="min-h-[100px] font-mono text-sm bg-background border-border"
                  placeholder="Enter client goals..."
                />
              </div>

              <div className="space-y-2 pt-2">
                <Label htmlFor="notes" className="font-mono text-xs uppercase">Internal Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[120px] font-mono text-sm bg-background border-border"
                  placeholder="Trainer notes (not visible to client)..."
                />
              </div>

              <Button
                onClick={handleSave}
                className="w-full mt-4 font-display uppercase font-bold tracking-wider"
                disabled={updateMutation.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

          {/* AI Insight Card */}
          <Card className="bg-card border-border shadow-md">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-display uppercase tracking-wider text-muted-foreground flex items-center">
                <Sparkles className="mr-2 h-4 w-4" /> AI Insight
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {client.lastAiInsight ? (
                <div className="space-y-2">
                  <p className="text-sm text-foreground/90 leading-relaxed">{client.lastAiInsight}</p>
                  {client.lastAiInsightAt && (
                    <p className="text-[10px] font-mono text-muted-foreground">
                      Generated {format(parseISO(client.lastAiInsightAt), "PP p")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No insight generated yet.</p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="w-full font-mono text-xs uppercase tracking-wider"
                onClick={handleGenerateInsight}
                disabled={insightMutation.isPending}
              >
                <Sparkles className="mr-2 h-3 w-3" />
                {insightMutation.isPending ? "Generating..." : client.lastAiInsight ? "Regenerate Insight" : "Generate Insight"}
              </Button>
            </CardContent>
          </Card>

          {/* Integrations Card */}
          <Card className="bg-card border-border shadow-md">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-display uppercase tracking-wider text-muted-foreground flex items-center">
                <Activity className="mr-2 h-4 w-4" /> Integrations
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">TeamUp:</span>
                <span className={client.teamupId ? "text-primary" : "text-destructive"}>
                  {client.teamupId ? "Connected" : "Missing"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Trainerize:</span>
                <span className={client.trainerizeId ? "text-primary" : "text-destructive"}>
                  {client.trainerizeId ? "Connected" : "Missing"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">InBody:</span>
                <span className={client.inbodyId ? "text-primary" : "text-destructive"}>
                  {client.inbodyId ? "Connected" : "Missing"}
                </span>
              </div>
              <div className="pt-3 mt-3 border-t border-border/50 text-muted-foreground opacity-70">
                Last synced: {client.lastSyncedAt ? format(parseISO(client.lastSyncedAt), "PP p") : "Never"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Data & Charts + AI cards */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-card border-border shadow-md h-[400px] flex flex-col">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-display uppercase tracking-wider text-muted-foreground flex items-center">
                  <Scale className="mr-2 h-4 w-4" /> InBody Trajectory
                </CardTitle>
                <div className="text-xs font-mono">
                  Current: <span className="text-primary font-bold">{client.latestWeight || "-"}kg</span> / <span className="text-chart-2 font-bold">{client.latestBodyFatPct || "-"}%</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 flex-1 min-h-0">
              {scansLoading ? (
                <div className="h-full w-full flex items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" stroke="hsl(var(--primary))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--chart-2))" fontSize={12} tickLine={false} axisLine={false} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line yAxisId="left" type="monotone" dataKey="weight" name="Weight (kg)" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--primary))" }} activeDot={{ r: 6 }} />
                    <Line yAxisId="left" type="monotone" dataKey="muscle" name="Muscle Mass (kg)" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--chart-3))" }} activeDot={{ r: 6 }} />
                    <Line yAxisId="right" type="monotone" dataKey="bodyFat" name="Body Fat %" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--chart-2))" }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
                  No scan data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-md h-[280px] flex flex-col">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-display uppercase tracking-wider text-muted-foreground flex items-center">
                  <Calendar className="mr-2 h-4 w-4" /> Weekly Attendance
                </CardTitle>
                <span className="text-xs font-mono text-muted-foreground">Last 4 weeks</span>
              </div>
            </CardHeader>
            <CardContent className="pt-4 flex-1 min-h-0">
              {attendanceLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyAttendanceData} margin={{ top: 4, right: 16, bottom: 4, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <RechartsTooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                      content={<AttendanceTooltip />}
                    />
                    <Bar dataKey="sessions" radius={[4, 4, 0, 0]} maxBarSize={56}>
                      {weeklyAttendanceData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.isDropWeek
                              ? "#f59e0b"
                              : index === 3
                              ? "hsl(var(--primary))"
                              : "hsl(var(--primary) / 0.45)"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Check-in Drafts Card */}
          <Card className="bg-card border-border shadow-md">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-display uppercase tracking-wider text-muted-foreground flex items-center">
                  <MessageSquare className="mr-2 h-4 w-4" /> Check-in Drafts
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="font-mono text-xs uppercase tracking-wider h-7 px-3"
                  onClick={handleGenerateCheckin}
                  disabled={checkinMutation.isPending}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  {checkinMutation.isPending ? "Drafting..." : "Draft Check-in"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {draftsLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : !checkinDrafts || checkinDrafts.length === 0 ? (
                <p className="text-xs text-muted-foreground italic text-center py-4">No drafts yet. Click "Draft Check-in" to generate one.</p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {checkinDrafts.map(draft => (
                    <div key={draft.id} className="rounded-md border border-border/60 p-3 space-y-2 bg-background/50">
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono uppercase ${draftStatusColor[draft.status] ?? ""}`}
                        >
                          {draft.status}
                        </Badge>
                        {draft.createdAt && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {format(parseISO(draft.createdAt), "MMM d, p")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed">{draft.draftText}</p>
                      {draft.status === "draft" && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px] font-mono uppercase"
                            onClick={() => handleCopyDraft(draft.draftText, draft.id)}
                          >
                            {copiedDraftId === draft.id ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                            {copiedDraftId === draft.id ? "Copied" : "Copy"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px] font-mono uppercase text-primary hover:text-primary"
                            onClick={() => handleDraftStatus(draft.id, "sent")}
                            disabled={updateDraftMutation.isPending}
                          >
                            Mark Sent
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px] font-mono uppercase text-muted-foreground"
                            onClick={() => handleDraftStatus(draft.id, "dismissed")}
                            disabled={updateDraftMutation.isPending}
                          >
                            Dismiss
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Macro Targets Card */}
          <Card className="bg-card border-border shadow-md">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-display uppercase tracking-wider text-muted-foreground flex items-center">
                  <Dumbbell className="mr-2 h-4 w-4" /> Macro Targets
                </CardTitle>
                {client.macroTargetsUpdatedAt && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Updated {format(parseISO(client.macroTargetsUpdatedAt), "PP")}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {!hasScans && (
                <p className="text-xs text-muted-foreground italic text-center py-2">
                  Needs an InBody scan first to suggest macros via AI.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="font-mono text-[10px] uppercase text-muted-foreground">Calories (kcal)</Label>
                  <Input
                    type="number"
                    value={calories}
                    onChange={e => setCalories(e.target.value)}
                    className="font-mono text-sm bg-background border-border h-8"
                    placeholder="—"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-mono text-[10px] uppercase text-muted-foreground">Protein (g)</Label>
                  <Input
                    type="number"
                    value={protein}
                    onChange={e => setProtein(e.target.value)}
                    className="font-mono text-sm bg-background border-border h-8"
                    placeholder="—"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-mono text-[10px] uppercase text-muted-foreground">Carbs (g)</Label>
                  <Input
                    type="number"
                    value={carbs}
                    onChange={e => setCarbs(e.target.value)}
                    className="font-mono text-sm bg-background border-border h-8"
                    placeholder="—"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-mono text-[10px] uppercase text-muted-foreground">Fat (g)</Label>
                  <Input
                    type="number"
                    value={fat}
                    onChange={e => setFat(e.target.value)}
                    className="font-mono text-sm bg-background border-border h-8"
                    placeholder="—"
                  />
                </div>
              </div>
              {client.macroTargetsRationale && (
                <p className="text-[11px] text-muted-foreground italic border-l-2 border-primary/40 pl-2">
                  {client.macroTargetsRationale}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                {hasScans && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-mono text-xs uppercase tracking-wider"
                    onClick={handleSuggestMacros}
                    disabled={macroAiMutation.isPending}
                  >
                    <Sparkles className="mr-1 h-3 w-3" />
                    {macroAiMutation.isPending ? "Suggesting..." : "Suggest via AI"}
                  </Button>
                )}
                <Button
                  size="sm"
                  className="font-mono text-xs uppercase tracking-wider"
                  onClick={handleSaveMacros}
                  disabled={macroManualMutation.isPending}
                >
                  <Save className="mr-1 h-3 w-3" />
                  {macroManualMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
