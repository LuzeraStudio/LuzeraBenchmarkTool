import { createContext, useContext, useState, type ReactNode } from "react";
import type { BenchmarkSession, StaticData } from "../types/benchmark";
import { useToast } from "@/hooks/use-toast";

interface BenchmarkDataContextType {
  sessions: BenchmarkSession[];
  isLoading: boolean;
  loadDataFromFiles: (files: File[]) => void;
  clearData: () => void;
  deleteSession: (sessionId: string) => void;
}

const initialData: BenchmarkSession[] = [];

const BenchmarkDataContext = createContext<
  BenchmarkDataContextType | undefined
>(undefined);

export const BenchmarkDataProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<BenchmarkSession[]>(initialData);
  const [isLoading, setIsLoading] = useState(false);

  const loadDataFromFiles = (files: File[]) => {
    setIsLoading(true);

    const worker = new Worker(
      new URL("../workers/parser.worker.ts", import.meta.url),
      { type: "module" },
    );

    const sessionId = Date.now().toString();
    let sessionName = `Session ${sessionId.slice(-4)}`; // Fallback name

    if (files.length > 0 && files[0].webkitRelativePath) {
      const pathParts = files[0].webkitRelativePath.split("/");
      if (pathParts.length > 1 && pathParts[0] !== "") {
        sessionName = pathParts[0];
      }
    }

    worker.onmessage = (e) => {
      const { benchmarkSession, filesProcessedCount, totalFiles, errors } =
        e.data;

      setSessions((prevSessions) => [...prevSessions, benchmarkSession]);
      setIsLoading(false);

      if (errors.length > 0) {
        errors.forEach((err: { file: string; error: string }) => {
          toast({
            variant: "destructive",
            title: `Error parsing ${err.file}`,
            description: err.error,
          });
        });
      }

      toast({
        title: "Processing Complete",
        description: `Finished processing ${filesProcessedCount} relevant file(s) for ${benchmarkSession.sessionName}.`,
      });

      worker.terminate();
    };

    worker.onerror = (e) => {
      console.error("Worker error:", e);
      setIsLoading(false);
      toast({
        variant: "destructive",
        title: "Parsing Failed",
        description: "An unexpected error occurred during file processing.",
      });
      worker.terminate();
    };

    worker.postMessage({ files, sessionId, sessionName });
  };

  const clearData = () => {
    setSessions(initialData);
  };

  const deleteSession = (sessionId: string) => {
    const sessionName =
      sessions.find((s) => s.sessionId === sessionId)?.sessionName || "Session";
    setSessions((prevSessions) =>
      prevSessions.filter((session) => session.sessionId !== sessionId),
    );
    toast({
      title: "Session Deleted",
      description: `"${sessionName}" has been removed.`,
    });
  };

  return (
    <BenchmarkDataContext.Provider
      value={{
        sessions,
        isLoading,
        loadDataFromFiles,
        clearData,
        deleteSession,
      }}
    >
      {children}
    </BenchmarkDataContext.Provider>
  );
};

export const useBenchmarkData = () => {
  const context = useContext(BenchmarkDataContext);
  if (context === undefined) {
    throw new Error(
      "useBenchmarkData must be used within a BenchmarkDataProvider",
    );
  }
  return context;
};
