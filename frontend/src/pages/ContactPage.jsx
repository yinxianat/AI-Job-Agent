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
    q: 'How does JobAgent scrape job listings?',
    a: 'JobAgent uses an async Python scraper (with BeautifulSoup / Playwright) to search Indeed based on your criteria. Results include job title, company, location, posting date, job description, and direct links.',
  },
  {
    q: 'How does the AI resume tailoring work?',
    a: 'Your uploaded resume is sent to the Claude API along with the job description and company details. Claude rewrites it to match keywords, tone, and required skills — then saves it locally as both PDF and DOCX.',
  },
  {
    q: 'Is my data stored on your servers?',
    a: 'No. JobAgent is a local-first application. Your resumes, job data, and Excel trackers are all saved to folders on your own computer. We only store hashed authentication credentials.',
  },
  {
    q: 'What resume formats are supported for upload?',
    a: 'JobAgent supports PDF (.pdf), Word 2007+ (.docx), and legacy Word (.doc) formats — up to 10 MB each.',
  },
  {
    q: 'Can I search multiple job categories at once?',
    a: 'Currently each search targets one category. You can run multiple searches back-to-back and each set of results will be exported to a separate Excel file.',
  },
  {
    q: 'Do I need my own Claude API key?',
    a: 'Yes. Add your key to the backend .env file as ANTHROPIC_API_KEY. You can get a key at console.anthropic.com.',
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
              { icon: BriefcaseIcon, title: 'Job Search guide', desc: 'How to configure your first search' },
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
