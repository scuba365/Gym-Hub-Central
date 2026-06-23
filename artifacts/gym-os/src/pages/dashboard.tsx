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
  Scale 
} from "lucide-react";

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [mealPlanOnly, setMealPlanOnly] = useState(false);

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  
  const { data: clients, isLoading: clientsLoading } = useListClients({
    search: search.length > 2 ? search : undefined,
    engagementStatus: status !== "all" ? status as ListClientsEngagementStatus : undefined,
    needsMealPlan: mealPlanOnly ? true : undefined,
  });

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight uppercase">Gym OS</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold mt-1">
            Command Center
          </p>
        </div>
        <div className="flex items-start gap-2">
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
        />
        <StatCard 
          title="Active" 
          value={stats?.activeClients} 
          icon={Activity} 
          loading={statsLoading}
          valueClass="text-primary"
        />
        <StatCard 
          title="At Risk" 
          value={stats?.atRiskClients} 
          icon={AlertTriangle} 
          loading={statsLoading}
          valueClass="text-yellow-500"
        />
        <StatCard 
          title="Disengaged" 
          value={stats?.disengagedClients} 
          icon={UserMinus} 
          loading={statsLoading}
          valueClass="text-destructive"
        />
        <StatCard 
          title="Needs Meal Plan" 
          value={stats?.needsMealPlanCount} 
          icon={UtensilsCrossed} 
          loading={statsLoading} 
        />
        <StatCard 
          title="Overdue InBody" 
          value={stats?.overdueInBodyCount} 
          icon={Scale} 
          loading={statsLoading} 
        />
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <Input 
            placeholder="Search clients..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card border-border font-mono text-sm max-w-md"
          />
        </div>
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
      </div>

      {clientsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-48 w-full rounded-md" />
          ))}
        </div>
      ) : clients?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-md border border-border border-dashed">
          <Users className="mx-auto h-10 w-10 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground">No clients found</h3>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or search query.</p>
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

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  loading,
  valueClass = "" 
}: { 
  title: string; 
  value?: number; 
  icon: React.ElementType; 
  loading: boolean;
  valueClass?: string;
}) {
  return (
    <Card className="bg-card/50 border-border/50">
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
