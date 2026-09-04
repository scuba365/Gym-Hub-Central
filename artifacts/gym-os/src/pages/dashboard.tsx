import React, { useState } from "react";
import { Link } from "wouter";
import {
  useListClients,
  useGetDashboardStats,
  useGetDashboardBirthdays,
  useGetClassAnalytics,
  ListClientsEngagementStatus
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { SyncButton } from "@/components/sync-button";
import { InBodyImportButton } from "@/components/inbody-import-button";
import { ClientCard } from "@/components/client-card";
import {
  Users,
  UtensilsCrossed,
  BarChart2,
  TrendingUp,
  ChevronRight,
  MessageCircle,
  Cake,
  Gift,
  UserPlus,
  Megaphone,
} from "lucide-react";

function toWhatsAppHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  // Already has country code
  if (digits.startsWith("+")) return `https://wa.me/${digits.replace("+", "")}`;
  // Irish mobile starting 08x → 3538x
  const local = digits.replace(/^0/, "");
  return `https://wa.me/353${local}`;
}

type TabView = "members" | "former";

export default function Dashboard() {
  const [tab, setTab] = useState<TabView>("members");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [mealPlanOnly, setMealPlanOnly] = useState(false);
  const [needsCheckInOnly, setNeedsCheckInOnly] = useState(false);

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: birthdays } = useGetDashboardBirthdays();
  const { data: classData } = useGetClassAnalytics();

  const { data: clients, isLoading: clientsLoading } = useListClients({
    search: search.length > 2 ? search : undefined,
    engagementStatus: status !== "all" ? status as ListClientsEngagementStatus : undefined,
    needsMealPlan: mealPlanOnly ? true : undefined,
    needsCheckIn: needsCheckInOnly ? true : undefined,
    isMember: tab === "members" ? true : false,
  });

  // Action item queries — only for members tab
  const { data: mealPlanClients } = useListClients(
    { needsMealPlan: true, isMember: true }
  );
  const { data: atRiskClients } = useListClients(
    { needsCheckIn: true, isMember: true }
  );

  const hasActionItems =
    (mealPlanClients && mealPlanClients.length > 0) ||
    (atRiskClients && atRiskClients.length > 0);

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-1">Command Center</p>
          <h1 className="text-2xl font-display font-bold tracking-tight uppercase">The Barracks Fitness</h1>
        </div>
        <div className="flex items-start gap-2">
          <Link href="/reports">
            <Button variant="outline" size="sm">
              <BarChart2 className="h-4 w-4 mr-1" />
              Reports
            </Button>
          </Link>
          <Link href="/class-analytics">
            <Button variant="outline" size="sm">
              <BarChart2 className="h-4 w-4 mr-1" />
              Classes
            </Button>
          </Link>
          <Link href="/growth">
            <Button variant="outline" size="sm">
              <TrendingUp className="h-4 w-4 mr-1" />
              Growth
            </Button>
          </Link>
          <Link href="/leads">
            <Button variant="outline" size="sm">
              <UserPlus className="h-4 w-4 mr-1" />
              Leads
            </Button>
          </Link>
          <Link href="/ads">
            <Button variant="outline" size="sm">
              <Megaphone className="h-4 w-4 mr-1" />
              Ads
            </Button>
          </Link>
          <InBodyImportButton />
          <SyncButton lastSyncedAt={stats?.lastSyncedAt} />
        </div>
      </header>

      {/* Stats — Primary row */}
      <div className="grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden mb-4">
        <BigStatCard
          label="Members"
          value={stats?.totalClients}
          loading={statsLoading}
          onClick={() => { setTab("members"); setStatus("all"); }}
        />
        <BigStatCard
          label="Avg Weekly Classes"
          value={stats?.avgWeeklyAttendance != null ? stats.avgWeeklyAttendance.toFixed(1) : undefined}
          loading={statsLoading}
        />
      </div>

      {/* Stats — Membership breakdown (3×2 grid) */}
      <div className="grid grid-cols-3 gap-px bg-border rounded-lg overflow-hidden mb-4">
        <BigStatCard
          label="Small Group PT"
          value={stats?.membershipBreakdown?.smallGroupPt}
          loading={statsLoading}
          valueClass="text-primary"
        />
        <BigStatCard
          label="Challenge"
          value={stats?.membershipBreakdown?.challenge}
          loading={statsLoading}
          valueClass="text-primary"
        />
        <BigStatCard
          label="Large Group"
          value={stats?.membershipBreakdown?.largeGroup}
          loading={statsLoading}
          valueClass="text-primary"
        />
        <BigStatCard
          label="Teen"
          value={stats?.membershipBreakdown?.teen}
          loading={statsLoading}
          valueClass="text-primary"
        />
        <BigStatCard
          label="Flex Pass"
          value={stats?.membershipBreakdown?.flexPass}
          loading={statsLoading}
          valueClass="text-primary"
        />
        <BigStatCard
          label="Prime"
          value={stats?.membershipBreakdown?.prime}
          loading={statsLoading}
          valueClass="text-primary"
        />
      </div>

      {/* Stats — Action row */}
      <div className="grid grid-cols-3 gap-px bg-border rounded-lg overflow-hidden mb-8">
        <BigStatCard
          label="Needs Check-in"
          value={stats?.atRiskClients}
          sub=">50% below 4-week attendance avg"
          loading={statsLoading}
          valueClass={stats?.atRiskClients ? "text-yellow-500" : ""}
          onClick={() => { setTab("members"); setStatus("all"); setNeedsCheckInOnly(true); setMealPlanOnly(false); }}
        />
        <BigStatCard
          label="Needs Meal Plan"
          value={stats?.needsMealPlanCount}
          loading={statsLoading}
          valueClass={stats?.needsMealPlanCount ? "text-amber-500" : ""}
          onClick={() => { setTab("members"); setMealPlanOnly(true); setNeedsCheckInOnly(false); setStatus("all"); }}
        />
        <BigStatCard
          label="Overdue InBody"
          value={stats?.overdueInBodyCount}
          loading={statsLoading}
          valueClass={stats?.overdueInBodyCount ? "text-destructive" : ""}
        />
      </div>

      {/* Class Analytics Summary */}
      {classData && (
        <Link href="/class-analytics">
          <div className="mb-6 rounded-lg border border-border bg-card/40 hover:border-primary/40 transition-colors cursor-pointer">
            <div className="px-4 py-2 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Class Utilisation</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-4 divide-x divide-border">
              <div className="px-4 py-3 text-center">
                <p className="text-xl font-display font-bold text-foreground">{classData.summary.avgFillPct.toFixed(0)}%</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Avg Fill</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-xl font-display font-bold text-foreground">{classData.summary.totalWeeklyAttendees}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Weekly Attendees</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className={`text-xl font-display font-bold ${classData.summary.cutCandidates > 0 ? "text-destructive" : "text-foreground"}`}>
                  {classData.summary.cutCandidates}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Cut Candidates</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className={`text-xl font-display font-bold ${classData.summary.fullClasses > 0 ? "text-green-500" : "text-foreground"}`}>
                  {classData.summary.fullClasses}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Full Classes</p>
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Tab Nav */}
      <div className="flex items-center gap-1 mb-6 border-b border-border pb-0">
        <TabButton active={tab === "members"} onClick={() => { setTab("members"); setStatus("all"); setMealPlanOnly(false); setNeedsCheckInOnly(false); setSearch(""); }}>
          Members
        </TabButton>
        <TabButton active={tab === "former"} onClick={() => { setTab("former"); setStatus("all"); setMealPlanOnly(false); setNeedsCheckInOnly(false); setSearch(""); }}>
          Former Members
        </TabButton>
      </div>

      {/* Action Items Panel (members tab only) */}
      {tab === "members" && hasActionItems && (
        <div className="mb-6 rounded-lg border border-border bg-card/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-card/50 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Action Items</span>
            <Badge variant="outline" className="text-xs font-mono ml-auto">
              {(mealPlanClients?.length ?? 0) + (atRiskClients?.length ?? 0)}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Meal Plan */}
            {mealPlanClients && mealPlanClients.length > 0 && (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 rounded-full bg-amber-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-500">
                    Meal Plan Review ({mealPlanClients.length})
                  </span>
                </div>
                <ul className="space-y-1">
                  {mealPlanClients.slice(0, 5).map(c => (
                    <li key={c.id}>
                      <Link href={`/clients/${c.id}`}>
                        <button className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-amber-500/10 text-left group transition-colors">
                          <span className="text-sm font-medium truncate">{c.name}</span>
                          <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-amber-500 flex-shrink-0" />
                        </button>
                      </Link>
                    </li>
                  ))}
                  {mealPlanClients.length > 5 && (
                    <li>
                      <button
                        className="w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground text-left"
                        onClick={() => { setMealPlanOnly(true); setNeedsCheckInOnly(false); setStatus("all"); }}
                      >
                        + {mealPlanClients.length - 5} more →
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Check-in */}
            {atRiskClients && atRiskClients.length > 0 && (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 rounded-full bg-yellow-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-yellow-500">
                    Needs Check-in ({atRiskClients.length})
                  </span>
                </div>
                <ul className="space-y-1">
                  {atRiskClients.slice(0, 5).map(c => {
                    const waHref = toWhatsAppHref(c.phone);
                    return (
                      <li key={c.id} className="flex items-center gap-1">
                        <Link href={`/clients/${c.id}`} className="flex-1 min-w-0">
                          <button className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-yellow-500/10 text-left group transition-colors">
                            <span className="text-sm font-medium truncate">{c.name}</span>
                            {c.attendanceDropPct != null && (
                              <span className="text-[10px] text-yellow-500 font-mono whitespace-nowrap">
                                ↓ {c.attendanceDropPct}%
                              </span>
                            )}
                            <MessageCircle className="h-3 w-3 text-muted-foreground group-hover:text-yellow-500 flex-shrink-0" />
                          </button>
                        </Link>
                        {waHref && (
                          <a href={waHref} target="_blank" rel="noreferrer"
                            className="flex-shrink-0 px-1.5 py-1.5 rounded hover:bg-green-500/10 text-green-500/60 hover:text-green-500 transition-colors"
                            title="Message on WhatsApp">
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                          </a>
                        )}
                      </li>
                    );
                  })}
                  {atRiskClients.length > 5 && (
                    <li>
                      <button
                        className="w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground text-left"
                        onClick={() => { setStatus("all"); setNeedsCheckInOnly(true); setMealPlanOnly(false); }}
                      >
                        + {atRiskClients.length - 5} more →
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upcoming Birthdays */}
      {birthdays && birthdays.length > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-card/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-card/50 flex items-center gap-2">
            <Cake className="h-3.5 w-3.5 text-pink-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Upcoming Birthdays
            </span>
            <Badge variant="outline" className="text-xs font-mono ml-auto">
              next 60 days
            </Badge>
          </div>
          <ul className="divide-y divide-border">
            {birthdays.map((b) => {
              const isToday = b.daysUntil === 0;
              const isSoon = b.daysUntil <= 7;
              const giftQuery = encodeURIComponent(`${b.name} gift idea`);
              return (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-card/60 transition-colors">
                  {b.photoUrl ? (
                    <img src={b.photoUrl} alt={b.name} className="h-7 w-7 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-xs font-semibold text-muted-foreground">
                      {b.name.charAt(0)}
                    </div>
                  )}
                  <Link href={`/clients/${b.id}`} className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{b.name}</span>
                  </Link>
                  <span className={`text-xs font-mono flex-shrink-0 ${isToday ? "text-pink-400 font-bold" : isSoon ? "text-amber-400" : "text-muted-foreground"}`}>
                    {isToday ? "🎂 Today!" : `${b.daysUntil}d`}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                    {new Date(b.birthdayThisYear + "T00:00:00").toLocaleDateString("en-IE", { day: "numeric", month: "short" })}
                  </span>
                  <a
                    href={`https://www.amazon.ie/s?k=${giftQuery}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Find a gift on Amazon"
                    className="flex-shrink-0 p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Gift className="h-3.5 w-3.5" />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <Input
            placeholder={tab === "members" ? "Search members..." : "Search former members..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card border-border font-mono text-sm max-w-md"
          />
        </div>
        {tab === "members" && (
          <>
            <div className="w-full md:w-48">
              <Select value={status} onValueChange={(value) => { setStatus(value); setNeedsCheckInOnly(false); }}>
                <SelectTrigger className="bg-card border-border">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="at_risk">At Risk</SelectItem>
                  <SelectItem value="disengaged">Disengaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant={mealPlanOnly ? "default" : "outline"}
              onClick={() => {
                setMealPlanOnly((value) => !value);
                setNeedsCheckInOnly(false);
              }}
              className={mealPlanOnly ? "bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}
            >
              <UtensilsCrossed className="h-4 w-4 mr-2" />
              Needs Meal Plan
            </Button>
          </>
        )}
      </div>

      {/* Client Grid */}
      {clientsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-48 w-full rounded-md" />
          ))}
        </div>
      ) : clients?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-md border border-border border-dashed">
          <Users className="mx-auto h-10 w-10 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground">
            {tab === "former" ? "No former members found" : "No clients found"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {tab === "former"
              ? "Run a sync to detect members who are no longer active in Trainerize."
              : "Try adjusting your filters or search query."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients?.map(client => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide border-b-2 transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {children}
    </button>
  );
}

function BigStatCard({
  label,
  value,
  sub,
  loading,
  valueClass = "",
  onClick,
}: {
  label: string;
  value?: number | string;
  sub?: string;
  loading: boolean;
  valueClass?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`bg-card px-6 py-5 flex flex-col gap-1 ${onClick ? "cursor-pointer hover:bg-card/80 transition-colors" : ""}`}
      onClick={onClick}
    >
      <span className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-10 w-20 mt-1" />
      ) : (
        <span className={`text-4xl font-display font-bold leading-none ${valueClass}`}>
          {value !== undefined && value !== null ? value : "—"}
        </span>
      )}
      {sub && !loading && (
        <span className="text-xs text-muted-foreground">{sub}</span>
      )}
    </div>
  );
}
