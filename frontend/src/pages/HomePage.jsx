import { Link } from 'react-router-dom'
import {
  SearchIcon, FileTextIcon, BrainCircuitIcon, BarChart3Icon,
  ArrowRightIcon, CheckIcon, ZapIcon, ShieldCheckIcon, TrendingUpIcon,
  BriefcaseIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const features = [
  {
    icon: SearchIcon,
    color: 'bg-blue-100 text-blue-600',
    title: 'Smart Job Discovery',
    desc: 'Enter your role, location, and date range. JobAgent scans Indeed and surfaces every relevant opportunity — complete with job descriptions, company links, and posting dates.',
  },
  {
    icon: BrainCircuitIcon,
    color: 'bg-purple-100 text-purple-600',
    title: 'AI-Powered Resume Tailoring',
    desc: 'Powered by Claude AI, your resume is intelligently rewritten for each specific role — matching keywords, tone, and company culture to maximise your interview rate.',
  },
  {
    icon: FileTextIcon,
    color: 'bg-green-100 text-green-600',
    title: 'Multi-format Export',
    desc: 'Every tailored resume is saved as both DOCX and PDF, named by role, location, and company. An Excel tracker keeps all your applications in one organised place.',
  },
  {
    icon: BarChart3Icon,
    color: 'bg-orange-100 text-orange-600',
    title: 'Company Research',
    desc: 'JobAgent automatically compiles a short company profile for each listing, so you walk into every interview knowing exactly who you\'re talking to.',
  },
]

const steps = [
  { num: '01', title: 'Set your criteria', desc: 'Choose your job category, preferred location, and how recently the role was posted.' },
  { num: '02', title: 'Let the agent search', desc: 'JobAgent scrapes Indeed in real time and returns a clean list of matching positions, saved to Excel.' },
  { num: '03', title: 'Upload your resume', desc: 'Drop in your existing resume (PDF or Word). Select the output folder on your laptop.' },
  { num: '04', title: 'Tailored & ready to apply', desc: 'Claude rewrites your resume for each job. You get perfectly targeted applications — fast.' },
]

const stats = [
  { value: '10×', label: 'Faster job hunting' },
  { value: '3×', label: 'More interview callbacks' },
  { value: '100%', label: 'Tailored to each role' },
  { value: '0', label: 'Hours of manual formatting' },
]

export default function HomePage() {
  const { user } = useAuth()

  return (
    <div className="overflow-x-hidden">
      {/* ── Hero ── */}
      <section className="relative bg-gradient-to-br from-brand-700 via-brand-600 to-blue-600 text-white py-24 px-4 overflow-hidden">
        {/* Background blob */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-white" />
          <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-white" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-4 py-1.5 rounded-full mb-6 border border-white/30">
            <ZapIcon className="w-3.5 h-3.5" /> Powered by Claude AI — Apply smarter, not harder
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold leading-tight mb-6">
            Your personal<br />
            <span className="text-blue-200">AI job agent</span><br />
            works for you 24/7
          </h1>

          <p className="text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto mb-10 leading-relaxed">
            JobAgent searches job boards, researches companies, and rewrites your resume for every single position — so you land interviews without the grind.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <>
                <Link to="/jobs" className="btn-primary bg-white text-brand-700 hover:bg-blue-50 text-base px-8 py-3.5 shadow-xl">
                  Start Job Search <ArrowRightIcon className="w-5 h-5" />
                </Link>
                <Link to="/resume" className="btn-secondary bg-white/10 border-white/30 text-white hover:bg-white/20 text-base px-8 py-3.5">
                  Tailor My Resume
                </Link>
              </>
            ) : (
              <>
                <Link to="/signup" className="btn-primary bg-white text-brand-700 hover:bg-blue-50 text-base px-8 py-3.5 shadow-xl">
                  Get started — it's free <ArrowRightIcon className="w-5 h-5" />
                </Link>
                <Link to="/login" className="btn-secondary bg-white/10 border-white/30 text-white hover:bg-white/20 text-base px-8 py-3.5">
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="bg-brand-900 text-white py-8">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-extrabold text-blue-300">{s.value}</div>
              <div className="text-sm text-blue-200 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="badge badge-blue mb-3">Features</span>
            <h2 className="text-4xl font-extrabold text-gray-900">Everything you need to land the job</h2>
            <p className="mt-3 text-gray-500 max-w-xl mx-auto">
              From discovery to a tailored application — JobAgent handles every step of your job hunt.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((f) => (
              <div key={f.title} className="card p-6 hover:shadow-md transition-shadow group">
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4 ${f.color} group-hover:scale-110 transition-transform`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-24 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="badge badge-blue mb-3">How it works</span>
            <h2 className="text-4xl font-extrabold text-gray-900">Four steps to your next role</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((s, i) => (
              <div key={s.num} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-6 left-full w-full h-px bg-brand-200 z-0" />
                )}
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white font-bold flex items-center justify-center text-lg mb-4 shadow-md">
                    {s.num}
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust signals ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="card p-10 bg-gradient-to-r from-brand-50 to-blue-50 border-brand-100">
            <div className="grid md:grid-cols-3 gap-6 text-center">
              {[
                { icon: ShieldCheckIcon, title: 'Secure by design', desc: 'JWT authentication, local file storage — your data never leaves your machine.' },
                { icon: ZapIcon,         title: 'Blazing fast',     desc: 'Async FastAPI backend + concurrent scraping means results in seconds, not minutes.' },
                { icon: TrendingUpIcon,  title: 'Built to scale',   desc: 'Modular architecture — swap out job boards, add LinkedIn, or plug in any AI model.' },
              ].map((t) => (
                <div key={t.title} className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center">
                    <t.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{t.title}</h3>
                  <p className="text-sm text-gray-500">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-4 bg-gradient-to-br from-brand-700 to-blue-600 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <BriefcaseIcon className="w-12 h-12 mx-auto mb-4 text-blue-200" />
          <h2 className="text-4xl font-extrabold mb-4">Ready to let AI do the heavy lifting?</h2>
          <p className="text-blue-100 text-lg mb-8">Create your free account and let JobAgent find, research, and apply to your next role.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <Link to="/jobs" className="btn-primary bg-white text-brand-700 hover:bg-blue-50 text-base px-8 py-3.5 shadow-xl">
                Go to Job Search <ArrowRightIcon className="w-5 h-5" />
              </Link>
            ) : (
              <>
                <Link to="/signup" className="btn-primary bg-white text-brand-700 hover:bg-blue-50 text-base px-8 py-3.5 shadow-xl">
                  Sign up free <ArrowRightIcon className="w-5 h-5" />
                </Link>
                <Link to="/contact" className="btn-secondary bg-transparent border-white/40 text-white hover:bg-white/10 text-base px-8 py-3.5">
                  Have questions?
                </Link>
              </>
            )}
          </div>

          <ul className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-blue-200">
            {['No credit card required', 'Local data — fully private', 'Cancel anytime'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckIcon className="w-4 h-4 text-blue-300" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
