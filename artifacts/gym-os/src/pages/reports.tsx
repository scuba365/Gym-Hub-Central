import React from "react";
import { Link } from "wouter";
import { useGetMembershipReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ArrowLeft, Users, TrendingUp, Euro } from "lucide-react";

function KpiCard({
  title,
  value,
  subtitle,
  loading,
  icon: Icon,
  positive,
}: {
  title: string;
  value: string | number | undefined;
  subtitle?: string;
  loading: boolean;
  icon: React.ElementType;
  positive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">{title}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        {loading ? (
          <Skeleton className="h-10 w-24" />
        ) : (
          <>
            <p className={`text-3xl font-bold font-display ${positive !== undefined ? (positive ? "text-green-500" : "text-red-500") : ""}`}>
              {value ?? "—"}
            </p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const { data, isLoading, error } = useGetMembershipReport();

  const momChange = data?.current.momChange ?? 0;
  const momLabel = momChange === 0 ? "±0 vs last month" : momChange > 0 ? `+${momChange} vs last month` : `${momChange} vs last month`;

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
          <h1 className="text-3xl font-display font-bold tracking-tight uppercase">Reports</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold mt-1">
            Rolling 12-month membership
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm">
          Failed to load report: {(error as { message?: string }).message ?? "Unknown error"}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard
          title="Active Members"
          value={data?.current.activeMembers}
          subtitle={momLabel}
          loading={isLoading}
          icon={Users}
        />
        <KpiCard
          title="MoM Change"
          value={momChange > 0 ? `+${momChange}` : momChange}
          subtitle="vs previous month"
          loading={isLoading}
          icon={TrendingUp}
          positive={momChange !== 0 ? momChange > 0 : undefined}
        />
        <KpiCard
          title="Trailing 12m Revenue"
          value={data ? `€${data.current.revenueTrailing12m.toLocaleString("en-IE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : undefined}
          loading={isLoading}
          icon={Euro}
        />
      </div>

      {/* Active Members chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold uppercase tracking-wider">Active Members — Last 12 Months</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.months ?? []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={40} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [v, "Active Members"]}
                />
                <Bar dataKey="activeMembers" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Revenue chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold uppercase tracking-wider">Revenue — Last 12 Months (€)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.months ?? []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={55} tickFormatter={(v) => `€${v}`} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`€${v.toFixed(2)}`, "Revenue"]}
                />
                <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Churn % chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold uppercase tracking-wider">Churn % — Last 12 Months</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data?.months ?? []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={45} tickFormatter={(v) => `${v}%`} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, "Churn"]}
                />
                <Line
                  type="monotone"
                  dataKey="churnPct"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "hsl(var(--destructive))" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* New vs Churned grouped bar chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold uppercase tracking-wider">New vs Churned Members — Last 12 Months</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.months ?? []} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={30} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="newMembers" name="New" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="churnedMembers" name="Churned" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Membership type breakdown */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold uppercase tracking-wider">Active Memberships by Type</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !data?.membershipBreakdown.length ? (
            <p className="text-sm text-muted-foreground">No active memberships found.</p>
          ) : (() => {
            const max = data.membershipBreakdown[0].count;
            return (
              <div className="space-y-2">
                {data.membershipBreakdown.map(({ name, count }) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-sm w-8 text-right font-semibold tabular-nums shrink-0">{count}</span>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground truncate max-w-xs">{name}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>
      {/* Upcoming expirations */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold uppercase tracking-wider">Expiring in the Next 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !data?.upcomingExpirations.length ? (
            <p className="text-sm text-muted-foreground">No memberships expiring in the next 30 days.</p>
          ) : (() => {
            const today = new Date().toISOString().split("T")[0];
            const in7 = new Date();
            in7.setDate(in7.getDate() + 7);
            const in7Str = in7.toISOString().split("T")[0];
            return (
              <div className="divide-y divide-border">
                {data.upcomingExpirations.map(({ name, planName, expiresOn }) => {
                  const urgent = expiresOn <= in7Str;
                  const formatted = new Date(expiresOn + "T12:00:00Z").toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
                  return (
                    <div key={`${name}-${expiresOn}`} className="flex items-center justify-between py-2 gap-4">
                      <span className="text-sm font-medium">{name}</span>
                      <span className="text-xs text-muted-foreground flex-1 truncate">{planName}</span>
                      <span className={`text-sm font-semibold tabular-nums shrink-0 ${urgent ? "text-yellow-500" : "text-muted-foreground"}`}>
                        {formatted}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
