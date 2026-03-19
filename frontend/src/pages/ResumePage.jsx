import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import {
  UploadCloudIcon, FileTextIcon, BrainCircuitIcon,
  DownloadIcon, SparklesIcon, FileSpreadsheetIcon,
  PencilIcon, XIcon, MapPinIcon,
  ClipboardListIcon, ChevronDownIcon, ChevronUpIcon, UploadIcon,
} from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import LocationAutocomplete from '../components/LocationAutocomplete'
import { SESSION_KEY_RESUME_FORM as FORM_KEY } from '../constants/storage'
import { API_ENDPOINTS } from '../constants/api'
import { RESUME_ACCEPT as ACCEPT, JOB_LOG_ACCEPT, RESUME_MAX_FILE_SIZE, JOB_LOG_MAX_FILE_SIZE, RESUME_MAX_FILES, JOB_LOG_MAX_FILES } from '../constants/fileTypes'

function loadFormState() {
  try {
    const s = sessionStorage.getItem(FORM_KEY)
    if (s) return JSON.parse(s)
  } catch (_) {}
  return null
}

// ── Accepted file types ───────────────────────────────────────────────────────
// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ResumePage() {
  const navigate = useNavigate()

  // Restore persisted form state (text fields only — files must be re-uploaded)
  const saved = loadFormState()

  const [resumeFiles, setResumeFiles] = useState([])   // File objects (not persisted)
  const [jobDetails, setJobDetails] = useState(saved?.jobDetails ?? {
    job_title: '', company: '', location: '', job_url: '', description: '',
  })
  const [homeLocation, setHomeLocation] = useState(saved?.homeLocation ?? '')
  const [loading, setLoading] = useState(false)
  const [errors,  setErrors]  = useState({})

  // Job description file-upload
  const descriptionFileRef = useRef(null)
  const [descriptionUploading, setDescriptionUploading] = useState(false)

  // Job log
  const [jobLogText,     setJobLogText]     = useState(saved?.jobLogText ?? '')
  const [jobLogFiles,    setJobLogFiles]    = useState([])   // File objects (not persisted)
  const [jobLogExpanded, setJobLogExpanded] = useState(saved?.jobLogExpanded ?? false)

  // Tracker download state
  const [hasHistory, setHasHistory] = useState(false)

  // ── Persist text form state to sessionStorage ─────────────────────────────
  useEffect(() => {
    try {
      sessionStorage.setItem(FORM_KEY, JSON.stringify({ jobDetails, jobLogText, jobLogExpanded, homeLocation }))
    } catch (_) {}
  }, [jobDetails, jobLogText, jobLogExpanded, homeLocation])

  // ── Resume dropzone ───────────────────────────────────────────────────────
  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return
    setResumeFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      return [...prev, ...accepted.filter(f => !existing.has(f.name))]
    })
    setErrors(e => ({ ...e, resume: '' }))
  }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPT, maxFiles: RESUME_MAX_FILES, maxSize: RESUME_MAX_FILE_SIZE,
    onDropRejected: () => toast.error('Invalid file. Please upload PDF, DOCX or DOC files.'),
  })
  const removeFile = (idx) => setResumeFiles(prev => prev.filter((_, i) => i !== idx))

  // ── Job log dropzone ──────────────────────────────────────────────────────
  const onDropJobLog = useCallback((accepted) => {
    if (!accepted.length) return
    setJobLogFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      return [...prev, ...accepted.filter(f => !existing.has(f.name))]
    })
  }, [])
  const { getRootProps: getJobLogRootProps, getInputProps: getJobLogInputProps, isDragActive: isJobLogDragActive } = useDropzone({
    onDrop: onDropJobLog, accept: JOB_LOG_ACCEPT, maxFiles: JOB_LOG_MAX_FILES, maxSize: JOB_LOG_MAX_FILE_SIZE,
    onDropRejected: () => toast.error('Unsupported file type for job log.'),
  })
  const removeJobLogFile = (idx) => setJobLogFiles(prev => prev.filter((_, i) => i !== idx))

  // ── Field helpers ─────────────────────────────────────────────────────────
  const setField = (f) => (e) => {
    setJobDetails(prev => ({ ...prev, [f]: e.target.value }))
    setErrors(prev => ({ ...prev, [f]: '' }))
  }

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {}
    if (!resumeFiles.length)    e.resume      = 'Please upload at least one resume'
    if (!jobDetails.description) e.description = 'Job description is required'
    return e
  }

  // ── Upload job description file ───────────────────────────────────────────
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
        setJobDetails(prev => ({ ...prev, description: data.text.trim() }))
        setErrors(prev => ({ ...prev, description: '' }))
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

  // ── Tailor → navigate to result page ────────────────────────────────────
  const handleTailor = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    const formData = new FormData()
    resumeFiles.forEach(f => formData.append('resume_files', f))
    Object.entries(jobDetails).forEach(([k, v]) => formData.append(k, v))
    formData.append('home_location', homeLocation)
    formData.append('job_log_text', jobLogText)
    jobLogFiles.forEach(f => formData.append('job_log_files', f))

    try {
      const { data } = await api.post(API_ENDPOINTS.RESUME_TAILOR, formData, { timeout: 120000 })
      setHasHistory(true)
      toast.success('Resume tailored! Opening result…')
      navigate('/resume/result', { state: { resume: data } })
    } catch (err) {
      toast.error(err.message || 'Failed to tailor resume')
    } finally {
      setLoading(false)
    }
  }

  // ── Download tracker ──────────────────────────────────────────────────────
  const handleDownloadTracker = async () => {
    try {
      const res = await api.get(API_ENDPOINTS.RESUME_TRACKER, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url; a.download = 'resume_tracker.xlsx'; a.click()
      URL.revokeObjectURL(url)
      toast.success('Tracker downloaded!')
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Resume Tailor</h1>
          <p className="mt-1 text-gray-500">
            Upload your resume and let Claude rewrite it for each specific role.
          </p>
        </div>
        {hasHistory && (
          <button onClick={handleDownloadTracker} className="btn-secondary">
            <FileSpreadsheetIcon className="w-4 h-4 text-green-600" /> Download Tracker
          </button>
        )}
      </div>

      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Resume upload ── */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <UploadCloudIcon className="w-4 h-4 text-brand-500" /> Upload Resume(s)
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Upload one or more resumes — Claude will combine them into one tailored resume
            </p>
          </div>
          <div className="card-body space-y-3">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'}
                ${errors.resume ? 'border-red-400' : ''}`}
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
                    <button type="button" onClick={() => removeFile(i)}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {resumeFiles.length > 1 && (
                  <p className="text-xs text-brand-600 flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3" />
                    Claude will synthesize all {resumeFiles.length} resumes into one optimized resume
                  </p>
                )}
              </div>
            )}

            {errors.resume && <p className="text-xs text-red-500">{errors.resume}</p>}
          </div>
        </div>

        {/* ── Job History & Work Log (optional, collapsible) ── */}
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
                Provide supplemental context — previous job descriptions, projects, achievements, or notes on your work history.
                Claude will use this to enrich and strengthen your tailored resume.
              </p>
              <div>
                <label className="label">Paste or type job history &amp; accomplishments</label>
                <textarea
                  value={jobLogText}
                  onChange={e => setJobLogText(e.target.value)}
                  rows={5}
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

        {/* ── Home Location ── */}
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
              City and state to include in the contact line of your tailored resume and cover letter.
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

        {/* ── Job Details ── */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <BrainCircuitIcon className="w-4 h-4 text-brand-500" /> Job Details
            </h2>
          </div>
          <div className="card-body space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Job Title <span className="text-gray-400 text-xs font-normal">(optional)</span></label>
                <input type="text" value={jobDetails.job_title} onChange={setField('job_title')}
                  placeholder="e.g. Senior Engineer" className="input" />
              </div>
              <div>
                <label className="label">Company <span className="text-gray-400 text-xs font-normal">(optional)</span></label>
                <input type="text" value={jobDetails.company} onChange={setField('company')}
                  placeholder="e.g. Acme Corp" className="input" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Location <span className="text-gray-400 text-xs font-normal">(optional)</span></label>
                <LocationAutocomplete
                  value={jobDetails.location}
                  onChange={(v) => {
                    setJobDetails(prev => ({ ...prev, location: v }))
                    setErrors(prev => ({ ...prev, location: '' }))
                  }}
                  onSelect={(v) => setJobDetails(prev => ({ ...prev, location: v }))}
                  placeholder="City, state or zip code"
                />
              </div>
              <div>
                <label className="label">Job URL <span className="text-gray-400 text-xs font-normal">(optional)</span></label>
                <input type="url" value={jobDetails.job_url} onChange={setField('job_url')}
                  placeholder="https://indeed.com/..." className="input" />
              </div>
            </div>

            {/* Job Description with file upload */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label !mb-0">Job Description *</label>
                <div className="flex items-center gap-2">
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
              </div>
              <textarea
                value={jobDetails.description}
                onChange={setField('description')}
                rows={6}
                placeholder="Paste the full job description here… or upload a PDF/DOC above"
                className={`input resize-none ${errors.description ? 'border-red-400' : ''}`}
              />
              {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description}</p>}
            </div>

            <button
              onClick={handleTailor}
              className="btn-primary w-full justify-center py-3"
              disabled={loading}
            >
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Tailoring with Claude…</>
              ) : (
                <><SparklesIcon className="w-4 h-4" /> Tailor My Resume</>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
