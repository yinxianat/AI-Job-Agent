import { useState } from 'react'
import {
  MailIcon, SendIcon, MessageSquareIcon, ChevronDownIcon,
  BriefcaseIcon, ShieldCheckIcon, HelpCircleIcon, SparklesIcon,
  FileTextIcon, DownloadIcon, CheckCircleIcon,
} from 'lucide-react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { API_ENDPOINTS } from '../constants/api'

const FAQS = [
  {
    q: 'What does the Resume Generator do?',
    a: 'The Resume Generator lets you upload one or more base resumes along with a list of jobs (via Excel or CSV spreadsheet). It then uses Claude AI to tailor each resume to every job automatically — producing a customised PDF and DOCX for each application in one batch run.',
  },
  {
    q: 'What spreadsheet formats can I upload for job listings?',
    a: 'You can upload Excel workbooks (.xlsx, .xls) or CSV files (.csv). For multi-sheet workbooks, you can choose which sheet to use. Your spreadsheet should include columns for job title, company, and job description at minimum.',
  },
  {
    q: 'What is the Match Assessment feature?',
    a: 'After your jobs are loaded, you can run a Match Assessment. Claude scores each job against your resume with a 0–100 match score, highlights your strengths and weaknesses for that role, lists key skills to develop, and gives a plain-English recommendation — all exportable to an Excel report.',
  },
  {
    q: 'How does the Resume Tailor work?',
    a: "Upload your resume and paste in a single job description. Claude rewrites the resume to align with that role's keywords, tone, and required skills, then lets you preview, download as PDF or DOCX, and save it to your tracker.",
  },
  {
    q: 'What resume formats are supported for upload?',
    a: 'JobAgent accepts PDF (.pdf), Word 2007+ (.docx), and legacy Word (.doc) files — up to 10 MB each.',
  },
  {
    q: 'Is my data stored on your servers?',
    a: 'Generated resumes are kept in a temporary server-side folder for your session only. We never permanently store your resume content. Only hashed authentication credentials are retained in the database.',
  },
  {
    q: 'Can I download all generated resumes at once?',
    a: 'Yes. Once a batch run completes, a "Download All as ZIP" button appears so you can grab every tailored resume and cover letter in a single archive.',
  },
]

const FEATURES = [
  { icon: BriefcaseIcon, title: 'Resume Generator', desc: 'Batch-tailor from a spreadsheet',  color: 'bg-violet-50 text-violet-600' },
  { icon: SparklesIcon,  title: 'Match Assessment',  desc: 'AI-scored fit for every role',      color: 'bg-amber-50  text-amber-600'  },
  { icon: FileTextIcon,  title: 'Resume Tailor',     desc: 'Single-job AI rewrite & preview',   color: 'bg-sky-50    text-sky-600'    },
  { icon: DownloadIcon,  title: 'ZIP Downloads',     desc: 'All files in one archive',           color: 'bg-green-50  text-green-600'  },
]

/* ── tiny helper: floating-label field ── */
function Field({ label, error, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500 tracking-wide uppercase">
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1 mt-0.5">
          <span className="inline-block w-1 h-1 rounded-full bg-red-400" />
          {error}
        </p>
      )}
    </div>
  )
}

const inputCls = (err) =>
  `w-full rounded-2xl border px-4 py-3 text-sm bg-white placeholder-gray-300
   outline-none transition-all duration-200
   focus:ring-2 focus:ring-brand-400 focus:border-brand-400 active:scale-[0.995]
   ${err ? 'border-red-300 bg-red-50 focus:ring-red-300' : 'border-gray-200 hover:border-gray-300'}`

export default function ContactPage() {
  const [form, setForm]       = useState({ name: '', email: '', subject: '', message: '' })
  const [errors, setErrors]   = useState({})
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [openFaq, setOpenFaq] = useState(null)

  const set = (f) => (e) => {
    setForm((p) => ({ ...p, [f]: e.target.value }))
    setErrors((p) => ({ ...p, [f]: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim())    e.name    = 'Name is required'
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email required'
    if (!form.subject.trim()) e.subject = 'Subject is required'
    if (!form.message.trim() || form.message.length < 20) e.message = 'At least 20 characters'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true)
    try {
      await api.post(API_ENDPOINTS.CONTACT_SEND, form)
      setSent(true)
      toast.success("Message sent! We'll get back to you shortly.")
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fc]">

      {/* ── Hero ── */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-5 pt-14 pb-12 text-center">
          <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-600 text-xs font-bold
            tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 select-none">
            <HelpCircleIcon className="w-3.5 h-3.5" />
            Support Center
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
            How can we help?
          </h1>
          <p className="mt-3 text-base text-gray-500 max-w-md mx-auto leading-relaxed">
            Browse the FAQ or send us a message. We reply within one business day.
          </p>
        </div>
      </div>

      {/* ── Feature chips — horizontal scroll on mobile ── */}
      <div className="max-w-3xl mx-auto px-5 -mt-4">
        <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
          {FEATURES.map(({ icon: Icon, title, desc, color }) => (
            <div key={title}
              className="flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm
                px-4 py-3 flex items-center gap-3 min-w-[160px] sm:flex-1
                hover:shadow-md hover:-translate-y-0.5 active:scale-95
                transition-all duration-200 cursor-default">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-800 leading-snug">{title}</p>
                <p className="text-[11px] text-gray-400 leading-snug mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-3xl mx-auto px-5 py-10 flex flex-col lg:grid lg:grid-cols-5 gap-8">

        {/* ── FAQ ── */}
        <div className="lg:col-span-3">
          <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">
            Frequently Asked Questions
          </p>

          <div className="space-y-2">
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i
              return (
                <div key={i}
                  style={{ transition: 'box-shadow 0.2s, border-color 0.2s' }}
                  className={`bg-white rounded-2xl border overflow-hidden
                    ${isOpen
                      ? 'border-brand-200 shadow-[0_0_0_3px_rgba(99,102,241,0.08)]'
                      : 'border-gray-100 shadow-sm hover:border-gray-200 hover:shadow-md'}`}>

                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left gap-3
                      active:bg-gray-50 transition-colors duration-150 min-h-[56px]"
                  >
                    <span className={`font-semibold text-sm leading-snug transition-colors duration-150
                      ${isOpen ? 'text-brand-700' : 'text-gray-800'}`}>
                      {faq.q}
                    </span>

                    {/* Animated chevron */}
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0
                      transition-all duration-200
                      ${isOpen ? 'bg-brand-100 text-brand-600 rotate-180' : 'bg-gray-100 text-gray-400 rotate-0'}`}>
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                    </span>
                  </button>

                  {/* Smooth open/close via max-height trick */}
                  <div
                    style={{
                      maxHeight: isOpen ? '400px' : '0px',
                      transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1)',
                      overflow: 'hidden',
                    }}>
                    <div className="px-5 pb-5 pt-1 text-sm text-gray-600 leading-relaxed border-t border-gray-50 bg-gray-50/60">
                      {faq.a}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Privacy note */}
          <div className="mt-5 flex items-start gap-3 bg-green-50 border border-green-100 rounded-2xl p-4
            hover:shadow-sm transition-shadow duration-200">
            <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
              <ShieldCheckIcon className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-green-800">Your data stays yours</p>
              <p className="text-xs text-green-700 mt-0.5 leading-relaxed">
                Resume content is never permanently stored — files live in a temporary
                server folder for your session only.
              </p>
            </div>
          </div>
        </div>

        {/* ── Contact form ── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden
            lg:sticky lg:top-20">

            {/* Card header */}
            <div className="px-6 pt-6 pb-5 border-b border-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-600 flex items-center justify-center shadow-sm">
                  <MessageSquareIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">Send a Message</p>
                  <p className="text-xs text-gray-400 mt-0.5">Reply within one business day</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-6">
              {sent ? (
                /* ── Success state ── */
                <div className="flex flex-col items-center text-center py-6 gap-4">
                  <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center
                    animate-[pulse_1s_ease-in-out_1]">
                    <CheckCircleIcon className="w-8 h-8 text-green-500" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">Message sent!</p>
                    <p className="text-sm text-gray-500 mt-1">
                      We'll reply to{' '}
                      <span className="font-semibold text-gray-700">{form.email}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => { setSent(false); setForm({ name:'', email:'', subject:'', message:'' }) }}
                    className="text-sm font-semibold text-brand-600 hover:text-brand-700
                      active:scale-95 transition-all duration-150 underline underline-offset-2 mt-1">
                    Send another message
                  </button>
                </div>
              ) : (
                /* ── Form ── */
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Name" error={errors.name}>
                      <input type="text" value={form.name} onChange={set('name')}
                        placeholder="Jane Smith" className={inputCls(errors.name)} />
                    </Field>
                    <Field label="Email" error={errors.email}>
                      <input type="email" value={form.email} onChange={set('email')}
                        placeholder="jane@example.com" className={inputCls(errors.email)} />
                    </Field>
                  </div>

                  <Field label="Subject" error={errors.subject}>
                    <input type="text" value={form.subject} onChange={set('subject')}
                      placeholder="Question about resume tailoring" className={inputCls(errors.subject)} />
                  </Field>

                  <Field label="Message" error={errors.message}>
                    <textarea value={form.message} onChange={set('message')}
                      rows={5} placeholder="Tell us what's on your mind…"
                      className={`${inputCls(errors.message)} resize-none`} />
                  </Field>

                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2
                      bg-brand-600 hover:bg-brand-700 active:scale-[0.97]
                      disabled:opacity-50 disabled:cursor-not-allowed
                      text-white text-sm font-bold py-3.5 rounded-2xl
                      shadow-sm hover:shadow-md
                      transition-all duration-200 min-h-[52px]">
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <SendIcon className="w-4 h-4" />
                        Send message
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
