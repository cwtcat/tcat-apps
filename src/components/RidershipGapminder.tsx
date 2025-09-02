// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'

export type DataRow = {
  service_day: string
  bus_id: string
  apc: number | null
  farebox: number | null
}

export type Mode = 'daily' | 'monthly'

type Props = {
  data: DataRow[]
  days: string[]
  currentDay: string
  mode: Mode
  selectedBusId: string | null
  onBusClick?: (busId: string) => void
  width?: number
  height?: number
  transitionMs?: number
}

const MARGIN = { top: 28, right: 24, bottom: 96, left: 72 }

const HUE_RED  = '#ef4444'
const HUE_BLUE = '#2563eb'
const INTENSITY_FLOOR = 0.14
const INTENSITY_BOOST = 1.10
const GAMMA_RANGE = 0.85
const USE_QUANTILES = false
const QMIN = 0.00
const QMAX = 1.00

// "YYYY-MM-DD" -> "Monday, 8/4/25"
function formatDayBanner(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00Z')
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'numeric', day: 'numeric', year: '2-digit'
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('weekday')}, ${get('month')}/${get('day')}/${get('year')}`
}

// symmetric percent difference vs mean
function pctDiff(xVal: number, yVal: number) {
  const ax = Math.max(0, xVal), ay = Math.max(0, yVal)
  const denom = (ax + ay) / 2
  if (denom <= 0) return 0
  return Math.abs((ay - ax) / denom)
}

function computePctDiffRange<T extends { xPlot: number; yPlot: number }>(rows: T[]) {
  const vals = rows.map(r => pctDiff(r.xPlot, r.yPlot)).filter(Number.isFinite).sort((a,b)=>a-b)
  if (!vals.length) return { pMin: 0, pMax: 1 }
  if (USE_QUANTILES) {
    const pMin = d3.quantile(vals, QMIN) ?? vals[0]
    const pMax = d3.quantile(vals, QMAX) ?? vals[vals.length - 1]
    return { pMin, pMax: Math.max(pMax, pMin + 1e-6) }
  } else {
    const pMin = vals[0]
    const pMax = vals[vals.length - 1]
    return { pMin, pMax: Math.max(pMax, pMin + 1e-6) }
  }
}

function centralityFromRange(pDiff: number, pMin: number, pMax: number) {
  const t = (pDiff - pMin) / Math.max(1e-6, (pMax - pMin))
  return Math.pow(Math.max(0, Math.min(1, 1 - t)), GAMMA_RANGE)
}

const mixTo = (hue: string, t: number) =>
  d3.interpolateRgb.gamma(2.2)('#ffffff', hue)(Math.max(0, Math.min(1, t)))

function getSymmetricFill<T extends { xPlot: number; yPlot: number }>(
  d: T, _xDomMax: number, _yDomMax: number, rowsForNorm: T[]
) {
  if (d.xPlot <= 0 || d.yPlot <= 0) return '#ffffff'
  const hue = (d.yPlot - d.xPlot) >= 0 ? HUE_BLUE : HUE_RED
  const { pMin, pMax } = computePctDiffRange(rowsForNorm)
  const p = pctDiff(d.xPlot, d.yPlot)
  let intensity = centralityFromRange(p, pMin, pMax)
  intensity = INTENSITY_FLOOR + (1 - INTENSITY_FLOOR) * Math.min(1, intensity * INTENSITY_BOOST)
  return mixTo(hue, intensity)
}

export default function RidershipGapminder({
  data,
  currentDay,
  mode,
  selectedBusId,
  onBusClick,
  width = 1100,
  height = 720,
  transitionMs = 2500,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  const dataByDay = useMemo(() => {
    const m = new Map<string, DataRow[]>()
    for (const r of data) {
      const arr = m.get(r.service_day) || []
      arr.push(r)
      m.set(r.service_day, arr)
    }
    return m
  }, [data])

  type Agg = { bus_id: string; farebox_sum: number; apc_sum: number; n_fx: number; n_apc: number }
  const monthlyAgg = useMemo(() => {
    const m = new Map<string, Agg>()
    for (const r of data) {
      const a = m.get(r.bus_id) || { bus_id: r.bus_id, farebox_sum: 0, apc_sum: 0, n_fx: 0, n_apc: 0 }
      if (r.farebox != null) { a.farebox_sum += r.farebox; a.n_fx += 1 }
      if (r.apc != null) { a.apc_sum += r.apc; a.n_apc += 1 }
      m.set(r.bus_id, a)
    }
    return Array.from(m.values())
  }, [data])

  const dailyExtents = useMemo(() => {
    let fxMax = 1, axMax = 1, volMax = 1
    for (const r of data) {
      const fx = r.farebox ?? 0
      const ax = r.apc ?? 0
      fxMax = Math.max(fxMax, fx)
      axMax = Math.max(axMax, ax)
      volMax = Math.max(volMax, Math.max(fx, ax))
    }
    fxMax = Math.ceil(fxMax * 1.05)
    axMax = Math.ceil(axMax * 1.05)
    return { xDomain: [0, fxMax] as [number, number], yDomain: [0, axMax] as [number, number], sizeDomain: [0, volMax] as [number, number] }
  }, [data])

  const monthlyExtents = useMemo(() => {
    let fxMax = 1, axMax = 1, volMax = 1
    for (const a of monthlyAgg) {
      fxMax = Math.max(fxMax, a.farebox_sum)
      axMax = Math.max(axMax, a.apc_sum)
      volMax = Math.max(volMax, Math.max(a.farebox_sum, a.apc_sum))
    }
    fxMax = Math.ceil(fxMax * 1.05)
    axMax = Math.ceil(axMax * 1.05)
    return { xDomain: [0, fxMax] as [number, number], yDomain: [0, axMax] as [number, number], sizeDomain: [0, volMax] as [number, number] }
  }, [monthlyAgg])

  const plotW = width - MARGIN.left - MARGIN.right
  const plotH = height - MARGIN.top - MARGIN.bottom

  const xDaily = d3.scaleLinear().domain(dailyExtents.xDomain).range([0, plotW])
  const yDaily = d3.scaleLinear().domain(dailyExtents.yDomain).range([plotH, 0])
  const rDaily = d3.scaleSqrt().domain(dailyExtents.sizeDomain).range([4, 22])

  const xMonthly = d3.scaleLinear().domain(monthlyExtents.xDomain).range([0, plotW])
  const yMonthly = d3.scaleLinear().domain(monthlyExtents.yDomain).range([plotH, 0])
  const rMonthly = d3.scaleSqrt().domain(monthlyExtents.sizeDomain).range([6, 28])

  const X = mode === 'daily' ? xDaily : xMonthly
  const Y = mode === 'daily' ? yDaily : yMonthly
  const R = mode === 'daily' ? rDaily : rMonthly

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const svg = d3.select(el)
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const defs = svg.selectAll('defs').data([null]).join('defs')
    defs.selectAll('filter#glow-yellow').data([null]).join('filter')
      .attr('id', 'glow-yellow')
      .attr('height', '250%')
      .attr('width', '250%')
      .attr('x', '-75%')
      .attr('y', '-75%')
      .html(`
        <feFlood flood-color="#facc15" flood-opacity="1" result="flood"/>
        <feComposite in="flood" in2="SourceAlpha" operator="in" result="mask"/>
        <feGaussianBlur in="mask" stdDeviation="3.5" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      `)

    const gradBlue = defs.selectAll('linearGradient#legend-blue').data([null]).join('linearGradient')
      .attr('id', 'legend-blue').attr('x1', '0%').attr('y1', '0%').attr('x2', '100%').attr('y2', '0%')
    gradBlue.selectAll('stop').data([
      {offset:'0%',   color:'#ffffff'},
      {offset:'100%', color:HUE_BLUE}
    ]).join('stop').attr('offset', d=>d.offset).attr('stop-color', d=>d.color)

    const gradRed = defs.selectAll('linearGradient#legend-red').data([null]).join('linearGradient')
      .attr('id', 'legend-red').attr('x1', '0%').attr('y1', '0%').attr('x2', '100%').attr('y2', '0%')
    gradRed.selectAll('stop').data([
      {offset:'0%',   color:HUE_RED},
      {offset:'100%', color:'#ffffff'}
    ]).join('stop').attr('offset', d=>d.offset).attr('stop-color', d=>d.color)

    const g = svg.selectAll<SVGGElement, unknown>('g.root')
      .data([null]).join('g')
      .attr('class', 'root')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    // Day banner
    const showDaily = mode === 'daily' && currentDay
    const bannerText = showDaily ? formatDayBanner(currentDay) : ''
    const banner = g.selectAll<SVGTextElement, string>('text.day-banner')
      .data(showDaily ? [bannerText] : [])
    banner.join(
      enter => enter.append('text')
        .attr('class', 'day-banner')
        .attr('x', plotW / 2)
        .attr('y', 30)
        .attr('text-anchor', 'middle')
        .attr('font-size', 46)
        .attr('font-weight', 600)
        .attr('fill', '#111827')
        .style('pointer-events', 'none')
        .text(d => d),
      update => update.text(d => d).attr('x', plotW / 2).attr('y', 30),
      exit => exit.remove()
    )

    // Axes
    g.selectAll('g.x-axis').data([null]).join('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${plotH})`)
      .call(d3.axisBottom(X).ticks(8).tickSizeOuter(0))
    g.selectAll('g.y-axis').data([null]).join('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(Y).ticks(8).tickSizeOuter(0))

    // Labels
    g.selectAll('text.x-label').data([null]).join('text')
      .attr('class', 'x-label')
      .attr('x', plotW/2).attr('y', plotH + 44).attr('text-anchor', 'middle')
      .text('Farebox')
    g.selectAll('text.y-label').data([null]).join('text')
      .attr('class', 'y-label')
      .attr('transform', `translate(${-56},${plotH/2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('APC')

    // Diagonal
    const diagMax = Math.max(X.domain()[1], Y.domain()[1])
    g.selectAll('line.diagonal').data([null]).join('line')
      .attr('class', 'diagonal')
      .attr('x1', X(0)).attr('y1', Y(0))
      .attr('x2', X(diagMax)).attr('y2', Y(diagMax))
      .attr('stroke', '#9ca3af').attr('stroke-dasharray', '6 4').attr('stroke-width', 1.5)

    // Tooltip
    let tooltip = d3.select(tooltipRef.current)
    if (tooltip.empty()) {
      const host = svg.node()?.parentElement || document.querySelector('.chart-wrap')
      if (host) tooltip = d3.select(host).append('div').attr('class', 'tooltip')
    }

    // -------- Data rows for active mode --------
    type RowD = DataRow & {
      xPlot: number; yPlot: number;
      relDelta: number; sizeMetric: number;
      missingApc: boolean; missingFarebox: boolean;
    }

    let rows: RowD[] = []
    if (mode === 'daily') {
      rows = (dataByDay.get(currentDay) ?? []).map(d => {
        const missingFarebox = d.farebox == null
        const missingApc = d.apc == null
        const xVal = missingFarebox ? 0 : d.farebox!
        const yVal = missingApc ? 0 : d.apc!
        const rel = d.farebox && d.farebox > 0 && d.apc != null ? (d.apc - d.farebox) / d.farebox : 0
        const size = Math.max(d.apc ?? 0, d.farebox ?? 0)
        return { ...d, xPlot:xVal, yPlot:yVal, relDelta: Math.max(-0.2, Math.min(0.2, rel)), sizeMetric:size, missingApc, missingFarebox }
      })
    } else {
      rows = monthlyAgg.map(a => {
        const rel = a.n_fx > 0 ? (a.apc_sum - a.farebox_sum) / Math.max(1, a.farebox_sum) : 0
        const size = Math.max(a.apc_sum, a.farebox_sum)
        return {
          service_day: 'AGG', bus_id: a.bus_id,
          apc: a.apc_sum, farebox: a.farebox_sum,
          xPlot: a.farebox_sum, yPlot: a.apc_sum,
          relDelta: Math.max(-0.2, Math.min(0.2, rel)),
          sizeMetric: size, missingApc: a.n_apc === 0, missingFarebox: a.n_fx === 0
        }
      })
    }

    const defaultOpacity = (d: RowD) => (d.missingApc || d.missingFarebox) ? 0.15 : 0.85
    const selectedAwareOpacity = (d: RowD) => (selectedBusId && d.bus_id !== selectedBusId) ? 0.08 : defaultOpacity(d)
    const selectedAwareStrokeOpacity = (d: RowD) => (selectedBusId && d.bus_id !== selectedBusId) ? 0.25 : 1
    const selectedAwareFilter = (d: RowD) => (selectedBusId && d.bus_id === selectedBusId) ? 'url(#glow-yellow)' : null
    const highlightedStrokeWidth = (d: RowD) =>
      (selectedBusId && d.bus_id === selectedBusId) ? 2.5 : ((d.missingApc || d.missingFarebox) ? 1.4 : 0.8)

    // Circles
    const pts = g.selectAll<SVGCircleElement, RowD>('circle.dot').data(rows, (d: any) => d.bus_id)
    const merged = pts.join(
      enter => enter.append('circle')
        .attr('class', 'dot')
        .attr('cx', d => X(d.xPlot))
        .attr('cy', d => Y(d.yPlot))
        .attr('r', 0)
        .attr('fill', d => getSymmetricFill(d, X.domain()[1], Y.domain()[1], rows))
        .attr('stroke', '#000')
        .attr('fill-opacity', d => selectedAwareOpacity(d))
        .attr('stroke-opacity', d => selectedAwareStrokeOpacity(d))
        .attr('filter', d => selectedAwareFilter(d))
        .attr('stroke-width', d => highlightedStrokeWidth(d))
        .style('cursor', mode === 'monthly' ? 'pointer' : 'default')
        .call(enter => enter.transition().duration(transitionMs).attr('r', d => R(d.sizeMetric))),
      update => update.call(u => u.transition().duration(transitionMs)
        .attr('cx', d => X(d.xPlot))
        .attr('cy', d => Y(d.yPlot))
        .attr('r', d => R(d.sizeMetric))
        .attr('fill', d => getSymmetricFill(d, X.domain()[1], Y.domain()[1], rows))
        .attr('fill-opacity', d => selectedAwareOpacity(d))
        .attr('stroke-opacity', d => selectedAwareStrokeOpacity(d))
        .attr('filter', d => selectedAwareFilter(d))
        .attr('stroke', '#000')
        .attr('stroke-width', d => highlightedStrokeWidth(d))
        .style('cursor', mode === 'monthly' ? 'pointer' : 'default')),
      exit => exit.call(x => x.transition().duration(150).attr('r', 0).remove())
    ) as d3.Selection<SVGCircleElement, RowD, SVGGElement, unknown>

    // Labels (bus_id above each circle)
    const labelOpacity = (d: RowD) => (selectedBusId && d.bus_id !== selectedBusId) ? 0.25 : 0.9
    const labels = g.selectAll<SVGTextElement, RowD>('text.label').data(rows, (d: any) => d.bus_id)
    labels.join(
      enter => enter.append('text')
        .attr('class', 'label')
        .attr('x', d => X(d.xPlot))
        .attr('y', d => Y(d.yPlot) - (R(d.sizeMetric) + 4))
        .attr('text-anchor', 'middle')
        .attr('font-size', 10)
        .attr('fill', '#111827')
        .attr('opacity', d => labelOpacity(d))
        .text(d => d.bus_id)
        .style('pointer-events', 'none'),
      update => update.call(u => u.transition().duration(transitionMs)
        .attr('x', d => X(d.xPlot))
        .attr('y', d => Y(d.yPlot) - (R(d.sizeMetric) + 4))
        .attr('opacity', d => labelOpacity(d))
        .text(d => d.bus_id)),
      exit => exit.remove()
    )

    // Interactions
    merged
      .on('mouseenter', function (event, d) {
        const busId = d.bus_id
        merged.interrupt().transition().duration(Math.min(150, transitionMs))
          .attr('fill-opacity', p => (p.bus_id === busId ? 0.9 : 0.08))
          .attr('stroke-opacity', p => (p.bus_id === busId ? 1 : 0.25))
          .attr('stroke-width', p => (p.bus_id === busId ? 2.5 : highlightedStrokeWidth(p)))
          .attr('filter', p => (p.bus_id === busId ? 'url(#glow-yellow)' : selectedAwareFilter(p)))

        labels.interrupt().transition().duration(Math.min(150, transitionMs))
          .attr('opacity', p => (p.bus_id === busId ? 1 : 0.25))
      })
      .on('mousemove', function (event, d) {
        const pDiffPct = (pctDiff(d.xPlot, d.yPlot) * 100).toFixed(1)
        const direction = d.yPlot >= d.xPlot ? 'APC > Farebox' : 'Farebox > APC'
        const html = mode === 'daily'
          ? `<div><b>Bus ${d.bus_id}</b> — ${d.service_day}</div>
             <div>Farebox: ${d.farebox ?? '—'}</div>
             <div>APC: ${d.apc ?? '—'}</div>
             <div>Percent Δ (sym.): ${pDiffPct}%</div>
             <div style='opacity:.85'>${direction}</div>`
          : `<div><b>Bus ${d.bus_id}</b> — Monthly Totals</div>
             <div>Farebox Σ: ${d.farebox}</div>
             <div>APC Σ: ${d.apc}</div>
             <div>Percent Δ (sym.): ${pDiffPct}%</div>
             <div style='opacity:.85'>${direction}</div>
             <div style='opacity:.8'>Click to drill into daily timeline</div>`
        d3.select(tooltipRef.current)
          .html(html)
          .style('left', (event.offsetX + 18) + 'px')
          .style('top', (event.offsetY + 18) + 'px')
          .style('display', 'block')
      })
      .on('mouseleave', function () {
        merged.interrupt().transition().duration(Math.min(150, transitionMs))
          .attr('fill-opacity', d => selectedAwareOpacity(d))
          .attr('stroke-opacity', d => selectedAwareStrokeOpacity(d))
          .attr('stroke-width', d => highlightedStrokeWidth(d))
          .attr('filter', d => selectedAwareFilter(d))

        labels.interrupt().transition().duration(Math.min(150, transitionMs))
          .attr('opacity', d => labelOpacity(d))

        d3.select(tooltipRef.current).style('display', 'none')
      })
      .on('click', (_, d) => {
        if (mode === 'monthly' && onBusClick) onBusClick(d.bus_id)
      })

    // -------- Daily stats panel (top-right) --------
    if (mode === 'daily') {
      const valid = rows.filter(d => d.xPlot > 0 && d.yPlot > 0)
      const total = rows.length
      const within = valid.filter(d => pctDiff(d.xPlot, d.yPlot) <= 0.25).length
      const outside = valid.length - within

      const panelW = 260
      const panelH = 72
      const pad = 10

      const statsG = g.selectAll<SVGGElement, any>('g.day-stats')
        .data([ { total, within, outside } ])
        .join('g')
        .attr('class', 'day-stats')
        .attr('transform', `translate(${plotW - panelW - 4}, ${8})`)

      statsG.selectAll('rect.bg').data([null]).join('rect')
        .attr('class', 'bg')
        .attr('x', 0).attr('y', 0)
        .attr('rx', 8).attr('ry', 8)
        .attr('width', panelW).attr('height', panelH)
        .attr('fill', '#ffffff')
        .attr('fill-opacity', 0.92)
        .attr('stroke', '#e5e7eb')

      const lines = [
        `Buses (reported): ${total}`,
        `Within 25%: ${within}`,
        `Outside 25%: ${outside}`,
      ]
      const textSel = statsG.selectAll<SVGTextElement, string>('text.item').data(lines)
      textSel.join(
        enter => enter.append('text')
          .attr('class', 'item')
          .attr('x', pad)
          .attr('y', (_, i) => pad + 16 + i * 18)
          .attr('font-size', 12)
          .attr('fill', '#111827')
          .text(d => d),
        update => update
          .attr('x', pad)
          .attr('y', (_, i) => pad + 16 + i * 18)
          .text(d => d),
        exit => exit.remove()
      )
    } else {
      g.selectAll('g.day-stats').remove()
    }

    // -------- Legend (unchanged) --------
    const legendW = 300
    const legendH = 14
    const legendX = (width - legendW) / 2
    const legendY = height - 44

    const legend = svg.selectAll<SVGGElement, unknown>('g.legend')
      .data([null]).join('g')
      .attr('class','legend')
      .attr('transform', `translate(${legendX}, ${legendY})`)

    legend.selectAll('rect.leftBar').data([null]).join('rect')
      .attr('class','leftBar')
      .attr('x', 0).attr('y', 0)
      .attr('width', legendW/2).attr('height', legendH)
      .style('fill', 'url(#legend-blue)')
      .attr('stroke', '#111827').attr('stroke-width', 0.4).attr('rx', 2)

    legend.selectAll('rect.rightBar').data([null]).join('rect')
      .attr('class','rightBar')
      .attr('x', legendW/2).attr('y', 0)
      .attr('width', legendW/2).attr('height', legendH)
      .style('fill', 'url(#legend-red)')
      .attr('stroke', '#111827').attr('stroke-width', 0.4).attr('rx', 2)

    const divergeScale = d3.scaleLinear().domain([-200, 200]).range([0, legendW])
    const tickVals = [-200, -100, -50, 0, 50, 100, 200]
    const axis = d3.axisBottom(divergeScale).tickValues(tickVals).tickFormat(d => `${Math.abs(+d as number)}%`)
    legend.selectAll('g.axis').data([null]).join('g')
      .attr('class','axis').attr('transform', `translate(0, ${legendH})`).call(axis as any)

    legend.selectAll('text.legend-label').data([null]).join('text')
      .attr('class','legend-label')
      .attr('x', legendW/2).attr('y', legendH + 28)
      .attr('text-anchor','middle')
      .attr('font-size',12).attr('fill','#111827')
      .text('Percent Δ (symmetric) — 0% at center, fades to white by 200%')

    legend.selectAll('text.left-cap').data([null]).join('text')
      .attr('class','left-cap')
      .attr('x', 0).attr('y', -6)
      .attr('text-anchor','start')
      .attr('font-size',10).attr('fill','#111827')
      .text('APC > Farebox (blue)')

    legend.selectAll('text.right-cap').data([null]).join('text')
      .attr('class','right-cap')
      .attr('x', legendW).attr('y', -6)
      .attr('text-anchor','end')
      .attr('font-size',10).attr('fill','#111827')
      .text('Farebox > APC (red)')

  }, [
    currentDay, mode, selectedBusId,
    dataByDay, monthlyAgg,
    dailyExtents, monthlyExtents,
    width, height, plotW, plotH, transitionMs
  ])

  return (
    <div className="chart-wrap">
      <svg ref={svgRef} width={width} height={height} />
      <div ref={tooltipRef} className="tooltip" />
    </div>
  )
}
