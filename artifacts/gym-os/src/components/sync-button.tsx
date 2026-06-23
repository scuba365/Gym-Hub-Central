import React from "react";
import { useSyncAll, getGetDashboardStatsQueryKey, getListClientsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";

export function SyncButton({ lastSyncedAt }: { lastSyncedAt?: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const syncMutation = useSyncAll();

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        
        if (result.success) {
          toast({
            title: "Sync Complete",
            description: `${result.clientsUpdated} clients, ${result.scansAdded} scans, ${result.attendanceRecordsAdded} attendances updated.`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Partial Sync",
            description: `Issues with: ${result.missingSources?.join(", ") || "Unknown"}. Check configuration.`,
          });
        }
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Sync Failed",
          description: "Failed to communicate with the synchronization service.",
        });
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button 
        onClick={handleSync} 
        disabled={syncMutation.isPending}
        className="font-display uppercase tracking-wider font-bold text-xs"
        size="sm"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
        {syncMutation.isPending ? "Syncing..." : "Sync All Sources"}
      </Button>
      <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
        {lastSyncedAt ? `Last sync: ${format(parseISO(lastSyncedAt), "HH:mm:ss")}` : "Never synced"}
      </div>
    </div>
  );
}
