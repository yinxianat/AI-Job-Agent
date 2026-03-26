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
  DownloadIcon, FileSpreadsheetIcon,
  ChevronRightIcon, CheckIcon, Loader2Icon, PlusIcon, XIcon,
  StarIcon, BookmarkIcon, TableIcon, AlertCircleIcon,
  ClipboardListIcon, ChevronDownIcon, ChevronUpIcon,
  BuildingIcon, GlobeIcon, ExternalLinkIcon,
} from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
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

  // ── Step 1 state ──
  const [resumeFiles,   setResumeFiles]   = useState([])   // array of File objects
  const [homeLocation,  setHomeLocation]  = useState('')
  const [extraSkills,   setExtraSkills]   = useState(incomingProfile)
  const [skillInput,    setSkillInput]    = useState('')
  const [skillTags,     setSkillTags]     = useState(
    incomingProfile ? incomingProfile.split(',').map(s => s.trim()).filter(Boolean) : []
  )
  const [wishes,        setWishes]        = useState(incomingWishes)

  // ── Job Log state ──
  const [jobLogText,     setJobLogText]     = useState('')
  const [jobLogFiles,    setJobLogFiles]    = useState([])
  const [jobLogExpanded, setJobLogExpanded] = useState(false)

  // ── Step 2 state ──
  const [step2Mode,    setStep2Mode]    = useState('upload')  // 'search' | 'upload' | 'companies'
  const [search,       setSearch]       = useState({ location: '', date_range: '7', radius: 25 })

  // ── Company discovery state ──
  const [companyLocation,    setCompanyLocation]    = useState('')
  const [companyRadius,      setCompanyRadius]      = useState(25)
  const [discoveredCompanies, setDiscoveredCompanies] = useState([])   // from AI
  const [selectedCompanies,  setSelectedCompanies]  = useState(new Set())  // indices
  const [discovering,        setDiscovering]        = useState(false)
  const [companySearchCats,  setCompanySearchCats]  = useState([])
  const [companyCustomCat,   setCompanyCustomCat]   = useState('')
  const [companySearching,   setCompanySearching]   = useState(false)
  const [remoteTypes,  setRemoteTypes]  = useState([])   // [] = any (optional)
  const [searchCategories,  setSearchCategories]  = useState([])
  const [customCatInput,    setCustomCatInput]    = useState('')
  const [showCatPresets,    setShowCatPresets]    = useState(false)
  const [catSuggestions,    setCatSuggestions]    = useState(null)   // { family, titles, categories }
  const [catSuggesting,     setCatSuggesting]     = useState(false)
  const catSuggestTimer = useRef(null)

  // ── AI Profile Category Suggestions panel state ───────────────────────────
  const [profileSugLoading,   setProfileSugLoading]   = useState(false)
  const [profileSuggestions,  setProfileSuggestions]  = useState(null)   // [{category,score,reason,titles}]
  const [profileSugSelected,  setProfileSugSelected]  = useState(new Set())
  const [profileSugExpanded,  setProfileSugExpanded]  = useState(new Set())
  const [searchErrors,       setSearchErrors]       = useState({})
  const [searching,          setSearching]          = useState(false)
  const [jobs,               setJobs]               = useState(incomingJobs)       // pre-loaded from Job Search
  const [searchTaskId,       setSearchTaskId]       = useState(null)
  const [searchStatus,       setSearchStatus]       = useState(incomingJobs.length ? 'completed' : null)
  const [searchSources,      setSearchSources]      = useState(null)   // { SourceName: count }
  const [searchSourceErrors, setSearchSourceErrors] = useState(null)   // { SourceName: errorMsg }
  const [selectedJobs, setSelectedJobs] = useState(
    incomingJobs.length ? new Set(incomingJobs.map((_, i) => i)) : new Set()
  )
  const [jobsPage,     setJobsPage]     = useState(0)   // pagination for the jobs results list
  const JOBS_PAGE_SIZE = 10
  const pollRef = useRef(null)

  // ── Single job state ──
  const [singleJob, setSingleJob] = useState({
    title: '', company: '', location: '', url: '', description: '',
  })
  const singleJobDescRef = useRef(null)
  const [singleJobUploading, setSingleJobUploading] = useState(false)

  // ── Spreadsheet upload state ──
  const [sheetFile,      setSheetFile]      = useState(null)
  const [sheetParsing,   setSheetParsing]   = useState(false)
  const [sheetError,     setSheetError]     = useState('')
  const [sheetPreview,   setSheetPreview]   = useState([])  // parsed but not yet loaded
  const [sheetNames,     setSheetNames]     = useState([])  // Excel sheet tabs
  const [selectedSheet,  setSelectedSheet]  = useState('')  // which sheet to parse
  const sheetInputRef = useRef(null)

  // ── Assessment state ──
  const [assessTaskId,    setAssessTaskId]    = useState(null)
  const [assessData,      setAssessData]      = useState(null)   // task object from backend
  const [assessing,       setAssessing]       = useState(false)
  const [assessExpanded,  setAssessExpanded]  = useState({})     // { jobIdx: bool }
  const [assessTopN,      setAssessTopN]      = useState(50)     // top-N filter for sorted results
  const assessPollRef = useRef(null)

  // ── Step 3 — paginated batch state ────────────────────────────────────────
  const BATCH_PAGE_SIZE = 10
  const [step3Page,        setStep3Page]        = useState(0)
  // pageIdx → Set<localJobIdx> (which jobs on that page are checked for generation)
  const [step3Selections,  setStep3Selections]  = useState({})
  // pageIdx → batchData from API
  const [step3Results,     setStep3Results]     = useState({})
  // pageIdx → task_id string
  const [step3TaskIds,     setStep3TaskIds]     = useState({})
  // pageIdx → bool
  const [step3Generating,  setStep3Generating]  = useState({})
  // pageIdx → assessment payload from API
  const [step3AssessData,  setStep3AssessData]  = useState({})
  // pageIdx → bool
  const [step3Assessing,   setStep3Assessing]   = useState({})
  const step3PollRefs      = useRef({})   // pageIdx → intervalId
  const step3AssessPollRef = useRef({})   // pageIdx → intervalId

  // cleanup polls on unmount
  useEffect(() => () => {
    clearInterval(pollRef.current)
    clearInterval(assessPollRef.current)
    Object.values(step3PollRefs.current).forEach(clearInterval)
    Object.values(step3AssessPollRef.current).forEach(clearInterval)
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
    setCatSuggestions(null)
  }
  const removeSearchCategory = (cat) => setSearchCategories(prev => prev.filter(c => c !== cat))

  // ── AI job-family suggestion (debounced) ──────────────────────────────────
  const addSuggestedCat = (title) => {
    if (!searchCategories.includes(title)) {
      setSearchCategories(prev => [...prev, title])
      setSearchErrors(p => ({ ...p, categories: '' }))
    }
    setCustomCatInput('')
    setCatSuggestions(null)
  }

  const handleCatInputChange = (val) => {
    setCustomCatInput(val)
    clearTimeout(catSuggestTimer.current)
    if (val.trim().length < 2) { setCatSuggestions(null); return }
    catSuggestTimer.current = setTimeout(async () => {
      setCatSuggesting(true)
      try {
        const { data } = await api.post(API_ENDPOINTS.JOBS_SUGGEST_CATEGORIES, { input: val.trim() })
        setCatSuggestions(data)
      } catch {
        setCatSuggestions(null)
      } finally {
        setCatSuggesting(false)
      }
    }, 600)
  }

  // ── AI Profile Category Suggestions handlers ─────────────────────────────
  const [profileSugError, setProfileSugError] = useState(null)   // {error, debug_info}

  const handleAnalyseProfile = async () => {
    // Build effective skills string: prefer tag list, fall back to raw textarea
    const effectiveSkills = skillTags.length > 0 ? skillTags.join(', ') : extraSkills
    if (!resumeFiles.length && !effectiveSkills.trim() && !jobLogText.trim() && !wishes.trim()) return

    setProfileSugLoading(true)
    setProfileSuggestions(null)
    setProfileSugSelected(new Set())
    setProfileSugExpanded(new Set())
    setProfileSugError(null)
    try {
      // Send resume files + profile data as FormData — backend extracts text server-side
      const formData = new FormData()
      resumeFiles.forEach(f => formData.append('resume_files', f))
      formData.append('extra_skills', effectiveSkills)
      formData.append('job_log', jobLogText)
      formData.append('wishes', wishes)

      const { data } = await api.post(API_ENDPOINTS.JOBS_SUGGEST_FROM_PROFILE, formData, { timeout: 60000 })
      const suggestions = data.suggestions || []
      setProfileSuggestions(suggestions)

      // Show server-side error or debug info
      if (data.error) {
        setProfileSugError({ error: data.error, debug_info: data.debug_info })
        toast.error(data.error, { duration: 8000 })
      } else if (suggestions.length === 0) {
        const info = data.debug_info || 'Unknown reason'
        setProfileSugError({ error: 'No suggestions returned by AI.', debug_info: info })
        toast.error('No suggestions returned. Check the details below for more info.', { duration: 6000 })
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Unknown error'
      const debugInfo = err?.response?.data?.debug_info || ''
      setProfileSugError({ error: detail, debug_info: debugInfo })
      toast.error(`Could not analyse profile: ${detail}`)
    } finally {
      setProfileSugLoading(false)
    }
  }

  const toggleProfileSugSelect = (category) => {
    setProfileSugSelected(prev => {
      const next = new Set(prev)
      next.has(category) ? next.delete(category) : next.add(category)
      return next
    })
  }

  const toggleProfileSugExpand = (category) => {
    setProfileSugExpanded(prev => {
      const next = new Set(prev)
      next.has(category) ? next.delete(category) : next.add(category)
      return next
    })
  }

  const addProfileSuggestionsToCategories = () => {
    const toAdd = [...profileSugSelected].filter(c => !searchCategories.includes(c))
    if (toAdd.length) {
      setSearchCategories(prev => [...prev, ...toAdd])
      setSearchErrors(p => ({ ...p, categories: '' }))
      toast.success(`Added ${toAdd.length} categor${toAdd.length === 1 ? 'y' : 'ies'}`)
    }
    setProfileSugSelected(new Set())
  }

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
    setSearchSources(null)
    setSearchSourceErrors(null)
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
            setJobsPage(0)
            setSearchSources(t.sources || null)
            setSearchSourceErrors(t.source_errors || null)
            // auto-select all
            setSelectedJobs(new Set(results.map((_, i) => i)))
            if (results.length === 0) {
              toast.error('No jobs found — check the error details below.')
            } else {
              toast.success(`Found ${results.length} jobs!`)
            }
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
    setSheetNames([])
    setSelectedSheet('')

    // For Excel files, first fetch the list of sheets so the user can pick one
    if (ext === '.xlsx' || ext === '.xls') {
      setSheetParsing(true)
      try {
        const fd = new FormData()
        fd.append('file', file)
        const { data } = await api.post(API_ENDPOINTS.GENERATOR_LIST_SHEETS, fd)
        const sheets = data.sheets || []
        if (sheets.length > 1) {
          // Multiple sheets — let user pick, then parse on confirm
          setSheetNames(sheets)
          setSelectedSheet(sheets[0])
          setSheetParsing(false)
          return  // wait for user to pick a sheet
        }
        // Single sheet — proceed straight to parse
        await parseSheet(file, sheets[0] || '')
      } catch (err) {
        const msg = err.response?.data?.detail || err.message || 'Failed to read Excel file'
        setSheetError(msg)
        toast.error(msg)
        setSheetParsing(false)
      }
      return
    }

    // CSV — parse immediately
    await parseSheet(file, '')
  }

  const parseSheet = async (file, sheetName) => {
    setSheetParsing(true)
    setSheetError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (sheetName) formData.append('sheet_name', sheetName)
      const { data } = await api.post(API_ENDPOINTS.GENERATOR_PARSE_SHEET, formData)
      setSheetPreview(data.jobs || [])
      setSheetNames([])  // hide picker once parsed
      toast.success(`Parsed ${data.count} job${data.count !== 1 ? 's' : ''} from "${sheetName || 'sheet'}"`)
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
    setJobsPage(0)
    setSelectedJobs(new Set(sheetPreview.map((_, i) => i)))
    setSearchStatus('completed')
    setSheetPreview([])
    setSheetFile(null)
    // Switch to "loaded" view so the jobs list is visible without the search form
    setStep2Mode('loaded')
    toast.success(`${sheetPreview.length} job${sheetPreview.length !== 1 ? 's' : ''} loaded!`)
  }

  // ── Single job helpers ────────────────────────────────────────────────────
  const setSingleField = (f) => (e) =>
    setSingleJob(prev => ({ ...prev, [f]: e.target.value }))

  const handleSingleJobDescUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setSingleJobUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post(API_ENDPOINTS.RESUME_EXTRACT_TEXT, fd)
      if (data.text?.trim()) {
        setSingleJob(prev => ({ ...prev, description: data.text.trim() }))
        toast.success('Job description extracted!')
      } else {
        toast.error('Could not extract text from this file')
      }
    } catch (err) {
      toast.error(err.message || 'Failed to extract text')
    } finally {
      setSingleJobUploading(false)
    }
  }

  const loadSingleJob = () => {
    if (!singleJob.title.trim() && !singleJob.description.trim()) {
      toast.error('Please fill in at least a Job Title or Job Description')
      return
    }
    const job = {
      title:       singleJob.title.trim()       || 'Untitled Role',
      company:     singleJob.company.trim()     || '',
      location:    singleJob.location.trim()    || '',
      url:         singleJob.url.trim()         || '',
      description: singleJob.description.trim() || '',
    }
    setJobs([job])
    setJobsPage(0)
    setSelectedJobs(new Set([0]))
    setSearchStatus('completed')
    setStep2Mode('loaded')
    toast.success('Job loaded!')
  }

  // ── Assessment ────────────────────────────────────────────────────────────
  const handleRunAssessment = async () => {
    if (!resumeFiles.length || !jobs.length) return
    setAssessing(true)
    setAssessData(null)
    setAssessExpanded({})
    clearInterval(assessPollRef.current)

    const selectedList = [...selectedJobs].map(i => jobs[i])
    const combinedSkills = [extraSkills, wishes ? `Career goals: ${wishes}` : ''].filter(Boolean).join('\n\n')

    const formData = new FormData()
    resumeFiles.forEach(f => formData.append('resume_files', f))
    formData.append('extra_skills', combinedSkills)
    formData.append('jobs_json', JSON.stringify(selectedList))

    try {
      const { data } = await api.post(API_ENDPOINTS.GENERATOR_ASSESSMENT_START, formData)
      setAssessTaskId(data.task_id)
      setAssessData({ status: 'running', total: data.total, done: 0, assessments: selectedList.map(j => ({ ...j, status: 'pending' })) })

      assessPollRef.current = setInterval(async () => {
        try {
          const { data: ad } = await api.get(API_ENDPOINTS.GENERATOR_ASSESSMENT_STATUS(data.task_id))
          setAssessData(ad)
          if (ad.status === 'completed' || ad.status === 'failed') {
            clearInterval(assessPollRef.current)
            setAssessing(false)
            if (ad.status === 'completed') toast.success('Assessment complete!')
          }
        } catch { clearInterval(assessPollRef.current); setAssessing(false) }
      }, 2000)
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message)
      setAssessing(false)
    }
  }

  const handleDownloadAssessment = async () => {
    if (!assessTaskId) return
    try {
      const res = await api.get(API_ENDPOINTS.GENERATOR_ASSESSMENT_EXPORT(assessTaskId), { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `match_assessment_${Date.now()}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Assessment downloaded!')
    } catch (err) { toast.error(err.message) }
  }

  // ── Step 3 — batch generation ────────────────────────────────────────────
  // ── Step 3 helpers ────────────────────────────────────────────────────────

  // Flat ordered list of all jobs the user selected in Step 2
  const step3AllJobs = [...selectedJobs].sort((a, b) => a - b).map(i => jobs[i])
  const step3TotalPages = Math.max(1, Math.ceil(step3AllJobs.length / BATCH_PAGE_SIZE))

  const getPageJobs = (p) =>
    step3AllJobs.slice(p * BATCH_PAGE_SIZE, (p + 1) * BATCH_PAGE_SIZE)

  // Default: all jobs on a page are checked
  const getPageSelection = (p) =>
    step3Selections[p] ?? new Set(getPageJobs(p).map((_, i) => i))

  const togglePageJob = (p, localIdx) => {
    const cur = getPageSelection(p)
    const next = new Set(cur)
    next.has(localIdx) ? next.delete(localIdx) : next.add(localIdx)
    setStep3Selections(prev => ({ ...prev, [p]: next }))
  }

  const toggleAllPage = (p) => {
    const cur = getPageSelection(p)
    const pageJobs = getPageJobs(p)
    const next = cur.size === pageJobs.length
      ? new Set()
      : new Set(pageJobs.map((_, i) => i))
    setStep3Selections(prev => ({ ...prev, [p]: next }))
  }

  // Run Match Assessment for a single page
  const handleStep3Assess = async (p) => {
    const pageJobs = getPageJobs(p)
    if (!pageJobs.length || !resumeFiles.length) return
    setStep3Assessing(prev => ({ ...prev, [p]: true }))
    setStep3AssessData(prev => ({ ...prev, [p]: null }))
    clearInterval(step3AssessPollRef.current[p])

    const formData = new FormData()
    resumeFiles.forEach(f => formData.append('resume_files', f))
    formData.append('jobs_json', JSON.stringify(pageJobs))
    if (wishes)      formData.append('wishes', wishes)
    if (extraSkills) formData.append('profile', extraSkills)

    try {
      const { data } = await api.post(API_ENDPOINTS.GENERATOR_ASSESSMENT_START, formData, { timeout: 30000 })
      setStep3AssessData(prev => ({
        ...prev,
        [p]: { status: 'running', total: data.total, done: 0, assessments: pageJobs.map(j => ({ ...j, status: 'pending' })) },
      }))
      step3AssessPollRef.current[p] = setInterval(async () => {
        try {
          const { data: ad } = await api.get(API_ENDPOINTS.GENERATOR_ASSESSMENT_STATUS(data.task_id))
          setStep3AssessData(prev => ({ ...prev, [p]: ad }))
          if (ad.status === 'completed' || ad.status === 'failed') {
            clearInterval(step3AssessPollRef.current[p])
            setStep3Assessing(prev => ({ ...prev, [p]: false }))
            if (ad.status === 'completed') toast.success(`Page ${p + 1} assessment done!`)
          }
        } catch { clearInterval(step3AssessPollRef.current[p]); setStep3Assessing(prev => ({ ...prev, [p]: false })) }
      }, 2000)
    } catch (err) {
      toast.error(err.message)
      setStep3Assessing(prev => ({ ...prev, [p]: false }))
    }
  }

  // Generate resumes & cover letters for selected jobs on a single page
  const handleStep3Generate = async (p) => {
    const pageJobs    = getPageJobs(p)
    const selection   = getPageSelection(p)
    const selectedList = [...selection].sort((a, b) => a - b).map(i => pageJobs[i])
    if (!resumeFiles.length || !selectedList.length) return

    setStep3Generating(prev => ({ ...prev, [p]: true }))
    clearInterval(step3PollRefs.current[p])

    const combinedSkills = [
      extraSkills,
      wishes ? `Career goals / what I'm looking for: ${wishes}` : '',
    ].filter(Boolean).join('\n\n')

    const formData = new FormData()
    resumeFiles.forEach(f => formData.append('resume_files', f))
    formData.append('extra_skills', combinedSkills)
    formData.append('home_location', homeLocation)
    formData.append('jobs_json', JSON.stringify(selectedList))
    formData.append('job_log_text', jobLogText)
    jobLogFiles.forEach(f => formData.append('job_log_files', f))

    try {
      const { data } = await api.post(API_ENDPOINTS.GENERATOR_RUN, formData, { timeout: 30000 })
      setStep3TaskIds(prev => ({ ...prev, [p]: data.task_id }))
      setStep3Results(prev => ({
        ...prev,
        [p]: { status: 'running', total: data.total, done: 0, jobs: selectedList.map(j => ({ ...j, status: 'pending' })) },
      }))

      step3PollRefs.current[p] = setInterval(async () => {
        try {
          const { data: bd } = await api.get(API_ENDPOINTS.GENERATOR_BATCH_STATUS(data.task_id))
          setStep3Results(prev => ({ ...prev, [p]: bd }))
          if (bd.status === 'completed' || bd.status === 'failed') {
            clearInterval(step3PollRefs.current[p])
            setStep3Generating(prev => ({ ...prev, [p]: false }))
            if (bd.status === 'completed') toast.success(`Page ${p + 1} — all resumes generated!`)
          }
        } catch { clearInterval(step3PollRefs.current[p]); setStep3Generating(prev => ({ ...prev, [p]: false })) }
      }, 2000)
    } catch (err) {
      toast.error(err.message)
      setStep3Generating(prev => ({ ...prev, [p]: false }))
    }
  }

  const handleStep3DownloadTracker = async (p) => {
    const taskId = step3TaskIds[p]
    if (!taskId) return
    try {
      const res = await api.get(API_ENDPOINTS.GENERATOR_EXPORT(taskId), { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `resume_tracker_page${p + 1}_${Date.now()}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Tracker downloaded!')
    } catch (err) { toast.error(err.message) }
  }

  const handleStep3DownloadZip = async (p) => {
    const taskId = step3TaskIds[p]
    if (!taskId) return
    try {
      const res = await api.get(API_ENDPOINTS.GENERATOR_DOWNLOAD_ZIP(taskId), { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }))
      const a = document.createElement('a'); a.href = url
      a.download = `resumes_page${p + 1}_${Date.now()}.zip`; a.click()
      URL.revokeObjectURL(url)
      toast.success('ZIP downloaded!')
    } catch (err) { toast.error(err.message) }
  }

  const handleDownloadFile = async (path) => {
    if (!path) return
    try {
      const res = await api.get(`/api/resume/download?path=${encodeURIComponent(path)}`, { responseType: 'blob' })
      const filename = path.split('/').pop() || 'resume'
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } catch (err) { toast.error('Download failed: ' + (err.response?.data?.detail || err.message)) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-container max-w-4xl">
      {/* Page header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900">Resume Generator</h1>
        <p className="mt-2 text-gray-500 max-w-xl mx-auto">
          Upload your resume, add your job list, and let Claude tailor a unique resume and cover letter for every role — all in one batch run.
        </p>
      </div>

      {/* How it works — 3-step inline guide */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          {
            num: '1',
            color: 'bg-violet-50 border-violet-100 text-violet-600',
            numColor: 'bg-violet-600',
            title: 'Upload your resume',
            desc: 'Drop in one or more resume files (PDF or Word). Optionally add extra skills and a work history log to give Claude more context.',
          },
          {
            num: '2',
            color: 'bg-sky-50 border-sky-100 text-sky-600',
            numColor: 'bg-sky-600',
            title: 'Add your jobs',
            desc: 'Choose how to add jobs: upload an Excel/CSV spreadsheet for batch runs, paste a single job description for a quick one-off, or search job boards directly. Run a Match Assessment to see your fit score.',
          },
          {
            num: '3',
            color: 'bg-green-50 border-green-100 text-green-600',
            numColor: 'bg-green-600',
            title: 'Generate & download',
            desc: 'Hit Generate and Claude tailors a resume + cover letter for every selected job. When done, download them all as a ZIP archive in one click.',
          },
        ].map(({ num, color, numColor, title, desc }) => (
          <div key={num} className={`rounded-2xl border p-4 flex gap-3 ${color}`}>
            <div className={`w-7 h-7 rounded-xl ${numColor} text-white text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5`}>
              {num}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800 leading-snug mb-1">{title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
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

          {/* ── Mode tab switcher (hidden once jobs are loaded) ── */}
          {step2Mode !== 'loaded' && (
            <div className="flex flex-wrap gap-1 p-1 bg-gray-100 rounded-2xl w-fit">
              <button
                type="button"
                onClick={() => setStep2Mode('upload')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                  ${step2Mode === 'upload'
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 active:scale-95'}`}
              >
                <TableIcon className="w-4 h-4" /> Upload Spreadsheet
              </button>
              <button
                type="button"
                onClick={() => { setSingleJob({ title: '', company: '', location: '', url: '', description: '' }); setStep2Mode('single') }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                  ${step2Mode === 'single'
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 active:scale-95'}`}
              >
                <FileTextIcon className="w-4 h-4" /> Single Job
              </button>
              <button
                type="button"
                onClick={() => setStep2Mode('search')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                  ${step2Mode === 'search'
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 active:scale-95'}`}
              >
                <SearchIcon className="w-4 h-4" /> Search Jobs
              </button>
              <button
                type="button"
                onClick={() => setStep2Mode('companies')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                  ${step2Mode === 'companies'
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 active:scale-95'}`}
              >
                <BuildingIcon className="w-4 h-4" /> Search by Company
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
                        onClick={(ev) => { ev.stopPropagation(); setSheetFile(null); setSheetPreview([]); setSheetError(''); setSheetNames([]); setSelectedSheet('') }}
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

                {/* Sheet picker — shown when Excel has multiple sheets */}
                {sheetNames.length > 0 && !sheetParsing && (
                  <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 space-y-3">
                    <p className="text-sm font-semibold text-brand-800 flex items-center gap-2">
                      <TableIcon className="w-4 h-4" />
                      This workbook has {sheetNames.length} sheets — select one to import:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {sheetNames.map(name => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setSelectedSheet(name)}
                          className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-all
                            ${selectedSheet === name
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:text-brand-700'}`}
                        >
                          {selectedSheet === name && <CheckIcon className="w-3 h-3 inline mr-1" />}
                          {name}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => parseSheet(sheetFile, selectedSheet)}
                      disabled={!selectedSheet}
                      className="btn-primary text-sm py-2 px-5"
                    >
                      <TableIcon className="w-4 h-4" /> Import "{selectedSheet}"
                    </button>
                  </div>
                )}

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

          {/* ── Single Job panel ── */}
          {step2Mode === 'single' && (
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <FileTextIcon className="w-4 h-4 text-brand-500" /> Single Job Info
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Fill in the details for one specific role — Claude will tailor your resume and write a cover letter just for it.
                </p>
              </div>
              <div className="card-body space-y-4">

                {/* Title + Company */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Job Title</label>
                    <input
                      type="text"
                      value={singleJob.title}
                      onChange={setSingleField('title')}
                      placeholder="e.g. Senior Software Engineer"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Company <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                    <input
                      type="text"
                      value={singleJob.company}
                      onChange={setSingleField('company')}
                      placeholder="e.g. Acme Corp"
                      className="input"
                    />
                  </div>
                </div>

                {/* Location + URL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Location <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                    <input
                      type="text"
                      value={singleJob.location}
                      onChange={setSingleField('location')}
                      placeholder="e.g. San Francisco, CA / Remote"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Job URL <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                    <input
                      type="url"
                      value={singleJob.url}
                      onChange={setSingleField('url')}
                      placeholder="https://..."
                      className="input"
                    />
                  </div>
                </div>

                {/* Job Description */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label !mb-0">Job Description</label>
                    <div className="flex items-center gap-2">
                      {singleJobUploading ? (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
                          Extracting…
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => singleJobDescRef.current?.click()}
                          className="text-xs text-brand-600 font-semibold hover:text-brand-700
                            flex items-center gap-1 active:scale-95 transition-all duration-150"
                        >
                          <UploadCloudIcon className="w-3.5 h-3.5" /> Upload PDF/DOC
                        </button>
                      )}
                      <input
                        ref={singleJobDescRef}
                        type="file"
                        accept=".pdf,.docx,.doc,.txt"
                        className="hidden"
                        onChange={handleSingleJobDescUpload}
                      />
                    </div>
                  </div>
                  <textarea
                    value={singleJob.description}
                    onChange={setSingleField('description')}
                    rows={8}
                    placeholder="Paste the full job description here, including responsibilities, requirements, and any other relevant details…&#10;&#10;Or click 'Upload PDF/DOC' above to extract text from a file."
                    className="input resize-none text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">
                    The more detail you provide, the better Claude can tailor your resume. Include the full JD if possible.
                  </p>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button type="button" onClick={() => setStep(1)} className="btn-secondary px-6">
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={loadSingleJob}
                    disabled={!singleJob.title.trim() && !singleJob.description.trim()}
                    className="btn-primary px-8 py-3 disabled:opacity-50"
                  >
                    <CheckIcon className="w-4 h-4" />
                    Use This Job & Continue
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
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

                {/* ══════════════════════════════════════════════════════════
                    AI PROFILE ANALYSIS — suggests job categories from resume
                ══════════════════════════════════════════════════════════ */}
                <div className="sm:col-span-2">
                  <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white overflow-hidden">

                    {/* Header row */}
                    <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <SparklesIcon className="w-4 h-4 text-violet-500 shrink-0" />
                        <span className="font-semibold text-violet-800 text-sm">AI Job Category Suggestions</span>
                        <span className="text-xs text-violet-400 font-normal hidden sm:inline">
                          — based on your resume &amp; profile
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAnalyseProfile}
                        disabled={profileSugLoading || (!resumeFiles.length && !skillTags.length && !extraSkills.trim() && !jobLogText.trim() && !wishes.trim())}
                        className="btn-primary shrink-0 py-2 px-4 text-sm bg-violet-600 hover:bg-violet-700 border-violet-600 disabled:opacity-50 flex items-center gap-1.5">
                        {profileSugLoading
                          ? <><Loader2Icon className="w-3.5 h-3.5 animate-spin" />Analysing…</>
                          : <><SparklesIcon className="w-3.5 h-3.5" />Analyse My Profile</>}
                      </button>
                    </div>

                    {/* No profile data hint */}
                    {!resumeFiles.length && !skillTags.length && !extraSkills.trim() && !jobLogText.trim() && !wishes.trim() && !profileSuggestions && (
                      <div className="px-4 pb-4 text-xs text-violet-400">
                        Upload a resume in Step 1, or add Skills / Job Goals / Job Log above — then click <strong className="font-semibold">Analyse My Profile</strong> to get personalised, scored job category suggestions.
                      </div>
                    )}

                    {/* Loading skeleton */}
                    {profileSugLoading && (
                      <div className="border-t border-violet-100 px-4 py-5 space-y-2">
                        {[1,2,3,4].map(i => (
                          <div key={i} className="flex items-center gap-3 animate-pulse">
                            <div className="w-10 h-5 rounded-full bg-violet-100" />
                            <div className="flex-1 h-4 rounded bg-gray-100" style={{width: `${55 + i * 10}%`}} />
                            <div className="w-16 h-5 rounded bg-gray-100" />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Error panel — shown when API call failed entirely (profileSuggestions is still null) */}
                    {!profileSugLoading && !profileSuggestions && profileSugError && (
                      <div className="border-t border-red-100 px-4 py-5 flex flex-col items-center gap-3 text-center bg-red-50/30">
                        <XCircleIcon className="w-5 h-5 text-red-400" />
                        <p className="text-sm text-red-600 font-medium">{profileSugError.error}</p>
                        {profileSugError.debug_info && (
                          <div className="mt-1 w-full max-w-md bg-white rounded-lg p-3 text-left border border-red-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Debug Info</p>
                            <p className="text-xs text-gray-500 break-words leading-relaxed whitespace-pre-wrap">{profileSugError.debug_info}</p>
                          </div>
                        )}
                        <button type="button"
                          onClick={handleAnalyseProfile}
                          className="mt-1 text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 flex items-center gap-1">
                          <SparklesIcon className="w-3 h-3" />Try Again
                        </button>
                      </div>
                    )}

                    {/* Results */}
                    {!profileSugLoading && profileSuggestions && (() => {
                      const suggestions  = profileSuggestions
                      const selCount     = [...profileSugSelected].length
                      const allCats      = suggestions.map(s => s.category)
                      const allSel       = allCats.length > 0 && allCats.every(c => profileSugSelected.has(c))

                      if (suggestions.length === 0) {
                        return (
                          <div className="border-t border-violet-100 px-4 py-6 flex flex-col items-center gap-3 text-center">
                            <SparklesIcon className="w-5 h-5 text-red-300" />
                            <p className="text-sm text-red-600 font-medium">
                              {profileSugError?.error || 'No suggestions returned'}
                            </p>
                            {profileSugError?.debug_info && (
                              <div className="mt-1 w-full max-w-md bg-gray-50 rounded-lg p-3 text-left">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Debug Info</p>
                                <p className="text-xs text-gray-500 break-words leading-relaxed whitespace-pre-wrap">{profileSugError.debug_info}</p>
                              </div>
                            )}
                            <button type="button"
                              onClick={handleAnalyseProfile}
                              className="mt-1 text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 flex items-center gap-1">
                              <SparklesIcon className="w-3 h-3" />Try Again
                            </button>
                          </div>
                        )
                      }

                      return (
                        <div className="border-t border-violet-100">
                          {/* Results sub-header */}
                          <div className="px-4 py-2 flex items-center justify-between bg-violet-50/60">
                            <span className="text-xs text-violet-600 font-medium">
                              {suggestions.length} categories found — sorted by match score
                            </span>
                            <button type="button"
                              onClick={() => allSel
                                ? setProfileSugSelected(new Set())
                                : setProfileSugSelected(new Set(allCats))}
                              className="text-xs text-violet-600 hover:underline font-semibold">
                              {allSel ? 'Deselect all' : 'Select all'}
                            </button>
                          </div>

                          {/* Suggestion rows */}
                          <div className="divide-y divide-gray-50">
                            {suggestions.map((s, idx) => {
                              const alreadyIn = searchCategories.includes(s.category)
                              const selected  = profileSugSelected.has(s.category)
                              const expanded  = profileSugExpanded.has(s.category)
                              const scoreColor =
                                s.score >= 85 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                s.score >= 70 ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                s.score >= 55 ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                'bg-gray-100 text-gray-600 border-gray-200'
                              const barColor =
                                s.score >= 85 ? 'bg-emerald-400' :
                                s.score >= 70 ? 'bg-blue-400' :
                                s.score >= 55 ? 'bg-amber-400' :
                                                'bg-gray-300'

                              return (
                                <div key={s.category}
                                  className={`px-4 py-2.5 transition-colors ${alreadyIn ? 'bg-gray-50/50' : selected ? 'bg-violet-50/40' : 'hover:bg-gray-50/40'}`}>
                                  <div className="flex items-center gap-2">
                                    {/* Rank */}
                                    <span className="text-[10px] font-bold text-gray-300 w-4 shrink-0 text-right">
                                      {idx + 1}
                                    </span>

                                    {/* Select checkbox */}
                                    <button type="button"
                                      onClick={() => !alreadyIn && toggleProfileSugSelect(s.category)}
                                      disabled={alreadyIn}
                                      className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors
                                        ${alreadyIn
                                          ? 'border-gray-200 bg-gray-100 cursor-default'
                                          : selected
                                            ? 'border-violet-500 bg-violet-500'
                                            : 'border-gray-300 bg-white hover:border-violet-400'}`}>
                                      {(selected || alreadyIn) && <CheckIcon className="w-2.5 h-2.5 text-white" />}
                                    </button>

                                    {/* Category name */}
                                    <span className={`flex-1 text-sm font-medium min-w-0 truncate
                                      ${alreadyIn ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                      {s.category}
                                    </span>

                                    {/* Score bar + badge */}
                                    <div className="flex items-center gap-2 shrink-0">
                                      <div className="hidden sm:flex items-center gap-1 w-20">
                                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                          <div className={`h-full rounded-full ${barColor} transition-all`}
                                            style={{width: `${s.score}%`}} />
                                        </div>
                                      </div>
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${scoreColor}`}>
                                        {s.score}%
                                      </span>
                                    </div>

                                    {/* Expand reason toggle */}
                                    <button type="button"
                                      onClick={() => toggleProfileSugExpand(s.category)}
                                      title="See how this score was computed"
                                      className="shrink-0 text-gray-300 hover:text-violet-500 transition-colors ml-0.5">
                                      <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                    </button>
                                  </div>

                                  {/* Expanded: reason + related titles */}
                                  {expanded && (
                                    <div className="mt-2 ml-10 space-y-2">
                                      <p className="text-xs text-gray-500 leading-relaxed">{s.reason}</p>
                                      {s.titles?.length > 0 && (
                                        <div>
                                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Related titles</p>
                                          <div className="flex flex-wrap gap-1">
                                            {s.titles.map(t => (
                                              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                                                {t}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* Bottom CTA */}
                          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
                            <span className="text-xs text-gray-500">
                              <span className="font-semibold text-violet-700">{selCount}</span> of {suggestions.length} selected
                            </span>
                            <div className="flex gap-2">
                              <button type="button"
                                onClick={() => { setProfileSuggestions(null); setProfileSugSelected(new Set()); setProfileSugExpanded(new Set()) }}
                                className="btn-secondary text-xs py-1.5 px-3">
                                Dismiss
                              </button>
                              <button type="button"
                                onClick={addProfileSuggestionsToCategories}
                                disabled={selCount === 0}
                                className="btn-primary text-xs py-1.5 px-4 disabled:opacity-50 flex items-center gap-1 bg-violet-600 hover:bg-violet-700 border-violet-600">
                                <CheckIcon className="w-3.5 h-3.5" />
                                Add {selCount > 0 ? selCount : ''} to Job Categories
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>

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

                  {/* Custom category input + AI suggestions */}
                  <div className="relative">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input type="text" value={customCatInput}
                          onChange={e => handleCatInputChange(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCat() } }}
                          onBlur={() => setTimeout(() => setCatSuggestions(null), 200)}
                          placeholder="Type a job title for AI suggestions…"
                          className={`input w-full text-sm py-2 pr-7 ${searchErrors.categories ? 'border-red-400' : ''}`} />
                        {catSuggesting && (
                          <Loader2Icon className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-400 animate-spin pointer-events-none" />
                        )}
                      </div>
                      <button type="button" onClick={addCustomCat} disabled={!customCatInput.trim()}
                        className="btn-secondary px-3 py-2 shrink-0" title="Add as-is">
                        <PlusIcon className="w-4 h-4" />
                      </button>
                    </div>

                    {/* ── AI suggestion dropdown ── */}
                    {catSuggestions && (catSuggestions.titles?.length > 0 || catSuggestions.categories?.length > 0) && (
                      <div className="absolute z-30 left-0 right-0 mt-1.5 rounded-2xl border border-brand-200 bg-white shadow-xl shadow-brand-100/40 overflow-hidden">
                        {/* Family header */}
                        {catSuggestions.family && (
                          <div className="flex items-center gap-1.5 px-3 py-2 bg-brand-50 border-b border-brand-100">
                            <SparklesIcon className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                            <span className="text-xs font-semibold text-brand-700">{catSuggestions.family}</span>
                          </div>
                        )}

                        <div className="p-3 space-y-3 max-h-72 overflow-y-auto">
                          {/* Job titles */}
                          {catSuggestions.titles?.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Job Titles</p>
                              <div className="flex flex-wrap gap-1.5">
                                {catSuggestions.titles.map(t => {
                                  const already = searchCategories.includes(t)
                                  return (
                                    <button key={t} type="button"
                                      onClick={() => addSuggestedCat(t)}
                                      disabled={already}
                                      className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all
                                        ${already
                                          ? 'bg-brand-100 border-brand-200 text-brand-400 cursor-default'
                                          : 'bg-white border-gray-200 text-gray-700 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-800'}`}>
                                      {already ? <CheckIcon className="inline w-3 h-3 mr-0.5" /> : <PlusIcon className="inline w-3 h-3 mr-0.5" />}
                                      {t}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Search categories */}
                          {catSuggestions.categories?.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Search Categories</p>
                              <div className="flex flex-wrap gap-1.5">
                                {catSuggestions.categories.map(c => {
                                  const already = searchCategories.includes(c)
                                  return (
                                    <button key={c} type="button"
                                      onClick={() => addSuggestedCat(c)}
                                      disabled={already}
                                      className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all
                                        ${already
                                          ? 'bg-teal-100 border-teal-200 text-teal-400 cursor-default'
                                          : 'bg-white border-teal-200 text-teal-700 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-800'}`}>
                                      {already ? <CheckIcon className="inline w-3 h-3 mr-0.5" /> : <PlusIcon className="inline w-3 h-3 mr-0.5" />}
                                      {c}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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

          {/* ══════════ Search by Company panel ══════════ */}
          {step2Mode === 'companies' && (
            <div className="space-y-4">
              {/* Step A — Discover companies */}
              <div className="card">
                <div className="card-header">
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                    <BuildingIcon className="w-4 h-4 text-brand-500" /> Discover Companies Near You
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">AI will find notable companies in your area and check which ones have job boards on Greenhouse or Lever.</p>
                </div>
                <div className="card-body space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Location</label>
                      <LocationAutocomplete
                        value={companyLocation}
                        onChange={setCompanyLocation}
                        placeholder="City, state or zip"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Radius (miles)</label>
                      <div className="flex flex-wrap gap-1">
                        {[10, 25, 50, 100].map(r => (
                          <button key={r} type="button"
                            onClick={() => setCompanyRadius(r)}
                            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all border
                              ${companyRadius === r
                                ? 'bg-brand-600 text-white border-brand-600'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}
                          >{r}mi</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button type="button"
                    onClick={async () => {
                      if (!companyLocation.trim()) { toast.error('Enter a location first'); return }
                      setDiscovering(true)
                      setDiscoveredCompanies([])
                      setSelectedCompanies(new Set())
                      try {
                        const { data } = await api.post(API_ENDPOINTS.JOBS_DISCOVER_COMPANIES, {
                          location: companyLocation, radius: companyRadius
                        })
                        const list = data.companies || []
                        setDiscoveredCompanies(list)
                        // Auto-select companies that have Greenhouse or Lever boards
                        const autoSelect = new Set()
                        list.forEach((c, i) => { if (c.greenhouse_slug || c.lever_slug) autoSelect.add(i) })
                        setSelectedCompanies(autoSelect)
                        if (list.length === 0) toast.error('No companies found for that area.')
                        else toast.success(`Found ${list.length} companies!`)
                      } catch (err) {
                        toast.error(err.message || 'Failed to discover companies')
                      } finally {
                        setDiscovering(false)
                      }
                    }}
                    disabled={discovering || !companyLocation.trim()}
                    className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2"
                  >
                    {discovering
                      ? <><Loader2Icon className="w-4 h-4 animate-spin" /> Discovering…</>
                      : <><SparklesIcon className="w-4 h-4" /> Discover Companies</>
                    }
                  </button>
                </div>
              </div>

              {/* Company results list */}
              {discoveredCompanies.length > 0 && (
                <div className="card">
                  <div className="card-header flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                      <GlobeIcon className="w-4 h-4 text-brand-500" />
                      {discoveredCompanies.length} Companies Found
                      <span className="text-xs font-normal text-gray-400 ml-1">
                        ({selectedCompanies.size} selected)
                      </span>
                    </h2>
                    <button type="button"
                      onClick={() => {
                        if (selectedCompanies.size === discoveredCompanies.length) setSelectedCompanies(new Set())
                        else setSelectedCompanies(new Set(discoveredCompanies.map((_, i) => i)))
                      }}
                      className="text-xs text-brand-600 hover:underline font-semibold">
                      {selectedCompanies.size === discoveredCompanies.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                    {discoveredCompanies.map((c, i) => (
                      <label key={i}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                          ${selectedCompanies.has(i) ? 'bg-brand-50/50' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox"
                          checked={selectedCompanies.has(i)}
                          onChange={() => setSelectedCompanies(prev => {
                            const next = new Set(prev)
                            next.has(i) ? next.delete(i) : next.add(i)
                            return next
                          })}
                          className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-gray-900">{c.name}</span>
                            {c.industry && (
                              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{c.industry}</span>
                            )}
                            {c.greenhouse_slug && (
                              <span className="text-xs bg-green-100 text-green-800 border border-green-300 px-2 py-0.5 rounded-full font-medium">
                                Greenhouse
                              </span>
                            )}
                            {c.lever_slug && (
                              <span className="text-xs bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-300 px-2 py-0.5 rounded-full font-medium">
                                Lever
                              </span>
                            )}
                            {!c.greenhouse_slug && !c.lever_slug && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Career page only</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                            {c.career_url && (
                              <a href={c.career_url} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-brand-500 hover:underline flex items-center gap-1">
                                <ExternalLinkIcon className="w-3 h-3" /> Careers
                              </a>
                            )}
                            {c.website && (
                              <a href={c.website} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-gray-400 hover:text-gray-600 hover:underline flex items-center gap-1">
                                <GlobeIcon className="w-3 h-3" /> Website
                              </a>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Step B — Category filter + search */}
                  {selectedCompanies.size > 0 && (
                    <div className="border-t border-gray-100 px-4 py-4 space-y-3 bg-gray-50/30">
                      <p className="text-xs font-semibold text-gray-600">Filter by Job Category <span className="font-normal text-gray-400">(optional — leave empty for all jobs)</span></p>
                      <div className="flex flex-wrap gap-1.5">
                        {PRESET_CATEGORIES.slice(0, 12).map(cat => (
                          <button key={cat} type="button"
                            onClick={() => setCompanySearchCats(prev =>
                              prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                            )}
                            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all border
                              ${companySearchCats.includes(cat)
                                ? 'bg-brand-600 text-white border-brand-600'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}
                          >{cat}</button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input type="text" value={companyCustomCat}
                          onChange={e => setCompanyCustomCat(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (companyCustomCat.trim()) { setCompanySearchCats(prev => [...prev, companyCustomCat.trim()]); setCompanyCustomCat('') } } }}
                          placeholder="Add custom category…"
                          className="input flex-1 text-sm" />
                        <button type="button"
                          onClick={() => { if (companyCustomCat.trim()) { setCompanySearchCats(prev => [...prev, companyCustomCat.trim()]); setCompanyCustomCat('') } }}
                          className="btn-secondary text-xs px-3">
                          <PlusIcon className="w-3 h-3" />
                        </button>
                      </div>
                      {companySearchCats.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {companySearchCats.map(cat => (
                            <span key={cat} className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 text-xs font-medium px-2.5 py-1 rounded-full">
                              {cat}
                              <button type="button" onClick={() => setCompanySearchCats(prev => prev.filter(c => c !== cat))}
                                className="hover:text-brand-900"><XIcon className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}

                      <button type="button"
                        onClick={async () => {
                          const selected = [...selectedCompanies].map(i => discoveredCompanies[i])
                          const hasBoards = selected.filter(c => c.greenhouse_slug || c.lever_slug)
                          if (hasBoards.length === 0) {
                            toast.error('None of the selected companies have Greenhouse or Lever boards. Select companies with green or pink tags.')
                            return
                          }
                          setCompanySearching(true)
                          setJobs([])
                          setSelectedJobs(new Set())
                          setSearchStatus('running')
                          setSearchSources(null)
                          setSearchSourceErrors(null)
                          clearInterval(pollRef.current)
                          try {
                            const { data } = await api.post(API_ENDPOINTS.JOBS_SEARCH_BY_COMPANIES, {
                              companies: hasBoards.map(c => ({
                                name: c.name, greenhouse_slug: c.greenhouse_slug, lever_slug: c.lever_slug, industry: c.industry
                              })),
                              categories: companySearchCats,
                              location: companyLocation,
                            })
                            setSearchTaskId(data.task_id)
                            pollRef.current = setInterval(async () => {
                              try {
                                const { data: t } = await api.get(API_ENDPOINTS.GENERATOR_TASK(data.task_id))
                                setSearchStatus(t.status)
                                if (t.status === 'completed') {
                                  clearInterval(pollRef.current)
                                  setCompanySearching(false)
                                  const results = t.results || []
                                  setJobs(results)
                                  setJobsPage(0)
                                  setSearchSources(t.sources || null)
                                  setSearchSourceErrors(t.source_errors || null)
                                  setSelectedJobs(new Set(results.map((_, i) => i)))
                                  if (results.length === 0) toast.error('No matching jobs found at those companies.')
                                  else toast.success(`Found ${results.length} jobs across ${hasBoards.length} companies!`)
                                } else if (t.status === 'failed') {
                                  clearInterval(pollRef.current)
                                  setCompanySearching(false)
                                  toast.error(t.error || 'Search failed')
                                }
                              } catch { clearInterval(pollRef.current); setCompanySearching(false) }
                            }, SEARCH_POLL_INTERVAL_MS)
                          } catch (err) {
                            toast.error(err.message)
                            setCompanySearching(false)
                            setSearchStatus(null)
                          }
                        }}
                        disabled={companySearching}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                      >
                        {companySearching
                          ? <><Loader2Icon className="w-4 h-4 animate-spin" /> Searching company boards…</>
                          : <><SearchIcon className="w-4 h-4" /> Search {selectedCompanies.size} Companies</>
                        }
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* end step2Mode === 'companies' */}

          {/* ── 0 jobs found error panel ── */}
          {searchStatus === 'completed' && jobs.length === 0 && (step2Mode === 'search' || step2Mode === 'companies') && !searching && !companySearching && (
            <div className="card border-red-200 bg-red-50">
              <div className="card-header flex items-center gap-2 pb-3">
                <AlertCircleIcon className="w-5 h-5 text-red-500 shrink-0" />
                <h2 className="font-semibold text-red-800">No jobs found</h2>
              </div>
              <p className="text-sm text-red-700 mb-4">
                The search completed but returned 0 results. This is usually caused by API errors or
                overly specific filters. Try broadening your search or removing location/date filters.
              </p>

              {/* Per-source breakdown */}
              {(searchSources || searchSourceErrors) && (() => {
                const allSources = new Set([
                  ...Object.keys(searchSources  || {}),
                  ...Object.keys(searchSourceErrors || {}),
                ])
                return (
                  <div className="overflow-x-auto rounded-xl border border-red-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-red-100 text-red-700">
                          <th className="text-left px-3 py-2 font-semibold">Source</th>
                          <th className="text-center px-3 py-2 font-semibold w-20">Jobs</th>
                          <th className="text-left px-3 py-2 font-semibold">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...allSources].map(src => {
                          const count = searchSources?.[src]
                          const err   = searchSourceErrors?.[src]
                          return (
                            <tr key={src} className="border-t border-red-100 even:bg-red-50/40">
                              <td className="px-3 py-2 font-medium text-gray-700">{src === 'USAJOBS' ? 'US Government Jobs' : src}</td>
                              <td className="px-3 py-2 text-center">
                                {count != null
                                  ? <span className={`inline-block px-2 py-0.5 rounded-full font-semibold ${count > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
                                  : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-3 py-2 text-red-600 font-mono break-all">
                                {err || <span className="text-gray-400 font-sans">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Results — shown for both search results and spreadsheet-loaded jobs */}
          {jobs.length > 0 && (() => {
            const jobsTotalPages  = Math.max(1, Math.ceil(jobs.length / JOBS_PAGE_SIZE))
            const jobsPageStart   = jobsPage * JOBS_PAGE_SIZE
            const jobsPageEnd     = Math.min(jobsPageStart + JOBS_PAGE_SIZE, jobs.length)
            const visibleJobs     = jobs.slice(jobsPageStart, jobsPageEnd)

            // Source colour map for badges
            const sourceColours = {
              'USAJOBS':          'bg-emerald-100 text-emerald-800 border-emerald-300',
              'JSearch':          'bg-sky-100 text-sky-800 border-sky-300',
              'Indeed':           'bg-indigo-100 text-indigo-800 border-indigo-300',
              'The Muse':         'bg-violet-100 text-violet-800 border-violet-300',
              'Remotive':         'bg-teal-100 text-teal-800 border-teal-300',
              'RemoteOK':         'bg-cyan-100 text-cyan-800 border-cyan-300',
              'Jobicy':           'bg-lime-100 text-lime-800 border-lime-300',
              'We Work Remotely': 'bg-amber-100 text-amber-800 border-amber-300',
              'Himalayas':        'bg-rose-100 text-rose-800 border-rose-300',
              'Arbeit Now':       'bg-orange-100 text-orange-800 border-orange-300',
              'Google Jobs':      'bg-blue-100 text-blue-800 border-blue-300',
              'Greenhouse':       'bg-green-100 text-green-800 border-green-300',
              'Lever':            'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300',
            }
            const defaultSourceColour = 'bg-gray-100 text-gray-700 border-gray-300'

            // Friendly display name for sources
            const sourceDisplayName = (src) => src === 'USAJOBS' ? 'US Government Jobs' : src

            return (
              <div className="card">
                {/* Header */}
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

                {/* Per-source result counts summary */}
                {searchSources && Object.keys(searchSources).length > 0 && (
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60" data-testid="source-summary">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Results by Source</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(searchSources)
                        .sort(([,a], [,b]) => b - a)
                        .map(([src, count]) => (
                          <span key={src}
                            className={`inline-flex items-center gap-1.5 text-xs font-medium border px-2.5 py-1 rounded-full ${sourceColours[src] || defaultSourceColour}`}>
                            {sourceDisplayName(src)}
                            <span className="inline-flex items-center justify-center bg-white/60 text-[10px] font-bold rounded-full w-5 h-5">{count}</span>
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {/* Job rows — current page only */}
                <div className="divide-y divide-gray-100">
                  {visibleJobs.map((job, pageLocalIdx) => {
                    const i = jobsPageStart + pageLocalIdx   // global index
                    return (
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
                            {job.source && job.source !== 'spreadsheet' && (
                              <span className={`text-xs border px-2 py-0.5 rounded-full font-medium shrink-0 ${sourceColours[job.source] || defaultSourceColour}`}
                                data-testid="job-source-badge">
                                {sourceDisplayName(job.source)}
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
                          {/* Enrichment tags — industry, org type, company size */}
                          {(job.industry || job.org_type || job.company_size) && (
                            <div className="flex gap-1.5 mt-1.5 flex-wrap">
                              {job.industry && (
                                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium shrink-0">
                                  {job.industry}
                                </span>
                              )}
                              {job.org_type && (() => {
                                const colours = {
                                  'Government':  'bg-green-50 text-green-700 border-green-200',
                                  'Non-Profit':  'bg-amber-50 text-amber-700 border-amber-200',
                                  'For-Profit':  'bg-gray-50 text-gray-600 border-gray-200',
                                }
                                const cls = colours[job.org_type] || 'bg-gray-50 text-gray-600 border-gray-200'
                                return (
                                  <span className={`text-xs border px-2 py-0.5 rounded-full font-medium shrink-0 ${cls}`}>
                                    {job.org_type}
                                  </span>
                                )
                              })()}
                              {job.company_size && (
                                <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-medium shrink-0">
                                  {job.company_size}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {selectedJobs.has(i) && <CheckCircleIcon className="w-4 h-4 text-brand-500 shrink-0 mt-1" />}
                      </label>
                    )
                  })}
                </div>

                {/* Pagination footer */}
                {jobsTotalPages > 1 && (
                  <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
                    <button
                      onClick={() => setJobsPage(p => p - 1)}
                      disabled={jobsPage === 0}
                      className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
                    >
                      ← Prev
                    </button>

                    <div className="flex items-center gap-1.5 flex-wrap justify-center">
                      {Array.from({ length: jobsTotalPages }, (_, pi) => (
                        <button key={pi} onClick={() => setJobsPage(pi)}
                          className={`w-7 h-7 rounded-full text-xs font-semibold transition-colors
                            ${pi === jobsPage
                              ? 'bg-brand-600 text-white'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {pi + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setJobsPage(p => p + 1)}
                      disabled={jobsPage === jobsTotalPages - 1}
                      className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Match Assessment Panel ── */}
          {jobs.length > 0 && (
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4 text-brand-500" />
                    Match Assessment
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Claude analyses your resume against each job — scores strengths, gaps, and what to improve.
                    {!resumeFiles.length && <span className="text-amber-500 ml-1">Upload a resume in Step 1 first.</span>}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {assessData?.status === 'completed' && (
                    <button onClick={handleDownloadAssessment} className="btn-secondary text-sm py-1.5">
                      <FileSpreadsheetIcon className="w-4 h-4 text-green-600" /> Export Excel
                    </button>
                  )}
                  <button
                    onClick={handleRunAssessment}
                    disabled={assessing || !resumeFiles.length}
                    className="btn-primary text-sm py-1.5 disabled:opacity-50"
                  >
                    {assessing
                      ? <><Loader2Icon className="w-4 h-4 animate-spin" /> Analysing…</>
                      : assessData
                        ? <><RefreshCwIcon className="w-4 h-4" /> Re-run</>
                        : <><SparklesIcon className="w-4 h-4" /> Run Assessment</>}
                  </button>
                </div>
              </div>

              {/* Progress bar while running */}
              {assessData && assessData.status === 'running' && (
                <div className="px-5 pt-3 pb-1">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full transition-all duration-500"
                      style={{ width: `${assessData.total ? (assessData.done / assessData.total) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{assessData.done} of {assessData.total} assessed…</p>
                </div>
              )}

              {/* ── Sorted results with top-N filter + checkboxes ── */}
              {assessData?.assessments?.length > 0 && (() => {
                // Attach original index, sort done jobs by score desc, pending/running at bottom
                const withIdx = assessData.assessments.map((a, i) => ({ ...a, jobIdx: i }))
                const done    = withIdx.filter(a => a.status === 'done' && a.match_score !== undefined)
                  .sort((a, b) => b.match_score - a.match_score)
                const notDone = withIdx.filter(a => a.status !== 'done' || a.match_score === undefined)
                const sorted  = [...done, ...notDone]
                const topNOpts = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].filter(n => n <= sorted.length)
                // Clamp topN to actual count
                const effectiveTopN = Math.min(assessTopN, sorted.length)
                const displayed     = sorted.slice(0, effectiveTopN)
                const dispSelected  = displayed.filter(a => selectedJobs.has(a.jobIdx))
                const allDispSel    = displayed.length > 0 && dispSelected.length === displayed.length

                const toggleAllDisplayed = () => {
                  const idxSet = new Set(displayed.map(a => a.jobIdx))
                  if (allDispSel) {
                    setSelectedJobs(prev => new Set([...prev].filter(i => !idxSet.has(i))))
                  } else {
                    setSelectedJobs(prev => new Set([...prev, ...idxSet]))
                  }
                }

                return (
                  <div>
                    {/* Toolbar: top-N filter + select controls */}
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap bg-gray-50/60">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-gray-500 shrink-0">Show top:</span>
                        {topNOpts.map(n => (
                          <button key={n} type="button"
                            onClick={() => setAssessTopN(n)}
                            className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-all
                              ${effectiveTopN === n
                                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-600'}`}>
                            {n}
                          </button>
                        ))}
                        {/* If total < 10, still show total */}
                        {topNOpts.length === 0 && (
                          <span className="text-xs text-gray-400">{sorted.length} result{sorted.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-gray-400">
                          <span className="font-semibold text-brand-600">{dispSelected.length}</span> of {displayed.length} selected
                        </span>
                        <button type="button" onClick={toggleAllDisplayed}
                          className="text-xs text-brand-600 hover:underline font-semibold">
                          {allDispSel ? 'Deselect all' : 'Select all visible'}
                        </button>
                      </div>
                    </div>

                    {/* Sorted rows */}
                    <div className="divide-y divide-gray-100">
                      {displayed.map((a, rank) => {
                        const score      = a.match_score
                        const level      = a.match_level
                        const isOpen     = assessExpanded[a.jobIdx]
                        const isSelected = selectedJobs.has(a.jobIdx)
                        const scoreColor =
                          level === 'Excellent' ? 'text-green-700 bg-green-100 border-green-200' :
                          level === 'Strong'    ? 'text-blue-700  bg-blue-100  border-blue-200'  :
                          level === 'Good'      ? 'text-yellow-700 bg-yellow-100 border-yellow-200' :
                          level === 'Fair'      ? 'text-orange-700 bg-orange-100 border-orange-200' :
                          level === 'Weak'      ? 'text-red-700   bg-red-100   border-red-200'   :
                                                 'text-gray-500  bg-gray-100  border-gray-200'
                        const barColor =
                          level === 'Excellent' ? 'bg-green-500' :
                          level === 'Strong'    ? 'bg-blue-500'  :
                          level === 'Good'      ? 'bg-yellow-400':
                          level === 'Fair'      ? 'bg-orange-400':
                                                 'bg-red-400'

                        return (
                          <div key={a.jobIdx}
                            className={`transition-colors ${isSelected ? 'bg-brand-50/40' : isOpen ? 'bg-gray-50/60' : ''}`}>

                            {/* Row — checkbox + score + info + expand */}
                            <div className="flex items-center gap-3 px-4 py-3.5">
                              {/* Rank */}
                              <span className="text-[10px] text-gray-300 font-bold w-5 shrink-0 text-center select-none">
                                {rank + 1}
                              </span>

                              {/* Checkbox */}
                              <input type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleJob(a.jobIdx)}
                                className="w-4 h-4 accent-brand-600 shrink-0 cursor-pointer" />

                              {/* Score badge */}
                              {a.status === 'pending'
                                ? <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                                    <ClockIcon className="w-4.5 h-4.5 text-gray-300" />
                                  </div>
                                : a.status === 'done' && score !== undefined
                                  ? <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 border font-bold ${scoreColor}`}>
                                      <span className="text-sm leading-none">{score}</span>
                                      <span className="text-[9px] leading-none mt-0.5 font-medium opacity-70">/100</span>
                                    </div>
                                  : <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                                      <Loader2Icon className="w-4 h-4 text-brand-400 animate-spin" />
                                    </div>
                              }

                              {/* Job info + expand toggle */}
                              <button type="button"
                                onClick={() => setAssessExpanded(prev => ({ ...prev, [a.jobIdx]: !prev[a.jobIdx] }))}
                                className="flex-1 min-w-0 text-left">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold text-gray-900 text-sm leading-snug">{a.title}</p>
                                  {level && level !== 'Unknown' && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${scoreColor}`}>{level}</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">{a.company}{a.location ? ` · ${a.location}` : ''}</p>
                                {score !== undefined && (
                                  <div className="mt-1.5 h-1 w-28 bg-gray-200 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                                      style={{ width: `${score}%` }} />
                                  </div>
                                )}
                              </button>

                              <div className="shrink-0 text-gray-300">
                                {isOpen ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                              </div>
                            </div>

                            {/* Expanded detail */}
                            {isOpen && a.status === 'done' && (
                              <div className="px-14 pb-4 space-y-3">
                                <div className="grid sm:grid-cols-2 gap-3">
                                  {a.strengths?.length > 0 && (
                                    <div className="rounded-xl bg-green-50 border border-green-200 p-3">
                                      <p className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1">
                                        <CheckCircleIcon className="w-3.5 h-3.5" /> Strengths
                                      </p>
                                      <ul className="space-y-1">
                                        {a.strengths.map((s, si) => (
                                          <li key={si} className="text-xs text-green-800 flex gap-1.5">
                                            <span className="shrink-0 mt-0.5">•</span>{s}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {a.weaknesses?.length > 0 && (
                                    <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                                      <p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
                                        <XCircleIcon className="w-3.5 h-3.5" /> Gaps
                                      </p>
                                      <ul className="space-y-1">
                                        {a.weaknesses.map((w, wi) => (
                                          <li key={wi} className="text-xs text-red-800 flex gap-1.5">
                                            <span className="shrink-0 mt-0.5">•</span>{w}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                                {a.key_skills_to_develop?.length > 0 && (
                                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                                    <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                                      <StarIcon className="w-3.5 h-3.5" /> Skills to Develop
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {a.key_skills_to_develop.map((sk, ki) => (
                                        <span key={ki} className="text-xs bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">{sk}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {a.recommendation && (
                                  <div className="rounded-xl bg-brand-50 border border-brand-200 p-3">
                                    <p className="text-xs font-semibold text-brand-700 mb-1 flex items-center gap-1">
                                      <SparklesIcon className="w-3.5 h-3.5" /> Recommendation
                                    </p>
                                    <p className="text-xs text-brand-800 leading-relaxed">{a.recommendation}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* ── Bottom CTA bar ── */}
                    {assessData.status === 'completed' && (
                      <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-4 flex-wrap">
                        {/* Left: selection count + download */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <p className="text-sm text-gray-500">
                            <span className="font-semibold text-brand-700">{selectedJobs.size}</span> job{selectedJobs.size !== 1 ? 's' : ''} selected for generation
                          </p>
                          <button
                            onClick={handleDownloadAssessment}
                            className="btn-secondary text-sm py-1.5 px-4 flex items-center gap-1.5 border-green-300 text-green-700 hover:bg-green-50">
                            <DownloadIcon className="w-4 h-4" />
                            Download Assessment Report
                          </button>
                        </div>
                        {/* Right: generate */}
                        <button
                          onClick={() => selectedJobs.size > 0 ? setStep(3) : toast.error('Select at least one job')}
                          disabled={selectedJobs.size === 0}
                          className="btn-primary px-8 py-2.5 disabled:opacity-50">
                          Generate Resumes &amp; Cover Letters <ChevronRightIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })()}

              {!assessData && !assessing && (
                <div className="card-body text-center py-8 text-gray-400">
                  <SparklesIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Click <strong className="text-gray-600">Run Assessment</strong> to score every job against your resume — sorted from best match to weakest.</p>
                </div>
              )}
            </div>
          )}

          {/* Bottom nav — show Back always; show Generate only when assessment hasn't completed yet
              (once assessment is done the Generate CTA lives inside the assessment panel) */}
          {jobs.length > 0 && (
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary px-6">← Back</button>
              {assessData?.status !== 'completed' && (
                <button
                  onClick={() => selectedJobs.size > 0 ? setStep(3) : toast.error('Select at least one job')}
                  disabled={selectedJobs.size === 0}
                  className="btn-primary px-8 py-3">
                  Generate for {selectedJobs.size} job{selectedJobs.size !== 1 ? 's' : ''} <ChevronRightIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          STEP 3 — Paginated batch: 10 jobs per page
          Each page: Match Assessment → select jobs → Generate
      ══════════════════════════════════════════════════════════════ */}
      {step === 3 && (() => {
        const pageJobs      = getPageJobs(step3Page)
        const pageSelection = getPageSelection(step3Page)
        const pageResult    = step3Results[step3Page]
        const pageAssess    = step3AssessData[step3Page]
        const isGenerating  = !!step3Generating[step3Page]
        const isAssessing   = !!step3Assessing[step3Page]
        const firstJobNum   = step3Page * BATCH_PAGE_SIZE + 1
        const lastJobNum    = Math.min((step3Page + 1) * BATCH_PAGE_SIZE, step3AllJobs.length)

        return (
          <div className="space-y-5">

            {/* ── Page header ── */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 text-lg">
                  Batch {step3Page + 1} of {step3TotalPages}
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    (jobs {firstJobNum}–{lastJobNum} of {step3AllJobs.length})
                  </span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Run assessment, select which jobs to generate, then click Generate.
                </p>
              </div>
              <button onClick={() => setStep(2)} className="btn-secondary text-sm px-4">← Back to Jobs</button>
            </div>

            {/* ── 1. Match Assessment card ── */}
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4 text-brand-500" /> Match Assessment
                    <span className="text-xs font-normal text-gray-400">— optional but recommended</span>
                  </h3>
                  {!resumeFiles.length && (
                    <p className="text-xs text-amber-500 mt-0.5">Upload a resume in Step 1 first.</p>
                  )}
                </div>
                <button
                  onClick={() => handleStep3Assess(step3Page)}
                  disabled={isAssessing || !resumeFiles.length}
                  className="btn-primary text-sm py-1.5 disabled:opacity-50 shrink-0"
                >
                  {isAssessing
                    ? <><Loader2Icon className="w-4 h-4 animate-spin" /> Analysing…</>
                    : pageAssess
                      ? <><RefreshCwIcon className="w-4 h-4" /> Re-run</>
                      : <><SparklesIcon className="w-4 h-4" /> Run Assessment</>}
                </button>
              </div>

              {/* Assessment progress bar */}
              {pageAssess?.status === 'running' && (
                <div className="px-5 pt-3 pb-1">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full transition-all duration-500"
                      style={{ width: `${pageAssess.total ? (pageAssess.done / pageAssess.total) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{pageAssess.done} of {pageAssess.total} assessed…</p>
                </div>
              )}

              {!pageAssess && !isAssessing && (
                <div className="card-body text-center py-6 text-gray-400">
                  <SparklesIcon className="w-7 h-7 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Click <strong className="text-gray-600">Run Assessment</strong> to see your match score for each job before generating.</p>
                </div>
              )}
            </div>

            {/* ── 2. Job selection + inline assessment scores ── */}
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">
                  Select jobs to generate
                  <span className="ml-2 badge badge-blue">{pageSelection.size} selected</span>
                </h3>
                <button onClick={() => toggleAllPage(step3Page)}
                  className="text-sm text-brand-600 hover:underline font-medium">
                  {pageSelection.size === pageJobs.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div className="divide-y divide-gray-100">
                {pageJobs.map((job, localIdx) => {
                  const assessment = pageAssess?.assessments?.[localIdx]
                  const score      = assessment?.match_score
                  const level      = assessment?.match_level
                  const scoreColor =
                    level === 'Excellent' ? 'text-green-700 bg-green-100 border-green-200' :
                    level === 'Strong'    ? 'text-blue-700  bg-blue-100  border-blue-200'  :
                    level === 'Good'      ? 'text-yellow-700 bg-yellow-100 border-yellow-200' :
                    level === 'Fair'      ? 'text-orange-700 bg-orange-100 border-orange-200' :
                    level === 'Weak'      ? 'text-red-700   bg-red-100   border-red-200'   : ''
                  const isChecked  = pageSelection.has(localIdx)

                  return (
                    <label key={localIdx}
                      className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer transition-colors
                        ${isChecked ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                      <input type="checkbox" checked={isChecked}
                        onChange={() => togglePageJob(step3Page, localIdx)}
                        className="mt-1 w-4 h-4 accent-brand-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 text-sm">{job.title}</p>
                          {level && level !== 'Unknown' && (
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${scoreColor}`}>{level}</span>
                          )}
                        </div>
                        <p className="text-brand-600 text-xs font-medium mt-0.5">{job.company}</p>
                        <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                          {job.location && <span className="flex items-center gap-1"><MapPinIcon className="w-3 h-3" />{job.location}</span>}
                          {job.posted_date && <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" />{job.posted_date}</span>}
                        </div>
                      </div>
                      {/* Score badge */}
                      {score !== undefined && (
                        <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 border font-bold text-xs ${scoreColor}`}>
                          <span className="text-sm leading-none">{score}</span>
                          <span className="text-[9px] opacity-70">/100</span>
                        </div>
                      )}
                      {assessment?.status === 'processing' && (
                        <Loader2Icon className="w-5 h-5 text-brand-400 animate-spin shrink-0 mt-2" />
                      )}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* ── 3. Generate button + results ── */}
            <div className="card">
              {/* Generate action row */}
              {!pageResult && (
                <div className="card-body flex items-center justify-between gap-4">
                  <p className="text-sm text-gray-500">
                    Claude will tailor your resume <strong>and</strong> write a cover letter for each selected job (PDF + DOCX).
                  </p>
                  <button
                    onClick={() => handleStep3Generate(step3Page)}
                    disabled={isGenerating || pageSelection.size === 0}
                    className="btn-primary px-7 py-2.5 shrink-0 disabled:opacity-50"
                  >
                    <SparklesIcon className="w-4 h-4" />
                    Generate {pageSelection.size} Resume{pageSelection.size !== 1 ? 's' : ''} &amp; Cover Letters
                  </button>
                </div>
              )}

              {/* Progress + per-job results */}
              {pageResult && (
                <>
                  <div className="card-header flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-gray-800">
                        {pageResult.status === 'completed' ? 'Done' : 'Generating…'}
                      </h3>
                      <span className="badge badge-blue">{pageResult.done}/{pageResult.total}</span>
                    </div>
                    {pageResult.status === 'completed' && (
                      <div className="flex gap-2">
                        <button onClick={() => handleStep3DownloadZip(step3Page)} className="btn-primary text-sm py-1.5">
                          <DownloadIcon className="w-4 h-4" /> ZIP
                        </button>
                        <button onClick={() => handleStep3DownloadTracker(step3Page)} className="btn-secondary text-sm py-1.5">
                          <FileSpreadsheetIcon className="w-4 h-4 text-green-600" /> Tracker
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="px-5 pt-3 pb-1">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full transition-all duration-500"
                        style={{ width: `${pageResult.total ? (pageResult.done / pageResult.total) * 100 : 0}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1 text-right">
                      {pageResult.total ? Math.round((pageResult.done / pageResult.total) * 100) : 0}%
                    </p>
                  </div>

                  {/* Per-job rows */}
                  <div className="divide-y divide-gray-100">
                    {pageResult.jobs.map((job, i) => (
                      <div key={i} className={`px-5 py-3.5 flex items-start gap-3 transition-colors
                        ${job.status === 'done' ? 'bg-green-50/50' : ''}`}>
                        <JobStatusIcon status={job.status} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm">{job.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{job.company}{job.location ? ` · ${job.location}` : ''}</p>
                          {job.status === 'error' && <p className="text-xs text-red-500 mt-1">{job.error}</p>}
                          {job.status === 'done' && <p className="text-xs text-gray-400 mt-0.5 font-mono">{job.resume_filename}</p>}
                        </div>
                        {job.status === 'done' && (
                          <div className="flex flex-col gap-1 shrink-0">
                            <div className="flex gap-1">
                              <button onClick={() => handleDownloadFile(job.resume_pdf_path)} className="btn-primary text-xs py-1 px-2 gap-1">
                                <DownloadIcon className="w-3 h-3" /> CV PDF
                              </button>
                              <button onClick={() => handleDownloadFile(job.resume_docx_path)} className="btn-secondary text-xs py-1 px-2 gap-1">
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

                  {pageResult.status === 'completed' && (
                    <div className="px-5 py-3 bg-green-50 border-t border-green-100 flex items-center gap-2 text-green-700 text-sm">
                      <CheckCircleIcon className="w-4 h-4" />
                      <span className="font-semibold">
                        {pageResult.jobs.filter(j => j.status === 'done').length} of {pageResult.total} generated
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Page navigation ── */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setStep3Page(p => p - 1)}
                disabled={step3Page === 0}
                className="btn-secondary px-5 disabled:opacity-40"
              >
                ← Previous batch
              </button>

              <div className="flex gap-1.5">
                {Array.from({ length: step3TotalPages }, (_, i) => (
                  <button key={i} onClick={() => setStep3Page(i)}
                    className={`w-7 h-7 rounded-full text-xs font-semibold transition-colors
                      ${i === step3Page
                        ? 'bg-brand-600 text-white'
                        : step3Results[i]
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {i + 1}
                  </button>
                ))}
              </div>

              {step3Page < step3TotalPages - 1 ? (
                <button onClick={() => setStep3Page(p => p + 1)} className="btn-primary px-5">
                  Next batch →
                </button>
              ) : (
                <button
                  onClick={() => { setStep(1); setStep3Page(0); setStep3Results({}); setStep3TaskIds({}); setStep3Generating({}); setStep3AssessData({}); setStep3Assessing({}); setStep3Selections({}); setJobs([]); setSelectedJobs(new Set()) }}
                  className="btn-secondary px-5 border-brand-300 text-brand-700 hover:bg-brand-50"
                >
                  Start Over
                </button>
              )}
            </div>

          </div>
        )
      })()}

    </div>
  )
}
