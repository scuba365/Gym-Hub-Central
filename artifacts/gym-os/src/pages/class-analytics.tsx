import { useState } from "react";
import { Link } from "wouter";
import { useGetClassAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ArrowLeft, TrendingUp, Users, Zap, Scissors } from "lucide-react";

type SortKey = "fillPct" | "avgAttendees" | "sessionsCount" | "growthGap" | "name" | "day" | "time";
type SortDir = "asc" | "desc";

const STATUS_LABEL: Record<string, string> = {
  full: "Full",
  healthy: "Healthy",
  grow: "Grow",
  cut: "Cut?",
};

const STATUS_COLOUR: Record<string, string> = {
  full: "bg-primary/20 text-primary border-primary/30",
  healthy: "bg-green-500/15 text-green-400 border-green-500/30",
  grow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  cut: "bg-destructive/15 text-destructive border-destructive/30",
};

const DAY_SHORT: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
};

function fillColour(pct: number): string {
  if (pct >= 90) return "hsl(var(--primary))";
  if (pct >= 70) return "#22c55e";
  if (pct >= 40) return "#eab308";
  return "hsl(var(--destructive))";
}

function KpiCard({
  title, value, subtitle, loading, icon: Icon, colour,
}: {
  title: string; value: string | number | undefined; subtitle?: string;
  loading: boolean; icon: React.ElementType; colour?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">{title}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        {loading ? <Skeleton className="h-10 w-24" /> : (
          <>
            <p className={`text-3xl font-bold font-display ${colour ?? ""}`}>{value ?? "—"}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClassAnalytics() {
  const { data, isLoading, error } = useGetClassAnalytics();
  const [sortKey, setSortKey] = useState<SortKey>("fillPct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sortedClasses = [...(data?.classes ?? [])]
    .filter(c => statusFilter === "all" || c.status === statusFilter)
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name" || sortKey === "day" || sortKey === "time") {
        return mul * String(a[sortKey]).localeCompare(String(b[sortKey]));
      }
      return mul * (Number(a[sortKey]) - Number(b[sortKey]));
    });

  const SortTh = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      className="text-left text-muted-foreground font-semibold pb-2 pr-3 cursor-pointer select-none whitespace-nowrap hover:text-foreground"
      onClick={() => toggleSort(k)}
    >
      {label}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <header className="flex items-center gap-4 mb-8">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight uppercase">Class Analytics</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold mt-1">
            Utilisation · Trends · Growth Gaps
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm">
          Failed to load: {(error as { message?: string }).message ?? "Unknown error"}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard
          title="Avg Fill Rate"
          value={data ? `${data.summary.avgFillPct}%` : undefined}
          subtitle="across all classes"
          loading={isLoading}
          icon={TrendingUp}
          colour={data ? (data.summary.avgFillPct >= 70 ? "text-green-400" : data.summary.avgFillPct >= 40 ? "text-yellow-400" : "text-destructive") : ""}
        />
        <KpiCard
          title="Weekly Gap"
          value={data ? `${data.summary.weeklyGrowthGap} spots` : undefined}
          subtitle="empty seats per week"
          loading={isLoading}
          icon={Users}
        />
        <KpiCard
          title="Cut Candidates"
          value={data?.summary.cutCandidates}
          subtitle="classes under 40% full"
          loading={isLoading}
          icon={Scissors}
          colour={data && data.summary.cutCandidates > 0 ? "text-destructive" : ""}
        />
        <KpiCard
          title="Full Classes"
          value={data?.summary.fullClasses}
          subtitle="consistently 90%+ full"
          loading={isLoading}
          icon={Zap}
          colour={data && data.summary.fullClasses > 0 ? "text-primary" : ""}
        />
      </div>

      {/* Fullest / Quietest callout */}
      {!isLoading && data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {data.summary.fullestClass && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4 pb-4">
                <p className="text-[10px] font-mono font-semibold uppercase tracking-wider text-primary mb-1">Most Popular</p>
                <p className="font-bold text-foreground">{data.summary.fullestClass.name}</p>
                <p className="text-sm text-muted-foreground">
                  {DAY_SHORT[data.summary.fullestClass.day] ?? data.summary.fullestClass.day} · {data.summary.fullestClass.time} · {data.summary.fullestClass.fillPct}% full
                </p>
              </CardContent>
            </Card>
          )}
          {data.summary.quietestClass && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="pt-4 pb-4">
                <p className="text-[10px] font-mono font-semibold uppercase tracking-wider text-destructive mb-1">Biggest Opportunity</p>
                <p className="font-bold text-foreground">{data.summary.quietestClass.name}</p>
                <p className="text-sm text-muted-foreground">
                  {DAY_SHORT[data.summary.quietestClass.day] ?? data.summary.quietestClass.day} · {data.summary.quietestClass.time} · {data.summary.quietestClass.fillPct}% full · {data.summary.quietestClass.growthGap} spots to fill
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Fill rate by day */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold uppercase tracking-wider">Avg Fill Rate by Day</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.byDay ?? []} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tickFormatter={(d) => DAY_SHORT[d] ?? d} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, "Avg fill"]}
                  labelFormatter={(d) => DAY_SHORT[d] ?? d}
                />
                <Bar dataKey="avgFillPct" radius={[4, 4, 0, 0]}>
                  {(data?.byDay ?? []).map((entry: { avgFillPct: number }, i: number) => (
                    <Cell key={i} fill={fillColour(entry.avgFillPct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Fill rate by time */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold uppercase tracking-wider">Avg Fill Rate by Time Slot</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.byTime ?? []} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, "Avg fill"]}
                />
                <Bar dataKey="avgFillPct" radius={[4, 4, 0, 0]}>
                  {(data?.byTime ?? []).map((entry: { avgFillPct: number }, i: number) => (
                    <Cell key={i} fill={fillColour(entry.avgFillPct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Monthly trend */}
      {(data?.trend?.length ?? 0) > 1 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base font-semibold uppercase tracking-wider">Fill Rate Trend — Last 12 Months</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data?.trend ?? []} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <RechartsTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`${v}%`, "Avg fill"]}
                  />
                  <Line type="monotone" dataKey="avgFillPct" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Class utilisation table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base font-semibold uppercase tracking-wider">All Classes</CardTitle>
            <div className="flex gap-2 flex-wrap">
              {["all", "full", "healthy", "grow", "cut"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
                    statusFilter === s
                      ? s === "all" ? "bg-foreground text-background border-foreground" : STATUS_COLOUR[s]
                      : "border-border text-muted-foreground hover:border-foreground/50"
                  }`}
                >
                  {s === "all" ? "All" : STATUS_LABEL[s]}
                  {s !== "all" && data && (
                    <span className="ml-1 opacity-70">
                      ({data.classes.filter(c => c.status === s).length})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : sortedClasses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border">
                    <SortTh label="Class" k="name" />
                    <SortTh label="Day" k="day" />
                    <SortTh label="Time" k="time" />
                    <SortTh label="Avg" k="avgAttendees" />
                    <th className="text-left text-muted-foreground font-semibold pb-2 pr-3 whitespace-nowrap">Cap</th>
                    <SortTh label="% Full" k="fillPct" />
                    <SortTh label="Gap" k="growthGap" />
                    <SortTh label="Sessions" k="sessionsCount" />
                    <th className="text-left text-muted-foreground font-semibold pb-2 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedClasses.map((c, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="py-2 pr-3 font-sans font-medium text-foreground text-sm max-w-[180px] truncate">{c.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{DAY_SHORT[c.day] ?? c.day}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{c.time}</td>
                      <td className="py-2 pr-3 text-foreground">{c.avgAttendees}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{c.capacity}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-1.5 rounded-full"
                              style={{ width: `${c.fillPct}%`, backgroundColor: fillColour(c.fillPct) }}
                            />
                          </div>
                          <span className="text-foreground font-semibold">{c.fillPct}%</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{c.growthGap > 0 ? `+${c.growthGap}` : "—"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{c.sessionsCount}</td>
                      <td className="py-2">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border ${STATUS_COLOUR[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
