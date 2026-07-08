# AssignIQ — AI-Powered Enterprise Workforce Management Platform

An intelligent, multi-role project management platform that uses an **Auditable AI Decision Engine** (Groq LLaMA) to automatically generate comprehensive 23-section project execution plans, form teams, assign employees, and manage the full sprint lifecycle — from project creation through admin approval to active sprint execution.

---

## 🚀 Platform Overview

AssignIQ supports **four distinct user roles**, each with their own dashboard and workflow:

| Role | Capabilities |
|---|---|
| **Admin** | Create projects, assign PMs, approve/reject AI execution plans, manage users & employees |
| **Project Manager** | Review assigned projects, trigger AI analysis, edit 23-section plans, submit to admin |
| **Team Lead** | View team, manage sprint tasks (Kanban board), track workload and progress |
| **Employee** | View assignments, update task progress, submit for review, request help |

---

## ✨ Key Features

| Feature | Description |
|---|---|
| **Multi-Role Auth** | Session-based login with role-specific dashboards (Admin / PM / Team Lead / Employee) |
| **8-Step Workflow** | PM Review → AI Analysis → Edit Plan → AI Assignment → Submit → Admin Approval → Dispatch → Active Sprint |
| **AI Execution Planner** | Groq LLaMA generates a full **23-section project plan** (objectives, modules, tech stack, timeline, cost, risks, deliverables, etc.) |
| **AI Team Assignment** | Deterministic + AI-powered employee matching using skill scores, workload, experience, and confidence scoring |
| **Auditable Decision Traces** | Every assignment includes transparent reasoning — no hallucination, full traceability |
| **AI Replacement Engine** | Replace any assigned employee; Llama 3.3 recommends the best alternative with justification |
| **Sprint Kanban Board** | PM and Team Lead can create and manage tasks across To Do / In Progress / Review / Completed |
| **Real-time Notifications** | In-app notification bell with unread badges; auto-polls every 12 seconds |
| **Employee Directory** | Full employee grid with skills, workload bars, performance scores, and department info |
| **Audit Logs** | Full action log (login, task assignment, plan approvals, etc.) |
| **Dark / Light Theme** | Persistent theme toggle with localStorage |
| **PDF & Text Export** | Export project plans as PDF or formatted text |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python · Flask |
| **AI** | Groq API (LLaMA 3.3 / LLaMA 3.1 models) |
| **Database** | Supabase (PostgreSQL) |
| **Frontend** | Vanilla HTML · CSS · JavaScript (no framework) |
| **Charts** | Chart.js |
| **Icons** | Font Awesome 6 |
| **Fonts** | Google Fonts — Plus Jakarta Sans |

---

## 📁 Project Structure

```
Work-Assign/
├── app.py                  # Flask backend — all API routes, auth, workflow logic
├── ai_project_manager.py   # AI prompt engineering + auditable decision engine
├── db.py                   # Database helpers (Supabase PostgreSQL)
├── supabase_schema.sql     # Full DB schema (run once in Supabase SQL Editor)
├── migrate_v2.py           # Schema migration script
├── employees_credentials.csv  # Seed employee data
├── requirements.txt
├── .env                    # Environment variables (not committed)
├── .gitignore
├── render.yaml             # Render.com deployment config
├── vercel.json             # Vercel deployment config
├── templates/
│   ├── index.html          # Main app shell (all views, modals, Kanban board)
│   └── login.html          # Login page
└── static/
    ├── app.js              # All frontend logic (2200+ lines — routing, API calls, UI rendering)
    └── style.css           # Dark/light theme, component styles
```

---

## ⚙️ Setup & Installation

### 1. Prerequisites
- Python 3.10+
- A [Supabase](https://supabase.com) project
- A [Groq](https://console.groq.com) API key

### 2. Clone the repository
```bash
git clone https://github.com/palamooradithyagoud/Work-Assign.git
cd Work-Assign
```

### 3. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure environment variables
Create a `.env` file in the project root:
```env
DATABASE_URL=postgresql://postgres:<password>@db.<project-id>.supabase.co:5432/postgres
GROQ_API_KEY=your-groq-api-key
FLASK_SECRET_KEY=any-random-secret-string
```

### 5. Set up the database
1. Open your Supabase project → SQL Editor
2. Paste and run the contents of `supabase_schema.sql`
3. *(Optional)* Run `python migrate_v2.py` for schema migrations

### 6. Run the application
```bash
python app.py
```

Then open [http://localhost:5000](http://localhost:5000) in your browser.

---

## 🔄 Workflow

```
Admin creates project → assigns PM
        ↓
PM reviews requirements → triggers AI (Groq LLaMA)
        ↓
AI generates 23-section execution plan (editable)
        ↓
PM approves plan → AI assigns employees to teams
        ↓
PM reviews assignments (accept / replace via AI)
        ↓
PM submits plan to Admin for final approval
        ↓
Admin approves → project goes Active
        ↓
Team Lead manages sprint tasks (Kanban)
        ↓
Employees update progress, submit for review, request help
```

---

## 👥 Default Roles & Login

After seeding the database (`db.seed_database()` runs on startup), the following demo accounts are available:

| Role | Email | Password |
|---|---|---|
| Admin | admin@assigniq.com | admin123 |
| Project Manager | pm@assigniq.com | pm123 |
| Team Lead | lead@assigniq.com | lead123 |
| Employee | emp@assigniq.com | emp123 |

---

## 🐛 Recent Bug Fixes (July 2026)

- **Create Task button fixed** — Merged duplicate conflicting `POST /api/tasks` Flask routes; `team_lead` role now properly allowed to create tasks
- **Task assignee dropdown** — Falls back to all employees when opened by PM/Admin (was only loading team members)
- **Error feedback** — `createTask()` now shows server error messages via toast instead of silently failing
- **Workflow badge labels** — Added missing entries for `awaiting_admin_approval`, `rejected`, `approved`, `ai_planning` statuses in `wsBadgeClass()` and `wsLabel()`

---

## 📄 License

MIT License — free to use, modify, and distribute.
