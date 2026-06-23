import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetClient, 
  useGetClientScans, 
  useGetClientAttendance, 
  useUpdateClient,
  getGetClientQueryKey,
  getGetClientScansQueryKey,
  getGetClientAttendanceQueryKey,
  getListClientsQueryKey
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
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, subDays, eachDayOfInterval } from "date-fns";
import { 
  ArrowLeft, 
  Save, 
  Activity, 
  Dumbbell, 
  Utensils,
  Scale,
  Calendar
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";

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

  const updateMutation = useUpdateClient();

  // Local state for editable fields
  const [goals, setGoals] = useState("");
  const [notes, setNotes] = useState("");
  const [needsMealPlan, setNeedsMealPlan] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (client && !initialized.current) {
      setGoals(client.goals || "");
      setNotes(client.notes || "");
      setNeedsMealPlan(client.needsMealPlan || false);
      initialized.current = true;
    }
  }, [client]);

  const handleSave = () => {
    updateMutation.mutate({
      id,
      data: {
        goals,
        notes,
        needsMealPlan
      }
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

  const getInitials = (name: string) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
  };

  // Chart data formatting
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

  return (
    <div className="container mx-auto p-4 max-w-6xl pb-20">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6 -ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Operations
        </Button>
      </Link>

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
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className={`font-mono uppercase ${
                client.engagementStatus === 'active' ? 'bg-primary/20 text-primary border-primary/30' :
                client.engagementStatus === 'at_risk' ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' :
                'bg-destructive/20 text-destructive border-destructive/30'
              }`}>
                {client.engagementStatus.replace("_", " ")}
              </Badge>
              <span className="text-xs font-mono text-muted-foreground">ID: {client.id}</span>
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
        
        {/* Left Column - Editable Settings */}
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

        {/* Right Column - Data & Charts */}
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

          <Card className="bg-card border-border shadow-md">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-display uppercase tracking-wider text-muted-foreground flex items-center">
                <Calendar className="mr-2 h-4 w-4" /> 90-Day Attendance Heatmap
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {attendanceLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <AttendanceHeatmap records={attendance || []} />
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

// Simple internal heatmap component
function AttendanceHeatmap({ records }: { records: any[] }) {
  const endDate = new Date();
  const startDate = subDays(endDate, 89);
  
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  
  // Create lookup map for faster checking
  const attendanceMap = new Set();
  records.forEach(r => {
    if (r.date) {
      attendanceMap.add(format(parseISO(r.date), "yyyy-MM-dd"));
    }
  });

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="min-w-[600px]">
        <div className="grid grid-rows-7 gap-1" style={{ gridAutoFlow: 'column' }}>
          {days.map((day, i) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const attended = attendanceMap.has(dateStr);
            return (
              <div 
                key={dateStr}
                className={`w-3 h-3 rounded-sm ${attended ? 'bg-primary' : 'bg-secondary'}`}
                title={`${format(day, "MMM d, yyyy")}${attended ? ' - Attended' : ''}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-3 text-[10px] uppercase font-mono text-muted-foreground">
          <span>90 days ago</span>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}
