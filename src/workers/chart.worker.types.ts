import type { PerformanceLogEntry } from "@/types/benchmark";

export interface ChartDataResult {
    downsampledData: PerformanceLogEntry[];
    fullDataForDetails: PerformanceLogEntry[];
}
export interface ChartDataResultMessage {
    type: "DATA_READY";
    payload: ChartDataResult;
}
export interface ErrorResultMessage {
    type: "ERROR";
    payload: { message: string };
}
export type ChartWorkerMessage = ChartDataResultMessage | ErrorResultMessage;