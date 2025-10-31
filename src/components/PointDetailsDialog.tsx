import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn, formatStatValue } from "@/lib/utils";

interface ComparisonData {
    headers: { key: string; label: string }[];
    rows: any[];
    runIds: string[];
    pointDistance: number | string | boolean | null;
    pointTimestamp: number | string | boolean | null;
}

interface PointDetailsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    comparisonData: ComparisonData;
}

export const PointDetailsDialog = ({
    open,
    onOpenChange,
    comparisonData
}: PointDetailsDialogProps) => {
    const { headers, rows, runIds, pointDistance, pointTimestamp } = comparisonData;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-auto max-w-[90vw] max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Data Point Comparison</DialogTitle>
                    <DialogDescription>
                        {`Distance: ${formatStatValue(pointDistance)}cm`}
                        {` - Time: ${formatStatValue(pointTimestamp)}s`}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-auto min-h-0">
                    <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                                {headers.map((header) => (
                                    <TableHead
                                        key={header.key}
                                        className={cn(
                                            "text-s font-semibold whitespace-nowrap px-2 text-left"
                                        )}
                                    >
                                        {header.label}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.metric}>
                                    <TableCell className="text-left font-semibold text-xs whitespace-nowrap px-2">
                                        {row.metric}
                                    </TableCell>
                                    {runIds.map((runId) => {
                                        const value = row[runId];
                                        return (
                                            <TableCell
                                                key={runId}
                                                className="text-center text-xs px-2"
                                            >
                                                {/* --- THIS IS THE FIX (Part 2) --- */}
                                                {formatStatValue(value)}
                                                {/* --- END FIX --- */}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>
        </Dialog>
    );
};