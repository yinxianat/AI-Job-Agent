import { Link } from 'react-router-dom'
import {
  FileTextIcon, BrainCircuitIcon, BarChart3Icon,
  ArrowRightIcon, CheckIcon, ZapIcon, ShieldCheckIcon, TrendingUpIcon,
  BriefcaseIcon, SparklesIcon, DownloadIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const features = [
  {
    icon: BrainCircuitIcon,
    color: 'bg-violet-50 text-violet-600',
    glow: 'group-hover:bg-violet-100',
    title: 'AI-Powered Resume Tailoring',
    desc: 'Powered by Claude AI, your resume is intelligently rewritten for each specific role — matching keywords, tone, and company culture to maximise your interview rate.',
  },
  {
    icon: SparklesIcon,
    color: 'bg-amber-50 text-amber-600',
    glow: 'group-hover:bg-amber-100',
    title: 'Match Assessment',
    desc: 'Claude scores each job against your profile with a 0–100 match score, highlights strengths and weaknesses, and gives a plain-English recommendation.',
  },
  {
    icon: FileTextIcon,
    color: 'bg-green-50 text-green-600',
    glow: 'group-hover:bg-green-100',
    title: 'Multi-format Export',
    desc: 'Every tailored resume is saved as both DOCX and PDF. Download them all at once as a ZIP archive — ready to submit instantly.',
  },
  {
    icon: BarChart3Icon,
    color: 'bg-sky-50 text-sky-600',
    glow: 'group-hover:bg-sky-100',
    title: 'Batch Generation',
    desc: 'Upload a spreadsheet of jobs and let JobAgent tailor a unique resume and cover letter for every single role — completely hands-free.',
  },
]

const steps = [
  { num: '01', title: 'Upload your resume', desc: 'Drop in your existing resume (PDF or Word). You can add multiple versions — Claude combines the best parts.' },
  { num: '02', title: 'Add your job list', desc: 'Upload an Excel or CSV file with your target jobs, or paste a single job description directly.' },
  { num: '03', title: 'Run Match Assessment', desc: 'Claude scores each job against your profile so you know where to focus your energy.' },
  { num: '04', title: 'Tailored & ready to apply', desc: 'Claude rewrites your resume for each role. Download all files as a ZIP — ready to send.' },
]

const stats = [
  { value: '10×', label: 'Faster job hunting' },
  { value: '3×',  label: 'More interview callbacks' },
  { value: '100%', label: 'Tailored to each role' },
  { value: '0',   label: 'Hours of manual formatting' },
]

export default function HomePage() {
  const { user } = useAuth()

  return (
    <div className="overflow-x-hidden">

      {/* ── Hero ── */}
      <section className="relative bg-gradient-to-br from-brand-700 via-brand-600 to-blue-600 text-white overflow-hidden">
        {/* decorative blobs */}
        <div className="absolute inset-0 pointer-events-none opacity-10">
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-white" />
          <div className="absolute -bottom-32 -left-32 w-[380px] h-[380px] rounded-full bg-white" />
        </div>

        <div className="relative max-w-4xl mx-auto px-5 pt-16 pb-20 text-center sm:pt-24 sm:pb-28">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white
            text-xs font-bold px-4 py-2 rounded-full mb-7 border border-white/20
            hover:bg-white/30 transition-colors duration-200 cursor-default">
            <ZapIcon className="w-3.5 h-3.5 text-yellow-300" />
            Powered by Claude AI — Apply smarter, not harder
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] mb-6 tracking-tight">
            Your personal<br />
            <span className="text-blue-200">AI job agent</span><br />
            works for you 24/7
          </h1>

          <p className="text-base sm:text-lg text-blue-100 max-w-xl mx-auto mb-10 leading-relaxed">
            Upload your resume and a job list — JobAgent tailors a unique application for every role, scores your fit, and packages everything in one ZIP download.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {user ? (
              <>
                <Link to="/generate"
                  className="btn-primary bg-white text-brand-700 hover:bg-blue-50
                    text-base px-8 py-4 shadow-xl rounded-2xl min-h-[56px]">
                  Start Generating <ArrowRightIcon className="w-5 h-5" />
                </Link>
                <Link to="/resume"
                  className="btn-secondary bg-white/10 border-white/20 text-white
                    hover:bg-white/20 text-base px-8 py-4 rounded-2xl min-h-[56px]">
                  Tailor My Resume
                </Link>
              </>
            ) : (
              <>
                <Link to="/signup"
                  className="btn-primary bg-white text-brand-700 hover:bg-blue-50
                    text-base px-8 py-4 shadow-xl rounded-2xl min-h-[56px]">
                  Get started — it's free <ArrowRightIcon className="w-5 h-5" />
                </Link>
                <Link to="/login"
                  className="btn-secondary bg-white/10 border-white/20 text-white
                    hover:bg-white/20 text-base px-8 py-4 rounded-2xl min-h-[56px]">
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="bg-brand-900 text-white py-8">
        <div className="max-w-4xl mx-auto px-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {stats.map((s) => (
            <div key={s.label}
              className="p-3 rounded-2xl hover:bg-white/5 transition-colors duration-200 cursor-default">
              <div className="text-3xl font-extrabold text-blue-300">{s.value}</div>
              <div className="text-xs text-blue-300 mt-1 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-5 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="section-pill mb-4">Features</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-3">
              Everything you need to land the job
            </h2>
            <p className="mt-3 text-gray-500 max-w-md mx-auto text-sm leading-relaxed">
              From upload to tailored applications — JobAgent handles every step.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {features.map((f) => (
              <div key={f.title}
                className="group card p-6 hover:shadow-lg hover:-translate-y-1
                  active:scale-[0.98] transition-all duration-200 cursor-default">
                <div className={`inline-flex items-center justify-center w-12 h-12
                  rounded-2xl mb-4 ${f.color} ${f.glow}
                  group-hover:scale-110 transition-all duration-200`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 px-5 bg-[#f8f9fc]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <span className="section-pill mb-4">How it works</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-3">
              Four steps to your next role
            </h2>
          </div>

          {/* Vertical on mobile, horizontal on desktop */}
          <div className="flex flex-col sm:grid sm:grid-cols-4 gap-6 sm:gap-4">
            {steps.map((s, i) => (
              <div key={s.num} className="relative flex sm:flex-col items-start gap-4 sm:gap-0">
                {/* Connector line — horizontal on sm+ */}
                {i < steps.length - 1 && (
                  <>
                    {/* Mobile: vertical line */}
                    <div className="sm:hidden absolute left-6 top-14 w-px h-[calc(100%+24px)] bg-brand-100" />
                    {/* Desktop: horizontal line */}
                    <div className="hidden sm:block absolute top-6 left-full w-full h-px bg-brand-100 z-0" />
                  </>
                )}
                <div className="relative z-10 w-12 h-12 shrink-0 rounded-2xl bg-brand-600 text-white
                  font-bold flex items-center justify-center text-sm shadow-md
                  hover:bg-brand-700 hover:scale-110 transition-all duration-200 cursor-default">
                  {s.num}
                </div>
                <div className="sm:mt-4">
                  <h3 className="font-bold text-gray-900 mb-1 text-sm">{s.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust signals ── */}
      <section className="py-16 px-5 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="bg-gradient-to-br from-brand-50 to-blue-50
            border border-brand-100 rounded-3xl p-8 sm:p-10">
            <div className="grid sm:grid-cols-3 gap-8 text-center">
              {[
                { icon: ShieldCheckIcon, color: 'bg-green-100 text-green-600',  title: 'Secure by design', desc: 'JWT auth, temporary file storage — your data never lingers.' },
                { icon: ZapIcon,         color: 'bg-amber-100 text-amber-600',  title: 'Blazing fast',     desc: 'Async FastAPI + parallel Claude calls mean results in seconds.' },
                { icon: DownloadIcon,    color: 'bg-sky-100 text-sky-600',      title: 'One-click export', desc: 'All resumes and assessments bundled as a ZIP or Excel file.' },
              ].map((t) => (
                <div key={t.title}
                  className="flex flex-col items-center gap-3
                    hover:-translate-y-1 transition-transform duration-200 cursor-default">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${t.color}`}>
                    <t.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm">{t.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-5 bg-gradient-to-br from-brand-700 to-blue-600 text-white text-center">
        <div className="max-w-xl mx-auto">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-5
            hover:bg-white/20 transition-colors duration-200">
            <BriefcaseIcon className="w-7 h-7 text-blue-200" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-4 leading-tight">
            Ready to let AI do the heavy lifting?
          </h2>
          <p className="text-blue-100 text-base mb-8 leading-relaxed">
            Create your free account and let JobAgent tailor, assess, and package your applications.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {user ? (
              <Link to="/generate"
                className="btn-primary bg-white text-brand-700 hover:bg-blue-50
                  text-base px-8 py-4 shadow-xl rounded-2xl min-h-[56px]">
                Go to Resume Generator <ArrowRightIcon className="w-5 h-5" />
              </Link>
            ) : (
              <>
                <Link to="/signup"
                  className="btn-primary bg-white text-brand-700 hover:bg-blue-50
                    text-base px-8 py-4 shadow-xl rounded-2xl min-h-[56px]">
                  Sign up free <ArrowRightIcon className="w-5 h-5" />
                </Link>
                <Link to="/contact"
                  className="btn-secondary bg-transparent border-white/30 text-white
                    hover:bg-white/10 text-base px-8 py-4 rounded-2xl min-h-[56px]">
                  Have questions?
                </Link>
              </>
            )}
          </div>

          <ul className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-blue-200">
            {['No credit card required', 'Local data — fully private', 'Cancel anytime'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckIcon className="w-3.5 h-3.5 text-blue-300" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
