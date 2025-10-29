import { useState, useMemo, useEffect } from "react";
import { FileUploader } from "@/components/FileUploader";
import { SystemInfo } from "@/components/SystemInfo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useBenchmarkData } from "@/contexts/BenchmarkContext";
import { ChartController } from "@/components/ChartController";
import { File } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { BenchmarkRun } from "@/types/benchmark";
import { useChartSettings } from "@/contexts/ChartSettingsContext";

const Home = () => {
    const { sessions, isLoading } = useBenchmarkData();
    const { selectedMap, setSelectedMap } = useChartSettings();

    const mapNames = useMemo(() => {
        const mapSet = new Set<string>();
        sessions.forEach((session) => {
            Object.keys(session.maps).forEach((mapName) => {
                mapSet.add(mapName);
            });
        });
        return Array.from(mapSet).sort();
    }, [sessions]);

    // Effect to initialize or reset selectedMap based on available mapNames
    useEffect(() => {
        if (mapNames.length > 0 && (!selectedMap || !mapNames.includes(selectedMap))) {
            setSelectedMap(mapNames[0]);
        } else if (mapNames.length === 0 && selectedMap) {
            setSelectedMap(""); // Clear map if no maps are available anymore
        }
    }, [mapNames, selectedMap, setSelectedMap]);

    const currentMapRuns = useMemo(() => {
        if (!selectedMap) return [];
        const runs: BenchmarkRun[] = [];
        sessions.forEach((session) => {
            if (session.maps[selectedMap]) {
                runs.push(...session.maps[selectedMap]);
            }
        });
        return runs;
    }, [sessions, selectedMap]);

    const hasData = sessions.length > 0;

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border bg-card sticky top-0 z-50">
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="logo.svg" className="h-8 w-8 text-primary" />
                        <div>
                            <h1 className="text-2xl font-bold">Luzera Benchmark Tool</h1>
                            <p className="text-sm text-muted-foreground">
                                Performance Analysis
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            to="/documentation"
                            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                        >
                            <Button>
                                <File /> Docs
                            </Button>
                        </Link>
                        {hasData && <FileUploader variant="compact" />}
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                {!hasData ? (
                    <>
                        {isLoading && (
                            <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
                                <p className="text-xl font-semibold animate-pulse">
                                    Processing files...
                                </p>
                            </div>
                        )}
                        <div className="max-w-2xl mx-auto mt-20">
                            <FileUploader />
                        </div>
                    </>
                ) : (
                    <>
                        {isLoading && (
                            <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
                                <p className="text-xl font-semibold animate-pulse">
                                    Processing files...
                                </p>
                            </div>
                        )}
                        <div className="space-y-8">
                            <h2 className="text-3xl font-bold">Benchmark Results</h2>

                            <Tabs defaultValue="performance" className="w-full">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="performance">Performance</TabsTrigger>
                                    <TabsTrigger value="system">System Info</TabsTrigger>
                                </TabsList>

                                <TabsContent value="performance" className="space-y-6 mt-6">

                                    {currentMapRuns.length > 0 ? (
                                        <ChartController
                                            key={selectedMap}
                                            runs={currentMapRuns}
                                            mapNames={mapNames}
                                            // selectedMap={selectedMap}
                                            // onMapChange={setSelectedMap}
                                        />
                                    ) : (
                                        <p className="text-center text-muted-foreground italic py-8">
                                            No performance log data found for the selected map.
                                        </p>
                                    )}
                                </TabsContent>

                                <TabsContent value="system" className="mt-6">
                                    <SystemInfo />
                                </TabsContent>
                            </Tabs>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
};

export default Home;
