import React, { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  useGetDashboardStats,
  useGetMembershipReport,
  useGetAttendanceHeatmap,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingUp, Users, PoundSterling, Target, Calendar } from "lucide-react";
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
  ReferenceLine,
  Legend,
} from "recharts";

function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  };
  return [value, set];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun display order

function fillColor(pct: number): string {
  if (pct >= 90) return "hsl(var(--destructive))";
  if (pct >= 70) return "hsl(48 96% 53%)"; // yellow-500
  if (pct >= 40) return "hsl(var(--primary))";
  return "hsl(var(--muted))";
}

function fillTextColor(pct: number): string {
  if (pct >= 40) return "hsl(var(--primary-foreground))";
  return "hsl(var(--muted-foreground))";
}

export default function Growth() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: report, isLoading: reportLoading } = useGetMembershipReport();
  const { data: heatmapRows, isLoading: heatmapLoading } = useGetAttendanceHeatmap();

  const SGPT_SPACES = 6;
  const LG_SPACES = 12;

  const [sgptSessions, setSgptSessions] = useLocalStorage("growth.sgptSessions", 15);
  const [lgSessions, setLgSessions] = useLocalStorage("growth.lgSessions", 30);
  const [avgMembershipValue, setAvgMembershipValue] = useLocalStorage("growth.avgMembershipValue", 247);

  const isLoading = statsLoading || reportLoading;

  const avgWeeklyAttendance = stats?.avgWeeklyAttendance ?? 2.2;
  const currentMembers = report?.current.activeMembers ?? 0;

  const avgMonthlySignUps = useMemo(() => {
    if (!report?.months?.length) return 15;
    const total = report.months.reduce((sum, m) => sum + m.newMembers, 0);
    return Math.round(total / report.months.length);
  }, [report]);

  const avgChurnRate = useMemo(() => {
    if (!report?.months?.length) return 0.04;
    const total = report.months.reduce((sum, m) => sum + m.churnPct, 0);
    return (total / report.months.length) / 100;
  }, [report]);

  // Total bookings split proportionally by session count (best estimate without per-format booking data)
  const totalWeeklyBookings = currentMembers * avgWeeklyAttendance;
  const totalSessions = sgptSessions + lgSessions;

  // Small Group PT calculations
  const sgptWeeklySpaces = sgptSessions * SGPT_SPACES;
  const sgptWeeklyBookings = totalSessions > 0 ? totalWeeklyBookings * (sgptSessions / totalSessions) : 0;
  const sgptBookedPct = sgptWeeklySpaces > 0 ? Math.round((sgptWeeklyBookings / sgptWeeklySpaces) * 100) : 0;
  const sgptMaxCapacity = Math.floor(sgptWeeklySpaces / avgWeeklyAttendance);
  const sgptOpCapacity = Math.floor(sgptMaxCapacity * 0.85);

  // Large Group calculations
  const lgWeeklySpaces = lgSessions * LG_SPACES;
  const lgWeeklyBookings = totalSessions > 0 ? totalWeeklyBookings * (lgSessions / totalSessions) : 0;
  const lgBookedPct = lgWeeklySpaces > 0 ? Math.round((lgWeeklyBookings / lgWeeklySpaces) * 100) : 0;
  const lgMaxCapacity = Math.floor(lgWeeklySpaces / avgWeeklyAttendance);
  const lgOpCapacity = Math.floor(lgMaxCapacity * 0.85);

  // Combined for revenue projections (use the larger of the two op capacities as ceiling)
  const combinedOpCapacity = Math.max(sgptOpCapacity, lgOpCapacity);
  const operationalCapacity = combinedOpCapacity;
  const maxCapacity = Math.max(sgptMaxCapacity, lgMaxCapacity);
  const monthlyRevenuePotential = operationalCapacity * avgMembershipValue;
  const annualRevenuePotential = monthlyRevenuePotential * 12;
  const currentMonthlyRevenue = currentMembers * avgMembershipValue;
  const growthPlateau = avgChurnRate > 0 ? Math.floor(avgMonthlySignUps / avgChurnRate) : null;
  const capacityUsedPct = operationalCapacity > 0 ? Math.round((currentMembers / operationalCapacity) * 100) : 0;

  // Legacy — kept for heatmap compat
  const spacesPerSession = SGPT_SPACES;
  const totalWeeklySpaces = sgptWeeklySpaces + lgWeeklySpaces;

  // 12-month forward projection
  const projection = useMemo(() => {
    const months = [];
    let members = currentMembers;
    for (let i = 1; i <= 12; i++) {
      members = members + avgMonthlySignUps - members * avgChurnRate;
      months.push({
        month: `Mo ${i}`,
        members: Math.round(members),
        membersExact: members,
        revenue: Math.round(members * avgMembershipValue),
        operationalCapacity,
        maxCapacity,
      });
    }
    return months;
  }, [currentMembers, avgMonthlySignUps, avgChurnRate, avgMembershipValue, operationalCapacity, maxCapacity]);

  const monthsToOperationalCapacity = useMemo(() => {
    const idx = projection.findIndex(p => p.membersExact >= operationalCapacity);
    return idx === -1 ? null : idx + 1;
  }, [projection, operationalCapacity]);

  // Combined revenue chart: past actuals (gray) + future projected (primary)
  // Fall back to activeMembers × avgMembershipValue when GoTeamUp subscription
  // prices return zero (payment_subscriptions prices not available).
  const combinedRevenueData = useMemo(() => {
    const actuals = (report?.months ?? []).map(m => ({
      label: m.month,
      actual: m.revenue > 0
        ? m.revenue
        : (m.activeMembers ?? 0) > 0
          ? (m.activeMembers ?? 0) * avgMembershipValue
          : null,
      projected: null as number | null,
    }));
    const future = projection.map(p => ({
      label: p.month,
      actual: null as number | null,
      projected: p.revenue,
    }));
    return [...actuals, ...future];
  }, [report, projection, avgMembershipValue]);

  // Heatmap: build className × day grid
  const heatmapGrid = useMemo(() => {
    if (!heatmapRows?.length) return { classNames: [], grid: {} };
    const classNames = [...new Set(heatmapRows.map(r => r.className))].sort();
    const grid: Record<string, Record<number, { avg: number; sessions: number; pct: number }>> = {};
    for (const r of heatmapRows) {
      if (!grid[r.className]) grid[r.className] = {};
      grid[r.className][r.dayOfWeek] = {
        avg: r.avgAttendance,
        sessions: r.totalSessions,
        pct: spacesPerSession > 0 ? Math.round((r.avgAttendance / spacesPerSession) * 100) : 0,
      };
    }
    return { classNames, grid };
  }, [heatmapRows, spacesPerSession]);

  const fmt = (n: number) =>
    n >= 1000 ? `£${(n / 1000).toFixed(1)}k` : `£${n.toLocaleString()}`;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded border px-3 py-2 text-xs font-mono shadow-md"
        style={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}>
        <p className="font-bold mb-1">{label}</p>
        {payload.map((p: any) => (
          p.value != null && (
            <p key={p.dataKey} style={{ color: p.color }}>
              {p.name}: {(p.dataKey === "revenue" || p.dataKey === "actual" || p.dataKey === "projected")
                ? `£${Number(p.value).toLocaleString()}` : p.value}
            </p>
          )
        ))}
      </div>
    );
  };

  const RevenueTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded border px-3 py-2 text-xs font-mono shadow-md"
        style={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}>
        <p className="font-bold mb-1">{label}</p>
        {payload.map((p: any) =>
          p.value != null ? (
            <p key={p.dataKey} style={{ color: p.color }}>
              {p.name}: £{Number(p.value).toLocaleString()}
            </p>
          ) : null
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 max-w-7xl pb-20">
      <div className="flex items-center justify-between mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Operations
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold tracking-tight uppercase">Growth Potential</h1>
        <p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold mt-1">
          Revenue & Capacity Projections
        </p>
      </div>

      {/* Weekly capacity banners — SGPT and Large Group */}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card/50 px-6 py-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">Small Group PT — Weekly Capacity</p>
          {isLoading ? <Skeleton className="h-12 w-32" /> : (
            <div className="flex items-end gap-3">
              <p className={`text-5xl font-display font-bold ${sgptBookedPct >= 90 ? "text-destructive" : sgptBookedPct >= 70 ? "text-yellow-500" : "text-primary"}`}>
                {sgptBookedPct}%
              </p>
              <p className="text-sm text-muted-foreground font-mono pb-1">
                {Math.round(sgptWeeklyBookings)} bookings / {sgptWeeklySpaces} spaces
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground font-mono mt-2">
            {sgptSessions} sessions × {SGPT_SPACES} spaces each
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card/50 px-6 py-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">Large Group — Weekly Capacity</p>
          {isLoading ? <Skeleton className="h-12 w-32" /> : (
            <div className="flex items-end gap-3">
              <p className={`text-5xl font-display font-bold ${lgBookedPct >= 90 ? "text-destructive" : lgBookedPct >= 70 ? "text-yellow-500" : "text-primary"}`}>
                {lgBookedPct}%
              </p>
              <p className="text-sm text-muted-foreground font-mono pb-1">
                {Math.round(lgWeeklyBookings)} bookings / {lgWeeklySpaces} spaces
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground font-mono mt-2">
            {lgSessions} sessions × {LG_SPACES} spaces each
          </p>
        </div>
      </div>

      {/* Configuration */}
      <Card className="bg-card/50 border-border/50 mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">SGPT Sessions / Week</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={sgptSessions}
                  onChange={e => setSgptSessions(Number(e.target.value))}
                  className="bg-background border-border font-mono" min={1} />
                <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">× 6 spaces</span>
              </div>
              <p className="text-xs text-muted-foreground">Small Group PT sessions per week</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Large Group Sessions / Week</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={lgSessions}
                  onChange={e => setLgSessions(Number(e.target.value))}
                  className="bg-background border-border font-mono" min={1} />
                <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">× 12 spaces</span>
              </div>
              <p className="text-xs text-muted-foreground">Hyrox, Engine, S&C, Finisher, etc.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Avg Monthly Membership (£)</Label>
              <Input type="number" value={avgMembershipValue}
                onChange={e => setAvgMembershipValue(Number(e.target.value))}
                className="bg-background border-border font-mono" min={1} />
              <p className="text-xs text-muted-foreground">Average monthly membership fee</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-muted-foreground">
            <span>Live from TeamUp:</span>
            {isLoading ? <Skeleton className="h-4 w-48" /> : (
              <>
                <span className="text-foreground">{currentMembers} members</span>
                <span className="text-foreground">{avgWeeklyAttendance}x / week avg attendance</span>
                <span className="text-foreground">{avgMonthlySignUps} sign-ups / mo</span>
                <span className="text-foreground">{(avgChurnRate * 100).toFixed(1)}% churn / mo</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards — SGPT */}
      <div className="mb-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">Small Group PT (Max 6)</p>
        <div className="grid grid-cols-3 gap-4">
          <KpiCard title="Max Capacity" value={sgptMaxCapacity} unit="members" icon={Users} />
          <KpiCard title="Operational Cap" value={sgptOpCapacity} unit="members" icon={Target}
            note="85% fill" highlight={currentMembers >= sgptOpCapacity * 0.9} />
          <KpiCard title="Booked %" value={sgptBookedPct} unit="of spaces" icon={Calendar} loading={isLoading} />
        </div>
      </div>

      {/* KPI Cards — Large Group */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">Large Group (Max 12)</p>
        <div className="grid grid-cols-3 gap-4">
          <KpiCard title="Max Capacity" value={lgMaxCapacity} unit="members" icon={Users} />
          <KpiCard title="Operational Cap" value={lgOpCapacity} unit="members" icon={Target}
            note="85% fill" highlight={currentMembers >= lgOpCapacity * 0.9} />
          <KpiCard title="Booked %" value={lgBookedPct} unit="of spaces" icon={Calendar} loading={isLoading} />
        </div>
      </div>

      {/* KPI Cards — Combined */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard title="Current Members" value={currentMembers} unit={`${capacityUsedPct}% full`} icon={Users} loading={isLoading} />
        <KpiCard title="Revenue Now" value={currentMonthlyRevenue} format="currency" icon={PoundSterling} loading={isLoading} />
        <KpiCard title="Revenue Potential" value={monthlyRevenuePotential} format="currency" icon={TrendingUp} valueClass="text-primary" />
        <KpiCard title="Growth Plateau" value={growthPlateau ?? 0} unit="members" icon={Calendar}
          note={monthsToOperationalCapacity ? `Cap in ${monthsToOperationalCapacity}mo` : undefined} />
      </div>

      {/* Annual callout */}
      <div className="mb-8 rounded-lg border border-primary/30 bg-primary/5 px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Annual Revenue Potential at Operational Capacity</p>
          <p className="text-4xl font-display font-bold text-primary mt-1">£{annualRevenuePotential.toLocaleString()}</p>
        </div>
        <div className="text-right text-sm text-muted-foreground font-mono">
          <p>{operationalCapacity} members × £{avgMembershipValue}/mo × 12</p>
          <p className="text-xs mt-1">{operationalCapacity - currentMembers} more members needed</p>
        </div>
      </div>

      {/* Member projection chart */}
      <Card className="bg-card/50 border-border/50 mb-6">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">
            12-Month Member Projection
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={projection} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                <ReferenceLine y={operationalCapacity} stroke="hsl(var(--primary))" strokeDasharray="6 3"
                  label={{ value: `Op. Cap ${operationalCapacity}`, fill: "hsl(var(--primary))", fontSize: 10, fontFamily: "monospace" }} />
                <ReferenceLine y={maxCapacity} stroke="hsl(var(--destructive))" strokeDasharray="6 3"
                  label={{ value: `Max ${maxCapacity}`, fill: "hsl(var(--destructive))", fontSize: 10, fontFamily: "monospace" }} />
                <Line type="monotone" dataKey="members" name="Projected Members" stroke="hsl(var(--primary))"
                  strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Combined revenue: past actuals + future projection */}
      <Card className="bg-card/50 border-border/50 mb-6">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">
            Revenue — Past 12 Months {report?.revenueIsActual ? "(from GoTeamUp invoices)" : "(est. from subscription amounts)"} + 12-Month Projection
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={combinedRevenueData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }} interval={1} />
                <YAxis tickFormatter={v => `£${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }} />
                <RechartsTooltip content={<RevenueTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                <ReferenceLine y={monthlyRevenuePotential} stroke="hsl(var(--primary))" strokeDasharray="6 3"
                  label={{ value: `Potential ${fmt(monthlyRevenuePotential)}`, fill: "hsl(var(--primary))", fontSize: 10, fontFamily: "monospace" }} />
                <Bar dataKey="actual" name="Actual Revenue" fill="hsl(var(--muted-foreground))" opacity={0.6} radius={[3, 3, 0, 0]} />
                <Bar dataKey="projected" name="Projected Revenue" fill="hsl(var(--primary))" opacity={0.8} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Timetable capacity heatmap */}
      <Card className="bg-card/50 border-border/50 mb-6">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">
            Timetable Capacity — Avg Attendance per Class & Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          {heatmapLoading ? <Skeleton className="h-48 w-full" /> : !heatmapGrid.classNames.length ? (
            <p className="text-sm text-muted-foreground">No attendance data yet — run a sync to populate.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-muted-foreground font-semibold pb-2 pr-4 whitespace-nowrap uppercase tracking-wider">Class</th>
                    {DAY_ORDER.map(d => (
                      <th key={d} className="text-center text-muted-foreground font-semibold pb-2 px-1 min-w-[52px] uppercase tracking-wider">
                        {DAY_LABELS[d]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmapGrid.classNames.map(className => (
                    <tr key={className}>
                      <td className="pr-4 py-1 text-foreground whitespace-nowrap font-semibold">{className}</td>
                      {DAY_ORDER.map(d => {
                        const cell = heatmapGrid.grid[className]?.[d];
                        return (
                          <td key={d} className="px-1 py-1 text-center">
                            {cell ? (
                              <div
                                className="rounded px-1 py-1.5 text-center leading-none"
                                style={{ backgroundColor: fillColor(cell.pct), color: fillTextColor(cell.pct) }}
                                title={`${cell.avg} avg / ${spacesPerSession} spaces = ${cell.pct}% · ${cell.sessions} sessions tracked`}
                              >
                                <div className="font-bold">{cell.avg}</div>
                                <div style={{ opacity: 0.75, fontSize: "0.65rem" }}>{cell.pct}%</div>
                              </div>
                            ) : (
                              <div className="rounded px-1 py-1.5 text-center text-muted-foreground/30">—</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground font-mono">
                <span className="font-semibold">Fill rate:</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "hsl(var(--muted))" }} /> &lt;40%</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "hsl(var(--primary))" }} /> 40–69%</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "hsl(48 96% 53%)" }} /> 70–89%</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "hsl(var(--destructive))" }} /> 90%+</span>
                <span className="ml-2 text-muted-foreground/60">Cell shows avg attendees / fill % vs {spacesPerSession} spaces</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  title, value, unit, format, icon: Icon, loading, valueClass = "", note, highlight,
}: {
  title: string; value: number; unit?: string; format?: "currency"; icon: React.ElementType;
  loading?: boolean; valueClass?: string; note?: string; highlight?: boolean;
}) {
  const displayValue = format === "currency"
    ? value >= 1000 ? `£${(value / 1000).toFixed(1)}k` : `£${value}`
    : value.toLocaleString();

  return (
    <Card className={`border-border/50 ${highlight ? "border-yellow-500/50 bg-yellow-500/5" : "bg-card/50"}`}>
      <CardContent className="p-4 flex flex-col justify-between h-full">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground leading-tight">{title}</span>
          <Icon className="h-4 w-4 text-muted-foreground opacity-50 flex-shrink-0" />
        </div>
        {loading ? <Skeleton className="h-8 w-16" /> : (
          <div>
            <span className={`text-2xl font-display font-bold ${valueClass}`}>{displayValue}</span>
            {(unit || note) && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{unit}{note ? ` · ${note}` : ""}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
