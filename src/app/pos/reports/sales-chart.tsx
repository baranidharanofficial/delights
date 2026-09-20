"use client";

import { useRef, useState, useTransition } from "react";

import { formatMoney } from "@/lib/shop/money";
import { SALES_RANGES, type SalesRange, type SalesSeries } from "@/lib/shop/sales-range";

import { loadSalesSeries } from "./actions";

/**
 * Plot geometry, in SVG user units. Fixed rather than measured, because the
 * `viewBox` is what actually scales the chart — these numbers only have to be
 * internally consistent, not match any real pixel size.
 */
const WIDTH = 760;
const HEIGHT = 200;
const PAD_LEFT = 64;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const VIEW_WIDTH = WIDTH + PAD_LEFT + PAD_RIGHT;
const VIEW_HEIGHT = HEIGHT + PAD_TOP + PAD_BOTTOM;

/** A "nice" axis step — 1, 2 or 5 × a power of ten — for roughly `targetTicks` gridlines. */
function niceStep(maxValue: number, targetTicks: number): number {
  if (maxValue <= 0) return 1;
  const rough = maxValue / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Whole rupees, comma-grouped, no paise — an axis tick doesn't need a receipt's precision. */
function formatWholeRupees(rupees: number): string {
  return formatMoney(Math.round(rupees) * 100).replace(/\.00$/, "");
}

export default function SalesChart({ initial }: { initial: SalesSeries }) {
  const [series, setSeries] = useState(initial);
  const [range, setRange] = useState<SalesRange>(initial.range);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [isPending, startTransition] = useTransition();
  const svgRef = useRef<SVGSVGElement>(null);

  const points = series.points;
  const last = points.length > 0 ? points[points.length - 1] : null;

  const maxRupees = Math.max(0, ...points.map((point) => point.total / 100));
  const step = niceStep(maxRupees || 1, 4);
  const axisMax = Math.max(step, Math.ceil((maxRupees || 1) / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= axisMax + 1e-6; value += step) ticks.push(value);

  function xAt(index: number): number {
    return points.length <= 1
      ? PAD_LEFT + WIDTH / 2
      : PAD_LEFT + (index / (points.length - 1)) * WIDTH;
  }

  function yAt(totalPaise: number): number {
    const ratio = axisMax === 0 ? 0 : totalPaise / 100 / axisMax;
    return PAD_TOP + HEIGHT - ratio * HEIGHT;
  }

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xAt(index)},${yAt(point.total)}`)
    .join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L${xAt(points.length - 1)},${PAD_TOP + HEIGHT} L${xAt(0)},${PAD_TOP + HEIGHT} Z`
      : "";

  // First, last, and a few evenly spaced in between — never one label per point.
  const labelCount = Math.min(points.length, 6);
  const labelIndices = new Set(
    Array.from({ length: labelCount }, (_, k) =>
      Math.round((k / Math.max(1, labelCount - 1)) * (points.length - 1)),
    ),
  );

  function nearestIndex(clientX: number): number | null {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return null;

    const rect = svg.getBoundingClientRect();
    const scale = VIEW_WIDTH / rect.width;
    const localX = (clientX - rect.left) * scale;
    const ratio = (localX - PAD_LEFT) / WIDTH;
    const index = Math.round(ratio * (points.length - 1));
    return Math.min(points.length - 1, Math.max(0, index));
  }

  function selectRange(next: SalesRange) {
    if (next === range || isPending) return;
    setRange(next);
    setActiveIndex(null);
    startTransition(async () => {
      setSeries(await loadSalesSeries(next));
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (points.length === 0) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(points.length - 1, (current ?? -1) + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, (current ?? points.length) - 1));
    } else if (event.key === "Escape") {
      setActiveIndex(null);
    }
  }

  const active = activeIndex !== null ? points[activeIndex] : null;

  return (
    <section
      aria-label="Sales over time"
      className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <h2 className="text-sm font-semibold tracking-wide">Sales over time</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Date range">
          {SALES_RANGES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={range === option.id}
              onClick={() => selectRange(option.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                range === option.id
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-white/10 text-muted hover:border-white/20 hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-4">
        <div>
          <p className="text-[0.65rem] tracking-wider text-muted/70 uppercase">
            Total sales
          </p>
          <p className="mt-1 text-2xl font-semibold text-accent">
            {formatMoney(series.totalSales)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {series.totalOrders} order{series.totalOrders === 1 ? "" : "s"}
          </p>
        </div>
        {points.length > 0 && (
          <button
            type="button"
            onClick={() => setShowTable((current) => !current)}
            className="text-xs text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            {showTable ? "Show chart" : "Show as table"}
          </button>
        )}
      </div>

      <div
        className="px-5 pt-3 pb-5 transition-opacity duration-150"
        style={{ opacity: isPending ? 0.5 : 1 }}
      >
        {points.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No sales yet.</p>
        ) : showTable ? (
          <SalesTable points={points} />
        ) : (
          <div className="relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              className="w-full touch-none select-none"
              role="img"
              aria-label={`Sales chart, ${series.range === "lifetime" ? "lifetime" : `last ${SALES_RANGES.find((option) => option.id === series.range)?.label}`}`}
              tabIndex={0}
              onPointerMove={(event) => setActiveIndex(nearestIndex(event.clientX))}
              onPointerDown={(event) => setActiveIndex(nearestIndex(event.clientX))}
              onPointerLeave={() => setActiveIndex(null)}
              onKeyDown={handleKeyDown}
            >
              {ticks.map((value) => (
                <g key={value}>
                  <line
                    x1={PAD_LEFT}
                    x2={PAD_LEFT + WIDTH}
                    y1={yAt(value * 100)}
                    y2={yAt(value * 100)}
                    className="stroke-white/10"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD_LEFT - 8}
                    y={yAt(value * 100)}
                    dy="0.32em"
                    textAnchor="end"
                    className="fill-muted text-[10px]"
                  >
                    {formatWholeRupees(value)}
                  </text>
                </g>
              ))}

              {points.map((point, index) =>
                labelIndices.has(index) ? (
                  <text
                    key={point.date}
                    x={xAt(index)}
                    y={PAD_TOP + HEIGHT + 20}
                    textAnchor="middle"
                    className="fill-muted text-[10px]"
                  >
                    {point.label}
                  </text>
                ) : null,
              )}

              {areaPath && <path d={areaPath} className="fill-accent/10" />}
              {points.length > 1 && (
                <path
                  d={linePath}
                  fill="none"
                  className="stroke-accent"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* The endpoint is the one value worth labelling directly on the mark. */}
              {last && (
                <>
                  <circle
                    cx={xAt(points.length - 1)}
                    cy={yAt(last.total)}
                    r={4}
                    className="fill-accent"
                    stroke="var(--background)"
                    strokeWidth={2}
                  />
                  <text
                    x={xAt(points.length - 1)}
                    y={yAt(last.total) - 10}
                    textAnchor="end"
                    className="fill-foreground text-[10px] font-medium"
                  >
                    {formatMoney(last.total)}
                  </text>
                </>
              )}

              {active && activeIndex !== null && (
                <>
                  <line
                    x1={xAt(activeIndex)}
                    x2={xAt(activeIndex)}
                    y1={PAD_TOP}
                    y2={PAD_TOP + HEIGHT}
                    className="stroke-white/20"
                    strokeWidth={1}
                  />
                  <circle
                    cx={xAt(activeIndex)}
                    cy={yAt(active.total)}
                    r={5}
                    className="fill-accent"
                    stroke="var(--background)"
                    strokeWidth={2}
                  />
                </>
              )}
            </svg>

            {active && activeIndex !== null && (
              <div
                aria-live="polite"
                className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-background px-3 py-2 text-xs whitespace-nowrap shadow-lg"
                style={{ left: `${(xAt(activeIndex) / VIEW_WIDTH) * 100}%` }}
              >
                <p className="font-medium text-foreground">{formatMoney(active.total)}</p>
                <p className="mt-0.5 text-muted">
                  {active.label} · {active.orderCount} order
                  {active.orderCount === 1 ? "" : "s"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SalesTable({ points }: { points: SalesSeries["points"] }) {
  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border border-white/10">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background">
          <tr className="text-left text-[0.65rem] tracking-wider text-muted/70 uppercase">
            <th className="px-3 py-2 font-medium">Period</th>
            <th className="px-3 py-2 text-right font-medium">Orders</th>
            <th className="px-3 py-2 text-right font-medium">Sales</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {[...points].reverse().map((point) => (
            <tr key={point.date}>
              <td className="px-3 py-2">{point.label}</td>
              <td className="px-3 py-2 text-right text-muted tabular-nums">
                {point.orderCount}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatMoney(point.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
