import { useState } from 'react'
import {
  MailIcon, SendIcon, MessageSquareIcon, ChevronDownIcon, ChevronUpIcon,
  BriefcaseIcon, ShieldCheckIcon, HelpCircleIcon,
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
    a: 'Upload your resume and paste in a single job description. Claude rewrites the resume to align with that role\'s keywords, tone, and required skills, then lets you preview, download as PDF or DOCX, and save it to your tracker.',
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

export default function ContactPage() {
  const [form, setForm]       = useState({ name: '', email: '', subject: '', message: '' })
  const [errors, setErrors]   = useState({})
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [openFaq, setOpenFaq] = useState(null)

  const set = (f) => (e) => {
    setForm((prev) => ({ ...prev, [f]: e.target.value }))
    setErrors((prev) => ({ ...prev, [f]: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim())    e.name    = 'Name is required'
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email is required'
    if (!form.subject.trim()) e.subject = 'Subject is required'
    if (!form.message.trim() || form.message.length < 20) e.message = 'Message must be at least 20 characters'
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
    <div className="page-container max-w-5xl">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl shadow-lg mb-4">
          <MailIcon className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900">Questions & Support</h1>
        <p className="mt-3 text-gray-500 max-w-xl mx-auto">
          Browse the FAQ below, or send us a message. We typically respond within one business day.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-10">
        {/* ── FAQ ── */}
        <div className="lg:col-span-3">
          <h2 className="text-xl font-bold text-gray-900 mb-5 flex items-center gap-2">
            <HelpCircleIcon className="w-5 h-5 text-brand-500" /> Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="card overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left gap-4 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-900 text-sm">{faq.q}</span>
                  {openFaq === i
                    ? <ChevronUpIcon className="w-4 h-4 text-brand-500 shrink-0" />
                    : <ChevronDownIcon className="w-4 h-4 text-gray-400 shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick links */}
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              { icon: BriefcaseIcon, title: 'Resume Generator', desc: 'Batch-tailor resumes from a spreadsheet' },
              { icon: ShieldCheckIcon, title: 'Privacy & Data', desc: 'Where your data is stored' },
            ].map((c) => (
              <div key={c.title} className="card p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                  <c.icon className="w-5 h-5 text-brand-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{c.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Contact form ── */}
        <div className="lg:col-span-2">
          <div className="card sticky top-20">
            <div className="card-header">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <MessageSquareIcon className="w-4 h-4 text-brand-500" /> Send a Message
              </h2>
            </div>
            <div className="card-body">
              {sent ? (
                <div className="text-center py-8 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                    <SendIcon className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="font-semibold text-gray-900">Message sent!</p>
                  <p className="text-sm text-gray-500">We'll reply to <strong>{form.email}</strong> shortly.</p>
                  <button onClick={() => { setSent(false); setForm({ name:'',email:'',subject:'',message:'' }) }}
                    className="btn-secondary text-sm mx-auto">
                    Send another
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div>
                    <label className="label">Your name</label>
                    <input type="text" value={form.name} onChange={set('name')}
                      placeholder="Jane Smith"
                      className={`input ${errors.name ? 'border-red-400' : ''}`} />
                    {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="label">Email address</label>
                    <input type="email" value={form.email} onChange={set('email')}
                      placeholder="jane@example.com"
                      className={`input ${errors.email ? 'border-red-400' : ''}`} />
                    {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="label">Subject</label>
                    <input type="text" value={form.subject} onChange={set('subject')}
                      placeholder="Question about resume tailoring"
                      className={`input ${errors.subject ? 'border-red-400' : ''}`} />
                    {errors.subject && <p className="mt-1 text-xs text-red-500">{errors.subject}</p>}
                  </div>
                  <div>
                    <label className="label">Message</label>
                    <textarea value={form.message} onChange={set('message')}
                      rows={5} placeholder="Tell us what's on your mind…"
                      className={`input resize-none ${errors.message ? 'border-red-400' : ''}`} />
                    {errors.message && <p className="mt-1 text-xs text-red-500">{errors.message}</p>}
                  </div>
                  <button type="submit" className="btn-primary w-full justify-center py-3" disabled={loading}>
                    {loading ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                    ) : (
                      <><SendIcon className="w-4 h-4" /> Send message</>
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
