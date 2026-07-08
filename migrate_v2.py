"""
AssignIQ v2 Database Migration
Adds new tables and columns for the enterprise workflow platform.
Safe to run multiple times (idempotent - uses IF NOT EXISTS / IF NOT EXISTS).
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:ADITHYAGOUD%40789@db.jxnacpjbrnbihgmcydwr.supabase.co:5432/postgres"
)


ALTER_STATEMENTS = [
    # Projects table additions
    "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client TEXT",
    "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS assigned_pm TEXT",
    "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'draft'",
    "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS pm_comment TEXT",
    "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS documents_json JSONB",
    "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_by TEXT",
    # Employees table additions
    "ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS performance_score REAL DEFAULT 85.0",
    "ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS completed_projects INTEGER DEFAULT 0",
    "ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS certifications TEXT",
    "ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS availability INTEGER DEFAULT 100",
    # Users table additions
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department TEXT",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT",
    # Tasks table additions
    "ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS help_requested BOOLEAN DEFAULT FALSE",
    "ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS help_comment TEXT",
]

CREATE_STATEMENTS = [
    # Modules table
    """CREATE TABLE IF NOT EXISTS public.modules (
        module_id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES public.projects(project_id) ON DELETE CASCADE,
        module_name TEXT NOT NULL,
        description TEXT,
        estimated_duration TEXT,
        required_skills TEXT,
        complexity TEXT DEFAULT 'Medium',
        status TEXT DEFAULT 'planning',
        created_at TEXT NOT NULL
    )""",

    # Teams table
    """CREATE TABLE IF NOT EXISTS public.teams (
        team_id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES public.projects(project_id) ON DELETE CASCADE,
        module_id TEXT,
        team_name TEXT NOT NULL,
        required_skills TEXT,
        team_size INTEGER DEFAULT 3,
        team_lead_id TEXT,
        lead_approved BOOLEAN DEFAULT FALSE,
        status TEXT DEFAULT 'forming',
        created_at TEXT NOT NULL
    )""",

    # Team members join table
    """CREATE TABLE IF NOT EXISTS public.team_members (
        id TEXT PRIMARY KEY,
        team_id TEXT REFERENCES public.teams(team_id) ON DELETE CASCADE,
        employee_id TEXT,
        assigned_role TEXT,
        assigned_at TEXT,
        ai_confidence REAL,
        ai_reason TEXT,
        is_lead BOOLEAN DEFAULT FALSE
    )""",

    # Lead approval requests (Admin must approve team lead selections)
    """CREATE TABLE IF NOT EXISTS public.lead_approvals (
        id TEXT PRIMARY KEY,
        team_id TEXT,
        project_id TEXT,
        team_name TEXT,
        project_name TEXT,
        selected_employee_id TEXT,
        requested_by TEXT,
        status TEXT DEFAULT 'pending',
        admin_comment TEXT,
        ai_reason TEXT,
        confidence_score REAL,
        alternative_ids JSONB,
        created_at TEXT NOT NULL,
        decided_at TEXT
    )""",

    # Comments on tasks / projects
    """CREATE TABLE IF NOT EXISTS public.comments (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""",
]

SEED_UPDATES = [
    # Set performance_score for all employees to realistic values
    "UPDATE public.employees SET performance_score = 92.0, completed_projects = 8,  availability = 60  WHERE employee_id = 'EMP001'",
    "UPDATE public.employees SET performance_score = 88.0, completed_projects = 5,  availability = 65  WHERE employee_id = 'EMP002'",
    "UPDATE public.employees SET performance_score = 91.0, completed_projects = 12, availability = 50  WHERE employee_id = 'EMP003'",
    "UPDATE public.employees SET performance_score = 84.0, completed_projects = 3,  availability = 70  WHERE employee_id = 'EMP004'",
    "UPDATE public.employees SET performance_score = 90.0, completed_projects = 7,  availability = 55  WHERE employee_id = 'EMP005'",
    "UPDATE public.employees SET performance_score = 95.0, completed_projects = 15, availability = 45  WHERE employee_id = 'EMP006'",
    "UPDATE public.employees SET performance_score = 87.0, completed_projects = 4,  availability = 60  WHERE employee_id = 'EMP007'",
    "UPDATE public.employees SET performance_score = 89.0, completed_projects = 6,  availability = 70  WHERE employee_id = 'EMP008'",
    "UPDATE public.employees SET performance_score = 93.0, completed_projects = 10, availability = 45  WHERE employee_id = 'EMP009'",
    "UPDATE public.employees SET performance_score = 82.0, completed_projects = 3,  availability = 75  WHERE employee_id = 'EMP010'",
    "UPDATE public.employees SET performance_score = 88.0, completed_projects = 8,  availability = 40  WHERE employee_id = 'EMP011'",
    "UPDATE public.employees SET performance_score = 91.0, completed_projects = 6,  availability = 65  WHERE employee_id = 'EMP012'",
    "UPDATE public.employees SET performance_score = 86.0, completed_projects = 9,  availability = 50  WHERE employee_id = 'EMP013'",
    "UPDATE public.employees SET performance_score = 90.0, completed_projects = 7,  availability = 60  WHERE employee_id = 'EMP014'",
    "UPDATE public.employees SET performance_score = 94.0, completed_projects = 11, availability = 55  WHERE employee_id = 'EMP015'",
    "UPDATE public.employees SET performance_score = 83.0, completed_projects = 2,  availability = 80  WHERE employee_id = 'EMP016'",
    "UPDATE public.employees SET performance_score = 88.0, completed_projects = 5,  availability = 65  WHERE employee_id = 'EMP017'",
    "UPDATE public.employees SET performance_score = 92.0, completed_projects = 14, availability = 70  WHERE employee_id = 'EMP018'",
    "UPDATE public.employees SET performance_score = 80.0, completed_projects = 1,  availability = 85  WHERE employee_id = 'EMP019'",
    "UPDATE public.employees SET performance_score = 85.0, completed_projects = 3,  availability = 60  WHERE employee_id = 'EMP020'",
    # Set workflow_status for existing projects
    "UPDATE public.projects SET workflow_status = 'published', created_by = 'admin-id-111' WHERE workflow_status IS NULL",
]

TEAM_LEAD_USERS = [
    ("TL001", "tl1@assigniq.com", "teamlead123", "Arjun Mehta (Team Lead)", "team_lead", "2026-07-08T00:00:00Z"),
    ("TL002", "tl2@assigniq.com", "teamlead123", "Priya Krishnan (Team Lead)", "team_lead", "2026-07-08T00:00:00Z"),
]

def run():
    conn = psycopg2.connect(DATABASE_URL, connect_timeout=20)
    conn.autocommit = True
    cur = conn.cursor()

    print("=== Phase 1: ALTER existing tables ===")
    for stmt in ALTER_STATEMENTS:
        try:
            cur.execute(stmt)
            print(f"  OK: {stmt[:65]}")
        except Exception as e:
            print(f"  WARN: {stmt[:65]} => {e}")

    print("\n=== Phase 2: CREATE new tables ===")
    for stmt in CREATE_STATEMENTS:
        table = [l for l in stmt.split('\n') if 'TABLE' in l][0].strip()
        try:
            cur.execute(stmt)
            print(f"  OK: {table}")
        except Exception as e:
            print(f"  WARN: {table} => {e}")

    print("\n=== Phase 3: Seed updates ===")
    for stmt in SEED_UPDATES:
        try:
            cur.execute(stmt)
            print(f"  OK: {stmt[:70]}")
        except Exception as e:
            print(f"  WARN: {stmt[:70]} => {e}")

    print("\n=== Phase 4: Team Lead user accounts ===")
    for (uid, email, pwd, name, role, created) in TEAM_LEAD_USERS:
        try:
            cur.execute("""INSERT INTO public.users (id, email, password_hash, full_name, role, created_at)
                VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                (uid, email, pwd, name, role, created))
            print(f"  OK: {email}")
        except Exception as e:
            print(f"  WARN: {email} => {e}")

    cur.close()
    conn.close()
    print("\n=== Migration complete! ===")

if __name__ == "__main__":
    run()
