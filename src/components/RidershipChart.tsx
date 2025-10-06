// @ts-nocheck

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import "./ridership_stacked_bar.css";

interface DataRow {
  date: string;
  [key: string]: number | string;
}
type ParsedRow = DataRow & { _date: Date };

export default function RidershipChart() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const resetRef = useRef<HTMLButtonElement | null>(null);
  const selectAllRef = useRef<HTMLButtonElement | null>(null);
  const clearAllRef = useRef<HTMLButtonElement | null>(null);

  // --- NEW: keep original data & legend in refs, and current date range in state
  const rawDataRef = useRef<DataRow[] | null>(null);
  const legendRef = useRef<Record<string, string[]> | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });

  useEffect(() => {
    Promise.all([
      import("../assets/data.json"),
      import("../assets/legend_groups.json"),
    ]).then(([dataModule, legendModule]) => {
      const raw: DataRow[] = dataModule.default;
      const legendGroups: Record<string, string[]> = legendModule.default;

      // Save originals
      rawDataRef.current = raw;
      legendRef.current = legendGroups;

      // Initialize date inputs to full file range
      const parse = d3.utcParse("%Y-%m-%d");
      const dates = raw
        .map((d) => parse(String(d.date)) as Date)
        .filter(Boolean) as Date[];
      const minDate = d3.min(dates)!;
      const maxDate = d3.max(dates)!;
      const fmtISO = d3.utcFormat("%Y-%m-%d");

      setDateRange({ start: fmtISO(minDate), end: fmtISO(maxDate) });

      // Initial render (unfiltered = full range)
      renderChart(raw, legendGroups);
    });
  }, []);

  // Re-render when the date inputs change
  useEffect(() => {
    if (!rawDataRef.current || !legendRef.current) return;
    if (!dateRange.start || !dateRange.end) return;

    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);

    // If user flips them, normalize to [min, max]
    const startDate = start <= end ? start : end;
    const endDate = start <= end ? end : start;

    // Filter raw data by date range (inclusive)
    const inRange = rawDataRef.current.filter((d) => {
      // Compare as UTC dates
      const dDate = new Date(d.date);
      return dDate >= startDate && dDate <= endDate;
    });

    // Guard: if no rows match, don't break renderChart; just show nothing
    if (inRange.length === 0) {
      // Clear the SVG (matches your renderChart clearing behavior)
      if (svgRef.current) {
        const container = d3.select(svgRef.current.parentNode as HTMLElement);
        container.selectAll(".legend, .legend-dropdowns, .chart-tooltip").remove();
        d3.select(svgRef.current).selectAll("*").remove();
      }
      return;
    }

    renderChart(inRange, legendRef.current);
  }, [dateRange]);

  function renderChart(data: DataRow[], legendGroups: Record<string, string[]>) {
    if (!svgRef.current) return;

    const container = d3.select(svgRef.current.parentNode as HTMLElement);
    container.selectAll(".legend, .legend-dropdowns, .chart-tooltip").remove();

    const svgSel = d3.select(svgRef.current);
    svgSel.selectAll("*").remove();

    const containerWidth =
      (svgRef.current.parentElement?.clientWidth ?? 1000) - 40;

    // === Tooltip ===
    const tooltip = container
      .append("div")
      .attr("class", "chart-tooltip")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "rgba(255,255,255,0.97)")
      .style("border", "2px solid #888")
      .style("border-radius", "6px")
      .style("padding", "8px 10px")
      .style("font-size", "13px")
      .style("line-height", "1.3em")
      .style("color", "#111")
      .style("box-shadow", "0 2px 8px rgba(0,0,0,0.15)")
      .style("display", "none")
      .style("opacity", 0)
      .style("transition", "opacity 0.2s ease-in-out");

    // --- Parse data ---
    const parse = d3.utcParse("%Y-%m-%d");
    const rows: ParsedRow[] = data.map((d) => ({
      ...d,
      _date: parse(String(d.date)) as Date,
    }));

    const allKeys = Object.keys(rows[0]).filter(
      (k) => k !== "date" && k !== "_date"
    );
    rows.forEach((r) => allKeys.forEach((k) => (r[k] = +r[k])));

    const dates = rows.map((r) => r._date).sort((a, b) => +a - +b);
    const gaps = d3.pairs(dates).map(([a, b]) => +b - +a);
    const stepMs = d3.median(gaps) ?? 24 * 3600 * 1000;

    // --- Layout ---
    const margin = { top: 40, right: 20, bottom: 55, left: 50 };
    const width = containerWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = svgSel
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom);

    // === Clip Path to prevent bars crossing y-axis ===
    const defs = svg.append("defs");
    defs
      .append("clipPath")
      .attr("id", "chart-clip")
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", width)
      .attr("height", height);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // === Colors ===
    const groupColorRanges: Record<string, string[]> = {
      "Cornell Riders": ["#d61a17ff", "#ffa895ff"],
      "Mobile App": ["#d9ead3", "#93c47d", "#38761d"],
      "TCARDs": ["#ead1dc", "#c27ba0", "#741b47"],
      "Ithaca College Riders": ["#0f28e6ff", "#5464d8ff", "#989ecfff"],
      "Farebox Categories": ["#d08c27ff", "#c59e51ff", "#dfc69bff"],
      "TC3 Riders": ["#4787afff", "#6f9a9aff", "#81a0a1ff"],
      "Other Descriptions": ["#e6e6e6", "#999999", "#333333"],
    };

    const groupPalettes: Record<string, (t: number) => string> = {};
    for (const [group, range] of Object.entries(groupColorRanges)) {
      groupPalettes[group] = d3
        .scaleLinear<string>()
        .domain(range.map((_, i) => i / (range.length - 1)))
        .range(range)
        .clamp(true)
        .interpolate(d3.interpolateRgb);
    }

    const colorMap = new Map<string, string>();
    Object.entries(legendGroups).forEach(([group, cats]) => {
      const interp = groupPalettes[group] || d3.interpolateViridis;
      const n = cats.length;
      cats.forEach((cat, i) => {
        const t = 0.25 + (0.6 * i) / Math.max(1, n - 1);
        colorMap.set(cat, interp(t));
      });
    });
    const color = (key: string) => colorMap.get(key) || "#999";

    const fmt = d3.utcFormat("%-m/%-d");

    // --- Scales ---
    const x = d3
      .scaleUtc()
      .domain(d3.extent(rows, (r) => r._date) as [Date, Date])
      .range([0, width]);
    const y = d3.scaleLinear().range([height, 0]);

    const xAxis = g
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(fmt));
    xAxis
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");

    const yAxis = g.append("g");

    const barsGroup = g
      .append("g")
      .attr("class", "bars-group")
      .attr("clip-path", "url(#chart-clip)");

    // --- Helpers ---
    const barWidthFor = (sx: d3.ScaleTime<number, number>) => {
      const d0 = dates[0];
      const d1 = new Date(+d0 + stepMs);
      return Math.max(1, (sx(d1) - sx(d0)) * 0.9);
    };

    const activeKeys = new Set(allKeys);
    const activeKeysArray = () => Array.from(activeKeys);

    const computeVisibleMax = (
      keys: string[],
      xScale: d3.ScaleTime<number, number>
    ): number => {
      if (keys.length === 0) return 1;
      const [xMin, xMax] = xScale.domain();
      let maxVal = 0;
      for (const r of rows) {
        if (r._date >= xMin && r._date <= xMax) {
          const total = d3.sum(keys, (k) => r[k] as number);
          if (total > maxVal) maxVal = total;
        }
      }
      return maxVal * 1.1 || 1;
    };

    const updateYScale = (
      keys: string[],
      xScale: d3.ScaleTime<number, number>,
      animate = true
    ) => {
      const visibleMax = computeVisibleMax(keys, xScale);
      const newDomain = [0, visibleMax];
      y.domain(newDomain);
      const axis = d3.axisLeft(y);
      const t = svg.transition().duration(1000).ease(d3.easeCubicInOut);
      animate ? yAxis.transition(t).call(axis) : yAxis.call(axis);
    };

    // Track last hovered rect
    let lastHovered: SVGRectElement | null = null;

    // --- Draw Bars with consistent rejoin ---
    const drawBars = (
      keys: string[],
      xScale: d3.ScaleTime<number, number>,
      yScale: d3.ScaleLinear<number, number>
    ) => {
      const stacked =
        keys.length > 0
          ? d3.stack<ParsedRow>().keys(keys as any)(rows as any)
          : [];

      const w = barWidthFor(xScale);

      // clean join even when keys empty
      const series = barsGroup
        .selectAll<SVGGElement, d3.Series<ParsedRow, string>>("g.layer")
        .data(stacked, (d: any) => d.key)
        .join(
          (enter) =>
            enter
              .append("g")
              .attr("class", "layer")
              .attr("fill", (d) => color(d.key)),
          (update) => update.attr("fill", (d) => color(d.key)),
          (exit) => exit.remove()
        );

      const rects = series
        .selectAll<SVGRectElement, d3.SeriesPoint<ParsedRow>>("rect")
        .data(
          (d) => d,
          (d: any) => (d.data as ParsedRow)._date.getTime()
        )
        .join(
          (enter) =>
            enter
              .append("rect")
              .attr("x", (d) => xScale((d.data as ParsedRow)._date) - w / 2)
              .attr("width", w)
              .attr("y", (d) => yScale(d[1]))
              .attr("height", (d) => yScale(d[0]) - yScale(d[1])),
          (update) =>
            update
              .attr("width", w)
              .attr("x", (d) => xScale((d.data as ParsedRow)._date) - w / 2)
              .attr("y", (d) => yScale(d[1]))
              .attr("height", (d) => yScale(d[0]) - yScale(d[1])),
          (exit) => exit.remove()
        );

      // Hide bars left of axis
      rects.attr("display", (d) =>
        xScale((d.data as ParsedRow)._date) - w / 2 < 0 ? "none" : null
      );

      // Tooltip handling
      rects
        .on("mouseenter", function (event, d) {
          if (lastHovered && lastHovered !== this) {
            d3.select(lastHovered).attr("stroke", null).attr("opacity", 1);
          }
          lastHovered = this as SVGRectElement;

          const catKey = (d3.select(this.parentNode).datum() as any).key;
          const groupName = Object.entries(legendGroups).find(([_, cats]) =>
            cats.includes(catKey)
          )?.[0];
          const value = (d.data as any)[catKey];
          const total = d3.sum(activeKeysArray(), (k) => (d.data as any)[k]);
          const borderColor = color(catKey);

          tooltip
            .style("border-color", borderColor)
            .style("display", "block")
            .style("opacity", 1)
            .html(
              `<strong>${groupName}</strong><br/>
               ${catKey}: <strong>${value.toLocaleString()}</strong><br/>
               Total: ${total.toLocaleString()}`
            );

          d3.select(this)
            .attr("stroke", "#000")
            .attr("stroke-width", 1.2)
            .attr("opacity", 0.88);
        })
        .on("mousemove", function (event) {
          tooltip
            .style("left", `${event.pageX + 12}px`)
            .style("top", `${event.pageY - 28}px`);
        });

      barsGroup.on("mouseleave", () => {
        tooltip.style("opacity", 0).style("display", "none");
        if (lastHovered) {
          d3.select(lastHovered).attr("stroke", null).attr("opacity", 1);
          lastHovered = null;
        }
      });
    };

    // --- Initial Draw ---
    const initialMax = computeVisibleMax(allKeys, x);
    y.domain([0, initialMax]);
    yAxis.attr("class", "y-axis").call(d3.axisLeft(y));
    drawBars(allKeys, x, y);

    // --- Zoom ---
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      .extent([
        [0, 0],
        [width, height],
      ])
      .on("zoom", (event) => {
        const t = event.transform;
        const zx = t.rescaleX(x);
        const visibleMax = computeVisibleMax(activeKeysArray(), zx);
        y.domain([0, visibleMax]);
        yAxis.call(d3.axisLeft(y));
        drawBars(activeKeysArray(), zx, y);
        xAxis
          .call(d3.axisBottom(zx).tickFormat(d3.utcFormat("%-m/%-d")))
          .selectAll("text")
          .attr("transform", "rotate(-45)")
          .style("text-anchor", "end");
      });

    svg.call(zoom as any);

    // === Legend Dropdowns ===
    const legendContainer = container
      .append("div")
      .attr("class", "legend-dropdowns")
      .style("margin-top", "12px")
      .style("max-width", "800px");

    Object.entries(legendGroups).forEach(([group, cats]) => {
      const dropdown = legendContainer
        .append("details")
        .attr("class", "legend-group")
        .attr("open", group === "Fare-Related");

      dropdown
        .append("summary")
        .style("font-weight", "bold")
        .style("cursor", "pointer")
        .style("font-size", "16px")
        .text(group);

      const controlRow = dropdown
        .append("div")
        .style("margin", "4px 0")
        .style("display", "flex")
        .style("gap", "8px");

      const list = dropdown
        .append("div")
        .attr("class", "legend-items")
        .style("display", "flex")
        .style("flex-wrap", "wrap")
        .style("gap", "10px")
        .style("margin-top", "4px");

      controlRow
        .append("button")
        .text("Select All")
        .attr("type", "button")
        .style("font-size", "12px")
        .on("click", () => {
          cats.forEach((cat) => activeKeys.add(cat));
          list.selectAll("input").property("checked", true);
          updateYScale(activeKeysArray(), x);
          drawBars(activeKeysArray(), x, y);
        });

      controlRow
        .append("button")
        .text("Clear All")
        .attr("type", "button")
        .style("font-size", "12px")
        .on("click", () => {
          cats.forEach((cat) => activeKeys.delete(cat));
          list.selectAll("input").property("checked", false);
          updateYScale(activeKeysArray(), x);
          drawBars(activeKeysArray(), x, y);
        });

      cats.forEach((cat) => {
        const item = list
          .append("label")
          .attr("class", "legend-item")
          .style("display", "flex")
          .style("align-items", "center")
          .style("cursor", "pointer");

        item
          .append("input")
          .attr("type", "checkbox")
          .attr("checked", activeKeys.has(cat) ? true : null)
          .style("margin-right", "5px")
          .on("change", function () {
            if ((this as HTMLInputElement).checked) activeKeys.add(cat);
            else activeKeys.delete(cat);
            updateYScale(activeKeysArray(), x);
            drawBars(activeKeysArray(), x, y);
          });

        item
          .append("span")
          .style("background-color", color(cat))
          .style("display", "inline-block")
          .style("width", "12px")
          .style("height", "12px")
          .style("margin-right", "6px");

        item.append("span").text(cat);
      });
    });

    // --- Top Buttons ---
    d3.select(resetRef.current).on("click", () => {
      svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
    });

    d3.select(clearAllRef.current).on("click", () => {
      activeKeys.clear();
      legendContainer.selectAll("input").property("checked", false);
      updateYScale(activeKeysArray(), x);
      drawBars([], x, y);
    });

    d3.select(selectAllRef.current).on("click", () => {
      allKeys.forEach((k) => activeKeys.add(k));
      legendContainer.selectAll("input").property("checked", true);
      updateYScale(activeKeysArray(), x);
      drawBars(allKeys, x, y);
    });
  }

  return (
    <div
      id="ridership-chart"
      style={{ position: "relative", width: "100%", overflowX: "hidden" }}
    >
      {/* NEW: Date range controls with styling that matches your buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          padding: "10px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: 13, color: "#333" }}>Start Date</span>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) =>
                setDateRange((r) => ({ ...r, start: e.target.value }))
              }
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid #ccc",
                backgroundColor: "#fff",
                fontSize: "13px",
              }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: 13, color: "#333" }}>End Date</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) =>
                setDateRange((r) => ({ ...r, end: e.target.value }))
              }
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid #ccc",
                backgroundColor: "#fff",
                fontSize: "13px",
              }}
            />
          </label>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <button
            ref={clearAllRef}
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid #ccc",
              backgroundColor: "#fff7f7",
              cursor: "pointer",
            }}
          >
            🚫 Clear All
          </button>
          <button
            ref={selectAllRef}
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid #ccc",
              backgroundColor: "#f7fff7",
              cursor: "pointer",
            }}
          >
            ✅ Select All
          </button>
          <button
            ref={resetRef}
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid #ccc",
              backgroundColor: "#f5f5f5",
              cursor: "pointer",
            }}
          >
            🔄 Reset Zoom
          </button>
        </div>
      </div>

      <svg ref={svgRef}></svg>
    </div>
  );
}
