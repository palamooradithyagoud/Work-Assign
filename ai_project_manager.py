import os
import json
import io
import pandas as pd
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


def ask_ai(prompt: str, api_key: str) -> str:
    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an elite enterprise-grade AI Technical Project Manager. "
                    "You ALWAYS respond in valid JSON format only, matching the exact schema requested. "
                    "Do not return any markdown code fences (like ```json ... ```), explanations, or notes outside the JSON."
                )
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.2
    )
    return response.choices[0].message.content


def parse_csv_text(csv_text: str) -> str:
    try:
        df = pd.read_csv(io.StringIO(csv_text))
        df = df.head(50)
        return df.to_string(index=False)
    except Exception as e:
        return f"ERROR_PARSING_CSV: {str(e)}"


def run_analysis(groq_key: str, project_name: str, csv_sources: list,
                  project_description: str = "",
                  preferred_roles: list = None,
                  team_size_hint: str = "",
                  tech_preferences: str = "",
                  duration_hint: str = "") -> dict:
    """
    Run full AI project analysis.
    Returns exactly the 23-section project plan in JSON.
    """
    preferred_roles = preferred_roles or []

    # Build CSV content section
    files_content = ""
    if csv_sources:
        for src in csv_sources:
            parsed = parse_csv_text(src["content"])
            files_content += f"\n\nFILE: {src['name']}\n{parsed}"

    csv_section = f"""
==============================
ORGANIZATION DATASETS (CSV)
==============================
{files_content if files_content else "No CSV data provided."}
"""

    hints_section = ""
    if project_description:
        hints_section += f"\nProject Description:\n{project_description}\n"
    if team_size_hint:
        hints_section += f"\nTeam Size Hint: {team_size_hint}\n"
    if tech_preferences:
        hints_section += f"\nTechnology Preferences: {tech_preferences}\n"
    if duration_hint:
        hints_section += f"\nDuration Hint: {duration_hint}\n"
    if preferred_roles:
        hints_section += f"\nPreferred/Required IT Roles: {', '.join(preferred_roles)}\n"

    prompt = f"""
You are a highly experienced AI Technical Program Manager.

Analyze the project and generate a complete, comprehensive, and production-ready enterprise execution plan.

==============================
PROJECT DETAILS
==============================
Project Name: {project_name}
{hints_section}
{csv_section}

==============================
YOUR TASK
==============================
Intelligently generate a single valid JSON object containing exactly the following 23 sections. Ensure all fields are filled with professional, detailed enterprise content. Do not use placeholders.

JSON Schema Output Structure:
{{
  "project_summary": "A detailed 2-3 sentence project summary",
  "project_objectives": ["Objective 1", "Objective 2", "Objective 3"],
  "project_scope": ["In Scope item 1", "In Scope item 2", "Out of Scope item 3"],
  "functional_modules": [
    {{
      "module_name": "Authentication Module",
      "description": "Secure login, token verification, role permissions",
      "required_skills": "JWT;OAuth2;Node.js",
      "complexity": "Medium",
      "duration": "2 weeks"
    }},
    {{
      "module_name": "Billing Module",
      "description": "Payment gateways, ledger entries, invoice generation",
      "required_skills": "Stripe;REST API;PostgreSQL",
      "complexity": "High",
      "duration": "3 weeks"
    }},
    {{
      "module_name": "Reports Module",
      "description": "Analytics charts, CSV export, audit trail",
      "required_skills": "Chart.js;Python;Pandas",
      "complexity": "Low",
      "duration": "2 weeks"
    }}
  ],
  "non_functional_requirements": ["Requirement 1", "Requirement 2"],
  "recommended_technology_stack": {{
    "frontend_technologies": "e.g., React, TailwindCSS, TypeScript",
    "backend_technologies": "e.g., FastAPI, Node.js, Python",
    "database": "e.g., PostgreSQL, Redis",
    "cloud_services": "e.g., AWS (ECS, RDS, S3), Supabase",
    "devops_tools": "e.g., Docker, GitHub Actions, Vercel"
  }},
  "security_recommendations": ["Recommendation 1", "Recommendation 2"],
  "estimated_team_size": "e.g., 6 Members",
  "recommended_roles": ["e.g., Frontend Engineer", "e.g., Backend Developer"],
  "number_of_teams_required": 3,
  "employees_per_team": 2,
  "estimated_timeline": {{
    "total_duration": "90 Days",
    "project_phases": [
      {{"phase": "Requirements Analysis", "duration": "10 Days"}},
      {{"phase": "Architecture & Database design", "duration": "10 Days"}},
      {{"phase": "Core Module Implementation", "duration": "50 Days"}},
      {{"phase": "Testing & QA Cycle", "duration": "12 Days"}},
      {{"phase": "Deployment & Transition", "duration": "8 Days"}}
    ],
    "milestones": ["Milestone 1", "Milestone 2"],
    "dependencies": ["Dependency 1", "Dependency 2"],
    "sprint_planning": "e.g., Four 2-week sprints"
  }},
  "estimated_cost": "$85,000 USD",
  "potential_risks": ["Risk 1", "Risk 2"],
  "risk_mitigation_plan": ["Mitigation 1", "Mitigation 2"],
  "project_complexity": "High",
  "priority_matrix": "High impact, Medium urgency",
  "expected_deliverables": ["Deliverable 1", "Deliverable 2"],
  "success_metrics": ["Metric 1", "Metric 2"],
  "testing_strategy": "Manual QA + PyTest Integration Tests + Cypress E2E",
  "deployment_strategy": "Vercel Frontend + Dockerized Backend on AWS ECS",
  "maintenance_plan": "Quarterly package upgrades, monthly database vacuuming",
  "project_documentation_checklist": ["System Architecture PDF", "API Specification Docs", "User Guide"]
}}
"""

    if not groq_key:
        return get_fallback_mock(project_name, project_description)

    try:
        raw = ask_ai(prompt, groq_key)
        raw = raw.strip()
        # Clean markdown code fences if present
        if raw.startswith("```"):
            parts = raw.split("```")
            if len(parts) >= 3:
                raw = parts[1]
            elif len(parts) == 2:
                raw = parts[1]
            lines = raw.splitlines()
            if lines and lines[0].strip().lower() in ("json", ""):
                raw = "\n".join(line for i, line in enumerate(lines) if i > 0)
            raw = raw.strip()
        
        parsed = json.loads(raw)
        # Ensure all keys exist
        required_keys = [
            "project_summary", "project_objectives", "project_scope", "functional_modules",
            "non_functional_requirements", "recommended_technology_stack", "security_recommendations",
            "estimated_team_size", "recommended_roles", "number_of_teams_required", "employees_per_team",
            "estimated_timeline", "estimated_cost", "potential_risks", "risk_mitigation_plan",
            "project_complexity", "priority_matrix", "expected_deliverables", "success_metrics",
            "testing_strategy", "deployment_strategy", "maintenance_plan", "project_documentation_checklist"
        ]
        for key in required_keys:
            if key not in parsed:
                parsed[key] = get_fallback_mock(project_name, project_description).get(key, "")
        return parsed
    except Exception as e:
        print(f"[AssignIQ AI Manager] API Error: {e}, falling back to mock")
        return get_fallback_mock(project_name, project_description)


def get_fallback_mock(project_name: str, desc: str) -> dict:
    """Intelligent fallback covering all 23 sections in exact requested structure."""
    return {
        "project_summary": (
            f"A high-impact modernization project for {project_name} designed to build, "
            f"optimize, and deploy highly resilient software services. Objectives center on "
            f"increasing application throughput and standardizing functional API services."
        ),
        "project_objectives": [
            "Standardize API response times below 200ms",
            "Establish role-based access control with secure JWT flow",
            "Enable cross-department automated work assignment updates"
        ],
        "project_scope": [
            "Authentication, database migration, and module breakdown (In-Scope)",
            "Automated notification triggers via Email and In-App alerts (In-Scope)",
            "Legacy hardware server upgrades (Out-of-Scope)"
        ],
        "functional_modules": [
            {
                "module_name": "Authentication Module",
                "description": "User login, session management, secure access control",
                "required_skills": "JWT;FastAPI;OAuth2",
                "complexity": "Medium",
                "duration": "2 weeks"
            },
            {
                "module_name": "Billing Module",
                "description": "Transaction processing, invoicing, subscription billing",
                "required_skills": "Stripe;PostgreSQL;REST API",
                "complexity": "High",
                "duration": "3 weeks"
            },
            {
                "module_name": "Reports Module",
                "description": "Real-time analytics dashboard, data filters, export options",
                "required_skills": "React;Chart.js;Pandas",
                "complexity": "Medium",
                "duration": "2 weeks"
            }
        ],
        "non_functional_requirements": [
            "Maintain 99.9% application uptime on cloud platforms",
            "Optimized for mobile-responsive screens and desktop layouts",
            "End-to-end encryption for transactional endpoints"
        ],
        "recommended_technology_stack": {
            "frontend_technologies": "React 18, HTML5, Vanilla CSS / TailwindCSS",
            "backend_technologies": "Python FastAPI, Gunicorn, REST API",
            "database": "Supabase PostgreSQL Connection Pooler",
            "cloud_services": "AWS ECS Container Host, Vercel Edge Networks",
            "devops_tools": "Docker, GitHub CI/CD Actions, Pipenv Environment"
        },
        "security_recommendations": [
            "Implement HTTPS-only headers and secure cookie flags",
            "Sanitize all SQL inputs through Connection Pool parameterized arguments",
            "Apply JWT token timeouts of 30 minutes with secure rotation"
        ],
        "estimated_team_size": "5 Members",
        "recommended_roles": [
            "Project Manager",
            "Frontend Developer",
            "Backend Engineer",
            "QA Tester"
        ],
        "number_of_teams_required": 3,
        "employees_per_team": 2,
        "estimated_timeline": {
            "total_duration": "60 Days",
            "project_phases": [
                {"phase": "Requirements & Alignment", "duration": "8 Days"},
                {"phase": "API & DB Setup", "duration": "10 Days"},
                {"phase": "Development Cycle", "duration": "30 Days"},
                {"phase": "Verification & Bug Fixes", "duration": "12 Days"}
            ],
            "milestones": [
                "Milestone A: Auth Module Ready (Day 15)",
                "Milestone B: Billing Module Core Completed (Day 40)",
                "Milestone C: Final QA Signed-off (Day 55)"
            ],
            "dependencies": [
                "Auth module must be verified before starting billing transactional ledger entries",
                "PostgreSQL schema setup completed before running ORM bindings"
            ],
            "sprint_planning": "Three 2-week active sprints (Sprint 1: Auth & Base, Sprint 2: Billing & Sync, Sprint 3: Reports & UI)"
        },
        "estimated_cost": "$65,000 USD",
        "potential_risks": [
            "API endpoint request throttling due to high query volume",
            "Availability bottlenecks for specialists"
        ],
        "risk_mitigation_plan": [
            "Configure Redis cache layers for highly fetched routes",
            "Cross-train team leads to maintain backup expertise"
        ],
        "project_complexity": "Medium",
        "priority_matrix": "High impact, Medium urgency (Launch phase planning)",
        "expected_deliverables": [
            "Source Code Repository with documentation",
            "Supabase database migration SQL files",
            "Fully deployed active staging link"
        ],
        "success_metrics": [
            "Zero open critical bugs at release candidate step",
            "Employee review score of 90%+ on interface usability"
        ],
        "testing_strategy": "Unit coverage target > 85%, Automated staging regression checks",
        "deployment_strategy": "Continuous Deployment trigger upon merging to origin main via GitHub actions",
        "maintenance_plan": "Monthly security patch review and weekly connection count log analysis",
        "project_documentation_checklist": [
            "Architecture design documentation",
            "Employee setup guides",
            "User workflow manuals"
        ]
    }
