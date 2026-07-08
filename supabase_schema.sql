-- ============================================================
-- ASSIGNIQ — FINAL DATABASE SCHEMA & SEED DATA FROM TARGET DATASETS
-- Safe to run in Supabase SQL Editor
-- Rebuilds public schema tables to match target images exactly
-- ============================================================

-- 1. DROP EXISTING TABLES IN REVERSE RELATION ORDER
DROP TABLE IF EXISTS public.chats CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.files CASCADE;
DROP TABLE IF EXISTS public.tools CASCADE;
DROP TABLE IF EXISTS public.project_history CASCADE;

-- 2. CREATE SYSTEM TABLES

-- Users Table (dashboard login profiles)
CREATE TABLE public.users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Tools Table
CREATE TABLE public.tools (
    tool_id TEXT PRIMARY KEY,
    tool_name TEXT NOT NULL,
    tool_type TEXT NOT NULL,
    purpose TEXT NOT NULL
);

-- Employees Table
CREATE TABLE public.employees (
    employee_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'employee',
    skills TEXT DEFAULT '',
    experience INTEGER DEFAULT 1,
    current_workload INTEGER DEFAULT 0,
    photo TEXT,
    department TEXT,
    email TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
);

-- Projects Table
CREATE TABLE public.projects (
    project_id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    description TEXT,
    required_skills TEXT DEFAULT '',
    deadline_days INTEGER NOT NULL DEFAULT 30,
    priority TEXT NOT NULL DEFAULT 'Medium',
    status TEXT DEFAULT 'planning',
    ai_plan JSONB,
    estimated_duration TEXT,
    budget TEXT,
    preferred_tech TEXT,
    preferred_roles JSONB,
    team_size INTEGER DEFAULT 2,
    created_at TEXT NOT NULL,
    updated_at TEXT
);

-- Project History (success metrics data)
CREATE TABLE public.project_history (
    history_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    team_size INTEGER NOT NULL,
    tools_used TEXT NOT NULL, -- semicolon-separated
    completion_days INTEGER NOT NULL,
    success_score REAL NOT NULL
);

-- Tasks Table
CREATE TABLE public.tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES public.projects(project_id) ON DELETE CASCADE,
    task_name TEXT NOT NULL,
    description TEXT,
    assigned_to TEXT REFERENCES public.employees(employee_id) ON DELETE SET NULL,
    priority TEXT,
    deadline TEXT,
    estimated_hours INTEGER,
    status TEXT,
    comments JSONB,
    deliverable JSONB,
    progress_percent INTEGER DEFAULT 0,
    hours_worked INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT
);

-- Notifications Table
CREATE TABLE public.notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TEXT NOT NULL
);

-- Audit Logs Table
CREATE TABLE public.audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    details TEXT,
    user_email TEXT,
    created_at TEXT NOT NULL
);

-- Chats Table
CREATE TABLE public.chats (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES public.projects(project_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Files Table
CREATE TABLE public.files (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    filename TEXT NOT NULL,
    size BIGINT,
    filepath TEXT NOT NULL,
    uploaded_by TEXT,
    created_at TEXT NOT NULL
);


-- ============================================================
-- 3. SEED INITIAL ENTERPRISE DEMO DATA
-- ============================================================

-- Seed Users (System controls)
INSERT INTO public.users (id, email, password_hash, full_name, role, created_at) VALUES
('admin-id-111', 'admin@assigniq.com', 'admin123', 'Sarah Connor (Admin)', 'admin', '2026-07-08T00:00:00Z'),
('pm-id-222', 'manager@assigniq.com', 'manager123', 'Marcus Aurelius (PM)', 'project_manager', '2026-07-08T00:00:00Z'),
('EMP001', 'aarav@assigniq.com', 'employee123', 'Aarav Sharma (AI Eng)', 'employee', '2026-07-08T00:00:00Z'),
('EMP002', 'riya@assigniq.com', 'employee123', 'Riya Patel (Data Sci)', 'employee', '2026-07-08T00:00:00Z'),
('EMP003', 'vikram@assigniq.com', 'employee123', 'Vikram Singh (Backend)', 'employee', '2026-07-08T00:00:00Z'),
('EMP004', 'sneha@assigniq.com', 'employee123', 'Sneha Reddy (Frontend)', 'employee', '2026-07-08T00:00:00Z'),
('EMP005', 'karthik@assigniq.com', 'employee123', 'Karthik Rao (DevOps)', 'employee', '2026-07-08T00:00:00Z'),
('EMP006', 'employee@assigniq.com', 'employee123', 'Meera Nair (Researcher)', 'employee', '2026-07-08T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Seed Tools (exactly from Table 1)
INSERT INTO public.tools (tool_id, tool_name, tool_type, purpose) VALUES
('T001', 'OpenAI API', 'LLM API', 'Natural language reasoning and generation'),
('T002', 'Pinecone', 'Vector Database', 'RAG and semantic search'),
('T003', 'PostgreSQL', 'Database', 'Structured relational data storage'),
('T004', 'Google Search API', 'Search Engine', 'External information retrieval'),
('T005', 'LangChain', 'AI Framework', 'Agent orchestration and tool integration')
ON CONFLICT (tool_id) DO NOTHING;

-- Seed Employees (exactly from Table 2)
INSERT INTO public.employees (employee_id, name, role, skills, experience, current_workload, photo, department, created_at) VALUES
('EMP001', 'Aarav Sharma', 'AI Engineer', 'Python;LLMs;PyTorch;LangChain;API Integration;Prompt Engineering', 4, 40, 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150', 'AI Engineering', '2026-07-08T00:00:00Z'),
('EMP002', 'Riya Patel', 'Data Scientist', 'Python;Data Analysis;Pandas;SQL;Tableau;Scikit-Learn', 3, 35, 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150', 'Data Science', '2026-07-08T00:00:00Z'),
('EMP003', 'Vikram Singh', 'Backend Developer', 'Node.js;API Integration;Express;MongoDB;PostgreSQL;Redis', 5, 50, 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150', 'Engineering', '2026-07-08T00:00:00Z'),
('EMP004', 'Sneha Reddy', 'Frontend Developer', 'React;UI/UX Design;Figma;TypeScript;HTML5;CSS3', 2, 30, 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', 'Engineering', '2026-07-08T00:00:00Z'),
('EMP005', 'Karthik Rao', 'DevOps Engineer', 'Docker;Kubernetes;AWS;Terraform;CI/CD;Linux', 4, 45, 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150', 'Infrastructure', '2026-07-08T00:00:00Z'),
('EMP006', 'Meera Nair', 'AI Researcher', 'LLMs;NLP;Python;PyTorch;Research Methods;Transformers', 6, 55, 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150', 'AI Research', '2026-07-08T00:00:00Z')
ON CONFLICT (employee_id) DO NOTHING;

-- Seed Project History (exactly from Table 3)
INSERT INTO public.project_history (history_id, project_id, project_name, team_size, tools_used, completion_days, success_score) VALUES
('H001', 'PRJ010', 'Fraud Detection', 4, 'Python;Scikit-Learn;PostgreSQL;Pinecone', 28, 0.92),
('H002', 'PRJ011', 'AI Resume Screener', 3, 'Python;NLP;OpenAI API;PostgreSQL', 22, 0.89),
('H003', 'PRJ012', 'Retail Recommendation', 5, 'TensorFlow;Flask;Pinecone;Google Search API', 35, 0.94)
ON CONFLICT (history_id) DO NOTHING;

-- Seed Projects (exactly from Table 4)
INSERT INTO public.projects (project_id, project_name, description, required_skills, deadline_days, priority, status, ai_plan, created_at) VALUES
('PRJ001', 'AI Sales Assistant', 'AI assistant to analyze sales conversations and suggest replies.', 'LLM;NLP;API Integration;Python', 30, 'High', 'active', '{"risks": [{"risk": "Integration delay", "mitigation": "Create dry run endpoints and verify early."}], "architecture": "LangChain agent orchestration with Pinecone search context.", "estimated_cost": "$60,000 USD", "project_overview": "AI assistant built to track, parse, and automate responses for corporate sales communication pipelines.", "timeline_summary": "Estimate: 30 days. Milestone 1 - Vector store setup (Day 8); Milestone 2 - RAG context binding (Day 18); Milestone 3 - Production deployment (Day 30).", "resource_allocation": "1 AI Engineer, 1 Frontend Developer", "team_composition": [{"role": "AI Engineer", "count": 1, "responsibility": "RAG indexing & NLP", "skills_required": ["Python", "LLMs"]}, {"role": "Frontend Developer", "count": 1, "responsibility": "UI Layout", "skills_required": ["React", "TypeScript"]}], "recommended_tech_stack": [{"purpose": "RAG indexing", "category": "Database", "technology": "Pinecone"}, {"purpose": "Generation API", "category": "LLM", "technology": "OpenAI API"}], "expected_completion_time": "30 Days"}', '2026-07-01T10:00:00Z'),
('PRJ002', 'Healthcare Predictive Model', 'Predict early onset of diseases using patient record datasets.', 'ML;Data Analysis;Python;SQL', 45, 'High', 'planning', NULL, '2026-07-05T12:00:00Z'),
('PRJ003', 'Customer Support Agent', 'AI chatbot to handle tier-1 support queries.', 'LLM;RAG;API Integration;Python', 25, 'Medium', 'planning', NULL, '2026-07-05T12:00:00Z'),
('PRJ004', 'Smart Investment Advisor', 'Automated portfolio advice based on market trends and risk profiles.', 'Python;ML;Data Analysis', 40, 'Medium', 'completed', NULL, '2026-05-10T09:00:00Z')
ON CONFLICT (project_id) DO NOTHING;

-- Seed Tasks (allocated sprints)
INSERT INTO public.tasks (id, project_id, task_name, description, assigned_to, priority, deadline, estimated_hours, status, comments, deliverable, created_at) VALUES
('task-1', 'PRJ001', 'Setup OpenAI API integration', 'Integrate OpenAI completion endpoint using LangChain framework.', 'EMP001', 'high', '2026-07-20', 30, 'In Progress', '[{"text": "Configured completion pipelines. Running validation tests.", "user_name": "Aarav Sharma", "created_at": "2026-07-07T14:30:00Z"}]', NULL, '2026-07-05T00:00:00Z'),
('task-2', 'PRJ001', 'Build RAG vector store setup', 'Index corporate training files into Pinecone database indexes.', 'EMP002', 'medium', '2026-08-05', 24, 'To Do', '[]', NULL, '2026-07-06T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
