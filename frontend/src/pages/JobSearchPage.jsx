import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SearchIcon, ExternalLinkIcon, CalendarIcon, MapPinIcon, BriefcaseIcon,
  RefreshCwIcon, FileSpreadsheetIcon, WifiIcon, SlidersHorizontalIcon,
  PlusIcon, XIcon, TagIcon, SparklesIcon, AlertCircleIcon,
  CheckCircleIcon, ChevronUpIcon, ChevronDownIcon, FileTextIcon,
  StarIcon, LayoutDashboardIcon, BookmarkIcon, ArrowRightIcon,
} from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import LocationMapPicker    from '../components/LocationMapPicker'
import LocationAutocomplete from '../components/LocationAutocomplete'
import {
  PRESET_CATEGORIES, DATE_RANGES, WORK_TYPE_OPTIONS, RADIUS_STEPS,
  STATUS_MAP, SEARCH_POLL_INTERVAL_MS, workTypesToRemote,
} from '../constants/jobSearch'
import { API_ENDPOINTS } from '../constants/api'

// ── Score badge ────────────────────────────────────────────────────────────────
function ScoreBadge({ score }) {
  const cfg =
    score >= 80 ? { bg: 'bg-green-100',  text: 'text-green-700',  ring: 'ring-green-300'  } :
    score >= 60 ? { bg: 'bg-blue-100',   text: 'text-blue-700',   ring: 'ring-blue-300'   } :
    score >= 40 ? { bg: 'bg-amber-100',  text: 'text-amber-700',  ring: 'ring-amber-300'  } :
                  { bg: 'bg-red-100',    text: 'text-red-600',    ring: 'ring-red-200'    }
  return (
    <div className={`flex flex-col items-center justify-center w-12 h-12 rounded-full
                     ring-2 shrink-0 ${cfg.ring} ${cfg.bg}`}>
      <span className={`text-sm font-bold leading-none ${cfg.text}`}>{score}</span>
      <span className={`text-[9px] font-medium ${cfg.text}`}>/ 100</span>
    </div>
  )
}

// ── Sort button ────────────────────────────────────────────────────────────────
function SortBtn({ label, field, sort, onSort }) {
  const active = sort.field === field
  return (
    <button type="button"
      onClick={() => onSort({ field, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
      className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors
        ${active ? 'bg-brand-100 text-brand-700' : 'text-gray-500 hover:bg-gray-100'}`}>
      {label}
      {active && (sort.dir === 'asc'
        ? <ChevronUpIcon className="w-3 h-3" />
        : <ChevronDownIcon className="w-3 h-3" />)}
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function JobSearchPage() {
  const navigate = useNavigate()

  // search criteria
  const [categories,  setCategories]  = useState([])
  const [customCat,   setCustomCat]   = useState('')
  const [showPresets, setShowPresets] = useState(false)
  const [location,    setLocation]    = useState('')
  const [radius,      setRadius]      = useState(25)
  const [remoteTypes, setRemoteTypes] = useState([])   // [] = any (optional)
  const [dateRange,   setDateRange]   = useState('7')
  const [showMap,     setShowMap]     = useState(false)

  // AI profile
  const [profile,     setProfile]     = useState('')
  const [wishes,      setWishes]      = useState('')
  const [showProfile, setShowProfile] = useState(false)

  // search state
  const [loading,     setLoading]     = useState(false)
  const [jobs,        setJobs]        = useState([])
  const [taskId,      setTaskId]      = useState(null)
  const [taskStatus,  setTaskStatus]  = useState(null)
  const [polling,     setPolling]     = useState(false)
  const [searchError, setSearchError] = useState('')
  const pollRef = useRef(null)

  // AI scoring
  const [scoring,        setScoring]        = useState(false)
  const [scoreError,     setScoreError]     = useState('')
  const [scoreErrorType, setScoreErrorType] = useState('')

  // dashboard
  const [selected, setSelected] = useState(new Set())
  const [sort,     setSort]     = useState({ field: 'score', dir: 'desc' })

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────
  const hasScores = jobs.some(j => j.match_score != null)

  const sortedJobs = [...jobs].sort((a, b) => {
    if (sort.field === 'score') {
      const sa = a.match_score ?? -1, sb = b.match_score ?? -1
      return sort.dir === 'desc' ? sb - sa : sa - sb
    }
    return 0
  })

  // ── Category helpers ──────────────────────────────────────────────────────
  const togglePreset = (cat) => setCategories(p =>
    p.includes(cat) ? p.filter(c => c !== cat) : [...p, cat])
  const addCustom = () => {
    const v = customCat.trim()
    if (v && !categories.includes(v)) setCategories(p => [...p, v])
    setCustomCat('')
  }
  const removeCat = (cat) => setCategories(p => p.filter(c => c !== cat))

  // ── Poll search task ───────────────────────────────────────────────────────
  const pollTask = (id) => {
    setPolling(true)
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(API_ENDPOINTS.JOBS_TASK(id))
        setTaskStatus(data.status)
        if (data.status === 'completed') {
          clearInterval(pollRef.current)
          setPolling(false)
          const results = data.results || []
          const sources = data.sources || {}
          setJobs(results)
          setSelected(new Set())
          if (results.length === 0) {
            const tried = Object.entries(sources)
              .map(([src, n]) => `${src.replace('_', ' ')} (${n})`)
              .join(', ')
            setSearchError(
              `No jobs found. Sources tried: ${tried || 'none'}. ` +
              `Try broader keywords, a wider radius, a longer date range, ` +
              `or check that your location is spelled correctly.`
            )
          } else {
            const srcSummary = Object.entries(sources)
              .filter(([, n]) => n > 0)
              .map(([src, n]) => `${n} from ${src.replace(/_/g, ' ')}`)
              .join(', ')
            toast.success(
              `Found ${results.length} job${results.length !== 1 ? 's' : ''}` +
              (srcSummary ? ` (${srcSummary})` : '') + '!'
            )
            if (profile.trim() || wishes.trim()) runScoring(results)
          }
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current)
          setPolling(false)
          setSearchError(data.error || 'Search failed. Please try again.')
        }
      } catch {
        clearInterval(pollRef.current)
        setPolling(false)
      }
    }, SEARCH_POLL_INTERVAL_MS)
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  const handleSearch = async (e) => {
    e.preventDefault()
    const remoteOnlySelected = remoteTypes.length === 1 && remoteTypes[0] === 'remote'
    if (!location.trim() && !remoteOnlySelected) {
      toast.error('Please enter a location, or select Remote as the only work type')
      return
    }
    setLoading(true)
    setJobs([])
    setSelected(new Set())
    setTaskStatus('pending')
    setSearchError('')
    setScoreError('')
    clearInterval(pollRef.current)
    try {
      const { data } = await api.post(API_ENDPOINTS.JOBS_SEARCH, {
        categories, location, date_range: dateRange, radius,
        remote: workTypesToRemote(remoteTypes),
      })
      setTaskId(data.task_id)
      setTaskStatus('running')
      const catLabel = categories.length
        ? `${categories.length} job type${categories.length > 1 ? 's' : ''}`
        : 'all jobs'
      toast.success(`Scanning Indeed for ${catLabel}…`)
      pollTask(data.task_id)
    } catch (err) {
      toast.error(err.message); setTaskStatus(null)
    } finally {
      setLoading(false)
    }
  }

  // ── AI scoring ─────────────────────────────────────────────────────────────
  const runScoring = async (jobList) => {
    const list = jobList || jobs
    if (!list.length) return
    setScoring(true); setScoreError(''); setScoreErrorType('')
    try {
      const { data } = await api.post(API_ENDPOINTS.JOBS_MATCH, {
        jobs: list, profile: profile.trim(), wishes: wishes.trim(),
      })
      if (data.error) {
        setScoreError(data.error); setScoreErrorType(data.error_type || ''); return
      }
      setJobs(prev => {
        const updated = [...prev]
        for (const r of data.results) {
          if (updated[r.job_index]) {
            updated[r.job_index] = { ...updated[r.job_index], match_score: r.score, match_reason: r.reason }
          }
        }
        return updated
      })
      setSort({ field: 'score', dir: 'desc' })
      toast.success('AI match scores ready!')
    } catch (err) {
      setScoreError(err.response?.data?.detail || err.message)
    } finally {
      setScoring(false)
    }
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  const toggleSelect = (idx) => setSelected(prev => {
    const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n
  })
  const toggleAll = () =>
    setSelected(prev => prev.size === jobs.length ? new Set() : new Set(jobs.map((_, i) => i)))
  const selectGoodMatches = () =>
    setSelected(new Set(jobs.map((j, i) => ({ i, s: j.match_score ?? 0 })).filter(x => x.s >= 60).map(x => x.i)))

  // ── Excel export ───────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!taskId) return
    try {
      const res = await api.get(API_ENDPOINTS.JOBS_EXPORT(taskId), { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `jobs_${Date.now()}.xlsx`; a.click(); URL.revokeObjectURL(url)
      toast.success('Excel downloaded!')
    } catch (err) { toast.error(err.message) }
  }

  // ── Navigate to Resume Generator with saved jobs ───────────────────────────
  const handleGenerateResumes = () => {
    if (!selected.size) { toast.error('Select at least one job first'); return }
    const savedJobs = [...selected].map(i => jobs[i])
    navigate('/generate', { state: { savedJobs, wishes, profile } })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Job Search</h1>
        <p className="mt-1 text-gray-500">
          Search Indeed, score results with AI, save the best matches, and generate tailored resumes.
        </p>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-8 items-start">

        {/* ══════════════ LEFT PANEL ══════════════ */}
        <div className="space-y-4 sticky top-20">

          {/* Search form */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <SearchIcon className="w-4 h-4 text-brand-500" /> Search Criteria
              </h2>
            </div>
            <div className="card-body">
              <form onSubmit={handleSearch} className="space-y-4">

                {/* Job type — optional */}
                <div>
                  <label className="label">
                    <BriefcaseIcon className="inline w-3.5 h-3.5 mr-1" />
                    Job Type
                    <span className="ml-1 text-gray-400 font-normal text-xs">(optional)</span>
                  </label>

                  {categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {categories.map(cat => (
                        <span key={cat}
                          className="inline-flex items-center gap-1 bg-brand-100 text-brand-800
                                     text-xs font-medium px-2.5 py-1 rounded-full">
                          {cat}
                          <button type="button" onClick={() => removeCat(cat)}>
                            <XIcon className="w-3 h-3 hover:text-brand-600" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <button type="button" onClick={() => setShowPresets(s => !s)}
                    className="flex items-center gap-1 text-xs text-brand-600 font-medium hover:text-brand-800 mb-2">
                    <TagIcon className="w-3.5 h-3.5" />
                    {showPresets ? 'Hide presets' : 'Browse job types'}
                  </button>

                  {showPresets && (
                    <div className="flex flex-wrap gap-1.5 mb-2 max-h-36 overflow-y-auto p-2
                                    rounded-xl border border-gray-200 bg-gray-50">
                      {PRESET_CATEGORIES.map(cat => {
                        const sel = categories.includes(cat)
                        return (
                          <button key={cat} type="button" onClick={() => togglePreset(cat)}
                            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all
                              ${sel ? 'bg-brand-600 text-white border-brand-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'}`}>
                            {sel ? '✓ ' : ''}{cat}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input type="text" value={customCat} onChange={e => setCustomCat(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
                      placeholder="Custom job type…" className="input flex-1 text-sm py-2" />
                    <button type="button" onClick={addCustom} disabled={!customCat.trim()}
                      className="btn-secondary px-3 py-2 shrink-0"><PlusIcon className="w-4 h-4" /></button>
                  </div>
                </div>

                {/* Work type — multi-select, optional */}
                <div>
                  <label className="label flex items-center gap-1.5">
                    <WifiIcon className="inline w-3.5 h-3.5" />Work Type
                    <span className="badge badge-blue text-xs font-normal">Optional</span>
                    {remoteTypes.length > 0 && (
                      <button type="button" onClick={() => setRemoteTypes([])}
                        className="ml-auto text-xs text-gray-400 hover:text-gray-600 font-normal">
                        Clear
                      </button>
                    )}
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {WORK_TYPE_OPTIONS.map(opt => {
                      const active = remoteTypes.includes(opt.value)
                      return (
                        <button key={opt.value} type="button"
                          onClick={() => setRemoteTypes(prev =>
                            prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                          )}
                          className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border text-xs font-medium transition-all
                            ${active
                              ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300'}`}>
                          <span className="text-sm">{opt.emoji}</span>
                          {opt.label}
                          {active && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-0.5" />}
                        </button>
                      )
                    })}
                  </div>
                  {remoteTypes.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">No filter — all work types included</p>
                  )}
                </div>

                {/* Location + map picker */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label mb-0">
                      <MapPinIcon className="inline w-3.5 h-3.5 mr-1" />
                      Location
                      {remoteTypes.length === 1 && remoteTypes[0] === 'remote' && <span className="ml-1 text-gray-400 font-normal text-xs">(optional)</span>}
                    </label>
                    <button type="button" onClick={() => setShowMap(s => !s)}
                      className={`text-xs font-medium flex items-center gap-1
                        ${showMap ? 'text-brand-700' : 'text-brand-500 hover:text-brand-700'}`}>
                      🗺 {showMap ? 'Hide map' : 'Pick on map'}
                    </button>
                  </div>

                  {showMap ? (
                    <LocationMapPicker
                      location={location} radius={radius}
                      onLocationChange={setLocation} onRadiusChange={setRadius}
                    />
                  ) : (
                    <>
                      <LocationAutocomplete
                        value={location}
                        onChange={setLocation}
                        onSelect={setLocation}
                        placeholder={remoteTypes.length === 1 && remoteTypes[0] === 'remote' ? 'Optional for remote-only' : 'City, state or zip code'}
                      />
                      {!(remoteTypes.length === 1 && remoteTypes[0] === 'remote') && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span className="flex items-center gap-1"><SlidersHorizontalIcon className="w-3 h-3" />Radius</span>
                            <span className="font-semibold text-brand-600">{radius === 0 ? 'Exact' : `${radius} mi`}</span>
                          </div>
                          <input type="range" min="0" max="6" step="1"
                            value={RADIUS_STEPS.indexOf(radius)}
                            onChange={e => setRadius(RADIUS_STEPS[Number(e.target.value)])}
                            className="w-full accent-brand-600 h-1.5" />
                          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                            <span>Exact</span><span>5</span><span>10</span><span>15</span><span>25</span><span>50</span><span>100mi</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Date range pills */}
                <div>
                  <label className="label"><CalendarIcon className="inline w-3.5 h-3.5 mr-1" />Posted Within</label>
                  <div className="flex flex-wrap gap-1.5">
                    {DATE_RANGES.map(d => (
                      <button key={d.value} type="button" onClick={() => setDateRange(d.value)}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all
                          ${dateRange === d.value
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'}`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="submit" className="btn-primary w-full justify-center py-2.5"
                  disabled={loading || polling}>
                  {loading || polling
                    ? <><RefreshCwIcon className="w-4 h-4 animate-spin" /> Searching…</>
                    : <><SearchIcon className="w-4 h-4" /> Search Jobs</>}
                </button>
              </form>
            </div>
          </div>

          {/* AI Match Profile */}
          <div className="card">
            <button type="button" onClick={() => setShowProfile(s => !s)}
              className="card-header w-full flex items-center justify-between text-left">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-purple-500" />
                AI Match Profile
                <span className="badge badge-blue text-xs">Optional</span>
              </h2>
              {showProfile
                ? <ChevronUpIcon className="w-4 h-4 text-gray-400" />
                : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
            </button>

            {showProfile && (
              <div className="card-body space-y-3">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Add your background and what you're looking for. Claude will score each job
                  (0–100) on how well it matches you, with a specific reason.
                </p>

                <div>
                  <label className="label text-xs">Your Resume / Skills / Experience</label>
                  <textarea value={profile} onChange={e => setProfile(e.target.value)} rows={5}
                    placeholder="Paste your resume text, key skills, years of experience, technologies…"
                    className="input text-sm resize-none w-full" />
                </div>

                <div>
                  <label className="label text-xs flex items-center gap-1">
                    <StarIcon className="w-3 h-3 text-amber-400" />
                    What You're Looking for in Your Next Role
                  </label>
                  <textarea value={wishes} onChange={e => setWishes(e.target.value)} rows={3}
                    placeholder="e.g. Senior IC role at a growth-stage startup, distributed systems focus, collaborative culture, strong work-life balance…"
                    className="input text-sm resize-none w-full" />
                </div>

                {jobs.length > 0 && (
                  <button type="button" onClick={() => runScoring()} disabled={scoring}
                    className="btn-primary w-full justify-center py-2.5 text-sm bg-purple-600 hover:bg-purple-700">
                    {scoring
                      ? <><RefreshCwIcon className="w-4 h-4 animate-spin" />Scoring {jobs.length} jobs…</>
                      : <><SparklesIcon className="w-4 h-4" />Score {jobs.length} Jobs with AI</>}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ══════════════ RIGHT PANEL — Dashboard ══════════════ */}
        <div className="space-y-3 min-w-0">

          {/* Status bar */}
          {taskStatus && (
            <div className="card p-3.5 flex flex-wrap items-center gap-3 justify-between">
              <div className="flex items-center gap-2.5">
                {polling && <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin shrink-0" />}
                <span className={`badge ${STATUS_MAP[taskStatus]?.cls}`}>{STATUS_MAP[taskStatus]?.label}</span>
                <span className="text-sm text-gray-600">
                  {taskStatus === 'running'   ? 'Scanning Indeed…'
                   : taskStatus === 'completed' ? `${jobs.length} result${jobs.length !== 1 ? 's' : ''}`
                   : taskStatus === 'failed'    ? 'Search failed' : ''}
                </span>
                {hasScores && (
                  <span className="text-xs text-purple-600 font-medium flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3" /> AI scored
                  </span>
                )}
              </div>
              {taskStatus === 'completed' && jobs.length > 0 && (
                <button onClick={handleDownload} className="btn-secondary text-xs py-1.5">
                  <FileSpreadsheetIcon className="w-3.5 h-3.5 text-green-600" /> Excel
                </button>
              )}
            </div>
          )}

          {/* Score error banner */}
          {scoreError && (
            <div className={`card p-4 flex items-start gap-3 border
              ${scoreErrorType === 'overloaded' || scoreErrorType === 'rate_limit'
                ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
              <AlertCircleIcon className={`w-5 h-5 shrink-0 mt-0.5
                ${scoreErrorType === 'overloaded' || scoreErrorType === 'rate_limit'
                  ? 'text-amber-500' : 'text-red-500'}`} />
              <div className="flex-1">
                <p className={`text-sm font-semibold mb-0.5
                  ${scoreErrorType === 'overloaded' || scoreErrorType === 'rate_limit'
                    ? 'text-amber-800' : 'text-red-800'}`}>
                  {scoreErrorType === 'overloaded' ? '⚠️ Claude is currently overloaded'
                   : scoreErrorType === 'rate_limit' ? '💳 Claude credit limit reached'
                   : '❌ AI scoring error'}
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">{scoreError}</p>
                {(scoreErrorType === 'overloaded' || scoreErrorType === 'rate_limit') && (
                  <button type="button" onClick={() => runScoring()} disabled={scoring}
                    className="mt-2 text-xs font-medium text-amber-700 underline hover:no-underline">
                    Retry when credits renew
                  </button>
                )}
              </div>
              <button type="button" onClick={() => setScoreError('')}
                className="shrink-0 text-gray-400 hover:text-gray-600">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Search error */}
          {searchError && (
            <div className="card p-4 flex items-start gap-3 border border-amber-200 bg-amber-50">
              <AlertCircleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">{searchError}</p>
            </div>
          )}

          {/* Dashboard toolbar */}
          {jobs.length > 0 && (
            <div className="card p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <LayoutDashboardIcon className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">
                  {selected.size} / {jobs.length} selected
                </span>
                <button type="button" onClick={toggleAll}
                  className="text-xs text-brand-600 hover:underline font-medium">
                  {selected.size === jobs.length ? 'Deselect all' : 'Select all'}
                </button>
                {hasScores && (
                  <button type="button" onClick={selectGoodMatches}
                    className="text-xs text-green-600 hover:underline font-medium flex items-center gap-1">
                    <CheckCircleIcon className="w-3 h-3" /> Good matches (60+)
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400">Sort:</span>
                <SortBtn label="Score" field="score" sort={sort} onSort={setSort} />
                <SortBtn label="Date"  field="date"  sort={sort} onSort={setSort} />

                {!hasScores && !scoring && (
                  <button type="button"
                    onClick={() => { setShowProfile(true); runScoring() }}
                    className="btn-secondary text-xs py-1.5 border-purple-300 text-purple-700 hover:bg-purple-50">
                    <SparklesIcon className="w-3.5 h-3.5" /> Score with AI
                  </button>
                )}

                {selected.size > 0 && (
                  <button type="button" onClick={handleGenerateResumes}
                    className="btn-primary text-xs py-1.5 gap-1.5 bg-green-600 hover:bg-green-700">
                    <BookmarkIcon className="w-3.5 h-3.5" />
                    Generate ({selected.size}) <ArrowRightIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* AI scoring progress */}
          {scoring && (
            <div className="card p-4 flex items-center gap-3 border border-purple-200 bg-purple-50">
              <RefreshCwIcon className="w-5 h-5 text-purple-500 animate-spin shrink-0" />
              <div>
                <p className="text-sm font-semibold text-purple-800">Claude is scoring your jobs…</p>
                <p className="text-xs text-purple-600 mt-0.5">
                  Analysing {jobs.length} jobs against your profile & wishes. This takes 10–30 sec.
                </p>
              </div>
            </div>
          )}

          {/* Job cards */}
          {sortedJobs.map((job) => {
            const originalIdx = jobs.indexOf(job)
            const isSelected  = selected.has(originalIdx)
            const scored      = job.match_score != null

            return (
              <label key={originalIdx}
                className={`card block cursor-pointer transition-all hover:shadow-md
                  ${isSelected ? 'ring-2 ring-brand-500 shadow-md' : ''}`}>
                <div className="card-body">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={isSelected}
                      onChange={() => toggleSelect(originalIdx)}
                      onClick={e => e.stopPropagation()}
                      className="mt-1.5 w-4 h-4 accent-brand-600 shrink-0" />

                    {scored && <ScoreBadge score={job.match_score} />}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-gray-900 text-sm">{job.title}</h3>
                            {job.search_category && (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                                {job.search_category}
                              </span>
                            )}
                          </div>
                          <p className="text-brand-600 font-medium text-sm mt-0.5">{job.company}</p>
                          <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                              <MapPinIcon className="w-3 h-3" />{job.location}
                              {job.location?.toLowerCase().includes('remote') && (
                                <span className="badge badge-blue ml-1">Remote</span>
                              )}
                            </span>
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="w-3 h-3" />{job.posted_date}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5 shrink-0">
                          {job.job_url && (
                            <a href={job.job_url} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="btn-primary text-xs py-1 px-2.5 gap-1">
                              View <ExternalLinkIcon className="w-3 h-3" />
                            </a>
                          )}
                          {job.company_url && (
                            <a href={job.company_url} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="btn-secondary text-xs py-1 px-2.5">
                              Co. <ExternalLinkIcon className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* AI match reason */}
                      {scored && job.match_reason && (
                        <div className={`mt-2 px-2.5 py-1.5 rounded-lg text-xs leading-relaxed border
                          ${job.match_score >= 60
                            ? 'bg-green-50 border-green-100 text-green-800'
                            : 'bg-gray-50 border-gray-100 text-gray-600'}`}>
                          <SparklesIcon className="w-3 h-3 inline mr-1 opacity-60" />
                          {job.match_reason}
                        </div>
                      )}

                      {/* Description snippet (when not yet scored) */}
                      {!scored && job.description && (
                        <p className="mt-2 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                          {job.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </label>
            )
          })}

          {/* Sticky "Generate" footer */}
          {selected.size > 0 && (
            <div className="sticky bottom-4 card p-3 bg-white/95 backdrop-blur border border-brand-200
                            shadow-lg flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BookmarkIcon className="w-4 h-4 text-brand-500" />
                <span className="text-sm font-semibold text-gray-800">
                  {selected.size} job{selected.size !== 1 ? 's' : ''} saved
                </span>
              </div>
              <button onClick={handleGenerateResumes} className="btn-primary py-2 px-5 gap-2 text-sm">
                <FileTextIcon className="w-4 h-4" />
                Generate Tailored Resumes
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Empty state */}
          {!taskStatus && jobs.length === 0 && (
            <div className="card p-16 text-center">
              <SearchIcon className="w-12 h-12 mx-auto mb-4 text-gray-200" />
              <p className="font-medium text-gray-500">Ready to search</p>
              <p className="text-sm mt-1 text-gray-400 max-w-xs mx-auto">
                Configure criteria on the left and click <strong>Search Jobs</strong>.
                Job type is optional — leave it blank to search broadly by location.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
