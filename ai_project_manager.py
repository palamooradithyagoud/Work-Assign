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
                "content": "You are an elite AI Project Manager responsible for project planning, workforce optimization, tech stack selection, and execution strategy. You ALWAYS return valid JSON only."
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
    """Parse CSV text into a readable string."""
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

    Args:
        groq_key: Groq API key
        project_name: Name of the project
        csv_sources: List of dicts {'name': ..., 'content': ...} (can be empty)
        project_description: Optional free-text description of the project
        preferred_roles: Optional list of IT role strings
        team_size_hint: Optional hint like "5 people" or "small team"
        tech_preferences: Optional tech preferences like "React, Python"
        duration_hint: Optional hint like "3 months" or "90 days"
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
{files_content if files_content else "No CSV data provided — use project description and hints to generate all output."}
""" if files_content else """
==============================
NOTE: No CSV data provided
==============================
Generate all output based on the project name, description, and hints provided.
Use your knowledge of typical IT teams and industry standards to fill in all fields.
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

Analyze the project and generate a complete project plan including team composition,
tech stack, timeline, and risk analysis.

==============================
PROJECT
==============================
Project Name: {project_name}
{hints_section}

{csv_section}

==============================
YOUR TASK
==============================

Even if no CSV data is provided, use the project name, description, and hints
to intelligently generate ALL of the following. Apply your knowledge of
software engineering best practices and typical IT team structures.

Step 1 — Project Understanding
Identify the main objective, scope, and technical complexity.

Step 2 — Team Composition
- Determine EXACTLY how many people are needed for this project
- List each IT role needed with the COUNT of people required for that role
- Cover all relevant IT roles (Frontend, Backend, DevOps, QA, PM, UX, etc.)
- If preferred roles are specified, prioritize those

Step 3 — Employee Assignment (AUDITABLE DECISION MODE)
If employee CSV data is available, act as a strict Decision Engine.
- Ensure all assigned candidates have: name, skills, experience, workload (derive from CSV if possible).
- Feature Evaluation: Calculate `skill_match` (exact matches/mappings only), `workload_score` (100 - workload), `experience_weight` (min(exp*10, 100)).
- Score Computation: Calculate `confidence` = (skill_match * 0.5) + (workload_score * 0.2) + (experience_weight * 0.3).
- Constraint Enforcement: Reject candidates if skill_match < 60. Penalize workload > 85.
Rank candidates by confidence, select the highest, apply tie-breaking.
Provide explainable, auditable, and consistent outputs using the required JSON schema.
If no CSV data is provided, generate a hypothetical assignment following the same strict structured format.

Step 4 — Tech Stack Selection
Recommend a complete, modern tech stack for this project including:
- Frontend framework/libraries
- Backend framework/language
- Database(s)
- DevOps/Infrastructure tools
- Testing tools
- Any domain-specific tools

Step 5 — Execution Plan
Generate structured project phases:
Requirement Analysis → System Architecture → Development → Testing → Deployment
For each phase, list specific tasks.

Step 6 — Timeline Estimation
- Estimate TOTAL project duration in days AND weeks
- Factor in team size and complexity
- Provide phase-by-phase breakdown

Step 7 — Risk Detection
Identify risks: overloaded employees, missing skills, unrealistic deadlines, tool limitations.

==============================
OUTPUT FORMAT
==============================

Return ONLY valid JSON. No markdown, no explanation, just the JSON.

{{
  "project_overview": "2-3 sentence project summary",

  "required_skills": ["skill1", "skill2"],

  "recommended_roles": ["role1", "role2"],

  "team_composition": [
    {{
      "role": "Frontend Developer",
      "count": 2,
      "skills_required": ["React", "TypeScript"],
      "responsibility": "Build the user interface and client-side logic"
    }}
  ],

  "team_size": {{
    "total": 8,
    "breakdown": "2 Developers + 1 DevOps + 1 QA + 1 PM + ...",
    "rationale": "Based on project scope and 3-month deadline"
  }},

  "team_assignments": [
    {{
      "role": "Frontend Developer",
      "assigned_to": "Meera",
      "reason": {{
        "skill_match": "92%",
        "workload": "55%",
        "experience": "6 years"
      }},
      "confidence": "88%",
      "summary": "Selected due to highest skill alignment and balanced workload among all candidates",
      "alternative": {{
        "name": "Rahul",
        "reason_not_selected": "Lower confidence due to reduced skill match and higher workload"
      }},
      "decision_trace": [
        "Skill match calculated using exact and mapped skills",
        "Workload evaluated without modification",
        "Confidence computed using weighted scoring",
        "Ranked #1 among 5 candidates"
      ]
    }}
  ],

  "tech_stack": [
    {{
      "technology": "React",
      "category": "Frontend",
      "purpose": "User interface development",
      "version": "18.x"
    }}
  ],

  "estimated_duration": {{
    "total_days": 90,
    "total_weeks": 13,
    "per_phase": [
      {{"phase": "Requirement Analysis", "days": 7}},
      {{"phase": "System Architecture", "days": 10}},
      {{"phase": "Development", "days": 50}},
      {{"phase": "Testing", "days": 15}},
      {{"phase": "Deployment", "days": 8}}
    ],
    "summary": "Estimated 13 weeks for a team of 8 people"
  }},

  "recommended_tools": [
    {{"tool": "Jira", "reason": "Project tracking and sprint management"}}
  ],

  "execution_plan": [
    {{
      "phase": "Requirement Analysis",
      "estimated_days": 7,
      "tasks": ["Stakeholder interviews", "Define user stories"]
    }}
  ],

  "timeline_summary": "Total: 13 weeks (90 days) with a team of 8",

  "risk_analysis": [
    {{"risk": "Risk description", "mitigation": "Mitigation strategy"}}
  ]
}}
"""

    raw = ask_ai(prompt, groq_key)

    # Strip markdown code fences if present
    raw = raw.strip()
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

    return json.loads(raw)
