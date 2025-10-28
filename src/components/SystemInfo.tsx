import { useState, useEffect } from "react"; // Import hooks
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBenchmarkData } from "@/contexts/BenchmarkContext"; // Import context hook
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const SystemInfo = () => {
  const { sessions } = useBenchmarkData();
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0].sessionId);
    }
  }, [sessions, selectedSessionId]);

  const selectedSession = sessions.find(
    (s) => s.sessionId === selectedSessionId,
  );
  const staticData = selectedSession?.staticData;

  if (sessions.length === 0) {
    return (
      <p className="text-center text-muted-foreground italic py-8">
        No static system data found. Upload a 'StaticData.csv' file.
      </p>
    );
  }

  const sections: Record<string, string[]> = {
    Project: ["Project Name", "Project Version"],
    Settings: ["Quality Preset", "Resolution", "Resolution Scale"],
    Hardware: [
      "CPU Brand",
      "CPU Cores",
      "CPU Threads",
      "Total RAM (MB)",
      "GPU Device Description",
      "GPU Driver Version",
    ],
  };

  const renderSection = (title: string, keys: string[]) => (
    <Card key={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key}>
                <TableCell className="font-medium">{key}</TableCell>
                <TableCell>{staticData?.[key] || "N/A"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Session:</label>
        <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Select a session" />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((session) => (
              <SelectItem key={session.sessionId} value={session.sessionId}>
                {session.sessionName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!staticData ? (
        <p className="text-center text-muted-foreground italic py-8">
          No static data found for the selected session.
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
          {Object.entries(sections).map(([title, keys]) =>
            renderSection(title, keys),
          )}
        </div>
      )}
    </div>
  );
};
