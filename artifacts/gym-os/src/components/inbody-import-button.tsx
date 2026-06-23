import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListClientsQueryKey } from "@workspace/api-client-react";

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export function InBodyImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/inbody/import-csv", {
        method: "POST",
        body: formData,
      });

      const data: ImportResult = await response.json();

      if (!response.ok) {
        throw new Error((data as any).error ?? "Import failed");
      }

      queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });

      const parts: string[] = [];
      if (data.imported > 0) parts.push(`${data.imported} scan${data.imported !== 1 ? "s" : ""} imported`);
      if (data.skipped > 0) parts.push(`${data.skipped} skipped`);

      toast({
        title: data.errors.length > 0 ? "Import Complete (with errors)" : "Import Complete",
        description: parts.length > 0
          ? parts.join(", ") + (data.errors.length > 0 ? `. ${data.errors.length} row error(s).` : ".")
          : "All rows were already up to date.",
        variant: data.errors.length > 0 ? "destructive" : "default",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: (err as Error).message ?? "Could not import the CSV file.",
      });
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        className="font-display uppercase tracking-wider font-bold text-xs border-border text-muted-foreground hover:text-foreground"
      >
        <Upload className={`mr-2 h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
        {loading ? "Importing..." : "Import InBody CSV"}
      </Button>
    </>
  );
}
