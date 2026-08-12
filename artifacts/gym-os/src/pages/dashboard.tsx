import React, { useState } from "react";
import { Link } from "wouter";
import {
  useListClients,
  useGetDashboardStats,
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
  Activity,
  AlertTriangle,
  UserMinus,
  UtensilsCrossed,
  Scale,
  BarChart2,
  TrendingUp,
  ChevronRight,
  MessageCircle,
} from "lucide-react";

type TabView = "members" | "former";

export default function Dashboard() {
  const [tab, setTab] = useState<TabView>("members");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [mealPlanOnly, setMealPlanOnly] = useState(false);

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();

  const { data: clients, isLoading: clientsLoading } = useListClients({
    search: search.length > 2 ? search : undefined,
    engagementStatus: status !== "all" ? status as ListClientsEngagementStatus : undefined,
    needsMealPlan: mealPlanOnly ? true : undefined,
    isMember: tab === "members" ? true : false,
  });

  // Action item queries — only for members tab
  const { data: mealPlanClients } = useListClients(
    { needsMealPlan: true, isMember: true },
    { query: { enabled: tab === "members" } }
  );
  const { data: atRiskClients } = useListClients(
    { engagementStatus: "at_risk" as ListClientsEngagementStatus, isMember: true },
    { query: { enabled: tab === "members" } }
  );

  const hasActionItems =
    (mealPlanClients && mealPlanClients.length > 0) ||
    (atRiskClients && atRiskClients.length > 0);

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight uppercase">Gym OS</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold mt-1">
            Command Center
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Link href="/reports">
            <Button variant="outline" size="sm">
              <BarChart2 className="h-4 w-4 mr-1" />
              Reports
            </Button>
          </Link>
          <Link href="/growth">
            <Button variant="outline" size="sm">
              <TrendingUp className="h-4 w-4 mr-1" />
              Growth
            </Button>
          </Link>
          <InBodyImportButton />
          <SyncButton lastSyncedAt={stats?.lastSyncedAt} />
        </div>
      </header>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard
          title="Total Clients"
          value={stats?.totalClients}
          icon={Users}
          loading={statsLoading}
          onClick={() => { setTab("members"); setStatus("all"); }}
        />
        <StatCard
          title="Active"
          value={stats?.activeClients}
          icon={Activity}
          loading={statsLoading}
          valueClass="text-primary"
          onClick={() => { setTab("members"); setStatus("active"); }}
        />
        <StatCard
          title="At Risk"
          value={stats?.atRiskClients}
          icon={AlertTriangle}
          loading={statsLoading}
          valueClass="text-yellow-500"
          onClick={() => { setTab("members"); setStatus("at_risk"); }}
        />
        <StatCard
          title="Disengaged"
          value={stats?.disengagedClients}
          icon={UserMinus}
          loading={statsLoading}
          valueClass="text-destructive"
          onClick={() => { setTab("members"); setStatus("disengaged"); }}
        />
        <StatCard
          title="Needs Meal Plan"
          value={stats?.needsMealPlanCount}
          icon={UtensilsCrossed}
          loading={statsLoading}
          onClick={() => { setTab("members"); setMealPlanOnly(true); setStatus("all"); }}
        />
        <StatCard
          title="Overdue InBody"
          value={stats?.overdueInBodyCount}
          icon={Scale}
          loading={statsLoading}
        />
      </div>

      {/* Tab Nav */}
      <div className="flex items-center gap-1 mb-6 border-b border-border pb-0">
        <TabButton active={tab === "members"} onClick={() => { setTab("members"); setStatus("all"); setMealPlanOnly(false); setSearch(""); }}>
          Members
        </TabButton>
        <TabButton active={tab === "former"} onClick={() => { setTab("former"); setStatus("all"); setMealPlanOnly(false); setSearch(""); }}>
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
                        onClick={() => { setMealPlanOnly(true); setStatus("all"); }}
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
                  {atRiskClients.slice(0, 5).map(c => (
                    <li key={c.id}>
                      <Link href={`/clients/${c.id}`}>
                        <button className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-yellow-500/10 text-left group transition-colors">
                          <span className="text-sm font-medium truncate">{c.name}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <MessageCircle className="h-3 w-3 text-muted-foreground group-hover:text-yellow-500" />
                          </div>
                        </button>
                      </Link>
                    </li>
                  ))}
                  {atRiskClients.length > 5 && (
                    <li>
                      <button
                        className="w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground text-left"
                        onClick={() => { setStatus("at_risk"); }}
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
              <Select value={status} onValueChange={setStatus}>
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
              onClick={() => setMealPlanOnly((v) => !v)}
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

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  valueClass = "",
  onClick,
}: {
  title: string;
  value?: number;
  icon: React.ElementType;
  loading: boolean;
  valueClass?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`bg-card/50 border-border/50 transition-colors ${onClick ? "cursor-pointer hover:bg-card hover:border-border" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-4 flex flex-col justify-between h-full">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{title}</span>
          <Icon className="h-4 w-4 text-muted-foreground opacity-50" />
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <span className={`text-2xl font-display font-bold ${valueClass}`}>
              {value !== undefined ? value : "-"}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
