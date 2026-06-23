import React from "react";
import { Link } from "wouter";
import { ClientSummary } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, parseISO } from "date-fns";
import { Activity, Dumbbell, Utensils, CalendarDays, RefreshCw } from "lucide-react";

export function ClientCard({ client }: { client: ClientSummary }) {
  
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case "active": return "bg-primary/20 text-primary border-primary/30";
      case "at_risk": return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
      case "disengaged": return "bg-destructive/20 text-destructive border-destructive/30";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case "active": return "ACTIVE";
      case "at_risk": return "AT RISK";
      case "disengaged": return "DISENGAGED";
      default: return "UNKNOWN";
    }
  };

  return (
    <Link href={`/clients/${client.id}`}>
      <Card className={`group cursor-pointer hover:border-primary/50 transition-colors duration-200 bg-card ${client.engagementStatus === 'disengaged' ? 'opacity-75 grayscale-[0.5]' : ''}`}>
        <CardContent className="p-5">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border border-border">
                <AvatarImage src={client.photoUrl || ""} />
                <AvatarFallback className="bg-secondary text-secondary-foreground font-mono text-xs">
                  {getInitials(client.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-display font-semibold text-foreground tracking-tight">{client.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 rounded-sm font-mono ${getStatusColor(client.engagementStatus)}`}>
                    {getStatusLabel(client.engagementStatus)}
                  </Badge>
                  {client.needsMealPlan && (
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-[10px] px-1.5 py-0 rounded-sm font-mono flex items-center gap-1">
                      <Utensils className="h-3 w-3" /> MEAL PLAN
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm mt-4 pt-4 border-t border-border/50">
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider flex items-center gap-1 mb-1">
                <Activity className="h-3 w-3" /> Wkly Avg
              </p>
              <p className="font-mono text-foreground">{client.weeklyAttendanceAvg?.toFixed(1) || "0.0"} <span className="text-muted-foreground text-xs">classes</span></p>
            </div>
            
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider flex items-center gap-1 mb-1">
                <Dumbbell className="h-3 w-3" /> Compliance
              </p>
              <p className="font-mono text-foreground">{client.workoutCompliancePct || 0}%</p>
            </div>

            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider flex items-center gap-1 mb-1">
                <CalendarDays className="h-3 w-3" /> Last InBody
              </p>
              <p className="font-mono text-foreground">
                {client.latestScanDate ? format(parseISO(client.latestScanDate), "MMM d") : "Never"}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider flex items-center gap-1 mb-1">
                Current Stats
              </p>
              <p className="font-mono text-foreground">
                {client.latestWeight ? `${client.latestWeight}kg` : "-"} / {client.latestBodyFatPct ? `${client.latestBodyFatPct}%` : "-"}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex justify-between items-center text-[10px] font-mono text-muted-foreground">
            <span className="truncate max-w-[200px]" title={client.goals || "No goals set"}>
              {client.goals ? `GOAL: ${client.goals}` : "NO GOALS SET"}
            </span>
            <span className="flex items-center gap-1 whitespace-nowrap">
              <RefreshCw className="h-3 w-3" />
              {client.lastSyncedAt ? format(parseISO(client.lastSyncedAt), "HH:mm") : "Never"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
