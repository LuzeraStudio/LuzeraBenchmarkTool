import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BookText, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const sections = [
  { id: "introduction", title: "Introduction" },
  { id: "getting-started", title: "Getting Started" },
  { id: "how-it-works", title: "How it Works" },
  { id: "command-line", title: "Command-Line Arguments" },
  { id: "csv-format", title: "CSV File Format" },
  { id: "static-data", title: "StaticData.csv" },
  { id: "performance-log", title: "PerformanceLog.csv" },
  { id: "events", title: "Events.csv" },
  { id: "using-analyzer", title: "Using the Analyzer" },
  { id: "metrics-glossary", title: "Metrics Glossary" },
  { id: "faq", title: "FAQ" },
];

const Highlight = ({ children }: { children: React.ReactNode }) => (
  <span className="font-semibold inline-block px-1">{children}</span>
);

const Documentation = () => {
  const [activeSection, setActiveSection] = useState<string>("introduction");

  const handleScrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Update active section based on scroll position
  useEffect(() => {
    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (entry.target.id) {
            setActiveSection(entry.target.id);
          }
        }
      });
    };

    // Adjust rootMargin: Trigger when the element enters the top 20%
    // or leaves the bottom 70% (ensuring it's prominently in view).
    const observerOptions = {
      rootMargin: "-20% 0px -70% 0px",
      threshold: 0.1,
    };

    const observer = new IntersectionObserver(
      observerCallback,
      observerOptions,
    );

    sections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <img src="logo.svg" className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">
                Luzera Benchmark Tool
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Documentation
              </p>
            </div>
          </Link>
          <div className="flex gap-2">
            <Link
              to="/"
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <Button>
                <Gauge /> Tool
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 flex-1 grid grid-cols-1 md:grid-cols-[250px_1fr] gap-8">
        <aside className="md:sticky md:top-24 h-fit">
          <h2 className="text-lg font-semibold mb-4 border-b pb-2">Sections</h2>
          {/* Use max-h for scroll within bounds, adjust 10rem/12rem based on actual header+padding height */}
          <ScrollArea className="max-h-[calc(100vh-10rem)] md:max-h-[calc(100vh-12rem)] pr-4">
            <nav className="flex flex-col space-y-1">
              {sections.map((section) => (
                <Button
                  key={section.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleScrollTo(section.id)}
                  className={cn(
                    "justify-start text-left h-auto py-2 px-3 whitespace-normal", // Allow text wrap
                    activeSection === section.id
                      ? "bg-muted text-primary hover:bg-muted font-semibold"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  {section.title}
                </Button>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        {/* Add scroll-mt-20 to sections for sticky header offset */}
        <main className="space-y-12 min-w-0">
          <section id="introduction" className="space-y-4 scroll-mt-20 pt-2">
            <h2 className="text-3xl font-bold border-b pb-2 flex items-center gap-2">
              <BookText className="h-6 w-6 text-primary" /> Introduction
            </h2>
            <p>Welcome to the documentation for the Luzera Benchmark Tool.</p>
            <p>
              The Luzera Benchmark Tool is a powerful Unreal Engine plugin built
              for developers who need reliable, automated performance analysis.
              It captures detailed hardware information and real-time
              performance metrics to help you diagnose and optimize your
              projects with confidence.
            </p>
            <p>
              Designed for seamless integration into CI/CD pipelines, the tool
              can also be executed in-game, from the command line, or even
              through a desktop shortcut, giving you full flexibility over how
              and when benchmarks are run.
            </p>
            <p>
              During execution, Luzera automatically cycles through your
              specified levels, following a precisely defined spline path while
              continuously logging data. It records everything from FPS
              percentile lows and frame-time stability to CPU, GPU, and memory
              usage, outputting all results in clean, structured CSV files ready
              for analysis or reporting.
            </p>
            <p>
              Whether you're investigating stutters, validating performance
              across hardware configurations, or generating automated
              performance dashboards, the Luzera Benchmark Tool delivers
              consistent, actionable data to pinpoint performance bottlenecks
              with precision.
            </p>
          </section>

          <section id="getting-started" className="space-y-4 scroll-mt-20 pt-2">
            <h2 className="text-3xl font-bold border-b pb-2">
              Getting Started
            </h2>
            <p>
              This guide will walk you through setting up and using the Luzera
              Benchmark Tool to test your Unreal Engine project's performance.
            </p>
            <ol className="list-decimal list-inside space-y-2 pl-4">
              <strong>
                <li>Enable the Plugin</li>
              </strong>
              <ol className="list-decimal list-inside space-y-4 pl-4 pb-8">
                <p>First, make sure the plugin is active in your project:</p>
                <li>In the Unreal Editor, go to "Edit → Plugins".</li>
                <li>
                  Search for "LuzeraBenchmarkTool" and check the box to enable
                  it.
                </li>
                <li>You will need to restart the editor.</li>
              </ol>

              <strong>
                <li>Configure Your Benchmark</li>
              </strong>
              <ol className="list-decimal list-inside space-y-4 pl-4 pb-8">
                <p>
                  Next, you'll configure the main settings file that comes with
                  the plugin:
                </p>
                <li>
                  On the toolbar, click the
                  <Highlight>Luzera Benchmark Tool</Highlight> icon, then
                  <Highlight>Configure Benchmark Settings</Highlight>. This will
                  open the <Highlight>BP_BenchmarkSubsystem</Highlight>
                  blueprint.
                </li>
                <li>
                  On the Details panel on the right, you'll see the
                  configuration options:
                  <ul className="list-disc list-inside space-y-4 pl-4 mt-4">
                    <li>
                      <strong>Enable Benchmark in Editor</strong>: Check this
                      box so you can test your setup by simply pressing "Play".
                    </li>
                    <li>
                      <strong>Game Levels</strong>: Click the + button and add
                      all the levels you want to test, in the order you want to
                      test them. For now add only one, you can add more later.
                    </li>
                  </ul>
                </li>
              </ol>

              <strong>
                <li>Set Up the Benchmark Path in Your Level</li>
              </strong>
              <ol className="list-decimal list-inside space-y-4 pl-4 pb-8">
                <p>
                  In the Content Browser, click the
                  <Highlight>Settings</Highlight> cog icon and make sure
                  <Highlight>Show Plugin Content</Highlight> is checked. Then
                  navigate to the folder: "LuzeraBenchmarkTool Content →
                  Actors".
                </p>
                <p>
                  Now, we need to tell the benchmark where to travel in your
                  level.
                </p>
                <li>
                  Open the level you previously added on the{" "}
                  <Highlight>BP_BenchmarkSubsystem</Highlight> to test.
                </li>
                <li>
                  Navigate to the folder: "/Engine/Plugins/LuzeraBenchmarkTool
                  Content/Actors".
                </li>
                <li>
                  Drag the <Highlight>BP_BenchmarkPath</Highlight> blueprint
                  into your level and place it where you want the test to begin.
                </li>
              </ol>
              <ol className="list-decimal list-inside space-y-4 pl-4 pb-8">
                <p>
                  This <Highlight>BP_BenchmarkPath</Highlight> contains a
                  spline, which is a flexible path. To edit it:
                </p>
                <li>
                  Make sure you have the <Highlight>BP_BenchmarkPath</Highlight>{" "}
                  actor selected in your level.
                </li>
                <li>
                  In the viewport, you will see two points connected by a line.
                  These are the spline points.
                </li>
                <li>
                  Click on one of the points to select it. You can now move it
                  around.
                </li>
              </ol>

              <ul className="list-disc list-inside space-y-4 pl-4 pb-8">
                <p>Here’s how to build your path:</p>
                <li>
                  <strong>To extend the path:</strong> Click on the last point
                  of the spline, hold the <strong>ALT</strong> key on your
                  keyboard, and then drag the point. This will duplicate it,
                  creating a new segment. Keep doing this to build your full
                  route.
                </li>
                <li>
                  <strong>To adjust the path:</strong> Click and drag any
                  existing point on the spline to change its position. You can
                  also right-click on a point for more options, like changing
                  the curve type.
                </li>
              </ul>
            </ol>
          </section>

          <section id="how-it-works" className="space-y-4 scroll-mt-20 pt-2">
            <h2 className="text-3xl font-bold border-b pb-2">How it Works</h2>
            <p>The tool is built around a few key parts:</p>
            <ul>
              <li>
                <strong>
                  <code>BP_BenchmarkSubsystem</code>
                </strong>
                : Main settings file. You can configure various settings here,
                such as if the benchmark should run by default (in editor or
                in-game), the interval capture, and the path to save the
                results.
              </li>
              <li>
                <strong>
                  <code>GM_Benchmark</code>
                </strong>
                : Special Game Mode to spawn the benchmark pawn.
              </li>
              <li>
                <strong>
                  <code>BP_BenchmarkPath</code>
                </strong>
                : The spline path used in your level to tell the benchmark pawn
                where to follow.
              </li>
              <li>
                <strong>
                  <code>BP_BenchmarkPawn</code>
                </strong>
                : The pawn that follows the path, and is used to measure
                performance.
              </li>
              <li>
                <strong>
                  <code>ULoggerComponent</code>
                </strong>
                : Attached to the pawn, handles logging.
              </li>
              <li>
                <strong>
                  <code>WBP_Benchmark</code>
                </strong>
                : Optional UI widget for live stats.
              </li>
            </ul>
          </section>

          <section id="command-line" className="space-y-4 scroll-mt-20 pt-2">
            <h2 className="text-3xl font-bold border-b pb-2 flex items-center">
              Command-Line Arguments
            </h2>
            <p>
              If you want to Launch packaged builds to automatically perform the
              benchmark, either through the command line or through shortcuts,
              you can use these arguments:
            </p>

            <ul>
              <h3 className="font-bold">Parameters (key=value)</h3>
              <li>
                <code>-quality=[0-4]</code> (0=Low to 4=Cinematic)
              </li>
              <li>
                <code>-maxfps=[number]</code> (0=unlimited)
              </li>
              <li>
                <code>-graphicsAdapter=[number]</code> (0=primary GPU, 1=second,
                etc.)
              </li>
            </ul>
            <ul>
              <h3 className="font-bold">Switches (on/off flags)</h3>
              <li>
                <code>-benchmarking</code>: Start benchmark automatically.
              </li>
              <li>
                <code>-opendirectory</code>: Open results folder on completion.
              </li>
              <li>
                <code>-preferNvidia</code> / <code>-preferAmd</code> /{" "}
                <code>-preferIntel</code>: Use first GPU from specified vendor.
              </li>
            </ul>
            <p>
              <h3 className="font-bold">Example</h3>
              <code>
                C:\MyGame\MyGame.exe -benchmarking -quality=2 -graphicsAdapter=0
                -opendirectory
              </code>
            </p>
            <p>
              Starts benchmark on High quality using the primary GPU and opens
              the folder afterwards.
            </p>
          </section>

          <section id="csv-format" className="space-y-4 scroll-mt-20 pt-2">
            <h2 className="text-3xl font-bold border-b pb-2">
              CSV File Format
            </h2>
            <p>
              The analyzer expects specific CSV files generated by the Luzera
              Benchmark Tool. Ensure your files adhere to the expected naming
              conventions and column headers.
            </p>
            <p>The primary files used are:</p>
            <ul className="list-disc list-inside space-y-1 pl-4">
              <li>
                <code>StaticData.csv</code>
              </li>
              <li>
                <code>[MapName]-PerformanceLog.csv</code>
              </li>
              <li>
                <code>[MapName]-Events.csv</code> (Optional, but recommended for
                context)
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Note: The `[MapName]-` prefix is important for associating
              performance logs and events correctly, especially when analyzing
              multiple maps in one session. A generic `Events.csv` will be
              associated with the first map found if no prefix matches.
            </p>
          </section>

          <section id="static-data" className="space-y-4 scroll-mt-20 pt-2">
            <h2 className="text-3xl font-bold border-b pb-2">StaticData.csv</h2>
            <p>
              This file contains information about the system and project
              settings at the time the benchmark was run. It typically has two
              columns: "Stat" and "Value".
            </p>
            <p>Example Rows:</p>
            <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
              <code>
                Stat,Value "Project Name","MyAwesomeGame"
                "Resolution","1920x1080" "CPU Brand","AMD Ryzen 9 5900X" "GPU
                Device Description","NVIDIA GeForce RTX 3080" "Total RAM
                (MB)","32768"
              </code>
            </pre>
            <p>
              This data is displayed under the "System Info" tab in the
              analyzer.
            </p>
          </section>

          <section id="performance-log" className="space-y-4 scroll-mt-20 pt-2">
            <h2 className="text-3xl font-bold border-b pb-2">
              PerformanceLog.csv
            </h2>
            <p>
              This is the core performance data file, capturing metrics at
              regular intervals (or during burst logging) as the benchmark
              progresses along the spline path. The filename should ideally be
              prefixed with the map name (e.g., `Level01-PerformanceLog.csv`).
            </p>
            <p>Essential Columns:</p>
            <ul className="list-disc list-inside space-y-1 pl-4">
              <li>
                <code>TIMESTAMP</code>: The time in seconds since the benchmark
                started.
              </li>
              <li>
                <code>SPLINE.DISTANCE</code>: The distance traveled along the
                spline path in Unreal Units.
              </li>
              <li>
                <code>FPS.CURRENT</code>: The instantaneous Frames Per Second at
                this point.
              </li>
            </ul>
            <p>Optional Common Columns (used by the analyzer if present):</p>
            <ul className="list-disc list-inside space-y-1 pl-4">
              <li>
                <code>SPLINE.PERCENTAGE</code>: Percentage completion along the
                spline (0.0 to 1.0).
              </li>
              <li>
                <code>BURST_LOGGING_STATUS</code>: Boolean (true/false)
                indicating if high-frequency logging was active.
              </li>
              <li>
                <code>CPU.USAGE</code>: Overall CPU utilization percentage.
              </li>
              <li>
                <code>GPU.USAGE</code>: Overall GPU utilization percentage.
              </li>
              <li>
                <code>GPU.TEMPERATURE</code>: GPU temperature in Celsius.
              </li>
              <li>
                <code>RAM.USAGE</code> / <code>RAM.AVAILABLE</code>: System RAM
                metrics (often in MB).
              </li>
              <li>
                <code>GPU.VRAM.USAGE</code> / <code>GPU.VRAM.AVAILABLE</code> /{" "}
                <code>GPU.VRAM.TOTAL</code>: Video RAM metrics (often in MB).
              </li>
              <li>
                Other FPS stats (Average, Percentiles), detailed thread times
                (GameThread, RenderThread, GpuTime), etc.
              </li>
            </ul>
            <p>
              The analyzer automatically detects available numeric columns
              (excluding the essential ones) and makes them selectable in the
              metrics dialog.
            </p>
          </section>

          <section id="events" className="space-y-4 scroll-mt-20 pt-2">
            <h2 className="text-3xl font-bold border-b pb-2">Events.csv</h2>
            <p>
              This optional file allows logging specific named events at certain
              timestamps during the benchmark. These are useful for marking
              points of interest (e.g., entering a new area, triggering an
              effect). The filename should ideally be prefixed with the map name
              (e.g., `Level01-Events.csv`).
            </p>
            <p>Expected Columns:</p>
            <ul className="list-disc list-inside space-y-1 pl-4">
              <li>
                <code>Timestamp</code>: The time in seconds when the event
                occurred.
              </li>
              <li>
                <code>EventName</code>: A short name for the event.
              </li>
              <li>
                <code>EventData</code>: Optional additional details about the
                event.
              </li>
            </ul>
            <p>Example Rows:</p>
            <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
              <code>
                Timestamp,EventName,EventData 6.958,Started,"Benchmark
                Started.\nHop on!" 25.123,EnteredCave,"Player entered the cave
                area" 45.678,BossSpawned,""
              </code>
            </pre>
            <p>
              Events are displayed as vertical lines on the performance chart,
              mapped to the closest recorded data point's distance or timestamp.
            </p>
          </section>

          <section id="using-analyzer" className="space-y-4 scroll-mt-20 pt-2">
            <h2 className="text-3xl font-bold border-b pb-2">
              Using the Analyzer
            </h2>
            <p>Once data is loaded:</p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                <strong>Run Selection:</strong> If multiple benchmark folders
                are uploaded, use the radio buttons at the top to switch between
                runs.
              </li>
              <li>
                <strong>Map Selection:</strong> If a run contains data for
                multiple maps, use the "Map" dropdown to switch views.
              </li>
              <li>
                <strong>Performance Tab:</strong>
                <ul className="list-disc list-inside space-y-1 pl-4 mt-1">
                  <li>
                    <Highlight>Chart Controls:</Highlight> Use the buttons in
                    the header to switch the X-axis (Distance/Time), zoom
                    vertically (+/-), export as PNG, and select the Metrics you
                    want to analyze.
                  </li>
                  <li>
                    <Highlight>Chart:</Highlight> Displays selected metrics over
                    distance or time. Hover for detailed tooltips. Event lines
                    mark specific occurrences. Red shaded areas indicate burst
                    logging.
                    <br />
                    Click on the chart to select a specific point and view its
                    details.
                  </li>
                  <li>
                    <Highlight>Brush:</Highlight> Use the handles below the
                    chart to zoom horizontally into a specific range. Drag the
                    selected area to pan.
                  </li>
                </ul>
              </li>
              <li>
                <strong>System Info Tab:</strong> Shows the hardware and project
                details captured in `StaticData.csv`.
              </li>
            </ul>
          </section>

          <section
            id="metrics-glossary"
            className="space-y-4 scroll-mt-20 pt-2"
          >
            <h2 className="text-3xl font-bold border-b pb-2">
              Metrics Glossary
            </h2>
            <p>Common metrics and their meanings:</p>
            <ul className="list-disc list-inside space-y-2 pl-4">
              <li>
                <code>FPS.CURRENT</code>: Instantaneous Frames Per Second.
                Higher is better.
              </li>
              <li>
                <code>CPU.USAGE</code>: Overall CPU load percentage. High values
                (90%+) might indicate a CPU bottleneck if GPU usage is low.
              </li>
              <li>
                <code>GPU.USAGE</code>: Overall GPU load percentage. High values
                (95%+) usually indicate the GPU is the primary performance
                limiter (GPU Bound).
              </li>
              <li>
                <code>GPU.TEMPERATURE</code>: Temperature of the GPU core in
                Celsius. High values can lead to thermal throttling (reduced
                performance).
              </li>
              <li>
                <code>GameThread</code> (Time in ms): CPU time spent on game
                logic, physics, actor updates per frame. High values indicate
                CPU limitation related to gameplay complexity.
              </li>
              <li>
                <code>RenderThread</code> (Time in ms): CPU time spent preparing
                data and commands for the GPU per frame. High values indicate
                CPU limitation related to rendering complexity (e.g., many
                objects, complex scenes).
              </li>
              <li>
                <code>GpuTime</code> (Time in ms): Time the GPU spent rendering
                the frame. High values directly reflect GPU workload.
              </li>
              <li>
                <code>RAM.USAGE</code>: Amount of system RAM allocated by the
                process.
              </li>
              <li>
                <code>GPU.VRAM.USAGE</code>: Amount of Video RAM allocated by
                the process. Approaching the GPU's total VRAM can cause severe
                stuttering.
              </li>
            </ul>
          </section>

          <section id="faq" className="space-y-4 scroll-mt-20 pt-2">
            <h2 className="text-3xl font-bold border-b pb-2 flex items-center gap-2">
              <BookText className="h-6 w-6 text-primary" /> Frequently Asked
              Questions (FAQ)
            </h2>
            <dl>
              <dt className="mt-6">
                <span className="font-mono font-semibold">Question:</span> Does
                this tool replace Unreal Insights or the CSV Profiler?
              </dt>
              <dd>
                <span className="font-mono font-semibold">Answer:</span> No, it
                complements them.
                <p>
                  Unreal Insights and the CSV Profiler are very deep, low-level
                  tools for engineers to find the exact bottlenecks causing a
                  slowdown.
                </p>
                <p>
                  This tool is for high-level, automated testing to see{" "}
                  <Highlight>if</Highlight> and <Highlight>where</Highlight>{" "}
                  your performance changes from a player's perspective.
                </p>
                <p>
                  Think of it this way: our automated benchmarking tool tells
                  you that{" "}
                  <Highlight>your FPS dropped in the village</Highlight>. Unreal
                  Insights is the deep-dive tool that tells you{" "}
                  <Highlight>
                    it's because the `UpdateVillagerAI` function is too slow.
                  </Highlight>
                </p>
              </dd>
              <dt className="mt-6">
                <span className="font-mono font-semibold">Question:</span> Why
                doesn't the benchmark start when I press "Play in Editor"?
              </dt>
              <dd>
                <span className="font-mono font-semibold">Answer:</span> Check
                "Enable Benchmark in Editor" and ensure maps are listed in{" "}
                <Highlight>BP_BenchmarkSubsystem</Highlight>.
              </dd>
              <dt className="mt-6">
                <span className="font-mono font-semibold">Question:</span> What
                is "Burst Mode" in the logger settings?
              </dt>
              <dd>
                <span className="font-mono font-semibold">Answer:</span> Burst
                Logging increases logging frequency during FPS drops for more
                detailed data around hitches, making it easier to identify the
                cause of performance issues.
              </dd>
              <dt className="mt-6">
                <span className="font-mono font-semibold">Question:</span> How
                to run in a packaged build?
              </dt>
              <dd>
                <span className="font-mono font-semibold">Answer:</span> If{" "}
                <Highlight>Enable on-launch Benchmark In-Game</Highlight> is set
                to true on the <Highlight>BP_BenchmarkSubsystem</Highlight> you
                can launch your game's <Highlight>.exe</Highlight> file with the{" "}
                <span className="font-semibold inline-block">
                  -benchmarking
                </span>{" "}
                command-line argument. This will automatically trigger the
                benchmark session to start.
                <br /> Optionally you can also trigger it manually by setting{" "}
                <Highlight>isBenchmarking</Highlight> to true and calling the{" "}
                <Highlight>Start Benchmark Session</Highlight> function, both on
                the <Highlight>BP_BenchmarkSubsystem</Highlight>.
              </dd>
              <dt className="mt-6">
                <span className="font-mono font-semibold">Question:</span> Why
                is the Report empty?
              </dt>
              <dd>
                <span className="font-mono font-semibold">Answer:</span> Ensure
                a <Highlight>BP_BenchmarkPath</Highlight> exists in each map
                listed in <Highlight>BP_BenchmarkSubsystem</Highlight>. Check
                logs filtered by "LogLuzera".
              </dd>
              <dt className="mt-6">
                <span className="font-mono font-semibold">Question:</span> How
                can I test a very specific part of my level, like an explosion
                that happens when the player enters a certain area?
              </dt>
              <dd>
                <span className="font-mono font-semibold">Answer:</span>
                You can a <Highlight>BP_BenchmarkArea</Highlight> volume. Place
                one over the path where the explosion is triggered, then add an
                event on the Blueprint interface for that functionality, using
                as an example the functionality that already is implemented, and
                calling this event on the actor that starts the explosion.
              </dd>
              <dt className="mt-6">
                <span className="font-mono font-semibold">Question:</span>I want
                to log my own data, how can I do that?
              </dt>
              <dd>
                <span className="font-mono font-semibold">Answer:</span>
                You can get a reference to the
                <Highlight>ULoggerComponent</Highlight> in your
                <Highlight>BP_BenchmarkPawn</Highlight> and use the
                <Highlight>Log Custom Data</Highlight> Blueprint node. This will
                add a new column to your CSV file with the value you provide,
                for example you can trace all the enemies on screen to save how
                many are currently visible.
                <br />
                You can also use the<Highlight>Log Custom Event</Highlight>
                node to log events happening in screen, such as entering or
                exiting a specific area, or triggering a visual effect.
              </dd>
              <dt className="mt-6">
                <span className="font-mono font-semibold">Question:</span>
                My benchmark results are inconsistent between runs. How can I
                make them more reliable?**
              </dt>
              <dd>
                <span className="font-mono font-semibold">Answer:</span> For the
                most reliable results, always run benchmarks in a packaged
                build, not the editor. Also, ensure consistent settings by using
                command-line arguments to set the graphics quality ( "
                <Highlight>-quality=3</Highlight>" ).
              </dd>
              <dt className="mt-6">
                <span className="font-mono font-semibold">Question:</span> Where
                are reports saved?
              </dt>
              <dd>
                <span className="font-mono font-semibold">Answer:</span>
                You can set where it is saved on the
                <Highlight>BP_BenchmarkSubsystem</Highlight>
                blueprint.
                <br /> There you can also configure so the folder containing
                your report automatically opens when the benchmark session is
                complete.
              </dd>
              <dt className="mt-6">
                <span className="font-mono font-semibold">Question:</span> Why
                are some GPU stats like 'VRAM Usage' or 'GPU Temperature'
                missing from my report?
              </dt>
              <dd>
                <span className="font-mono font-semibold">Answer:</span> Some of
                the GPU statistics are collected using NVAPI, a third-party
                library from NVIDIA that is included with Unreal Engine, that is
                only available when running the benchmark on the
                <Highlight>
                  Windows operating system with an NVIDIA graphics card.
                </Highlight>
                <br /> Most of the data will still be recorded for all hardware,
                it is just some specific GPU hardware data that requires NVAPI.
              </dd>
            </dl>
          </section>

          {/* Filler to allow last section to be scrolled to top */}
          <section
            id="filer"
            className="space-y-4 scroll-mt-20 pt-2 min-h-[400px]"
          ></section>
        </main>
      </div>
    </div>
  );
};

export default Documentation;