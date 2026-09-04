import React, { useState } from "react";
import { Link } from "wouter";
import { useGetMetaAdsReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp, AlertCircle, CheckCircle2, Euro } from "lucide-react";

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-IE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtEuro(n: number): string {
  return `€${fmt(n, 0)}`;
}

function fmtPct(n: number): string {
  return `${fmt(n, 2)}%`;
}

interface WeekMetrics {
  weekStart: string;
  weekEnd: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leads: number;
  conversions: number;
  conversionValue: number;
  gtuSales: number;
  gtuRevenue: number;
  // calculated
  pageConvRate: number;
  leadToSaleRate: number;
  cpl: number;
  cpa: number;
  roas: number;
  roasMultiple: number;
  // projections
  newMembers: number;
  memberRevenue: number;
}

function formatWeekLabel(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString("en-IE", { day: "numeric", month: "short" })} – ${e.toLocaleDateString("en-IE", { day: "numeric", month: "short" })}`;
}

export default function Ads() {
  const { data, isLoading, error } = useGetMetaAdsReport();

  const [memberConvPct, setMemberConvPct] = useState(50);
  const [avgStayMonths, setAvgStayMonths] = useState(12);
  const [membershipPrice, setMembershipPrice] = useState(247);
  const [programPrice, setProgramPrice] = useState(299);

  const notConfigured =
    !isLoading &&
    (error as any)?.status === 503;

  const weeks: WeekMetrics[] = (data?.weeks ?? []).map((w) => {
    const spend = w.spend;
    const leads = w.leads;
    // Use GoTeamUp actual signups as sales; fall back to Meta pixel conversions
    const sales = (w.gtuSales ?? 0) > 0 ? (w.gtuSales ?? 0) : w.conversions;
    // Use GTU actual revenue if available; otherwise estimate from program price
    const cvValue =
      (w.gtuRevenue ?? 0) > 0 ? (w.gtuRevenue ?? 0) :
      w.conversionValue > 0 ? w.conversionValue :
      sales * programPrice;

    const pageConvRate = w.clicks > 0 ? (leads / w.clicks) * 100 : 0;
    const leadToSaleRate = leads > 0 ? (sales / leads) * 100 : 0;
    const cpl = leads > 0 ? spend / leads : 0;
    const cpa = sales > 0 ? spend / sales : 0;
    const roas = spend > 0 ? cvValue / spend : 0;
    const roasMultiple = roas;

    const newMembers = Math.round((sales * memberConvPct) / 100);
    const memberRevenue = newMembers * membershipPrice * avgStayMonths;

    return {
      ...w,
      pageConvRate,
      leadToSaleRate,
      cpl,
      cpa,
      roas,
      roasMultiple,
      newMembers,
      memberRevenue,
    };
  });

  const totals = weeks.reduce(
    (acc, w) => {
      const sales = (w.gtuSales ?? 0) > 0 ? (w.gtuSales ?? 0) : w.conversions;
      const cvValue =
        (w.gtuRevenue ?? 0) > 0 ? (w.gtuRevenue ?? 0) :
        w.conversionValue > 0 ? w.conversionValue :
        sales * programPrice;
      return {
        spend: acc.spend + w.spend,
        impressions: acc.impressions + w.impressions,
        clicks: acc.clicks + w.clicks,
        leads: acc.leads + w.leads,
        sales: acc.sales + sales,
        cvValue: acc.cvValue + cvValue,
        newMembers: acc.newMembers + w.newMembers,
        memberRevenue: acc.memberRevenue + w.memberRevenue,
      };
    },
    { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, cvValue: 0, newMembers: 0, memberRevenue: 0 }
  );

  const totalCpl = totals.leads > 0 ? totals.spend / totals.leads : 0;
  const totalCpa = totals.sales > 0 ? totals.spend / totals.sales : 0;
  const totalRoas = totals.spend > 0 ? totals.cvValue / totals.spend : 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/">
          <button className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-blue-400" />
            Meta Ads Performance
          </h1>
          {data && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {data.adAccountName} · Last 8 weeks · {data.currency}
            </p>
          )}
        </div>
        {!isLoading && !notConfigured && data && (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Connected
          </Badge>
        )}
      </div>

      {/* Not configured state */}
      {notConfigured && (
        <Card className="border-yellow-500/30 bg-yellow-500/10">
          <CardContent className="p-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-300">Meta Ads not connected</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add <code className="bg-muted px-1 rounded text-xs">META_ACCESS_TOKEN</code> and{" "}
                <code className="bg-muted px-1 rounded text-xs">META_AD_ACCOUNT_ID</code> to your
                Replit environment variables to connect your ad account.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Projection inputs */}
      {!isLoading && !notConfigured && data && (
        <>
          <Card className="mb-6 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Projection Assumptions
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Program Price (€)</Label>
                <Input
                  type="number"
                  value={programPrice}
                  onChange={(e) => setProgramPrice(Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Member Conv. %</Label>
                <Input
                  type="number"
                  value={memberConvPct}
                  onChange={(e) => setMemberConvPct(Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Avg. Stay (months)</Label>
                <Input
                  type="number"
                  value={avgStayMonths}
                  onChange={(e) => setAvgStayMonths(Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Membership Price (€/mo)</Label>
                <Input
                  type="number"
                  value={membershipPrice}
                  onChange={(e) => setMembershipPrice(Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Summary stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Total Spend", value: fmtEuro(totals.spend) },
              { label: "Total Leads", value: fmt(totals.leads) },
              { label: "Challenge Sales (GTU)", value: fmt(totals.sales) },
              { label: "ROAS", value: totalRoas > 0 ? `${fmt(totalRoas, 1)}×` : "—" },
            ].map((s) => (
              <Card key={s.label} className="border-border/50">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold mt-1">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Challenge → SGPT conversion funnel */}
          {data.gtuConnected && data.challengeToSgpt && (
            <Card className="mb-6 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Challenge → Small Group PT Conversion
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{data.challengeToSgpt.totalChallenges}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total Challenge Alumni</p>
                  </div>
                  <div className="flex-1 h-px bg-border relative">
                    <div
                      className="absolute inset-y-0 left-0 bg-green-500/60 rounded"
                      style={{ width: `${data.challengeToSgpt.conversionRate}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-400">{data.challengeToSgpt.converted}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Converted to SGPT</p>
                  </div>
                  <div className="text-center min-w-[80px]">
                    <p className="text-2xl font-bold text-green-400">{data.challengeToSgpt.conversionRate}%</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Conversion Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Weekly table */}
          {weeks.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="p-8 text-center text-muted-foreground">
                No ad data found for the last 8 weeks. Make sure your Meta Ads account has active campaigns.
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Weekly Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground whitespace-nowrap">Week</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Spend</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Impr.</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Clicks</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">CTR%</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Leads</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Conv%</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sales</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">L→S%</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">CPL</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">CPA</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">ROAS</th>
                        <th className="text-right px-3 py-2 font-medium text-blue-400">Members</th>
                        <th className="text-right px-3 py-2 font-medium text-blue-400">Mem. Rev.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeks.map((w, i) => (
                        <tr
                          key={w.weekStart}
                          className={`border-b border-border/30 ${i % 2 === 0 ? "" : "bg-muted/10"} hover:bg-muted/20 transition-colors`}
                        >
                          <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-xs">
                            {formatWeekLabel(w.weekStart, w.weekEnd)}
                          </td>
                          <td className="text-right px-3 py-2.5 font-medium">{fmtEuro(w.spend)}</td>
                          <td className="text-right px-3 py-2.5 text-muted-foreground">{fmt(w.impressions)}</td>
                          <td className="text-right px-3 py-2.5 text-muted-foreground">{fmt(w.clicks)}</td>
                          <td className="text-right px-3 py-2.5">{fmtPct(w.ctr)}</td>
                          <td className="text-right px-3 py-2.5 font-medium">{fmt(w.leads)}</td>
                          <td className="text-right px-3 py-2.5 text-muted-foreground">{fmtPct(w.pageConvRate)}</td>
                          <td className="text-right px-3 py-2.5 font-medium">
                            {(() => {
                              const sales = (w.gtuSales ?? 0) > 0 ? (w.gtuSales ?? 0) : w.conversions;
                              return fmt(sales);
                            })()}
                          </td>
                          <td className="text-right px-3 py-2.5 text-muted-foreground">
                            {w.leads > 0 ? fmtPct(w.leadToSaleRate) : "—"}
                          </td>
                          <td className="text-right px-3 py-2.5">{w.leads > 0 ? fmtEuro(w.cpl) : "—"}</td>
                          <td className="text-right px-3 py-2.5">{w.cpa > 0 ? fmtEuro(w.cpa) : "—"}</td>
                          <td className="text-right px-3 py-2.5 font-medium">
                            {w.roas > 0 ? `${fmt(w.roas, 1)}×` : "—"}
                          </td>
                          <td className="text-right px-3 py-2.5 text-blue-400 font-medium">{w.newMembers}</td>
                          <td className="text-right px-3 py-2.5 text-blue-400 font-medium">
                            {w.memberRevenue > 0 ? fmtEuro(w.memberRevenue) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border bg-muted/30 font-semibold">
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">Total / Avg</td>
                        <td className="text-right px-3 py-2.5">{fmtEuro(totals.spend)}</td>
                        <td className="text-right px-3 py-2.5 text-muted-foreground">{fmt(totals.impressions)}</td>
                        <td className="text-right px-3 py-2.5 text-muted-foreground">{fmt(totals.clicks)}</td>
                        <td className="text-right px-3 py-2.5">
                          {totals.clicks > 0 ? fmtPct((totals.clicks / totals.impressions) * 100) : "—"}
                        </td>
                        <td className="text-right px-3 py-2.5">{fmt(totals.leads)}</td>
                        <td className="text-right px-3 py-2.5 text-muted-foreground">
                          {totals.clicks > 0 ? fmtPct((totals.leads / totals.clicks) * 100) : "—"}
                        </td>
                        <td className="text-right px-3 py-2.5">{fmt(totals.sales)}</td>
                        <td className="text-right px-3 py-2.5 text-muted-foreground">
                          {totals.leads > 0 ? fmtPct((totals.sales / totals.leads) * 100) : "—"}
                        </td>
                        <td className="text-right px-3 py-2.5">{totalCpl > 0 ? fmtEuro(totalCpl) : "—"}</td>
                        <td className="text-right px-3 py-2.5">{totalCpa > 0 ? fmtEuro(totalCpa) : "—"}</td>
                        <td className="text-right px-3 py-2.5">{totalRoas > 0 ? `${fmt(totalRoas, 1)}×` : "—"}</td>
                        <td className="text-right px-3 py-2.5 text-blue-400">{totals.newMembers}</td>
                        <td className="text-right px-3 py-2.5 text-blue-400">
                          {totals.memberRevenue > 0 ? fmtEuro(totals.memberRevenue) : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground mt-4">
            Sales = GoTeamUp 6-week challenge/trial signups whose start date falls in that week. ROAS uses actual GoTeamUp revenue if available, otherwise estimates from Program Price × Sales. Member Revenue = Sales × Member Conv% × Membership Price × Avg Stay.
          </p>
        </>
      )}
    </div>
  );
}
