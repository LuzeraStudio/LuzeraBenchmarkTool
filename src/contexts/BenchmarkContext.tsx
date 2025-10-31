import { createContext, useContext, useState, type ReactNode } from "react";
import type { BenchmarkSession } from "../types/benchmark";
import { useToast } from "@/hooks/useToast";

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

    // 1. Group files by their root session folder
    const filesBySession = new Map<string, File[]>();

    for (const file of files) {
      let sessionName = "Unknown Session"; // Default for files without a path
      if (file.webkitRelativePath) {
        const pathParts = file.webkitRelativePath.split("/");
        if (pathParts.length > 1 && pathParts[0] !== "") {
          sessionName = pathParts[0]; // The root folder name
        }
      }

      if (!filesBySession.has(sessionName)) {
        filesBySession.set(sessionName, []);
      }
      filesBySession.get(sessionName)!.push(file);
    }

    // 2. Process each group as a separate session
    const totalSessions = filesBySession.size;
    let sessionsProcessed = 0;

    if (totalSessions === 0) {
      setIsLoading(false);
      toast({
        variant: "destructive",
        title: "No files found",
        description: "Please drop one or more valid benchmark folders.",
      });
      return;
    }

    for (const [sessionName, sessionFiles] of filesBySession.entries()) {
      const worker = new Worker(
        new URL("../workers/parser.worker.ts", import.meta.url),
        { type: "module" },
      );

      const sessionId = `${Date.now()}-${sessionName}`;

      worker.onmessage = (e) => {
        const { benchmarkSession, filesProcessedCount, errors } = e.data;

        setSessions((prevSessions) => [...prevSessions, benchmarkSession]);

        if (errors.length > 0) {
          errors.forEach((err: { file: string; error: string }) => {
            toast({
              variant: "destructive",
              title: `Error in ${sessionName}: ${err.file}`,
              description: err.error,
            });
          });
        }

        toast({
          title: `Session "${sessionName}" Processed`,
          description: `Finished processing ${filesProcessedCount} relevant file(s).`,
        });

        worker.terminate();
        sessionsProcessed++;
        if (sessionsProcessed === totalSessions) {
          setIsLoading(false);
        }
      };

      worker.onerror = (e) => {
        console.error("Worker error:", e);
        toast({
          variant: "destructive",
          title: `Parsing Failed for "${sessionName}"`,
          description: "An unexpected error occurred during file processing.",
        });
        worker.terminate();
        sessionsProcessed++;
        if (sessionsProcessed === totalSessions) {
          setIsLoading(false);
        }
      };

      worker.postMessage({ files: sessionFiles, sessionId, sessionName });
    }
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