import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'

export type DataRow = {
  service_day: string
  bus_id: string
  apc: number | null
  farebox: number | null
}

type Props = {
  data: DataRow[]
  busId: string
  width?: number
  height?: number
  transitionMs?: number
  /** Directory prefix for PNGs, e.g. "/day_charts/". Must include trailing slash or desired delimiter. */
  pngDir?: string
}

const MARGIN = { top: 28, right: 24, bottom: 56, left: 72 }

// --- Symmetric percent-diff color model (range-based; NO axis whitening) ---
const HUE_RED  = '#d64d4dff'
const HUE_BLUE = '#2563eb'
const INTENSITY_FLOOR = 0.14
const INTENSITY_BOOST = 1.10
const GAMMA_RANGE = 0.85

const USE_QUANTILES = false
const QMIN = 0.00
const QMAX = 1.00

// Percent difference relative to the mean of the two values
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
  d: T,
  _xDomMax: number,
  _yDomMax: number,
  rowsForNorm: T[]
) {
  if (d.xPlot <= 0 || d.yPlot <= 0) return '#ffffff'
  const hue = (d.yPlot - d.xPlot) >= 0 ? HUE_BLUE : HUE_RED
  const { pMin, pMax } = computePctDiffRange(rowsForNorm)
  const p = pctDiff(d.xPlot, d.yPlot)
  let intensity = centralityFromRange(p, pMin, pMax)
  intensity = INTENSITY_FLOOR + (1 - INTENSITY_FLOOR) * Math.min(1, intensity * INTENSITY_BOOST)
  return mixTo(hue, intensity)
}

// Format "YYYY-MM-DD" -> "YYMMDD" (e.g., 2025-08-04 → 250804)
function toDateId(iso: string) {
  if (!iso || iso.length < 10) return ''
  const y = iso.slice(2, 4)
  const m = iso.slice(5, 7)
  const d = iso.slice(8, 10)
  return `${y}${m}${d}`
}

export default function BusDrilldown({
  data,
  busId,
  width = 1100,
  height = 720,
  transitionMs = 1500,
  pngDir = '/day_charts/',
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  // --- Lightbox state for clicked PNG (and image load/error) ---
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  const closePreview = () => {
    setPreviewUrl(null)
    setImgLoaded(false)
    setImgError(false)
  }

  // Prevent page scroll while lightbox is open; add Esc-to-close
  useEffect(() => {
    if (previewUrl) {
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePreview() }
      const orig = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onKey)
      return () => {
        document.body.style.overflow = orig
        window.removeEventListener('keydown', onKey)
      }
    }
  }, [previewUrl])

  const rowsSrc = useMemo(() => {
    const r = data.filter(d => d.bus_id === busId)
      .slice()
      .sort((a,b) => (a.service_day < b.service_day ? -1 : a.service_day > b.service_day ? 1 : 0))
    return r
  }, [data, busId])

  // derive & extents for this bus only
  type RowD = DataRow & {
    xPlot: number; yPlot: number; sizeMetric: number; relDelta: number;
    missingApc: boolean; missingFarebox: boolean;
  }

  const derived = useMemo<RowD[]>(() => {
    return rowsSrc.map(d => {
      const missingFarebox = d.farebox == null
      const missingApc = d.apc == null
      const xVal = missingFarebox ? 0 : d.farebox!
      const yVal = missingApc ? 0 : d.apc!
      const rel = d.farebox && d.farebox > 0 && d.apc != null ? (d.apc - d.farebox) / d.farebox : 0
      const size = Math.max(d.apc ?? 0, d.farebox ?? 0)
      return { ...d, xPlot: xVal, yPlot: yVal, sizeMetric: size, relDelta: Math.max(-0.2, Math.min(0.2, rel)), missingApc, missingFarebox }
    })
  }, [rowsSrc])

  const extents = useMemo(() => {
    let fxMax = 1, axMax = 1, volMax = 1
    for (const d of derived) {
      fxMax = Math.max(fxMax, d.xPlot)
      axMax = Math.max(axMax, d.yPlot)
      volMax = Math.max(volMax, d.sizeMetric)
    }
    fxMax = Math.ceil(fxMax * 1.05)
    axMax = Math.ceil(axMax * 1.05)
    return { xDomain: [0, fxMax] as [number, number], yDomain: [0, axMax] as [number, number], sizeDomain: [0, volMax] as [number, number] }
  }, [derived])

  const plotW = width - MARGIN.left - MARGIN.right
  const plotH = height - MARGIN.top - MARGIN.bottom

  const x = d3.scaleLinear().domain(extents.xDomain).range([0, plotW])
  const y = d3.scaleLinear().domain(extents.yDomain).range([plotH, 0])
  const r = d3.scaleSqrt().domain(extents.sizeDomain).range([4, 22])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    // yellow glow (reuse filter id)
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

    const g = svg.selectAll<SVGGElement, unknown>('g.root')
      .data([null])
      .join('g')
      .attr('class', 'root')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    // axes
    g.selectAll('g.x-axis').data([null]).join('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${plotH})`)
      .call(d3.axisBottom(x).ticks(8).tickSizeOuter(0))
    g.selectAll('g.y-axis').data([null]).join('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(y).ticks(8).tickSizeOuter(0))

    // labels
    g.selectAll('text.x-label').data([null]).join('text')
      .attr('class', 'x-label')
      .attr('x', plotW/2).attr('y', plotH + 44).attr('text-anchor', 'middle')
      .text(`Farebox — Bus ${busId}`)
    g.selectAll('text.y-label').data([null]).join('text')
      .attr('class', 'y-label')
      .attr('transform', `translate(${-56},${plotH/2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('APC')

    // diagonal
    const diagMax = Math.max(x.domain()[1], y.domain()[1])
    g.selectAll('line.diagonal').data([null]).join('line')
      .attr('class', 'diagonal')
      .attr('x1', x(0)).attr('y1', y(0))
      .attr('x2', x(diagMax)).attr('y2', y(diagMax))
      .attr('stroke', '#9ca3af').attr('stroke-dasharray', '6 4').attr('stroke-width', 1.5)

    // tooltip
    let tooltip = d3.select(tooltipRef.current)
    if (tooltip.empty()) {
      tooltip = d3.select('.chart-wrap').append('div').attr('class', 'tooltip')
    }

    // dots per day
    const pts = g.selectAll<SVGCircleElement, RowD>('circle.dot')
      .data(derived, (d: any) => d.service_day)

    const merged = pts.join(
      enter => enter.append('circle')
        .attr('class', 'dot')
        .attr('cx', d => x(d.xPlot))
        .attr('cy', d => y(d.yPlot))
        .attr('r', 0)
        .attr('fill', d => getSymmetricFill(d, x.domain()[1], y.domain()[1], derived))
        .attr('stroke', '#000')
        .attr('fill-opacity', d => (d.missingApc || d.missingFarebox) ? 0.25 : 0.9)
        .attr('stroke-width', d => (d.missingApc || d.missingFarebox) ? 1.4 : 0.8)
        .style('cursor', 'zoom-in')
        .call(enter => enter.transition().duration(transitionMs).attr('r', d => Math.max(3, r(d.sizeMetric))))
    ) as d3.Selection<SVGCircleElement, RowD, SVGGElement, unknown>

    // ---- Labels above each daily circle (MM-DD) ----
    const fmt = (s: string) => (s && s.length >= 10 ? s.slice(5) : s)
    const labels = g.selectAll<SVGTextElement, RowD>('text.label')
      .data(derived, (d: any) => d.service_day)

    labels.join(
      enter => enter.append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.xPlot))
        .attr('y', d => y(d.yPlot) - (Math.max(3, r(d.sizeMetric)) + 4))
        .attr('text-anchor', 'middle')
        .attr('font-size', 10)
        .attr('fill', '#111827')
        .attr('opacity', d => (d.missingApc || d.missingFarebox) ? 0.6 : 0.95)
        .text(d => fmt(d.service_day))
        .style('pointer-events', 'none'),
      update => update.call(u => u.transition().duration(transitionMs)
        .attr('x', d => x(d.xPlot))
        .attr('y', d => y(d.yPlot) - (Math.max(3, r(d.sizeMetric)) + 4))
        .attr('opacity', d => (d.missingApc || d.missingFarebox) ? 0.6 : 0.95)
        .text(d => fmt(d.service_day))
      ),
      exit => exit.remove()
    )

    // interactions
    merged
      .on('mouseenter', function (event, d) {
        d3.select(this as SVGCircleElement)
          .attr('filter', 'url(#glow-yellow)')
          .attr('stroke-width', 2.5)
        const pDiffPct = (pctDiff(d.xPlot, d.yPlot) * 100).toFixed(1)
        const direction = d.yPlot >= d.xPlot ? 'APC > Farebox' : 'Farebox > APC'
        const html = `<div><b>Bus ${busId}</b> — ${d.service_day}</div>
            <div>Farebox: ${d.farebox ?? '—'}</div>
            <div>APC: ${d.apc ?? '—'}</div>
            <div>Percent Δ (sym.): ${pDiffPct}%</div>
            <div style='opacity:.85'>${direction}</div>`
        tooltip.html(html)
          .style('left', (event.offsetX + 18) + 'px')
          .style('top', (event.offsetY + 18) + 'px')
          .style('display', 'block')
      })
      .on('mouseleave', function (_, d) {
        d3.select(this as SVGCircleElement)
          .attr('filter', null)
          .attr('stroke-width', (d.missingApc || d.missingFarebox) ? 1.4 : 0.8)
        tooltip.style('display', 'none')
      })
      .on('click', (_, d) => {
        // Build image URL: "{pngDir}{YYMMDD}_{bus}_chart.png"
        const dateId = toDateId(d.service_day)
        if (!dateId) return
        const url = `${pngDir}${dateId}_${busId}_chart.png`

        // reset preview state and open
        setImgLoaded(false)
        setImgError(false)
        setPreviewUrl(url)

        // hide tooltip when opening
        d3.select(tooltipRef.current).style('display', 'none')
      })

  }, [derived, extents, width, height, busId, transitionMs, pngDir])

  return (
    <div className="chart-wrap" style={{ position: 'relative' }}>
      <svg ref={svgRef} width={width} height={height} />
      <div ref={tooltipRef} className="tooltip" />

      {/* --- Lightbox overlay for clicked PNG --- */}
      {previewUrl && (
        <div
          aria-modal
          role="dialog"
          onClick={closePreview}   // clicking backdrop closes
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()} // prevent backdrop close when clicking panel
            style={{
              position: 'relative',
              background: '#111827',
              padding: 12,
              borderRadius: 12,
              maxWidth: '92vw',
              maxHeight: '88vh',
              boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'center',   // center content & button
              justifyContent: 'center',
              minWidth: 320,
              minHeight: 200
            }}
          >
            {/* Image element: hidden until it loads; clicking image closes */}
            {!imgError && (
              <img
                src={previewUrl}
                alt="Daily bus chart"
                onLoad={() => setImgLoaded(true)}
                onError={() => { setImgLoaded(false); setImgError(true) }}
                onClick={closePreview}
                style={{
                  maxWidth: '88vw',
                  maxHeight: '76vh',
                  objectFit: 'contain',
                  borderRadius: 8,
                  background: '#fff',
                  cursor: 'zoom-out',
                  display: imgLoaded ? 'block' : 'none' // no broken icon / no flash
                }}
              />
            )}

            {/* Message when image fails to load */}
            {imgError && (
              <div
                onClick={closePreview}
                style={{
                  color: '#f9fafb',
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  cursor: 'pointer',
                  userSelect: 'none',
                  textAlign: 'center'
                }}
              >
                NO DATA AVAILABLE
              </div>
            )}

            {/* Centered Exit button */}
            <button
              onClick={closePreview}
              className="btn"
              style={{
                alignSelf: 'center',
                background: '#f3f4f6',
                color: '#111827',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                minWidth: 88
              }}
            >
              Exit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
