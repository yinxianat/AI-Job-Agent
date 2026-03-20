import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  FileTextIcon, ArrowLeftIcon, PencilIcon, EyeIcon,
  CopyIcon, PrinterIcon, XIcon, CheckIcon, SaveIcon,
  SparklesIcon, MailIcon, DownloadIcon,
} from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import FolderPicker from '../components/FolderPicker'
import { SESSION_KEY_RESUME_RESULT as SESSION_KEY, LOCAL_KEY_OUTPUT_FOLDER } from '../constants/storage'
import { API_ENDPOINTS } from '../constants/api'

// ── Date-range regex — mirrors backend _DATE_RANGE_RE exactly ────────────────
const DATE_RANGE_RE = new RegExp(
  '^(.+?)\\s{3,}' +
  '((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?' +
  '|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)' +
  '\\.?\\s+\\d{4}|\\d{4})' +
  '\\s*[-–—]\\s*' +
  '((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?' +
  '|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)' +
  '\\.?\\s+\\d{4}|\\d{4}|[Pp]resent|[Cc]urrent)\\s*$',
  'i'
)

// ── Mirrors backend _is_section_header() ─────────────────────────────────────
function isSectionHeader(s) {
  return (
    s.length >= 3 &&
    s.length <= 60 &&
    s === s.toUpperCase() &&
    /[A-Z]/.test(s) &&
    !/[\d\s\W]+/.test(s.replace(/[A-Z\s&]/g, ''))  // skip pure numbers/punctuation
  )
}

// ── Resume HTML preview — matches write_pdf() exactly ────────────────────────
// Styles use the same fonts, pt sizes, colors, spacing as the ReportLab PDF.
// The outer wrapper simulates an 8.5×11" letter page with 0.875"/0.75" margins.
function ResumeHtmlPreview({ text }) {
  if (!text?.trim()) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#e8eaed', padding: '32px' }}>
        <p style={{ color: '#9ca3af', fontSize: '14px' }}>No resume text available.</p>
      </div>
    )
  }

  const lines = text.split('\n')

  // Identify name line and contact lines (everything before first section header)
  let firstSectionIdx = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (isSectionHeader(lines[i].trim())) { firstSectionIdx = i; break }
  }
  let nameIdx = -1
  const contactIdxs = new Set()
  for (let i = 0; i < firstSectionIdx; i++) {
    if (!lines[i].trim()) continue
    if (nameIdx === -1) nameIdx = i
    else contactIdxs.add(i)
  }

  // Track whether the previous content line was a date-range entry.
  // Used to detect subtitle lines (e.g. company name on its own line) and
  // render them bold-italic, mirroring the PDF/DOCX subtitle_style.
  let prevWasDateEntry = false

  const elements = lines.map((line, i) => {
    const s = line.trim()

    // ── Blank spacer — mirrors Spacer(1, 4) ──────────────────────────────────
    // Blank lines do NOT reset prevWasDateEntry (same as backend logic)
    if (!s) return <div key={i} style={{ height: '4pt' }} />

    // ── Candidate name — 18pt Helvetica-Bold, centered, dark navy ────────────
    if (i === nameIdx) {
      prevWasDateEntry = false
      return (
        <div key={i} style={{ textAlign: 'center', marginBottom: '3pt' }}>
          <div style={{
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontSize: '18pt', fontWeight: 700,
            color: '#1a2744', lineHeight: '22pt',
          }}>{s}</div>
          {/* HRFlowable: 1.5pt, #3d5a80 */}
          <div style={{ borderTop: '1.5pt solid #3d5a80', marginTop: '3pt' }} />
        </div>
      )
    }

    // ── Contact / header block — 9pt, centered, mid-gray ─────────────────────
    if (contactIdxs.has(i)) {
      prevWasDateEntry = false
      return (
        <div key={i} style={{
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontSize: '9pt', textAlign: 'center',
          color: '#555555', lineHeight: '13pt', marginBottom: '1pt',
        }}>{s}</div>
      )
    }

    // ── ALL-CAPS section header — 10.5pt bold, #2c3e50, underline rule ────────
    if (isSectionHeader(s)) {
      prevWasDateEntry = false
      return (
        <div key={i} style={{ marginTop: '14pt', marginBottom: '2pt' }}>
          <div style={{
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontSize: '10.5pt', fontWeight: 700,
            color: '#2c3e50', letterSpacing: '0.06em',
          }}>{s}</div>
          {/* HRFlowable: 0.5pt, #bbbbbb */}
          <div style={{ borderTop: '0.5pt solid #bbbbbb', marginTop: '2pt' }} />
        </div>
      )
    }

    // ── Job/edu entry with right-aligned date — two-column table ──────────────
    const dm = DATE_RANGE_RE.exec(s)
    if (dm) {
      prevWasDateEntry = true
      const leftText = dm[1].trim()
      const dateText = `${dm[2]} – ${dm[3]}`
      return (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', marginBottom: '2pt',
        }}>
          {/* left: Helvetica-Bold 10.5pt — 68% width */}
          <span style={{
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontSize: '10.5pt', fontWeight: 700, color: '#222222',
            flex: '0 0 68%',
          }}>{leftText}</span>
          {/* right: Helvetica-BoldOblique 10pt, right-aligned — 32% width */}
          <span style={{
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontSize: '10pt', fontWeight: 700, fontStyle: 'italic',
            color: '#222222', textAlign: 'right',
            flex: '0 0 32%', whiteSpace: 'nowrap',
          }}>{dateText}</span>
        </div>
      )
    }

    // ── Bullet point — 10pt, leftIndent 14pt ─────────────────────────────────
    if (s.startsWith('•') || s.startsWith('-') || s.startsWith('*')) {
      prevWasDateEntry = false
      const bulletText = s.replace(/^[•\-*]\s*/, '')
      return (
        <div key={i} style={{
          display: 'flex', gap: '4pt',
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontSize: '10pt', color: '#222222',
          lineHeight: '14pt', paddingLeft: '14pt', marginBottom: '1pt',
        }}>
          <span style={{ flexShrink: 0 }}>•</span>
          <span>{bulletText}</span>
        </div>
      )
    }

    // ── Subtitle: non-bullet line immediately after a date entry ─────────────
    // Mirrors backend subtitle_style (Helvetica-BoldOblique) — used for
    // company name / location when they appear on their own line.
    if (prevWasDateEntry) {
      prevWasDateEntry = false
      return (
        <div key={i} style={{
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontSize: '10pt', fontWeight: 700, fontStyle: 'italic',
          color: '#222222', lineHeight: '14pt', marginBottom: '1pt',
        }}>{s}</div>
      )
    }

    // ── Normal line — 10pt Helvetica ─────────────────────────────────────────
    prevWasDateEntry = false
    return (
      <div key={i} style={{
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontSize: '10pt', color: '#222222',
        lineHeight: '14pt', marginBottom: '1pt',
      }}>{s}</div>
    )
  })

  return (
    // Outer: PDF-viewer grey background
    <div style={{
      background: '#e8eaed',
      padding: '32px',
      overflow: 'auto',
      flex: 1,
      minHeight: 0,
    }}>
      {/* Paper page — 8.5×11" @ 96 dpi, margins 0.875"/0.75" */}
      <div style={{
        background: 'white',
        boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
        width: '816px',        /* 8.5in × 96dpi */
        minHeight: '1056px',   /* 11in  × 96dpi */
        margin: '0 auto',
        padding: '72px 84px', /* 0.75in top/bot, 0.875in left/right */
        boxSizing: 'border-box',
        fontFamily: 'Helvetica, Arial, sans-serif',
      }}>
        {elements}
      </div>
    </div>
  )
}

// ── Cover Letter HTML preview ─────────────────────────────────────────────────
// Plain left-aligned prose, matching write_pdf(is_cover_letter=True) formatting.
function CoverLetterHtmlPreview({ text }) {
  if (!text?.trim()) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#e8eaed', padding: '32px' }}>
        <p style={{ color: '#9ca3af', fontSize: '14px' }}>No cover letter text available.</p>
      </div>
    )
  }

  const lines = text.split('\n')
  const elements = lines.map((line, i) => {
    const s = line.trim()
    if (!s) return <div key={i} style={{ height: '10pt' }} />
    return (
      <div key={i} style={{
        fontFamily: "'Calibri', 'Arial', sans-serif",
        fontSize: '11pt', color: '#222222',
        lineHeight: '16pt', marginBottom: '2pt',
      }}>{s}</div>
    )
  })

  return (
    <div style={{ background: '#e8eaed', padding: '32px', overflow: 'auto', flex: 1, minHeight: 0 }}>
      {/* Paper page — same dimensions as resume preview */}
      <div style={{
        background: 'white',
        boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
        width: '816px',
        minHeight: '1056px',
        margin: '0 auto',
        padding: '96px 96px',   /* 1in margins matching cover letter PDF */
        boxSizing: 'border-box',
      }}>
        {elements}
      </div>
    </div>
  )
}

// ── Main Result Page ──────────────────────────────────────────────────────────
export default function ResumeResultPage() {
  const location = useLocation()
  const navigate  = useNavigate()

  // Load resume from router state OR sessionStorage fallback
  const [resume] = useState(() => {
    const fromState = location.state?.resume
    if (fromState) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(fromState)) } catch (_) {}
      return fromState
    }
    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      if (stored) return JSON.parse(stored)
    } catch (_) {}
    return null
  })

  // Tab state — 'resume' | 'cover_letter'
  const coverLetterText = resume?.cover_letter_text || ''
  const [activeTab, setActiveTab] = useState('resume')

  // Editing state
  const editorRef     = useRef(null)
  const editorHtmlRef = useRef(null)
  const [editText,  setEditText]  = useState(resume?.tailored_text || '')
  const [isEditing, setIsEditing] = useState(false)

  // Save state
  const [isSaving,    setIsSaving]    = useState(false)
  const [savedFolder, setSavedFolder] = useState(
    () => { try { return localStorage.getItem(LOCAL_KEY_OUTPUT_FOLDER) || '' } catch { return '' } }
  )
  const [savedType,   setSavedType]   = useState(null) // 'pdf' | 'docx' | null

  // Cover letter download state
  const [clDownloading, setClDownloading] = useState(null) // 'pdf' | 'docx' | null

  // Folder picker — shared between resume and cover letter saves
  const [folderPickerOpen,  setFolderPickerOpen]  = useState(false)
  const [pendingSaveFormat, setPendingSaveFormat] = useState(null)
  const [pendingSaveMode,   setPendingSaveMode]   = useState('resume') // 'resume' | 'cover_letter'

  // Rich-text toolbar
  const FONTS = [
    { label: 'Default',         value: 'inherit' },
    { label: 'Times New Roman', value: "'Times New Roman', serif" },
    { label: 'Georgia',         value: 'Georgia, serif' },
    { label: 'Arial',           value: 'Arial, sans-serif' },
    { label: 'Helvetica',       value: 'Helvetica, Arial, sans-serif' },
    { label: 'Calibri',         value: 'Calibri, sans-serif' },
    { label: 'Garamond',        value: 'Garamond, serif' },
    { label: 'Courier New',     value: "'Courier New', monospace" },
  ]
  const FONT_SIZES = ['10','11','12','13','14','16','18','20','22','24']
  const [fontFamily, setFontFamily] = useState('inherit')
  const [fontSize,   setFontSize]   = useState('14')
  const [fmtBold,    setFmtBold]    = useState(false)
  const [fmtItalic,  setFmtItalic]  = useState(false)
  const [fmtUnder,   setFmtUnder]   = useState(false)

  const defaultFilename = resume?.filename
    ? resume.filename.replace(/\.(pdf|docx|doc)$/i, '')
    : 'tailored_resume'

  // Redirect if no result
  useEffect(() => {
    if (!resume) {
      toast.error('No resume result found. Please tailor a resume first.')
      navigate('/resume', { replace: true })
    }
  }, [resume, navigate])

  // Populate editor on enter edit mode
  useEffect(() => {
    if (isEditing && editorRef.current) {
      if (editorHtmlRef.current !== null) {
        editorRef.current.innerHTML = editorHtmlRef.current
      } else {
        editorRef.current.innerText = editText
      }
      editorRef.current.focus()
    }
  }, [isEditing]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist edits to sessionStorage
  useEffect(() => {
    if (!resume) return
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...resume, tailored_text: editText }))
    } catch (_) {}
  }, [editText, resume])

  const syncFormatStates = () => {
    setFmtBold(document.queryCommandState('bold'))
    setFmtItalic(document.queryCommandState('italic'))
    setFmtUnder(document.queryCommandState('underline'))
  }
  const execCmd = (cmd) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, null)
    syncFormatStates()
  }

  const handleToggleEdit = () => {
    if (isEditing && editorRef.current) {
      editorHtmlRef.current = editorRef.current.innerHTML
      setEditText(editorRef.current.innerText)
    }
    setIsEditing(v => !v)
  }

  const getCurrentText = useCallback(() =>
    (isEditing && editorRef.current) ? editorRef.current.innerText : editText,
  [isEditing, editText])

  const handleCopy = () => {
    navigator.clipboard.writeText(getCurrentText())
    toast.success('Copied to clipboard!')
  }

  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const text = getCurrentText()
    win.document.write(`
      <html><head><title>${resume?.filename || 'Resume'}</title>
      <style>
        body { font-family: Helvetica, Arial, sans-serif; font-size: 10pt; line-height: 14pt;
               margin: 0.75in 0.875in; color: #222; }
        pre  { white-space: pre-wrap; font-family: inherit; font-size: inherit; }
      </style></head>
      <body><pre>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>
    `)
    win.document.close(); win.focus(); win.print()
  }

  const handleSave = (format, mode = 'resume') => {
    setPendingSaveFormat(format)
    setPendingSaveMode(mode)
    setFolderPickerOpen(true)
  }

  const handleFolderSelected = async (folder) => {
    setFolderPickerOpen(false)
    setSavedFolder(folder)
    try { localStorage.setItem(LOCAL_KEY_OUTPUT_FOLDER, folder) } catch (_) {}
    setIsSaving(true)
    try {
      const fd = new FormData()
      const isCL = pendingSaveMode === 'cover_letter'
      fd.append('text',            isCL ? coverLetterText : getCurrentText())
      fd.append('output_folder',   folder)
      fd.append('filename',        isCL ? `CoverLetter_${defaultFilename}` : defaultFilename)
      fd.append('is_cover_letter', isCL ? 'true' : 'false')
      await api.post(API_ENDPOINTS.RESUME_SAVE_PREVIEW, fd)
      setSavedType(pendingSaveFormat)
      const label = isCL ? 'Cover letter' : pendingSaveFormat?.toUpperCase()
      toast.success(`${label} saved to ${folder}`)
      setTimeout(() => setSavedType(null), 4000)
    } catch (err) {
      toast.error(err.message || 'Failed to save file')
    } finally {
      setIsSaving(false)
      setPendingSaveFormat(null)
    }
  }

  // Download cover letter directly to browser (no folder picker)
  const handleDownloadCoverLetter = async (format) => {
    setClDownloading(format)
    try {
      const fd = new FormData()
      fd.append('text',            coverLetterText)
      fd.append('filename',        `CoverLetter_${defaultFilename}`)
      fd.append('is_cover_letter', 'true')
      if (format === 'pdf') {
        fd.append('disposition', 'attachment')
        const res = await api.post(API_ENDPOINTS.RESUME_RENDER_PDF, fd, { responseType: 'blob' })
        const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
        const a = document.createElement('a'); a.href = url
        a.download = `CoverLetter_${defaultFilename}.pdf`; a.click()
        URL.revokeObjectURL(url)
        toast.success('Cover letter PDF downloaded!')
      } else {
        const res = await api.post(API_ENDPOINTS.RESUME_RENDER_DOCX, fd, { responseType: 'blob' })
        const url = URL.createObjectURL(new Blob([res.data], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }))
        const a = document.createElement('a'); a.href = url
        a.download = `CoverLetter_${defaultFilename}.docx`; a.click()
        URL.revokeObjectURL(url)
        toast.success('Cover letter DOCX downloaded!')
      }
    } catch (err) {
      toast.error(err.message || `Failed to download cover letter ${format.toUpperCase()}`)
    } finally {
      setClDownloading(null)
    }
  }

  const handleDiscard = () => {
    try { sessionStorage.removeItem(SESSION_KEY) } catch (_) {}
    navigate('/resume')
  }

  if (!resume) return null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">

          <button
            onClick={() => navigate('/resume')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-700 transition-colors shrink-0"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Tailor
          </button>

          <div className="w-px h-5 bg-gray-200" />

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
              <FileTextIcon className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{resume.filename}</p>
              {resume.job_url && (
                <a href={resume.job_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-brand-500 hover:underline truncate block">{resume.job_url}</a>
              )}
            </div>
          </div>

          {/* Tab switcher — only show when cover letter is available */}
          {coverLetterText && (
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shrink-0">
              <button
                onClick={() => setActiveTab('resume')}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors
                  ${activeTab === 'resume' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <FileTextIcon className="w-3.5 h-3.5" /> Resume
              </button>
              <button
                onClick={() => setActiveTab('cover_letter')}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors
                  ${activeTab === 'cover_letter' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <MailIcon className="w-3.5 h-3.5" /> Cover Letter
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {activeTab === 'resume' && (
              <>
                <button
                  onClick={handleToggleEdit}
                  title={isEditing ? 'Switch to preview' : 'Edit resume text'}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors
                    ${isEditing
                      ? 'bg-brand-100 text-brand-700 hover:bg-brand-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {isEditing
                    ? <><EyeIcon className="w-3.5 h-3.5" /> Preview</>
                    : <><PencilIcon className="w-3.5 h-3.5" /> Edit</>}
                </button>
                <button onClick={handleCopy} title="Copy resume text"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                  <CopyIcon className="w-4 h-4" />
                </button>
                <button onClick={handlePrint} title="Print"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                  <PrinterIcon className="w-4 h-4" />
                </button>
              </>
            )}
            {activeTab === 'cover_letter' && (
              <button
                onClick={() => { navigator.clipboard.writeText(coverLetterText); toast.success('Copied to clipboard!') }}
                title="Copy cover letter text"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <CopyIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Rich-text toolbar (edit mode only) */}
        {isEditing && (
          <div className="flex items-center gap-1.5 px-6 py-2 border-t border-gray-100 bg-gray-50 flex-wrap">
            <select value={fontFamily} onMouseDown={e => e.stopPropagation()}
              onChange={e => { setFontFamily(e.target.value); setTimeout(() => editorRef.current?.focus(), 0) }}
              className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:border-brand-400 max-w-[150px]">
              {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <select value={fontSize} onMouseDown={e => e.stopPropagation()}
              onChange={e => { setFontSize(e.target.value); setTimeout(() => editorRef.current?.focus(), 0) }}
              className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 w-[62px] focus:outline-none focus:border-brand-400">
              {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
            </select>
            <div className="w-px h-5 bg-gray-200 mx-0.5" />
            <button type="button" onMouseDown={e => { e.preventDefault(); execCmd('bold') }}
              className={`w-7 h-7 flex items-center justify-center rounded text-sm font-bold transition-colors
                ${fmtBold ? 'bg-brand-100 text-brand-700' : 'text-gray-600 hover:bg-gray-200'}`}>B</button>
            <button type="button" onMouseDown={e => { e.preventDefault(); execCmd('italic') }}
              className={`w-7 h-7 flex items-center justify-center rounded text-sm italic font-semibold transition-colors
                ${fmtItalic ? 'bg-brand-100 text-brand-700' : 'text-gray-600 hover:bg-gray-200'}`}>I</button>
            <button type="button" onMouseDown={e => { e.preventDefault(); execCmd('underline') }}
              className={`w-7 h-7 flex items-center justify-center rounded text-sm underline font-semibold transition-colors
                ${fmtUnder ? 'bg-brand-100 text-brand-700' : 'text-gray-600 hover:bg-gray-200'}`}>U</button>
          </div>
        )}
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full px-6 py-6 gap-5">

        {/* Company research banner */}
        {resume.company_description && (
          <div className="bg-brand-50 border border-brand-100 rounded-xl px-5 py-3 flex items-start gap-3">
            <SparklesIcon className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-brand-800 mb-0.5">Company Research</p>
              <p className="text-xs text-brand-700 leading-relaxed">{resume.company_description}</p>
            </div>
          </div>
        )}

        {/* ── Main view: resume editor/preview or cover letter preview ── */}
        <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200 flex flex-col" style={{ minHeight: '75vh' }}>
          {activeTab === 'resume' ? (
            isEditing ? (
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => { if (editorRef.current) setEditText(editorRef.current.innerText) }}
                onKeyUp={syncFormatStates}
                onMouseUp={syncFormatStates}
                style={{ fontFamily, fontSize: `${fontSize}px` }}
                className="flex-1 overflow-y-auto w-full min-h-[600px] px-12 py-10 bg-white text-gray-800 leading-relaxed outline-none"
              />
            ) : (
              <ResumeHtmlPreview text={editText} />
            )
          ) : (
            <CoverLetterHtmlPreview text={coverLetterText} />
          )}
        </div>

        {/* ── Footer actions ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
          {activeTab === 'resume' ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="text-xs text-gray-400 min-w-0">
                {savedType && savedFolder && pendingSaveMode === 'resume' ? (
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <CheckIcon className="w-3.5 h-3.5" />
                    {savedType.toUpperCase()} saved to{' '}
                    <span className="font-mono truncate max-w-[240px] inline-block align-bottom">{savedFolder}</span>
                  </span>
                ) : (
                  <span>Edits are saved in this session. Click <strong>Save PDF</strong> or <strong>Save DOCX</strong> to export.</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button onClick={() => handleSave('pdf', 'resume')} disabled={isSaving}
                  className="btn-primary text-xs py-2 px-4 gap-1.5">
                  {isSaving && pendingSaveFormat === 'pdf' && pendingSaveMode === 'resume'
                    ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : savedType === 'pdf' && pendingSaveMode === 'resume' ? <CheckIcon className="w-3.5 h-3.5" /> : <SaveIcon className="w-3.5 h-3.5" />}
                  Save PDF
                </button>
                <button onClick={() => handleSave('docx', 'resume')} disabled={isSaving}
                  className="btn-secondary text-xs py-2 px-4 gap-1.5">
                  {isSaving && pendingSaveFormat === 'docx' && pendingSaveMode === 'resume'
                    ? <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    : savedType === 'docx' && pendingSaveMode === 'resume' ? <CheckIcon className="w-3.5 h-3.5" /> : <SaveIcon className="w-3.5 h-3.5" />}
                  Save DOCX
                </button>
                <button onClick={handleDiscard}
                  className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <XIcon className="w-3.5 h-3.5" /> Discard
                </button>
              </div>
            </div>
          ) : (
            /* Cover letter footer */
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="text-xs text-gray-400 min-w-0">
                {savedType && savedFolder && pendingSaveMode === 'cover_letter' ? (
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <CheckIcon className="w-3.5 h-3.5" />
                    Cover letter saved to{' '}
                    <span className="font-mono truncate max-w-[240px] inline-block align-bottom">{savedFolder}</span>
                  </span>
                ) : (
                  <span>Download your cover letter or save it to a folder.</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {/* Direct browser downloads */}
                <button
                  onClick={() => handleDownloadCoverLetter('pdf')}
                  disabled={clDownloading !== null}
                  className="btn-primary text-xs py-2 px-4 gap-1.5"
                >
                  {clDownloading === 'pdf'
                    ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <DownloadIcon className="w-3.5 h-3.5" />}
                  Download PDF
                </button>
                <button
                  onClick={() => handleDownloadCoverLetter('docx')}
                  disabled={clDownloading !== null}
                  className="btn-secondary text-xs py-2 px-4 gap-1.5"
                >
                  {clDownloading === 'docx'
                    ? <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    : <DownloadIcon className="w-3.5 h-3.5" />}
                  Download DOCX
                </button>
                {/* Save to folder */}
                <button
                  onClick={() => handleSave('pdf', 'cover_letter')}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                >
                  <SaveIcon className="w-3.5 h-3.5" /> Save to Folder
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <FolderPicker
        isOpen={folderPickerOpen}
        onClose={() => { setFolderPickerOpen(false); setPendingSaveFormat(null) }}
        onSelect={handleFolderSelected}
        currentPath={savedFolder}
      />
    </div>
  )
}
