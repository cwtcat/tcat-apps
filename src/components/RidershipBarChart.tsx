import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

interface DataPoint {
  service_day: string;
  farebox: number;
  apc: number;
}

interface RidershipBarChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
}

const RidershipBarChart: React.FC<RidershipBarChartProps> = ({
  data,
  width = 800,
  height = 400,
}) => {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!data || data.length === 0 || !ref.current) return;

    const margin = { top: 40, right: 20, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // --- Reset SVG ---
    const svg = d3
      .select(ref.current)
      .attr("width", width)
      .attr("height", height);

    svg.selectAll("*").remove();

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // --- Aggregate data by service_day ---
    const rollup: DataPoint[] = Array.from(
      d3.rollups(
        data,
        (v: DataPoint[]) => ({
          service_day: v[0].service_day,
          farebox: d3.sum(v, (d: DataPoint) => d.farebox || 0),
          apc: d3.sum(v, (d: DataPoint) => d.apc || 0),
        }),
        (d: DataPoint) => d.service_day
      ),
      ([service_day, vals]) => ({
        service_day,
        farebox: (vals as any).farebox,
        apc: (vals as any).apc,
      })
    );

    const keys = ["farebox", "apc"];

    // --- Stack layout ---
    const stackGenerator = d3.stack().keys(keys);
    const stackedSeries = stackGenerator(rollup as any);

    // --- Scales ---
    const x = d3
      .scaleBand()
      .domain(rollup.map((d) => d.service_day))
      .range([0, innerWidth])
      .padding(0.2);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(rollup, (d) => d.farebox + d.apc)!])
      .nice()
      .range([innerHeight, 0]);

    const color = d3
      .scaleOrdinal(keys)
      .range(["#4e79a7", "#f28e2b"]);

    // --- Bars ---
    g.selectAll("g.layer")
      .data(stackedSeries)
      .join("g")
      .attr("class", "layer")
      .attr("fill", (d: any) => color(d.key)!)
      .selectAll("rect")
      .data((d: any) => d)
      .join("rect")
      .attr("x", (d: any) => x(d.data.service_day)!)
      .attr("y", (d: any) => y(d[1]))
      .attr("height", (d: any) => y(d[0]) - y(d[1]))
      .attr("width", x.bandwidth());

    // --- Axes ---
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x as any))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");

    g.append("g").call(d3.axisLeft(y as any));

    // --- Legend ---
    const legend = svg
      .append("g")
      .attr("transform", `translate(${margin.left},10)`);

    keys.forEach((key, i) => {
      const legendRow = legend
        .append("g")
        .attr("transform", `translate(${i * 150},0)`);

      legendRow
        .append("rect")
        .attr("width", 20)
        .attr("height", 20)
        .attr("fill", color(key)!);

      legendRow
        .append("text")
        .attr("x", 30)
        .attr("y", 15)
        .text(key)
        .style("text-transform", "capitalize");
    });
  }, [data, width, height]);

  return <svg ref={ref}></svg>;
};

export default RidershipBarChart;
