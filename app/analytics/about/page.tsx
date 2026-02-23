"use client";

import Link from "next/link";
import { DesktopNav } from "@/components/DesktopNav";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="text-sm text-[var(--color-content-secondary)] space-y-2 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-sunken)] text-[var(--color-content)]">
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/analytics" className="text-sm text-accent hover:text-accent-hover">&larr;</Link>
            <h1 className="text-xl font-bold text-content">Methodology</h1>
          </div>
          <DesktopNav />
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-sm text-[var(--color-content-secondary)] mb-8">
          How PortoMove collects, processes, and presents transit performance data for Porto&apos;s STCP network.
        </p>

        <Section title="Data Sources">
          <p>
            All transit data originates from STCP (Sociedade de Transportes Colectivos do Porto),
            officially published on the Porto Open Data portal.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Bus positions</strong> — FIWARE Urban Platform (NGSI v2), provided by Porto Digital.
              Real-time GPS snapshots of ~400–600 STCP buses, collected every 30 seconds by our worker process.
              Each record includes: vehicle ID, lat/lon, speed, heading, route, trip ID, direction.
            </li>
            <li>
              <strong>Route patterns &amp; schedules</strong> — Porto Digital OpenTripPlanner (OTP) GraphQL API
              at <code className="text-xs bg-surface-sunken px-1 rounded">otp.portodigital.pt</code>.
              Provides route geometries (polylines), stop locations, and scheduled departure times.
              All transit data originates from STCP and is published on the{" "}
              <a href="https://opendata.porto.digital" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">Porto Open Data portal</a>.
            </li>
            <li>
              <strong>Bike infrastructure</strong> — Explore Porto API. Bike parks and bike lanes (ciclovias).
            </li>
          </ul>
        </Section>

        <Section title="Data Collection">
          <p>
            A dedicated worker process running on Fly.io queries the FIWARE API every 30 seconds
            and writes each bus position to a PostgreSQL database (Neon). Raw position data is
            retained for 24 hours; after daily aggregation, it is cleaned up to manage storage costs.
          </p>
          <p>
            On a typical day, the collector records ~100,000–150,000 position samples across
            ~120 active vehicles and ~49 routes.
          </p>
        </Section>

        <Section title="Route Segments">
          <p>
            Route polylines from the Porto Digital OTP API are split into ~200-meter segments. Each GPS position is
            snapped to the nearest segment (within 150m) using the Haversine formula. This allows
            us to compute speed statistics at a granular geographic level.
          </p>
        </Section>

        <Section title="Trip Reconstruction">
          <p>
            Individual bus trips are reconstructed from the GPS breadcrumb trail. A new trip is
            detected when:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>The trip ID changes between consecutive positions</li>
            <li>There is a gap of more than 10 minutes between consecutive positions</li>
          </ul>
          <p>
            Trips with fewer than 3 position samples are discarded as noise.
          </p>
        </Section>

        <Section title="Headway Metrics">
          <p>
            For each route and direction, we compute headways (time between consecutive trips
            passing a reference point). From these headways we derive:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Average Wait Time (AWT)</strong> = &Sigma;(H&sup2;) / (2 &middot; &Sigma;H),
              where H is the observed headway. This accounts for the fact that passengers are more
              likely to arrive during long gaps.
            </li>
            <li>
              <strong>Scheduled Wait Time (SWT)</strong> = scheduled headway / 2 (for perfectly
              regular service).
            </li>
            <li>
              <strong>Excess Wait Time (EWT)</strong> = AWT &minus; SWT. The additional time
              passengers wait beyond what the schedule promises.
            </li>
            <li>
              <strong>Headway Adherence</strong> — percentage of headways within the scheduled
              headway + 3 minutes.
            </li>
            <li>
              <strong>Bunching</strong> — percentage of headways below 50% of scheduled (buses
              arriving too close together).
            </li>
            <li>
              <strong>Gapping</strong> — percentage of headways above 150% of scheduled (long
              gaps in service).
            </li>
          </ul>
          <p>
            When scheduled headway is unknown, the median observed headway is used as the reference.
          </p>
        </Section>

        <Section title="Grading Scale">
          <p>
            Each route receives a letter grade based on EWT and headway adherence:
          </p>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse mt-2">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left pr-6 py-1 font-medium">Grade</th>
                  <th className="text-left pr-6 py-1 font-medium">EWT</th>
                  <th className="text-left py-1 font-medium">Adherence</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[var(--color-border)]">
                  <td className="pr-6 py-1"><span className="inline-block w-6 h-6 rounded-full bg-green-500 text-white text-center text-xs leading-6 font-bold">A</span></td>
                  <td className="pr-6 py-1">&lt; 60 seconds</td>
                  <td className="py-1">&gt; 90%</td>
                </tr>
                <tr className="border-b border-[var(--color-border)]">
                  <td className="pr-6 py-1"><span className="inline-block w-6 h-6 rounded-full bg-green-400 text-white text-center text-xs leading-6 font-bold">B</span></td>
                  <td className="pr-6 py-1">&lt; 120 seconds</td>
                  <td className="py-1">&gt; 80%</td>
                </tr>
                <tr className="border-b border-[var(--color-border)]">
                  <td className="pr-6 py-1"><span className="inline-block w-6 h-6 rounded-full bg-yellow-400 text-white text-center text-xs leading-6 font-bold">C</span></td>
                  <td className="pr-6 py-1">&lt; 180 seconds</td>
                  <td className="py-1">&gt; 70%</td>
                </tr>
                <tr className="border-b border-[var(--color-border)]">
                  <td className="pr-6 py-1"><span className="inline-block w-6 h-6 rounded-full bg-orange-400 text-white text-center text-xs leading-6 font-bold">D</span></td>
                  <td className="pr-6 py-1">&lt; 300 seconds</td>
                  <td className="py-1">&gt; 50%</td>
                </tr>
                <tr>
                  <td className="pr-6 py-1"><span className="inline-block w-6 h-6 rounded-full bg-red-500 text-white text-center text-xs leading-6 font-bold">F</span></td>
                  <td className="pr-6 py-1">&ge; 300 seconds</td>
                  <td className="py-1">&le; 50%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Velocity Heatmap">
          <p>
            The heatmap colors each ~200m route segment by average commercial speed. Speed is
            computed from the GPS-reported speed field in the FIWARE data, aggregated hourly per
            segment. Percentiles (p10, median, p90) are also computed to show speed variability.
          </p>
          <p>
            Color scale: red (&le;5 km/h) through orange, yellow, lime, to green (&ge;25 km/h).
            Gray segments have no data for the selected period.
          </p>
        </Section>

        <Section title="Data Retention &amp; Freshness">
          <p>
            Raw GPS positions are retained for 24 hours in the database. Each night at 03:00 UTC,
            the aggregation pipeline runs to compute daily route performance metrics and hourly
            segment speeds. At 04:00 UTC, positions older than 24 hours are cleaned up.
          </p>
          <p>
            Route segment definitions are refreshed weekly from the Porto Digital OTP API to capture any route changes.
          </p>
        </Section>

        <Section title="Limitations">
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              GPS accuracy varies; positions may be off by 10–30 meters, affecting segment snapping.
            </li>
            <li>
              The FIWARE API occasionally has gaps or delays, which may cause some trips to be
              split or missed entirely.
            </li>
            <li>
              Scheduled headways are not always available from OTP, so we fall back to median
              observed headway as the reference.
            </li>
            <li>
              Speed data reflects commercial speed (including dwell time at stops), not free-flow
              traffic speed.
            </li>
            <li>
              Only STCP buses are tracked. Metro, Fertagus, and other operators are not included
              in the position data.
            </li>
          </ul>
        </Section>

        <Section title="Open Data">
          <p>
            All aggregated data is available for download on the{" "}
            <Link href="/analytics/data" className="text-[var(--color-accent)] hover:underline">
              data page
            </Link>
            . Formats include JSON, CSV, and GeoJSON. We encourage researchers, journalists, and
            civic hackers to use this data and help improve public transit in Porto.
          </p>
          <p>
            If you find errors or have suggestions, please open an issue on our{" "}
            <a
              href="https://github.com/anomalyco/opencode"
              className="text-[var(--color-accent)] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub repository
            </a>.
          </p>
        </Section>
      </div>
    </div>
  );
}
