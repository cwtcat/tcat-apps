// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import "./ridership_stacked_bar.css";

export default function CornellBarChart() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const resetRef = useRef<HTMLButtonElement | null>(null);
  const selectAllRef = useRef<HTMLButtonElement | null>(null);
  const clearAllRef = useRef<HTMLButtonElement | null>(null);

  const rawDataRef = useRef<any[] | null>(null);
  const legendRef = useRef<Record<string, string[]> | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });

  // === Load data + legend ===
  useEffect(() => {
    Promise.all([
      fetch("/assets/cornell_filtered.json").then((r) => r.json()),
      import("../assets/cu_legend_groups.json"),
    ])
      .then(([raw, legendModule]) => {
        const legendGroups = legendModule.default;
        // Preserve the group and category order exactly as defined in the JSON
        const orderedLegendGroups = Object.entries(legendGroups);        
        rawDataRef.current = raw;
        legendRef.current = legendGroups;

        raw.forEach((d) => {
          const parsed = new Date(d.time || d.timestamp);
          if (!isNaN(parsed)) d.date = parsed;
        });

        const dates = raw.map((d) => d.date).filter(Boolean);
        const minDate = d3.min(dates);
        const maxDate = d3.max(dates);
        const fmtISO = d3.utcFormat("%Y-%m-%d");
        setDateRange({ start: fmtISO(minDate), end: fmtISO(maxDate) });

        renderChart(raw, legendGroups);
      })
      .catch((err) => console.error("Failed to load JSON:", err));
  }, []);

  useEffect(() => {
    if (!rawDataRef.current || !legendRef.current) return;
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const inRange = rawDataRef.current.filter(
      (d) => d.date >= start && d.date <= end
    );
    renderChart(inRange, legendRef.current);
  }, [dateRange]);

  function renderChart(rows: any[], legendGroups: Record<string, string[]>) {
    if (!svgRef.current) return;
    const container = d3.select(svgRef.current.parentNode as HTMLElement);
    container.selectAll(".legend-dropdowns, .chart-tooltip").remove();
    const svgSel = d3.select(svgRef.current);
    svgSel.selectAll("*").remove();

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
      .style("color", "#111")
      .style("box-shadow", "0 2px 8px rgba(0,0,0,0.15)")
      .style("display", "none")
      .style("opacity", 0)
      .style("transition", "opacity 0.2s ease-in-out");

    // --- Aggregate data ---
    const aggregates = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!r.parameter) continue;
      const dkey = r.date.toISOString().slice(0, 10);
      if (!aggregates.has(dkey)) aggregates.set(dkey, new Map());
      const inner = aggregates.get(dkey)!;
      inner.set(r.parameter, (inner.get(r.parameter) || 0) + 1);
    }

    const data = Array.from(aggregates.entries()).map(([date, params]) => {
      const obj: any = { date: new Date(date) };
      for (const [param, count] of params.entries()) obj[param] = count;
      return obj;
    });

    // === Respect legend JSON + custom group order ===
    const customGroupOrder = ["Other", "Faculty and Staff", "Students"];

    // Build an ordered list of groups following customGroupOrder,
    // then categories within each group following JSON order
    const orderedLegendGroups = Object.entries(legendGroups).sort(
      ([a], [b]) => {
        const aIdx = customGroupOrder.indexOf(a);
        const bIdx = customGroupOrder.indexOf(b);
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
      }
    );

    // Flatten that into one continuous ordered list of parameter keys
    const keys = orderedLegendGroups.flatMap(([_, cats]) => cats);
   
    // === Activate all keys initially so all groups are displayed ===
    const activeKeys = new Set(keys);

    if (data.length === 0) return;

    const margin = { top: 40, right: 20, bottom: 55, left: 60 };
    const width =
      (svgRef.current?.parentElement?.clientWidth ?? 800) -
      margin.left -
      margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = svgSel
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom);

    // --- Add clipping path (same as RidershipChart) ---
    svg
      .append("defs")
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

    const barsGroup = g.append("g").attr("clip-path", "url(#chart-clip)");

    // Add half-bar-width buffer to the left and right edges
    const dateExtent = d3.extent(data, (r) => r.date) as [Date, Date];
    const barBufferMs = ((dateExtent[1].getTime() - dateExtent[0].getTime()) / data.length) / 2;
    const bufferedDomain: [Date, Date] = [
      new Date(dateExtent[0].getTime() - barBufferMs),
      new Date(dateExtent[1].getTime() + barBufferMs)
    ];

    const x = d3.scaleUtc().domain(bufferedDomain).range([0, width]);
    const y = d3.scaleLinear().range([height, 0]);

    // === Color interpolation ===
    const groupColorRanges: Record<string, string[]> = {
      "Students": ["#c20000ff", "#f77e7eff", "#ffe5e5ff"],
      "Faculty and Staff": ["#0f6fabff", "#8ad8d8ff", "#e5f3f4ff"],
      "Other": ["#ead1dc", "#c27ba0", "#741b47"],
      "Ithaca College Riders": ["#d9ead3", "#93c47d", "#38761d"],
      "Farebox Categories": ["#d08c27ff", "#c59e51ff", "#dfc69bff"],
      "TC3 Riders": ["#0f28e6ff", "#414c98ff", "#989ecfff"],
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

    // Preserve JSON-defined order for both groups and their items
    const colorMap = new Map<string, string>();
    orderedLegendGroups.forEach(([group, cats]) => {
      const interp = groupPalettes[group] || d3.interpolateViridis;
      const n = cats.length;

      // assign colors in JSON order (first cat in JSON → first color)
      cats.forEach((cat, i) => {
        const t = 0.25 + (0.6 * i) / Math.max(1, n - 1);
        colorMap.set(cat, interp(t));
      });
    });

    const color = (key: string) => colorMap.get(key) || "#999";

    // === Stack ===
    const stacked = d3.stack().keys(keys)(data);
    y.domain([0, d3.max(stacked, (s) => d3.max(s, (d) => d[1])) || 1]);
    const barWidth = Math.max(1, width / data.length / 1.5);

    // === Bars ===
    const layer = barsGroup
      .selectAll(".layer")
      .data(stacked)
      .join("g")
      .attr("fill", (d) => color(d.key))
      .attr("class", "layer");

    let lastHovered: SVGRectElement | null = null;

    layer
      .selectAll("rect")
      .data((d) => d)
      .join("rect")
      // FIX: Clamp bars to chart area like in RidershipChart
      .attr("x", (d) => Math.max(0, x(d.data.date) - barWidth / 2))
      .attr("width", (d) => {
        const barX = x(d.data.date) - barWidth / 2;
        const visibleWidth = Math.min(barWidth, width - barX);
        return visibleWidth > 0 ? visibleWidth : 0;
      })
      .attr("y", (d) => y(d[1]))
      .attr("height", (d) => Math.max(0, y(d[0]) - y(d[1])))
      .on("mouseenter", function (event, d) {
        if (lastHovered && lastHovered !== this) {
          d3.select(lastHovered).attr("stroke", null).attr("opacity", 1);
        }
        lastHovered = this as SVGRectElement;

        const catKey = (d3.select(this.parentNode).datum() as any).key;
        const groupName =
          Object.entries(legendGroups).find(([_, cats]) =>
            cats.some(
              (c) => c.trim().toLowerCase() === catKey.trim().toLowerCase()
            )
          )?.[0] || "Other Descriptions";

        const value = (d.data as any)[catKey];
        const rowTotal = d3.sum(keys, (k) => (d.data as any)[k] || 0);
        const percentage =
          rowTotal > 0 ? ((value / rowTotal) * 100).toFixed(1) : "0.0";
        const borderColor = color(catKey);

        tooltip
          .style("border-color", borderColor)
          .style("display", "block")
          .style("opacity", 1)
          .html(
            `<strong>${groupName}</strong><br/>
             ${catKey}: <strong>${value.toLocaleString()}</strong><br/>
             <span style="color:#555;">${percentage}% of ${rowTotal.toLocaleString()} total</span>`
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

    g.on("mouseleave", () => {
      tooltip.style("opacity", 0).style("display", "none");
      if (lastHovered) {
        d3.select(lastHovered).attr("stroke", null).attr("opacity", 1);
        lastHovered = null;
      }
    });

    // === Axes ===
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .attr("class", "x-axis")
      .call(d3.axisBottom(x).tickFormat(d3.utcFormat("%-m/%-d")))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");

    g.append("g").attr("class", "y-axis").call(d3.axisLeft(y));

    // === Legend (same as RidershipChart) ===
    //const activeKeys = new Set(keys);

    // === Helper: attach tooltip event handlers to bar rects ===
    const attachTooltipHandlers = (selection) => {
      selection
        .on("mouseenter", function (event, d) {
          if (lastHovered && lastHovered !== this) {
            d3.select(lastHovered).attr("stroke", null).attr("opacity", 1);
          }
          lastHovered = this as SVGRectElement;

          const catKey = (d3.select(this.parentNode).datum() as any).key;
          const groupName =
            Object.entries(legendGroups).find(([_, cats]) =>
              cats.some(
                (c) => c.trim().toLowerCase() === catKey.trim().toLowerCase()
              )
            )?.[0] || "Other Descriptions";

          const value = (d.data as any)[catKey];
          const rowTotal = d3.sum(keys, (k) => (d.data as any)[k] || 0);
          const percentage =
            rowTotal > 0 ? ((value / rowTotal) * 100).toFixed(1) : "0.0";
          const borderColor = color(catKey);

          tooltip
            .style("border-color", borderColor)
            .style("display", "block")
            .style("opacity", 1)
            .html(
              `<strong>${groupName}</strong><br/>
              ${catKey}: <strong>${value.toLocaleString()}</strong><br/>
              <span style="color:#555;">${percentage}% of ${rowTotal.toLocaleString()} total</span>`
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
    };

    // === Updated redraw() that keeps tooltips working ===
    const redraw = () => {
     
      const shown = Array.from(activeKeys);
      const stackedShown = d3.stack().keys(shown)(data);

      y.domain([0, d3.max(stackedShown, (s) => d3.max(s, (d) => d[1])) || 1]);
      g.select(".y-axis").call(d3.axisLeft(y));
      barsGroup.selectAll(".layer").remove();

      const newLayer = barsGroup
        .selectAll(".layer")
        .data(stackedShown)
        .join("g")
        .attr("fill", (d) => color(d.key))
        .attr("class", "layer");

      const rects = newLayer
        .selectAll("rect")
        .data((d) => d)
        .join("rect")
        .attr("x", (d) => Math.max(0, x(d.data.date) - barWidth / 2))
        .attr("width", (d) => {
          const barX = x(d.data.date) - barWidth / 2;
          const visibleWidth = Math.min(barWidth, width - barX);
          return visibleWidth > 0 ? visibleWidth : 0;
        })
        .attr("y", (d) => y(d[1]))
        .attr("height", (d) => Math.max(0, y(d[0]) - y(d[1])));

      // 👇 Re-attach tooltip events for new bars
      attachTooltipHandlers(rects);
    };
    // === Global top-level buttons (Clear All, Select All, Reset Zoom) ===

    // "Clear All" — deselect everything and hide bars
    if (clearAllRef.current) {
      clearAllRef.current.onclick = () => {
        activeKeys.clear();
        d3.selectAll(".checkbox-container input[type=checkbox]").property("checked", false);
        redraw();
      };
    }

    // "Select All" — select all keys and show all bars
    if (selectAllRef.current) {
      selectAllRef.current.onclick = () => {
        keys.forEach((k) => activeKeys.add(k));
        d3.selectAll(".checkbox-container input[type=checkbox]").property("checked", true);
        redraw();
      };
    }

    // "Reset Zoom" — restore zoom transform to default
    if (resetRef.current) {
      resetRef.current.onclick = () => {
        const svg = d3.select(svgRef.current);
        svg.transition().duration(400).call(
          zoom.transform,
          d3.zoomIdentity,
          d3.zoomTransform(svg.node()).invert([width / 2, height / 2])
        );
      };
    }

    const legendContainer = container
      .append("div")
      .attr("class", "legend-dropdowns")
      .style("display", "flex")
      .style("justify-content", "center")
      .style("flex-wrap", "wrap")
      .style("gap", "8px")
      .style("padding", "10px")
      .style("border-top", "1px solid #ddd")
      .style("background", "#fafafa");

    Object.entries(legendGroups).forEach(([group, cats]) => {
      const box = legendContainer
        .append("div")
        .style("border", "1px solid #ddd")
        .style("border-radius", "6px")
        .style("padding", "6px 8px")
        .style("background", "#fff");

      box
        .append("div")
        .style("font-weight", "600")
        .style("margin-bottom", "4px")
        .text(group);

      // === Card control buttons ===
      const controls = box
        .append("div")
        .style("display", "flex")
        .style("gap", "4px")
        .style("margin-bottom", "4px");

      // Container for checkboxes
      const checkboxContainer = box
        .append("div")
        .attr("class", "checkbox-container")
        .style("display", "flex")
        .style("flex-direction", "column")
        .style("gap", "2px");

      // Clear all (affects only this card)
      controls
        .append("button")
        .text("Clear All")
        .attr("type", "button")
        .style("font-size", "10px")
        .style("padding", "1px 5px")
        .on("click", () => {
          cats.forEach((c) => activeKeys.delete(c));
          checkboxContainer.selectAll("input[type=checkbox]").property("checked", false);
          redraw();
        });

      // Select all (affects only this card)
      controls
        .append("button")
        .text("Select All")
        .attr("type", "button")
        .style("font-size", "10px")
        .style("padding", "1px 5px")
        .on("click", () => {
          cats.forEach((c) => activeKeys.add(c));
          checkboxContainer.selectAll("input[type=checkbox]").property("checked", true);
          redraw();
        });

      // Individual checkboxes
      cats.forEach((cat) => {
        const item = checkboxContainer
          .append("label")
          .style("display", "flex")
          .style("align-items", "center")
          .style("gap", "4px")
          .style("font-size", "11px");

        item
          .append("input")
          .attr("type", "checkbox")
          .attr("checked", true)
          .on("change", function () {
            if (this.checked) activeKeys.add(cat);
            else activeKeys.delete(cat);
            redraw();
          });

        item
          .append("span")
          .style("background", color(cat))
          .style("display", "inline-block")
          .style("width", "10px")
          .style("height", "10px")
          .style("border-radius", "2px");

        item.append("span").text(cat);
      });
    });


    // === Zoom (also clipped) ===
    const zoom = d3
      .zoom()
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
        const zx = event.transform.rescaleX(x);

        // Update x positions and hide bars that move offscreen
        barsGroup
          .selectAll("rect")
          .attr("x", (d) => {
            const barX = zx(d.data.date) - barWidth / 2;
            return barX;
          })
          .attr("display", (d) => {
            const barX = zx(d.data.date) - barWidth / 2;
            const barRight = barX + barWidth;

            // Define a half-bar buffer zone
            const buffer = barWidth / 2;

            // Hide bars that are completely off the visible region (with buffer)
            if (barRight < -buffer || barX > width + buffer) return "none";

            // Show bars within or partially overlapping the visible region
            return null;
          });

        // Update X-axis ticks
        g.select(".x-axis")
          .call(d3.axisBottom(zx).tickFormat(d3.utcFormat("%-m/%-d")))
          .selectAll("text")
          .attr("transform", "rotate(-45)")
          .style("text-anchor", "end");
      });


    svg.call(zoom as any);
  }

  return (
    <div
      id="cornell-chart"
      style={{ position: "relative", width: "100%", overflowX: "hidden" }}
    >
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
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button ref={clearAllRef}>🚫 Clear All</button>
          <button ref={selectAllRef}>✅ Select All</button>
          <button ref={resetRef}>🔄 Reset Zoom</button>
        </div>
      </div>
      <svg ref={svgRef}></svg>
    </div>
  );
}
