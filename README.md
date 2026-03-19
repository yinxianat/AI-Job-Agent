# 🤖 JobAgent — AI-Powered Job Search & Resume Tailor

> Your personal AI agent that searches for jobs, researches companies, and rewrites your resume for every position — powered by **Claude AI** and **FastAPI + React**.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 JWT Auth | Secure sign-up / login with bcrypt hashing |
| 🔍 Job Search | Scrapes Indeed by category, location, and date range |
| 📊 Excel Export | All job results saved to a formatted `.xlsx` file |
| 🧠 AI Resume Tailor | Claude rewrites your resume for each specific role |
| 📁 Multi-format Output | Tailored resumes saved as both PDF and DOCX |
| 📋 Resume Tracker | Excel tracker linking every resume to its job posting |
| 📧 Contact Form | Customer enquiries forwarded via SMTP email |

---

## 🏗️ Tech Stack

**Frontend**
- React 18 + Vite
- React Router v6
- Tailwind CSS
- Axios + React Hot Toast
- React Dropzone

**Backend**
- FastAPI + Uvicorn (async)
- SQLAlchemy 2 + aiosqlite (SQLite, swappable to Postgres)
- JWT via `python-jose` + `passlib[bcrypt]`
- httpx + BeautifulSoup4 (Indeed scraping)
- Anthropic Python SDK (Claude AI)
- openpyxl (Excel), python-docx + ReportLab (DOCX/PDF)
- aiosmtplib (async email)

---

## 📁 Project Structure

```
job-agent/
├── frontend/                 # React + Vite app
│   ├── src/
│   │   ├── components/       # Navbar, Footer, ProtectedRoute
│   │   ├── contexts/         # AuthContext (JWT session)
│   │   ├── pages/            # HomePage, LoginPage, SignUpPage,
│   │   │                     # JobSearchPage, ResumePage, ContactPage
│   │   └── services/         # api.js (axios instance)
│   ├── tailwind.config.js
│   └── package.json
│
└── backend/                  # FastAPI app
    ├── app/
    │   ├── main.py           # App entry point + CORS
    │   ├── config.py         # Settings from .env
    │   ├── database.py       # SQLAlchemy async engine
    │   ├── models/           # User, Job, ResumeEntry ORM models
    │   ├── schemas/          # Pydantic request/response schemas
    │   ├── routers/          # auth, jobs, resume, contact
    │   └── services/         # auth, scraper, claude, excel, resume, email
    ├── requirements.txt
    └── .env.example
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- An [Anthropic API key](https://console.anthropic.com)

---

### 1. Clone & configure

```bash
git clone <your-repo-url>
cd job-agent
```

### 2. Backend setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# (Optional) Install Playwright for enhanced scraping
playwright install chromium

# Configure environment
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY and SMTP credentials
```

#### Key `.env` settings

```env
SECRET_KEY=your-long-random-secret-here
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
CLAUDE_MODEL=claude-opus-4-6

# Email (optional — contact form)
SMTP_USERNAME=your@gmail.com
SMTP_PASSWORD=your-gmail-app-password
SUPPORT_EMAIL=support@yourdomain.com
```

### 3. Start the backend

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

API docs available at: http://localhost:8000/api/docs

---

### 4. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

App available at: http://localhost:3000

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create new account |
| POST | `/api/auth/login` | Login, receive JWT |
| GET  | `/api/auth/me` | Get current user |

### Jobs
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/jobs/search` | Start async job scrape |
| GET  | `/api/jobs/task/{id}` | Poll task status + results |
| GET  | `/api/jobs/export/{id}` | Download results as Excel |

### Resume
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/resume/tailor` | Upload resume → tailor with Claude |
| GET  | `/api/resume/download?path=...` | Download tailored file |
| GET  | `/api/resume/tracker` | Download resume tracker Excel |

### Contact
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/contact/send` | Submit contact form |

---

## 🧠 Resume Naming Convention

```
JobTitle_Location_Company.pdf
JobTitle_Location_Company.docx

Example:
  Senior_Software_Engineer_New_York_NY_Acme_Corp.pdf
```

---

## 🔒 Security Notes

- Passwords are hashed with bcrypt (12 rounds)
- JWT tokens expire after 24 hours (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- All protected routes require `Authorization: Bearer <token>` header
- Resume files are saved **locally on the server machine** — no cloud storage
- Change `SECRET_KEY` to a cryptographically random value before production

---

## 🔧 Extending the Project

- **Add more job boards**: extend `scraper_service.py` with LinkedIn, Glassdoor scrapers
- **Use PostgreSQL**: change `DATABASE_URL` to `postgresql+asyncpg://...` and update `requirements.txt`
- **Add Redis task queue**: replace the in-memory `_tasks` dict in `scraper_service.py` with Celery + Redis
- **Deploy**: wrap backend in a Docker container, serve frontend with Nginx

---

## 📄 License

MIT — free to use and modify.
