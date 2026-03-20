/**
 * Resume Generator — 3-step wizard
 *
 * Step 1: Upload resume + optional skills/keywords + pick output folder
 * Step 2: Search for jobs (category, location, radius, remote, date range)
 *         → results shown as selectable cards
 * Step 3: Generate resumes & cover letters for selected jobs
 *         → per-job progress → download Excel tracker
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useLocation as useRouterLocation } from 'react-router-dom'
import {
  UploadCloudIcon, FileTextIcon, TrashIcon, TagIcon,
  SearchIcon, MapPinIcon, BriefcaseIcon, CalendarIcon,
  WifiIcon, SlidersHorizontalIcon, RefreshCwIcon,
  SparklesIcon, CheckCircleIcon, XCircleIcon, ClockIcon,
  DownloadIcon, FileSpreadsheetIcon, FolderOpenIcon,
  ChevronRightIcon, CheckIcon, Loader2Icon, PlusIcon, XIcon,
  StarIcon, BookmarkIcon, TableIcon, AlertCircleIcon,
  ClipboardListIcon, ChevronDownIcon, ChevronUpIcon,
} from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import FolderPicker           from '../components/FolderPicker'
import LocationAutocomplete  from '../components/LocationAutocomplete'
import {
  PRESET_CATEGORIES, DATE_RANGES, WORK_TYPE_OPTIONS, RADIUS_STEPS,
  SEARCH_POLL_INTERVAL_MS, workTypesToRemote,
} from '../constants/jobSearch'
import { API_ENDPOINTS } from '../constants/api'
import {
  RESUME_ACCEPT as ACCEPT,
  JOB_LOG_ACCEPT,
  RESUME_MAX_FILE_SIZE,
  JOB_LOG_MAX_FILE_SIZE,
  RESUME_MAX_FILES,
  JOB_LOG_MAX_FILES,
} from '../constants/fileTypes'
import { LOCAL_KEY_OUTPUT_FOLDER } from '../constants/storage'

// ── Local alias — radius options with labels for the generator's pill UI ──────
const RADIUS_OPTIONS = RADIUS_STEPS.map(v => ({
  label: v === 0 ? 'Exact' : `${v}mi`,
  value: v,
}))

// ── Step indicator ────────────────────────────────────────────────────────────
function Stepper({ current }) {
  const steps = [
    { num: 1, label: 'Your Resume' },
    { num: 2, label: 'Find Jobs'   },
    { num: 3, label: 'Generate'    },
  ]
  return (
    <div className="flex items-center justify-center mb-10">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
              ${current > s.num  ? 'bg-brand-600 border-brand-600 text-white'
              : current === s.num ? 'bg-brand-600 border-brand-600 text-white shadow-lg shadow-brand-200'
              :                     'bg-white border-gray-300 text-gray-400'}`}
            >
              {current > s.num ? <CheckIcon className="w-4 h-4" /> : s.num}
            </div>
            <span className={`text-xs font-medium whitespace-nowrap
              ${current === s.num ? 'text-brand-700' : 'text-gray-400'}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-16 sm:w-24 h-0.5 mx-2 mb-5 transition-colors
              ${current > s.num ? 'bg-brand-500' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Job status icon ───────────────────────────────────────────────────────────
function JobStatusIcon({ status }) {
  if (status === 'done')       return <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
  if (status === 'error')      return <XCircleIcon     className="w-5 h-5 text-red-400   shrink-0" />
  if (status === 'processing') return <Loader2Icon     className="w-5 h-5 text-brand-500 shrink-0 animate-spin" />
  return                              <ClockIcon       className="w-5 h-5 text-gray-300   shrink-0" />
}

// ── Main page component ───────────────────────────────────────────────────────
export default function ResumeGeneratorPage() {
  const routerLocation = useRouterLocation()
  const routerState    = routerLocation.state || {}

  // If user arrived via "Generate Resumes" from Job Search, we pre-populate
  const incomingJobs    = routerState.savedJobs  || []
  const incomingWishes  = routerState.wishes     || ''
  const incomingProfile = routerState.profile    || ''

  const [step, setStep] = useState(1)

  // In production the backend runs on Railway — it cannot browse the user's local
  // filesystem. Folder picker is only shown in local dev mode.
  const isLocalMode = !import.meta.env.PROD

  // ── Step 1 state ──
  const [resumeFiles,   setResumeFiles]   = useState([])   // array of File objects
  const [outputFolder,  setOutputFolder]  = useState(
    () => { try { return localStorage.getItem(LOCAL_KEY_OUTPUT_FOLDER) || '' } catch { return '' } }
  )
  const [homeLocation,  setHomeLocation]  = useState('')
  const [folderOpen,    setFolderOpen]    = useState(false)
  const [extraSkills,   setExtraSkills]   = useState(incomingProfile)
  const [skillInput,    setSkillInput]    = useState('')
  const [skillTags,     setSkillTags]     = useState(
    incomingProfile ? incomingProfile.split(',').map(s => s.trim()).filter(Boolean) : []
  )
  const [wishes,        setWishes]        = useState(incomingWishes)

  // ── Job description state ──
  const descriptionFileRef = useRef(null)
  const [jobDescription,     setJobDescription]     = useState('')
  const [descriptionUploading, setDescriptionUploading] = useState(false)

  // ── Job Log state ──
  const [jobLogText,     setJobLogText]     = useState('')
  const [jobLogFiles,    setJobLogFiles]    = useState([])
  const [jobLogExpanded, setJobLogExpanded] = useState(false)

  // ── Step 2 state ──
  const [step2Mode,    setStep2Mode]    = useState('search')  // 'search' | 'upload'
  const [search,       setSearch]       = useState({ location: '', date_range: '7', radius: 25 })
  const [remoteTypes,  setRemoteTypes]  = useState([])   // [] = any (optional)
  const [searchCategories,  setSearchCategories]  = useState([])
  const [customCatInput,    setCustomCatInput]    = useState('')
  const [showCatPresets,    setShowCatPresets]    = useState(false)
  const [searchErrors, setSearchErrors] = useState({})
  const [searching,    setSearching]    = useState(false)
  const [jobs,         setJobs]         = useState(incomingJobs)       // pre-loaded from Job Search
  const [searchTaskId, setSearchTaskId] = useState(null)
  const [searchStatus, setSearchStatus] = useState(incomingJobs.length ? 'completed' : null)
  const [selectedJobs, setSelectedJobs] = useState(
    incomingJobs.length ? new Set(incomingJobs.map((_, i) => i)) : new Set()
  )
  const pollRef = useRef(null)

  // ── Spreadsheet upload state ──
  const [sheetFile,      setSheetFile]      = useState(null)
  const [sheetParsing,   setSheetParsing]   = useState(false)
  const [sheetError,     setSheetError]     = useState('')
  const [sheetPreview,   setSheetPreview]   = useState([])  // parsed but not yet loaded
  const sheetInputRef = useRef(null)

  // ── Step 3 state ──
  const [batchTaskId,  setBatchTaskId]  = useState(null)
  const [batchData,    setBatchData]    = useState(null)
  const [generating,   setGenerating]   = useState(false)
  const batchPollRef = useRef(null)

  // cleanup polls on unmount
  useEffect(() => () => {
    clearInterval(pollRef.current)
    clearInterval(batchPollRef.current)
  }, [])

  // ── Step 1 helpers ────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return
    setResumeFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name))
      return [...prev, ...accepted.filter(f => !existingNames.has(f.name))]
    })
  }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPT, maxFiles: RESUME_MAX_FILES, maxSize: RESUME_MAX_FILE_SIZE,
    onDropRejected: () => toast.error('Invalid file type. Use PDF, DOCX or DOC.'),
  })
  const removeResumeFile = (idx) => setResumeFiles(prev => prev.filter((_, i) => i !== idx))

  // Job description upload
  const handleDescriptionFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setDescriptionUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post(API_ENDPOINTS.RESUME_EXTRACT_TEXT, fd)
      if (data.text?.trim()) {
        setJobDescription(data.text.trim())
        toast.success('Job description extracted!')
      } else {
        toast.error('Could not extract text from this file')
      }
    } catch (err) {
      toast.error(err.message || 'Failed to extract text')
    } finally {
      setDescriptionUploading(false)
    }
  }

  // Job Log dropzone
  const onDropJobLog = useCallback((accepted) => {
    if (!accepted.length) return
    setJobLogFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name))
      return [...prev, ...accepted.filter(f => !existingNames.has(f.name))]
    })
  }, [])
  const { getRootProps: getJobLogRootProps, getInputProps: getJobLogInputProps, isDragActive: isJobLogDragActive } = useDropzone({
    onDrop: onDropJobLog, accept: JOB_LOG_ACCEPT, maxFiles: JOB_LOG_MAX_FILES, maxSize: JOB_LOG_MAX_FILE_SIZE,
    onDropRejected: () => toast.error('Unsupported file type for job log.'),
  })
  const removeJobLogFile = (idx) => setJobLogFiles(prev => prev.filter((_, i) => i !== idx))

  const addSkillTag = () => {
    const tag = skillInput.trim()
    if (!tag || skillTags.includes(tag)) { setSkillInput(''); return }
    const updated = [...skillTags, tag]
    setSkillTags(updated)
    setExtraSkills(updated.join(', '))
    setSkillInput('')
  }
  const removeSkillTag = (tag) => {
    const updated = skillTags.filter(t => t !== tag)
    setSkillTags(updated)
    setExtraSkills(updated.join(', '))
  }

  const step1Valid = resumeFiles.length > 0

  // ── Step 2 helpers ────────────────────────────────────────────────────────
  const setSearchField = (f) => (e) => {
    const val = e.target.type === 'range' ? Number(e.target.value) : e.target.value
    setSearch(p => ({ ...p, [f]: val }))
    setSearchErrors(p => ({ ...p, [f]: '' }))
  }
  const setSearchDirect = (f, v) => setSearch(p => ({ ...p, [f]: v }))

  const toggleSearchCategory = (cat) => {
    setSearchCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
    setSearchErrors(p => ({ ...p, categories: '' }))
  }
  const addCustomCat = () => {
    const val = customCatInput.trim()
    if (!val) return
    if (!searchCategories.includes(val)) {
      setSearchCategories(prev => [...prev, val])
      setSearchErrors(p => ({ ...p, categories: '' }))
    }
    setCustomCatInput('')
  }
  const removeSearchCategory = (cat) => setSearchCategories(prev => prev.filter(c => c !== cat))

  const handleSearch = async (e) => {
    e.preventDefault()
    const errs = {}
    const remoteOnly = remoteTypes.length === 1 && remoteTypes[0] === 'remote'
    if (!search.location && !remoteOnly) errs.location = 'Enter a location'
    if (Object.keys(errs).length) { setSearchErrors(errs); return }

    setSearching(true)
    setJobs([])
    setSelectedJobs(new Set())
    setSearchStatus('running')
    clearInterval(pollRef.current)

    try {
      const { data } = await api.post(API_ENDPOINTS.GENERATOR_SEARCH, {
        ...search,
        categories: searchCategories,
        remote: workTypesToRemote(remoteTypes),
      })
      setSearchTaskId(data.task_id)
      pollRef.current = setInterval(async () => {
        try {
          const { data: t } = await api.get(API_ENDPOINTS.GENERATOR_TASK(data.task_id))
          setSearchStatus(t.status)
          if (t.status === 'completed') {
            clearInterval(pollRef.current)
            setSearching(false)
            const results = t.results || []
            setJobs(results)
            // auto-select all
            setSelectedJobs(new Set(results.map((_, i) => i)))
            toast.success(`Found ${results.length} jobs!`)
          } else if (t.status === 'failed') {
            clearInterval(pollRef.current)
            setSearching(false)
            toast.error(t.error || 'Search failed')
          }
        } catch { clearInterval(pollRef.current); setSearching(false) }
      }, SEARCH_POLL_INTERVAL_MS)
    } catch (err) {
      toast.error(err.message)
      setSearching(false)
      setSearchStatus(null)
    }
  }

  const toggleJob = (i) => {
    setSelectedJobs(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }
  const toggleAll = () => {
    setSelectedJobs(prev =>
      prev.size === jobs.length ? new Set() : new Set(jobs.map((_, i) => i))
    )
  }

  // ── Spreadsheet helpers ───────────────────────────────────────────────────
  const handleSheetFile = async (file) => {
    if (!file) return
    const allowed = ['.xlsx', '.xls', '.csv']
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!allowed.includes(ext)) {
      setSheetError('Unsupported file type. Please upload an .xlsx, .xls, or .csv file.')
      return
    }
    setSheetFile(file)
    setSheetError('')
    setSheetPreview([])
    setSheetParsing(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      // Do NOT set Content-Type manually — axios auto-sets multipart/form-data with the correct boundary
      const { data } = await api.post(API_ENDPOINTS.GENERATOR_PARSE_SHEET, formData)
      setSheetPreview(data.jobs || [])
      toast.success(`Parsed ${data.count} job${data.count !== 1 ? 's' : ''} from spreadsheet`)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to parse spreadsheet'
      setSheetError(msg)
      toast.error(msg)
    } finally {
      setSheetParsing(false)
    }
  }

  const handleSheetDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleSheetFile(file)
  }

  const loadSheetJobs = () => {
    if (!sheetPreview.length) return
    setJobs(sheetPreview)
    setSelectedJobs(new Set(sheetPreview.map((_, i) => i)))
    setSearchStatus('completed')
    setSheetPreview([])
    setSheetFile(null)
    // Switch to "loaded" view so the jobs list is visible without the search form
    setStep2Mode('loaded')
    toast.success(`${sheetPreview.length} job${sheetPreview.length !== 1 ? 's' : ''} loaded!`)
  }

  // ── Step 3 — batch generation ────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!resumeFiles.length || selectedJobs.size === 0) return
    setGenerating(true)
    clearInterval(batchPollRef.current)

    const selectedList = [...selectedJobs].map(i => jobs[i])

    // Combine extra_skills + wishes so Claude can factor in both
    const combinedSkills = [
      extraSkills,
      wishes ? `Career goals / what I'm looking for: ${wishes}` : '',
    ].filter(Boolean).join('\n\n')

    const formData = new FormData()
    resumeFiles.forEach(f => formData.append('resume_files', f))
    formData.append('output_folder', outputFolder)
    formData.append('extra_skills', combinedSkills)
    formData.append('home_location', homeLocation)
    formData.append('jobs_json', JSON.stringify(selectedList))
    formData.append('job_description', jobDescription)
    formData.append('job_log_text', jobLogText)
    jobLogFiles.forEach(f => formData.append('job_log_files', f))

    try {
      const { data } = await api.post(API_ENDPOINTS.GENERATOR_RUN, formData, {
        timeout: 30000,
      })
      setBatchTaskId(data.task_id)

      // Initialise display immediately
      setBatchData({
        status: 'running', total: data.total, done: 0,
        jobs: selectedList.map(j => ({ ...j, status: 'pending' })),
      })

      batchPollRef.current = setInterval(async () => {
        try {
          const { data: bd } = await api.get(`/api/resume/batch-status/${data.task_id}`) // uses dynamic task id
          setBatchData(bd)
          if (bd.status === 'completed' || bd.status === 'failed') {
            clearInterval(batchPollRef.current)
            setGenerating(false)
            if (bd.status === 'completed') toast.success('All resumes & cover letters generated!')
          }
        } catch { clearInterval(batchPollRef.current); setGenerating(false) }
      }, 2000)
    } catch (err) {
      toast.error(err.message)
      setGenerating(false)
    }
  }

  const handleDownloadTracker = async () => {
    if (!batchTaskId) return
    try {
      const res = await api.get(API_ENDPOINTS.GENERATOR_EXPORT(batchTaskId), { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `resume_tracker_${Date.now()}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Tracker downloaded!')
    } catch (err) { toast.error(err.message) }
  }

  const handleDownloadFile = (path) => {
    window.open(`/api/resume/download?path=${encodeURIComponent(path)}`, '_blank')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-container max-w-4xl">
      {/* Page header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900">Resume Generator</h1>
        <p className="mt-2 text-gray-500 max-w-xl mx-auto">
          Search for jobs, then let Claude tailor your resume and write a cover letter for every role — automatically.
        </p>
      </div>

      <Stepper current={step} />

      {/* ══════════════════════════════════════════════════════════════
          STEP 1 — Upload resume + skills + folder
      ══════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-6">

          {/* Resume upload — multiple files */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <UploadCloudIcon className="w-4 h-4 text-brand-500" /> Upload Resume(s)
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Upload one or more resumes — Claude will combine them into one optimized version for each job
              </p>
            </div>
            <div className="card-body space-y-3">
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                  ${isDragActive            ? 'border-brand-400 bg-brand-50'
                  : resumeFiles.length > 0  ? 'border-brand-300 bg-brand-50/30'
                  :                           'border-gray-300 hover:border-brand-400 hover:bg-gray-50'}`}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-2">
                  <UploadCloudIcon className={`w-9 h-9 ${isDragActive ? 'text-brand-400' : 'text-gray-300'}`} />
                  <p className="text-sm font-medium text-gray-600">
                    {isDragActive ? 'Drop files here!' : 'Drag & drop or click to add resumes'}
                  </p>
                  <p className="text-xs text-gray-400">PDF, DOCX, DOC — max 10 MB each — multiple allowed</p>
                </div>
              </div>

              {resumeFiles.length > 0 && (
                <div className="space-y-2">
                  {resumeFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 bg-brand-50 rounded-xl border border-brand-100">
                      <FileTextIcon className="w-4 h-4 text-brand-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                        <p className="text-xs text-gray-400">{(f.size / 1024).toFixed(1)} KB</p>
                      </div>
                      {resumeFiles.length > 1 && (
                        <span className="text-xs text-brand-600 bg-brand-100 px-2 py-0.5 rounded-full shrink-0">
                          Resume {i + 1}
                        </span>
                      )}
                      <button type="button" onClick={() => removeResumeFile(i)}
                        className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {resumeFiles.length > 1 && (
                    <p className="text-xs text-brand-600 flex items-center gap-1">
                      <SparklesIcon className="w-3 h-3" />
                      Claude will synthesize all {resumeFiles.length} resumes into one optimized version per job
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Output folder — local dev only */}
          {isLocalMode ? (
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <FolderOpenIcon className="w-4 h-4 text-brand-500" /> Output Folder
                </h2>
              </div>
              <div className="card-body">
                <div
                  onClick={() => setFolderOpen(true)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors group
                    ${outputFolder
                      ? 'border-brand-400 bg-brand-50 hover:bg-brand-100'
                      : 'border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-brand-50'}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors
                    ${outputFolder ? 'bg-brand-100' : 'bg-gray-200 group-hover:bg-brand-100'}`}>
                    <FolderOpenIcon className={`w-5 h-5 ${outputFolder ? 'text-yellow-500' : 'text-gray-400 group-hover:text-yellow-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {outputFolder ? (
                      <>
                        <p className="text-xs font-medium text-brand-700 mb-0.5">Selected folder</p>
                        <p className="text-sm font-mono text-gray-800 truncate">{outputFolder}</p>
                      </>
                    ) : (
                      <p className="text-sm font-medium text-gray-600 group-hover:text-brand-700">
                        Click to choose where to save resumes &amp; cover letters
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors
                    ${outputFolder
                      ? 'bg-brand-100 text-brand-700'
                      : 'bg-white text-gray-600 border border-gray-300 group-hover:border-brand-400'}`}>
                    {outputFolder ? 'Change' : 'Browse'}
                  </span>
                </div>
                {outputFolder && (
                  <p className="mt-2 text-xs text-gray-400">
                    Files saved as <code className="bg-gray-100 px-1 rounded">JobTitle_Location_Company.pdf/.docx</code> and{' '}
                    <code className="bg-gray-100 px-1 rounded">CoverLetter_JobTitle_Location_Company.pdf/.docx</code>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-body">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <DownloadIcon className="w-5 h-5 text-blue-500 shrink-0" />
                  <p className="text-sm text-blue-700">
                    Generated resumes will be available to <strong>download as a ZIP</strong> after generation completes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Home Location */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <MapPinIcon className="w-4 h-4 text-brand-500" />
                Your Home Location
                <span className="badge badge-blue text-xs">Optional</span>
              </h2>
            </div>
            <div className="card-body space-y-2">
              <p className="text-sm text-gray-500">
                City and state to include in the contact line of every generated resume.
              </p>
              <input
                type="text"
                value={homeLocation}
                onChange={(e) => setHomeLocation(e.target.value)}
                placeholder="e.g. San Francisco, CA"
                className="input w-full text-sm"
              />
            </div>
          </div>

          {/* Job Description */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <BriefcaseIcon className="w-4 h-4 text-brand-500" />
                Job Description Context
                <span className="badge badge-blue text-xs">Optional</span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Add context about the types of roles you're targeting. Claude will use this across all generated resumes.
              </p>
            </div>
            <div className="card-body space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Paste text or upload a file</span>
                {descriptionUploading ? (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
                    Extracting…
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => descriptionFileRef.current?.click()}
                    className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1 transition-colors"
                  >
                    <UploadCloudIcon className="w-3 h-3" /> Upload PDF/DOC
                  </button>
                )}
                <input
                  ref={descriptionFileRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                  onChange={handleDescriptionFileUpload}
                />
              </div>
              <textarea
                value={jobDescription}
                onChange={e => setJobDescription(e.target.value)}
                rows={4}
                placeholder="Paste a sample job description or describe the type of roles you're applying for…"
                className="input resize-y text-sm"
              />
            </div>
          </div>

          {/* Job History & Work Log (optional, collapsible) */}
          <div className="card">
            <button
              type="button"
              onClick={() => setJobLogExpanded(v => !v)}
              className="card-header w-full flex items-center justify-between text-left hover:bg-gray-50 rounded-t-xl transition-colors"
            >
              <div className="flex items-center gap-2">
                <ClipboardListIcon className="w-4 h-4 text-brand-500 shrink-0" />
                <div>
                  <span className="font-semibold text-gray-800">Job History &amp; Work Log</span>
                  <span className="ml-2 text-xs text-gray-400 font-normal">(optional)</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(jobLogText.trim() || jobLogFiles.length > 0) && (
                  <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                    {[jobLogText.trim() && 'text', jobLogFiles.length > 0 && `${jobLogFiles.length} file${jobLogFiles.length > 1 ? 's' : ''}`].filter(Boolean).join(' + ')}
                  </span>
                )}
                {jobLogExpanded
                  ? <ChevronUpIcon className="w-4 h-4 text-gray-400" />
                  : <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                }
              </div>
            </button>

            {jobLogExpanded && (
              <div className="card-body space-y-4 pt-0">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Provide supplemental context — previous job descriptions, projects, achievements, or any notes on your work history.
                  Claude will use this to enrich every tailored resume.
                </p>
                <div>
                  <label className="label">Paste or type job history &amp; accomplishments</label>
                  <textarea
                    value={jobLogText}
                    onChange={e => setJobLogText(e.target.value)}
                    rows={4}
                    placeholder={`Example:\n• Led migration of legacy monolith to microservices (2022-2023)\n• Reduced API latency by 40% through caching redesign\n• Managed cross-functional team of 8 engineers...`}
                    className="input resize-y text-sm"
                  />
                </div>
                <div>
                  <label className="label">Or upload files <span className="text-gray-400 font-normal">(PDF, Word, Excel, TXT, CSV)</span></label>
                  <div
                    {...getJobLogRootProps()}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors
                      ${isJobLogDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}
                  >
                    <input {...getJobLogInputProps()} />
                    <div className="flex flex-col items-center gap-1.5">
                      <UploadCloudIcon className={`w-7 h-7 ${isJobLogDragActive ? 'text-brand-400' : 'text-gray-300'}`} />
                      <p className="text-xs font-medium text-gray-500">
                        {isJobLogDragActive ? 'Drop files here!' : 'Drag & drop or click to browse'}
                      </p>
                      <p className="text-xs text-gray-400">PDF, DOCX, XLSX, XLS, TXT, CSV — up to 20 MB each</p>
                    </div>
                  </div>
                  {jobLogFiles.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {jobLogFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                          <FileSpreadsheetIcon className="w-4 h-4 text-green-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 truncate">{f.name}</p>
                            <p className="text-xs text-gray-400">{(f.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <button type="button" onClick={() => removeJobLogFile(i)}
                            className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                            <XIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* What you're looking for */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <StarIcon className="w-4 h-4 text-amber-400" />
                What You're Looking for in Your Next Role
                <span className="badge badge-blue text-xs">Optional</span>
              </h2>
            </div>
            <div className="card-body">
              <p className="text-sm text-gray-500 mb-2">
                Describe your ideal next job — Claude uses this when tailoring your resume and writing cover letters.
              </p>
              <textarea
                value={wishes}
                onChange={e => setWishes(e.target.value)}
                rows={3}
                placeholder="e.g. Senior IC role at a growth-stage startup, working on distributed systems, strong eng culture, remote-friendly…"
                className="input text-sm resize-none w-full"
              />
            </div>
          </div>

          {/* Skills & keywords */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <TagIcon className="w-4 h-4 text-brand-500" />
                Skills &amp; Keywords
                <span className="badge badge-blue text-xs">Optional</span>
              </h2>
            </div>
            <div className="card-body space-y-3">
              <p className="text-sm text-gray-500">
                Add skills or technologies you want Claude to emphasise in every resume and cover letter.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkillTag() } }}
                  placeholder="e.g. React, Python, Agile…"
                  className="input flex-1 text-sm"
                />
                <button type="button" onClick={addSkillTag} className="btn-secondary text-sm px-4">Add</button>
              </div>
              {skillTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {skillTags.map(tag => (
                    <span key={tag}
                      className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 text-xs font-medium
                                 px-2.5 py-1 rounded-full border border-brand-200">
                      {tag}
                      <button onClick={() => removeSkillTag(tag)} className="ml-0.5 hover:text-red-500 transition-colors">✕</button>
                    </span>
                  ))}
                </div>
              )}
              {/* Freeform textarea for longer input */}
              <details className="mt-2">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 list-none">
                  Or paste a longer skills summary…
                </summary>
                <textarea
                  value={extraSkills}
                  onChange={(e) => setExtraSkills(e.target.value)}
                  rows={3}
                  placeholder="e.g. 8 years Python, strong SQL, experience with CI/CD pipelines, led team of 5..."
                  className="input mt-2 text-sm resize-none w-full"
                />
              </details>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => step1Valid ? setStep(2) : toast.error('Please upload a resume first')}
              className={`btn-primary px-8 py-3 ${!step1Valid ? 'opacity-50' : ''}`}
            >
              Next: Find Jobs <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          STEP 2 — Job search + select
      ══════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-6">

          {/* ── Mode tab switcher (hidden once jobs are loaded from sheet) ── */}
          {step2Mode !== 'loaded' && (
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setStep2Mode('search')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${step2Mode === 'search'
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'}`}
              >
                <SearchIcon className="w-4 h-4" /> Search Jobs
              </button>
              <button
                type="button"
                onClick={() => { if (step2Mode !== 'upload') { setJobs([]); setSelectedJobs(new Set()) } setStep2Mode('upload') }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${step2Mode === 'upload'
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'}`}
              >
                <TableIcon className="w-4 h-4" /> Upload Spreadsheet
              </button>
            </div>
          )}

          {/* ── "Loaded from spreadsheet" banner ── */}
          {step2Mode === 'loaded' && jobs.length > 0 && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50 px-5 py-3 flex items-center gap-3">
              <TableIcon className="w-4 h-4 text-teal-500 shrink-0" />
              <p className="text-sm text-teal-800 flex-1">
                <span className="font-semibold">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span> loaded from your spreadsheet.
              </p>
              <button type="button"
                onClick={() => { setStep2Mode('search'); setJobs([]); setSelectedJobs(new Set()) }}
                className="text-xs text-teal-600 hover:text-teal-800 font-medium underline whitespace-nowrap">
                Start over
              </button>
            </div>
          )}

          {/* ── Pre-loaded jobs banner (when arriving from Job Search page) ── */}
          {incomingJobs.length > 0 && searchStatus === 'completed' && jobs.length > 0 && !searching && (
            <div className="rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 flex items-start gap-3">
              <BookmarkIcon className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-brand-800 text-sm">
                  {jobs.length} job{jobs.length !== 1 ? 's' : ''} pre-loaded from Job Search
                </p>
                <p className="text-xs text-brand-600 mt-0.5">
                  {selectedJobs.size} selected — scroll down to review, then click <strong>Generate</strong> to proceed,
                  or run a new search below to replace them.
                </p>
              </div>
              <button
                type="button"
                onClick={() => selectedJobs.size > 0 ? setStep(3) : toast.error('Select at least one job')}
                disabled={selectedJobs.size === 0}
                className="btn-primary text-xs py-2 px-4 shrink-0 whitespace-nowrap"
              >
                Generate for {selectedJobs.size} <ChevronRightIcon className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* ── Spreadsheet upload panel ── */}
          {step2Mode === 'upload' && (
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-brand-500" /> Upload Jobs Spreadsheet
                </h2>
              </div>
              <div className="card-body space-y-4">
                <p className="text-sm text-gray-500">
                  Upload an Excel or CSV file with your job listings. Claude will generate a tailored resume
                  and cover letter for each row.
                </p>

                {/* Column guide */}
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Expected columns:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { name: 'Job Title',        required: true,  desc: 'Role name' },
                      { name: 'Company',           required: false, desc: 'Employer name' },
                      { name: 'Job Description',   required: false, desc: 'Full JD text' },
                      { name: 'Location',          required: false, desc: 'City/state' },
                      { name: 'Company Website',   required: false, desc: 'URL' },
                    ].map(col => (
                      <div key={col.name} className="flex items-start gap-1.5">
                        <span className={`mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full ${col.required ? 'bg-brand-500' : 'bg-gray-300'}`} />
                        <div>
                          <p className="text-xs font-medium text-gray-700">{col.name}
                            {col.required && <span className="text-brand-500 ml-0.5">*</span>}
                          </p>
                          <p className="text-xs text-gray-400">{col.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-3">* Required — column names are case-insensitive.</p>
                </div>

                {/* Drop zone */}
                <div
                  onDrop={handleSheetDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => sheetInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                    ${sheetFile && !sheetError
                      ? 'border-green-400 bg-green-50'
                      : sheetError
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'}`}
                >
                  <input
                    ref={sheetInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => handleSheetFile(e.target.files?.[0])}
                  />
                  {sheetParsing ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2Icon className="w-10 h-10 text-brand-400 animate-spin" />
                      <p className="text-sm text-gray-500">Parsing spreadsheet…</p>
                    </div>
                  ) : sheetFile && !sheetError ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileSpreadsheetIcon className="w-10 h-10 text-green-500" />
                      <p className="font-semibold text-gray-800">{sheetFile.name}</p>
                      <p className="text-xs text-gray-400">{(sheetFile.size / 1024).toFixed(1)} KB</p>
                      <button type="button"
                        onClick={(ev) => { ev.stopPropagation(); setSheetFile(null); setSheetPreview([]); setSheetError('') }}
                        className="text-xs text-red-500 hover:underline flex items-center gap-1 mt-1">
                        <TrashIcon className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <TableIcon className="w-10 h-10 text-gray-300" />
                      <p className="text-sm font-medium text-gray-600">Drag & drop or click to browse</p>
                      <p className="text-xs text-gray-400">.xlsx · .xls · .csv</p>
                    </div>
                  )}
                </div>

                {/* Error */}
                {sheetError && (
                  <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                    <AlertCircleIcon className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{sheetError}</p>
                  </div>
                )}

                {/* Preview table */}
                {sheetPreview.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-700">
                        Preview — {sheetPreview.length} job{sheetPreview.length !== 1 ? 's' : ''} found
                      </p>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-gray-200 max-h-64">
                      <table className="min-w-full text-xs divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            {['Job Title', 'Company', 'Location', 'Has Description', 'URL'].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {sheetPreview.map((job, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium text-gray-900 max-w-[160px] truncate">{job.title}</td>
                              <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate">{job.company || <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate">{job.location || <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2">
                                {job.description
                                  ? <span className="text-green-600 font-medium">✓ Yes</span>
                                  : <span className="text-gray-400">No</span>}
                              </td>
                              <td className="px-3 py-2 max-w-[150px] truncate">
                                {job.url
                                  ? <a href={job.url} target="_blank" rel="noopener noreferrer"
                                      className="text-brand-600 hover:underline"
                                      onClick={e => e.stopPropagation()}>{job.url}</a>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-between items-center mt-4">
                      <button type="button" onClick={() => setStep(1)} className="btn-secondary px-6">← Back</button>
                      <button type="button" onClick={loadSheetJobs} className="btn-primary px-8 py-3">
                        <CheckIcon className="w-4 h-4" />
                        Load {sheetPreview.length} Job{sheetPreview.length !== 1 ? 's' : ''} & Continue
                        <ChevronRightIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {!sheetPreview.length && (
                  <div className="flex justify-start">
                    <button type="button" onClick={() => setStep(1)} className="btn-secondary px-6">← Back</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Search form */}
          {step2Mode === 'search' && (
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <SearchIcon className="w-4 h-4 text-brand-500" /> Job Search Criteria
              </h2>
            </div>
            <div className="card-body">
              <form onSubmit={handleSearch} className="grid sm:grid-cols-2 gap-5">

                {/* ── Multi-category selector ── */}
                <div className="sm:col-span-2">
                  <label className="label">
                    <BriefcaseIcon className="inline w-3.5 h-3.5 mr-1" />Job Categories
                    <span className="ml-1 text-gray-400 font-normal">(pick one or more)</span>
                  </label>

                  {/* Selected category tags */}
                  {searchCategories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {searchCategories.map(cat => (
                        <span key={cat}
                          className="inline-flex items-center gap-1 bg-brand-100 text-brand-800 text-xs font-medium px-2.5 py-1 rounded-full">
                          {cat}
                          <button type="button" onClick={() => removeSearchCategory(cat)}
                            className="hover:text-brand-600 ml-0.5" aria-label={`Remove ${cat}`}>
                            <XIcon className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Preset pills toggle */}
                  <button type="button" onClick={() => setShowCatPresets(s => !s)}
                    className="flex items-center gap-1.5 text-xs text-brand-600 font-medium hover:text-brand-800 mb-2">
                    <TagIcon className="w-3.5 h-3.5" />
                    {showCatPresets ? 'Hide presets' : 'Browse presets'}
                  </button>

                  {showCatPresets && (
                    <div className="flex flex-wrap gap-1.5 mb-3 max-h-36 overflow-y-auto p-2 rounded-xl border border-gray-200 bg-gray-50">
                      {PRESET_CATEGORIES.map(cat => {
                        const selected = searchCategories.includes(cat)
                        return (
                          <button key={cat} type="button" onClick={() => toggleSearchCategory(cat)}
                            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all
                              ${selected
                                ? 'bg-brand-600 text-white border-brand-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:text-brand-700'}`}>
                            {selected ? '✓ ' : ''}{cat}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Custom category input */}
                  <div className="flex gap-2">
                    <input type="text" value={customCatInput}
                      onChange={e => setCustomCatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCat() } }}
                      placeholder="Or type a custom category…"
                      className={`input flex-1 text-sm py-2 ${searchErrors.categories ? 'border-red-400' : ''}`} />
                    <button type="button" onClick={addCustomCat} disabled={!customCatInput.trim()}
                      className="btn-secondary px-3 py-2 shrink-0" title="Add category">
                      <PlusIcon className="w-4 h-4" />
                    </button>
                  </div>
                  {searchErrors.categories && (
                    <p className="mt-1 text-xs text-red-500">{searchErrors.categories}</p>
                  )}
                </div>

                {/* Location */}
                <div>
                  <label className="label">
                    <MapPinIcon className="inline w-3.5 h-3.5 mr-1" />Location
                    {remoteTypes.length === 1 && remoteTypes[0] === 'remote' && (
                      <span className="text-gray-400 font-normal ml-1">(optional)</span>
                    )}
                  </label>
                  <LocationAutocomplete
                    value={search.location}
                    onChange={v => { setSearch(p => ({ ...p, location: v })); setSearchErrors(p => ({ ...p, location: '' })) }}
                    onSelect={v => { setSearch(p => ({ ...p, location: v })); setSearchErrors(p => ({ ...p, location: '' })) }}
                    placeholder={remoteTypes.length === 1 && remoteTypes[0] === 'remote' ? 'Optional for remote' : 'City, state or zip code'}
                    inputClassName={searchErrors.location ? 'border-red-400' : ''}
                  />
                  {searchErrors.location && <p className="mt-1 text-xs text-red-500">{searchErrors.location}</p>}
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
                  <div className="grid grid-cols-3 gap-2">
                    {WORK_TYPE_OPTIONS.map(opt => {
                      const active = remoteTypes.includes(opt.value)
                      return (
                        <button key={opt.value} type="button"
                          onClick={() => setRemoteTypes(prev =>
                            prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                          )}
                          className={`flex flex-col items-center gap-0.5 py-2 rounded-xl border text-xs font-medium transition-all
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

                {/* Date range */}
                <div>
                  <label className="label"><CalendarIcon className="inline w-3.5 h-3.5 mr-1" />Posted Within</label>
                  <select value={search.date_range} onChange={setSearchField('date_range')} className="input">
                    {DATE_RANGES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>

                {/* Radius */}
                {!(remoteTypes.length === 1 && remoteTypes[0] === 'remote') && (
                  <div className="sm:col-span-2">
                    <label className="label flex justify-between">
                      <span><SlidersHorizontalIcon className="inline w-3.5 h-3.5 mr-1" />Search Radius</span>
                      <span className="font-semibold text-brand-600">
                        {search.radius === 0 ? 'Exact location' : `${search.radius} miles`}
                      </span>
                    </label>
                    <input type="range" min="0" max="6" step="1"
                      value={RADIUS_OPTIONS.findIndex(r => r.value === search.radius)}
                      onChange={(e) => setSearchDirect('radius', RADIUS_OPTIONS[Number(e.target.value)].value)}
                      className="w-full accent-brand-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      {RADIUS_OPTIONS.map(r => <span key={r.value}>{r.label}</span>)}
                    </div>
                  </div>
                )}

                <div className="sm:col-span-2 flex justify-end gap-3">
                  <button type="button" onClick={() => setStep(1)} className="btn-secondary px-6">← Back</button>
                  <button type="submit" className="btn-primary px-8" disabled={searching}>
                    {searching
                      ? <><RefreshCwIcon className="w-4 h-4 animate-spin" /> Searching…</>
                      : <><SearchIcon className="w-4 h-4" /> Search Jobs</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
          )}  {/* end step2Mode === 'search' */}

          {/* Results — shown for both search results and spreadsheet-loaded jobs */}
          {jobs.length > 0 && (
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-gray-800">
                    {jobs.length} Job{jobs.length !== 1 ? 's' : ''}
                    {jobs[0]?.source === 'spreadsheet' ? ' from Spreadsheet' : ' Found'}
                  </h2>
                  <span className="badge badge-blue">{selectedJobs.size} selected</span>
                </div>
                <button onClick={toggleAll} className="text-sm text-brand-600 hover:underline font-medium">
                  {selectedJobs.size === jobs.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
                {jobs.map((job, i) => (
                  <label key={i}
                    className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer transition-colors
                      ${selectedJobs.has(i) ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={selectedJobs.has(i)} onChange={() => toggleJob(i)}
                      className="mt-1 w-4 h-4 accent-brand-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{job.title}</p>
                        {job.source === 'spreadsheet' && (
                          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium shrink-0 flex items-center gap-1">
                            <TableIcon className="w-3 h-3" /> Spreadsheet
                          </span>
                        )}
                        {job.search_category && job.source !== 'spreadsheet' && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                            {job.search_category}
                          </span>
                        )}
                      </div>
                      <p className="text-brand-600 text-xs font-medium mt-0.5">{job.company}</p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                        {job.location && <span className="flex items-center gap-1"><MapPinIcon className="w-3 h-3" />{job.location}</span>}
                        {job.posted_date && <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" />{job.posted_date}</span>}
                        {job.url && job.source === 'spreadsheet' && (
                          <a href={job.url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-brand-500 hover:underline flex items-center gap-1">
                            🌐 Website
                          </a>
                        )}
                      </div>
                    </div>
                    {selectedJobs.has(i) && <CheckCircleIcon className="w-4 h-4 text-brand-500 shrink-0 mt-1" />}
                  </label>
                ))}
              </div>
            </div>
          )}

          {jobs.length > 0 && (
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary px-6">← Back</button>
              <button
                onClick={() => selectedJobs.size > 0 ? setStep(3) : toast.error('Select at least one job')}
                disabled={selectedJobs.size === 0}
                className="btn-primary px-8 py-3">
                Generate for {selectedJobs.size} job{selectedJobs.size !== 1 ? 's' : ''} <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          STEP 3 — Generate & results
      ══════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Summary card */}
          {!batchData && (
            <div className="card">
              <div className="card-body">
                <h2 className="font-semibold text-gray-900 text-lg mb-4">Ready to generate</h2>
                <div className="grid sm:grid-cols-3 gap-4 mb-6">
                  {[
                    { label: 'Base resume',   value: resumeFiles.length === 1 ? resumeFiles[0]?.name : `${resumeFiles.length} resumes` },
                    { label: 'Output folder', value: outputFolder.split('/').pop() || outputFolder },
                    { label: 'Jobs selected', value: `${selectedJobs.size} position${selectedJobs.size !== 1 ? 's' : ''}` },
                  ].map(item => (
                    <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                      <p className="font-semibold text-gray-800 text-sm truncate">{item.value}</p>
                    </div>
                  ))}
                </div>
                {skillTags.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-2">Skills to highlight</p>
                    <div className="flex flex-wrap gap-2">
                      {skillTags.map(t => (
                        <span key={t} className="badge badge-blue">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {wishes && (
                  <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-100">
                    <p className="text-xs text-amber-600 font-medium flex items-center gap-1 mb-1">
                      <StarIcon className="w-3 h-3" /> Career goals included
                    </p>
                    <p className="text-xs text-amber-800 line-clamp-2">{wishes}</p>
                  </div>
                )}
                <p className="text-sm text-gray-500 mb-5">
                  For each job, Claude will tailor your resume <strong>and</strong> write a cover letter.
                  Files are saved to your selected folder as both PDF and DOCX.
                </p>
                <div className="flex justify-between">
                  <button onClick={() => setStep(2)} className="btn-secondary px-6">← Back</button>
                  <button onClick={handleGenerate} disabled={generating} className="btn-primary px-8 py-3">
                    <SparklesIcon className="w-4 h-4" /> Generate {selectedJobs.size} Resume{selectedJobs.size !== 1 ? 's' : ''} &amp; Cover Letters
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Progress */}
          {batchData && (
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-gray-800">Generating…</h2>
                  <span className="badge badge-blue">{batchData.done}/{batchData.total}</span>
                </div>
                {batchData.status === 'completed' && (
                  <button onClick={handleDownloadTracker} className="btn-secondary text-sm py-1.5">
                    <FileSpreadsheetIcon className="w-4 h-4 text-green-600" /> Download Excel Tracker
                  </button>
                )}
              </div>

              {/* Progress bar */}
              <div className="px-5 pt-3 pb-1">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all duration-500"
                    style={{ width: `${batchData.total ? (batchData.done / batchData.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {batchData.total ? Math.round((batchData.done / batchData.total) * 100) : 0}%
                </p>
              </div>

              {/* Per-job rows */}
              <div className="divide-y divide-gray-100">
                {batchData.jobs.map((job, i) => (
                  <div key={i} className={`px-5 py-3.5 flex items-start gap-3 transition-colors
                    ${job.status === 'done' ? 'bg-green-50/50' : ''}`}>
                    <JobStatusIcon status={job.status} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{job.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{job.company} · {job.location}</p>
                      {job.status === 'error' && (
                        <p className="text-xs text-red-500 mt-1">{job.error}</p>
                      )}
                      {job.status === 'done' && (
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">{job.resume_filename}</p>
                      )}
                    </div>

                    {/* Download buttons */}
                    {job.status === 'done' && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <div className="flex gap-1">
                          <button onClick={() => handleDownloadFile(job.resume_pdf_path)}
                            className="btn-primary text-xs py-1 px-2 gap-1">
                            <DownloadIcon className="w-3 h-3" /> CV PDF
                          </button>
                          <button onClick={() => handleDownloadFile(job.resume_docx_path)}
                            className="btn-secondary text-xs py-1 px-2 gap-1">
                            <DownloadIcon className="w-3 h-3" /> CV DOCX
                          </button>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleDownloadFile(job.cover_letter_pdf_path)}
                            className="btn-secondary text-xs py-1 px-2 gap-1 border-green-300 text-green-700 hover:bg-green-50">
                            <DownloadIcon className="w-3 h-3" /> CL PDF
                          </button>
                          <button onClick={() => handleDownloadFile(job.cover_letter_docx_path)}
                            className="btn-secondary text-xs py-1 px-2 gap-1 border-green-300 text-green-700 hover:bg-green-50">
                            <DownloadIcon className="w-3 h-3" /> CL DOCX
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Completed footer */}
              {batchData.status === 'completed' && (
                <div className="px-5 py-4 bg-green-50 border-t border-green-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircleIcon className="w-5 h-5" />
                    <span className="font-semibold text-sm">
                      {batchData.jobs.filter(j => j.status === 'done').length} of {batchData.total} completed
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleDownloadTracker} className="btn-primary text-sm py-2 px-4 bg-green-600 hover:bg-green-700">
                      <FileSpreadsheetIcon className="w-4 h-4" /> Excel Tracker
                    </button>
                    <button onClick={() => { setStep(1); setBatchData(null); setBatchTaskId(null); setJobs([]); setSelectedJobs(new Set()) }}
                      className="btn-secondary text-sm py-2 px-4">
                      Start Over
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Folder Picker Modal */}
      {isLocalMode && (
        <FolderPicker
          isOpen={folderOpen}
          onClose={() => setFolderOpen(false)}
          onSelect={(path) => {
            setOutputFolder(path)
            try { localStorage.setItem(LOCAL_KEY_OUTPUT_FOLDER, path) } catch (_) {}
          }}
          currentPath={outputFolder}
        />
      )}
    </div>
  )
}
