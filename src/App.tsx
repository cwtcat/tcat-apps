import React, { useMemo, useState, useEffect, useCallback } from 'react'
import Papa from 'papaparse'
import RidershipGapminder, { DataRow, Mode } from './components/RidershipGapminder'
import BusDrilldown from './components/BusDrilldown'
import './styles.css'

type View = 'main' | 'drill'

function normalizeDateLike(s: string): string | null {
  if (!s) return null
  const isoLike = /^\d{4}-\d{2}-\d{2}$/.test(s.trim())
  if (isoLike) return s.trim()
  const d = new Date(s)
  if (isNaN(+d)) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseNumOrNull(v: any): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'na' || s === '-') return null
  const n = Number(s.replace(/,/g, ''))
  return isFinite(n) ? n : null
}

// If your CSV uses different header names, tweak this mapping.
const HEADER_MAP = {
  service_day: ['service_day', 'date', 'service date', 'service_day_yyyy_mm_dd'],
  bus_id: ['bus_id', 'bus', 'vehicle', 'vehicle_id'],
  farebox: ['farebox', 'farebox_count', 'farebox_total'],
  apc: ['apc', 'apc_count', 'apc_total'],
}

function mapHeader(obj: Record<string, any>, key: keyof typeof HEADER_MAP) {
  for (const k of HEADER_MAP[key]) {
    const hit = Object.keys(obj).find(h => h.toLowerCase().trim() === k.toLowerCase())
    if (hit) return obj[hit]
  }
  return undefined
}

// Base-URL aware logo URL (works in dev and when deployed under a subpath)
const baseUrl =
  (import.meta as any)?.env?.BASE_URL ??
  (process as any)?.env?.PUBLIC_URL ??
  '/'

const logoUrl = new URL('tcat_logo.jpg', baseUrl).toString()

export default function App() {
  // Data state
  const [rawRows, setRawRows] = useState<DataRow[]>([])
  const [days, setDays] = useState<string[]>([])
  const [mode, setMode] = useState<Mode>('daily')
  const [view, setView] = useState<View>('main')
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null)

  // Drilldown
  const [drillBusId, setDrillBusId] = useState<string | null>(null)

  // Slider state (index into "days")
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)

  // Date range state (min/max from the loaded CSV)
  const allDates = useMemo(() => Array.from(new Set(rawRows.map(r => r.service_day))).sort(), [rawRows])
  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)

  // Recompute filtered rows + derived days whenever inputs change
  const filteredRows = useMemo(() => {
    if (!startDate || !endDate) return rawRows
    return rawRows.filter(r => r.service_day >= startDate && r.service_day <= endDate)
  }, [rawRows, startDate, endDate])

  useEffect(() => {
    const uniqueDays = Array.from(new Set(filteredRows.map(r => r.service_day))).sort()
    setDays(uniqueDays)
    setI(0) // reset slider
  }, [filteredRows])

  // Autoplay only in daily + main view (4s per day)
  useEffect(() => {
    if (!playing || mode !== 'daily' || view !== 'main' || days.length === 0) return
    const id = setInterval(() => setI(v => (v + 1) % days.length), 4000)
    return () => clearInterval(id)
  }, [playing, days.length, mode, view, days])

  const currentDay = days[i] ?? ''

  // Bus options from filtered rows
  const busOptions = useMemo(
    () => Array.from(new Set(filteredRows.map(r => r.bus_id))).sort((a,b)=>a.localeCompare(b)),
    [filteredRows]
  )

  // CSV loader
  const onPickCsv = useCallback((file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (res) => {
        const out: DataRow[] = []
        for (const row of res.data as any[]) {
          const sd = mapHeader(row, 'service_day')
          const bid = mapHeader(row, 'bus_id')
          const fx = mapHeader(row, 'farebox')
          const ax = mapHeader(row, 'apc')

          const service_day = normalizeDateLike(String(sd ?? ''))
          const bus_id = (bid ?? '').toString().trim()
          if (!service_day || !bus_id) continue

          out.push({
            service_day,
            bus_id,
            farebox: parseNumOrNull(fx),
            apc: parseNumOrNull(ax),
          })
        }
        out.sort((a,b) => a.service_day.localeCompare(b.service_day) || a.bus_id.localeCompare(b.bus_id))
        setRawRows(out)

        const uniqueDates = Array.from(new Set(out.map(r => r.service_day))).sort()
        setStartDate(uniqueDates[0] ?? null)
        setEndDate(uniqueDates[uniqueDates.length - 1] ?? null)

        setView('main')
        setMode('daily')
        setSelectedBusId(null)
        setDrillBusId(null)
        setI(0)
      },
      error: (err) => {
        console.error('CSV parse error', err)
        alert('Failed to parse CSV. See console for details.')
      }
    })
  }, [])

  // Clicking a monthly bubble opens drilldown
  const handleBusClick = (busId: string) => {
    if (mode !== 'monthly') return
    setDrillBusId(busId)
    setView('drill')
  }

  const handleBack = () => setView('main')

  // Helper: when user changes start/end ensure start<=end
  const setStart = (v: string) => {
    if (endDate && v > endDate) setEndDate(v)
    setStartDate(v)
  }
  const setEnd = (v: string) => {
    if (startDate && v < startDate) setStartDate(v)
    setEndDate(v)
  }

  return (
    <div className="page">
      {/* ======= TOP TOOLBAR ======= */}
      <header className="toolbar">
        {/* LEFT: agency/logo JPG */}
        <div className="left">
          <img src={logoUrl} alt="Agency Logo" className="logo" />
        </div>

        {/* CENTER: all your existing controls (except Load CSV) */}
        <div className="center">
          <div className="controls" style={{ gap: 8 }}>
            {/* Date range (enabled once data loaded) */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: rawRows.length ? 1 : 0.5 }}>
              <label style={{ fontSize: 14, color: '#374151' }}>From:&nbsp;
                <input
                  type="date"
                  value={startDate ?? ''}
                  min={allDates[0] ?? ''}
                  max={endDate ?? allDates[allDates.length - 1] ?? ''}
                  onChange={e => setStart(e.target.value)}
                  disabled={!rawRows.length}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb' }}
                />
              </label>
              <label style={{ fontSize: 14, color: '#374151' }}>To:&nbsp;
                <input
                  type="date"
                  value={endDate ?? ''}
                  min={startDate ?? allDates[0] ?? ''}
                  max={allDates[allDates.length - 1] ?? ''}
                  onChange={e => setEnd(e.target.value)}
                  disabled={!rawRows.length}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb' }}
                />
              </label>
            </div>

            {view === 'main' ? (
              <>
                <button
                  className="btn"
                  onClick={() => setMode(m => m === 'daily' ? 'monthly' : 'daily')}
                  disabled={!filteredRows.length}
                >
                  {mode === 'daily' ? 'Switch to Monthly' : 'Switch to Daily'}
                </button>

                {/* Bus selector */}
                <label style={{ fontSize: 14, color: '#374151' }}>
                  Bus:&nbsp;
                  <select
                    value={selectedBusId ?? ''}
                    onChange={e => setSelectedBusId(e.target.value || null)}
                    disabled={!filteredRows.length}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb' }}
                  >
                    <option value="">All buses</option>
                    {busOptions.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </label>

                {mode === 'daily' && (
                  <>
                    <button className="btn" onClick={() => setPlaying(p => !p)} disabled={!days.length}>
                      {playing ? 'Pause' : 'Play'}
                    </button>
                    <input
                      className="slider"
                      type="range"
                      min={0}
                      max={Math.max(0, days.length - 1)}
                      value={Math.min(i, Math.max(0, days.length - 1))}
                      onChange={e => setI(parseInt(e.target.value,10))}
                      disabled={!days.length}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <button className="btn" onClick={handleBack}>← Back</button>
                <div className="day-label">Bus {drillBusId} — daily view (drilldown)</div>
              </>
            )}
          </div>
        </div>

        {/* RIGHT: Load CSV button (moved here) */}
        <div className="right">
          <label className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            Load CSV
            <input
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) onPickCsv(f)
                e.currentTarget.value = '' // allow re-upload of same file
              }}
            />
          </label>
        </div>
      </header>

      {/* ======= BODY ======= */}
      {rawRows.length === 0 ? (
        <div style={{ padding: 24, color: '#6b7280' }}>
          Load a CSV to begin. Expected columns: <code>service_day</code>, <code>bus_id</code>, <code>farebox</code>, <code>apc</code>.
        </div>
      ) : view === 'main' ? (
        <RidershipGapminder
          data={filteredRows}
          days={days}
          currentDay={currentDay}
          mode={mode}
          selectedBusId={selectedBusId}
          onBusClick={handleBusClick}
          width={1100}
          height={720}
        />
      ) : (
        <BusDrilldown
          data={filteredRows}
          busId={drillBusId!}
          width={1100}
          height={720}
        />
      )}

      <footer className="footer">
        {view === 'main'
          ? (mode === 'daily'
              ? 'Daily mode — slider shows one day at a time. Click Monthly for aggregates.'
              : 'Monthly mode — click a bus bubble to drill into that bus’s daily timeline.')
          : 'Drilldown — viewing one bus across the selected date range. Use Back to return.'}
      </footer>
    </div>
  )
}
