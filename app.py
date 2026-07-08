import os
import json
import uuid
import datetime
import random
from flask import Flask, request, jsonify, send_from_directory, session
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
import db
from ai_project_manager import run_analysis

load_dotenv()

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-key-assigniq-2026")

if os.environ.get('VERCEL'):
    UPLOAD_FOLDER = os.path.join('/tmp', 'uploads')
else:
    UPLOAD_FOLDER = os.path.join(app.root_path, 'static', 'uploads')

try:
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
except Exception as e:
    print(f"[WARNING] Could not create upload directory: {e}")

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Startup seed trigger
db.seed_database()

# ──────────────────────────────────────────────
# Serve Pages
# ──────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory("templates", "index.html")

@app.route("/login")
def login_page():
    return send_from_directory("templates", "login.html")

@app.route("/signup")
def signup_page():
    return send_from_directory("templates", "signup.html")

# ──────────────────────────────────────────────
# AUTHENTICATION API
# ──────────────────────────────────────────────
@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    body = request.get_json(force=True)
    email = body.get("email", "").strip().lower()
    password = body.get("password", "").strip()
    
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
        
    users = db.get_all("users")
    user = None
    for u in users:
        if u["email"].lower() == email and u["password_hash"] == password:
            user = u
            break
            
    if not user:
        return jsonify({"error": "Invalid email or password"}), 401
        
    session["user_id"] = user["id"]
    session["email"] = user["email"]
    session["role"] = user["role"]
    session["full_name"] = user["full_name"]
    
    db.log_action("USER_LOGIN", f"User {email} logged in successfully.", email)
    return jsonify({
        "id": user["id"],
        "email": user["email"],
        "role": user["role"],
        "full_name": user["full_name"]
    })

@app.route("/api/auth/signup", methods=["POST"])
def auth_signup():
    body = request.get_json(force=True)
    email = body.get("email", "").strip().lower()
    password = body.get("password", "").strip()
    full_name = body.get("full_name", "").strip()
    role = body.get("role", "employee").strip()
    
    if not email or not password or not full_name:
        return jsonify({"error": "All fields are required"}), 400
        
    users = db.get_all("users")
    for u in users:
        if u["email"].lower() == email:
            return jsonify({"error": "Email already registered"}), 400
            
    # Generate employee id
    emp_id = f"EMP{random.randint(100, 999)}"
    new_user = {
        "id": emp_id,
        "email": email,
        "password_hash": password,
        "full_name": full_name,
        "role": role,
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    db.insert("users", new_user)
    
    # Check if employee profile needs to be created
    if role == "employee":
        employees = db.get_all("employees")
        emp_exists = any(e["email"].lower() == email for e in employees)
        if not emp_exists:
            db.insert("employees", {
                "employee_id": emp_id,
                "name": full_name,
                "email": email,
                "photo": "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
                "department": "Engineering",
                "skills": "Python;HTML5;CSS3",
                "experience": 1,
                "current_workload": 0
            })
            
    db.log_action("USER_SIGNUP", f"User {email} signed up with role {role}.", email)
    return jsonify({"success": True})

@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    email = session.get("email", "unknown")
    session.clear()
    db.log_action("USER_LOGOUT", f"User {email} logged out.", email)
    return jsonify({"success": True})

@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify({
        "id": session["user_id"],
        "email": session["email"],
        "role": session["role"],
        "full_name": session["full_name"]
    })

# ──────────────────────────────────────────────
# ADMIN USERS MANAGEMENT
# ──────────────────────────────────────────────
@app.route("/api/admin/users", methods=["GET", "POST"])
def admin_users():
    if session.get("role") != "admin":
        return jsonify({"error": "Forbidden"}), 403
        
    if request.method == "GET":
        return jsonify(db.get_all("users"))
        
    # POST - Create User
    body = request.get_json(force=True)
    email = body.get("email", "").strip().lower()
    password = body.get("password", "").strip()
    full_name = body.get("full_name", "").strip()
    role = body.get("role", "employee").strip()
    
    if not email or not password or not full_name:
        return jsonify({"error": "All fields are required"}), 400
        
    users = db.get_all("users")
    if any(u["email"].lower() == email for u in users):
        return jsonify({"error": "Email already exists"}), 400
        
    emp_id = f"EMP{random.randint(100, 999)}"
    new_user = {
        "id": emp_id,
        "email": email,
        "password_hash": password,
        "full_name": full_name,
        "role": role,
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    db.insert("users", new_user)
    
    # Create employee record if applicable
    if role == "employee":
        db.insert("employees", {
            "employee_id": emp_id,
            "name": full_name,
            "email": email,
            "photo": "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
            "department": "Engineering",
            "skills": "",
            "experience": 1,
            "current_workload": 0
        })
        
    db.log_action("ADMIN_USER_CREATED", f"Admin created user {email} with role {role}.", session.get("email"))
    return jsonify(new_user)

@app.route("/api/admin/users/<id>", methods=["PUT", "DELETE"])
def admin_user_detail(id):
    if session.get("role") != "admin":
        return jsonify({"error": "Forbidden"}), 403
        
    if request.method == "DELETE":
        user = db.get_by_id("users", id)
        if user:
            db.delete("users", id)
            db.delete("employees", id) # clean up
            db.log_action("ADMIN_USER_DELETED", f"Admin revoked access for user {user['email']}.", session.get("email"))
            return jsonify({"success": True})
        return jsonify({"error": "User not found"}), 404
        
    # PUT
    body = request.get_json(force=True)
    updates = {}
    if "full_name" in body:
        updates["full_name"] = body["full_name"].strip()
    if "role" in body:
        updates["role"] = body["role"].strip()
    if "password" in body and body["password"].strip():
        updates["password_hash"] = body["password"].strip()
        
    updated = db.update("users", id, updates)
    if updated:
        db.log_action("ADMIN_USER_UPDATED", f"Admin updated user controls for {updated['email']}.", session.get("email"))
        return jsonify(updated)
    return jsonify({"error": "User not found"}), 404

# ──────────────────────────────────────────────
# PROJECTS MANAGEMENT API
# ──────────────────────────────────────────────
@app.route("/api/projects", methods=["GET", "POST"])
def api_projects():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    if request.method == "GET":
        projects = db.get_all("projects")
        if session.get("role") == "employee":
            tasks = db.get_all("tasks")
            assigned_project_ids = {t["project_id"] for t in tasks if t.get("assigned_to") == session["user_id"]}
            return jsonify([p for p in projects if p["project_id"] in assigned_project_ids])
        return jsonify(projects)
        
    # POST - Create project
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
        
    body = request.get_json(force=True)
    project_name = body.get("project_name", "").strip()
    if not project_name:
        return jsonify({"error": "Project name is required"}), 400
        
    new_proj = {
        "project_id": f"PRJ{random.randint(100, 999)}",
        "project_name": project_name,
        "description": body.get("description", "").strip(),
        "deadline_days": int(body.get("deadline_days", 30)),
        "priority": body.get("priority", "Medium"),
        "estimated_duration": body.get("estimated_duration", ""),
        "budget": body.get("budget", ""),
        "required_skills": body.get("required_skills", ""),
        "preferred_tech": body.get("preferred_tech", ""),
        "preferred_roles": body.get("preferred_roles", []),
        "team_size": int(body.get("team_size", 2)),
        "status": "planning"
    }
    db.insert("projects", new_proj)
    db.log_action("PROJECT_CREATED", f"Project '{project_name}' was created.", session.get("email"))
    return jsonify(new_proj)

@app.route("/api/projects/<id>", methods=["PUT", "DELETE"])
def api_project_detail(id):
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
        
    if request.method == "DELETE":
        proj = db.get_by_id("projects", id)
        if proj:
            db.delete("projects", id)
            db.log_action("PROJECT_DELETED", f"Project '{proj['project_name']}' deleted.", session.get("email"))
            return jsonify({"success": True})
        return jsonify({"error": "Project not found"}), 404
        
    # PUT
    body = request.get_json(force=True)
    updates = {}
    for field in ["project_name", "description", "deadline_days", "priority", "estimated_duration", "budget", "required_skills", "preferred_tech", "preferred_roles", "team_size", "status"]:
        if field in body:
            updates[field] = body[field]
            
    updated = db.update("projects", id, updates)
    if updated:
        db.log_action("PROJECT_UPDATED", f"Project '{updated['project_name']}' updated.", session.get("email"))
        return jsonify(updated)
    return jsonify({"error": "Project not found"}), 404

@app.route("/api/projects/<id>/archive", methods=["POST"])
def api_archive_project(id):
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
        
    proj = db.get_by_id("projects", id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404
        
    updated = db.update("projects", id, {"status": "archived"})
    db.log_action("PROJECT_ARCHIVED", f"Project '{proj['project_name']}' archived.", session.get("email"))
    return jsonify(updated)

# ──────────────────────────────────────────────
# AI PLANNING ENGINE
# ──────────────────────────────────────────────
@app.route("/api/projects/<id>/ai-plan", methods=["POST"])
def api_ai_plan(id):
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
        
    proj = db.get_by_id("projects", id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404
        
    employees = db.get_all("employees")
    csv_data = [
        {
            "name": "employees.csv",
            "content": "employee_id,name,role,skills,experience,current_workload\n" + \
                       "\n".join([f"{e['employee_id']},{e['name']},{e['role']},\"{e['skills']}\",{e['experience']},{e['current_workload']}" for e in employees])
        }
    ]
    
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    if not GROQ_API_KEY:
        mock_plan = {
            "project_overview": f"A targeted AI application optimization cycle for {proj['project_name']}. Deploys serverless infrastructure with responsive React features.",
            "architecture": "Structured RAG pipeline connecting frontend client elements to a secure LLM execution framework.",
            "team_composition": [
                {"role": "AI Engineer", "count": 1, "skills_required": ["Python", "LLMs"], "responsibility": "Model fine-tuning and index generation"},
                {"role": "Frontend Developer", "count": 1, "skills_required": ["React", "TypeScript"], "responsibility": "Interactive workspace screens design"}
            ],
            "timeline_summary": f"Estimate: {proj.get('deadline_days', 30)} days. Milestones: Setup (Day 5), Core refactoring (Day 15), Delivery (Day 30).",
            "risks": [
                {"risk": "High context window costs", "mitigation": "Optimize search embeddings with custom threshold RAG filters."}
            ],
            "recommended_tech_stack": [
                {"technology": "OpenAI API", "category": "LLM", "purpose": "Natural language generation"},
                {"technology": "Pinecone", "category": "Database", "purpose": "Semantic RAG database storage"}
            ],
            "resource_allocation": "1 AI Engineer, 1 Frontend Developer",
            "estimated_cost": "$25,000.00 USD",
            "expected_completion_time": f"{proj.get('deadline_days', 30)} Days"
        }
        db.update("projects", id, {"ai_plan": mock_plan})
        db.log_action("AI_PLAN_GENERATED", f"AI generated project plan for '{proj['project_name']}' (MOCK).", session.get("email"))
        return jsonify(mock_plan)
        
    try:
        # Request Llama plan
        result = run_analysis(
            groq_key=GROQ_API_KEY,
            project_name=proj["project_name"],
            csv_sources=csv_data,
            project_description=proj.get("description", ""),
            preferred_roles=proj.get("preferred_roles", []),
            team_size_hint=str(proj.get("team_size", 2)),
            tech_preferences=proj.get("preferred_tech", ""),
            duration_hint=f"{proj.get('deadline_days')} days"
        )
        db.update("projects", id, {"ai_plan": result})
        db.log_action("AI_PLAN_GENERATED", f"AI generated project plan for '{proj['project_name']}' (Llama-3.3).", session.get("email"))
        
        # Populate project tasks if none exist
        proj_tasks = [t for t in db.get_all("tasks") if t["project_id"] == id]
        if not proj_tasks and "execution_plan" in result:
            for phase_idx, phase in enumerate(result["execution_plan"]):
                for task_idx, tname in enumerate(phase.get("tasks", [])):
                    db.insert("tasks", {
                        "id": f"task-ai-{id}-{phase_idx}-{task_idx}",
                        "project_id": id,
                        "task_name": tname,
                        "description": f"Generated task for phase {phase['phase']}.",
                        "assigned_to": None,
                        "priority": "medium",
                        "deadline": (datetime.date.today() + datetime.timedelta(days=15)).isoformat(),
                        "estimated_hours": 8,
                        "status": "To Do",
                        "comments": []
                    })
        return jsonify(result)
    except Exception as e:
        print(f"[AssignIQ] AI Plan failed: {e}")
        return jsonify({"error": f"AI Plan failed: {str(e)}"}), 500

# ──────────────────────────────────────────────
# EMPLOYEES DIRECTORY API
# ──────────────────────────────────────────────
@app.route("/api/employees", methods=["GET", "POST"])
def api_employees():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    if request.method == "GET":
        if session.get("role") == "employee":
            emp = db.get_by_id("employees", session["user_id"])
            return jsonify([emp] if emp else [])
        return jsonify(db.get_all("employees"))
        
    # POST - Add Employee
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
        
    body = request.get_json(force=True)
    name = body.get("name", "").strip()
    email = body.get("email", "").strip().lower()
    
    if not name or not email:
        return jsonify({"error": "Name and email are required"}), 400
        
    employees = db.get_all("employees")
    if any(e["email"].lower() == email for e in employees):
        return jsonify({"error": "Employee email already registered."}), 400
        
    emp_id = f"EMP{random.randint(100, 999)}"
    new_emp = {
        "employee_id": emp_id,
        "name": name,
        "email": email,
        "photo": body.get("photo") or "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
        "department": body.get("department", "Engineering").strip(),
        "skills": body.get("skills", ""),
        "experience": int(body.get("experience", 1)),
        "current_workload": int(body.get("current_workload", 0))
    }
    
    # User Profile login mapping
    db.insert("users", {
        "id": emp_id,
        "email": email,
        "password_hash": "employee123",
        "full_name": name,
        "role": "employee",
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    })
    
    db.insert("employees", new_emp)
    db.log_action("EMPLOYEE_ADDED", f"Added employee '{name}' to team roster.", session.get("email"))
    return jsonify(new_emp)


@app.route("/api/employees/<id>", methods=["GET", "PUT", "DELETE"])
def api_employee_detail(id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    is_self = session["user_id"] == id
    is_pm_admin = session.get("role") in ("admin", "project_manager")
    
    if not is_self and not is_pm_admin:
        return jsonify({"error": "Forbidden"}), 403
        
    if request.method == "GET":
        emp = db.get_by_id("employees", id)
        if emp:
            return jsonify(emp)
        return jsonify({"error": "Employee not found"}), 404
        
    if request.method == "DELETE":
        if not is_pm_admin:
            return jsonify({"error": "Forbidden"}), 403
        emp = db.get_by_id("employees", id)
        if emp:
            db.delete("employees", id)
            db.delete("users", id) # clean login
            db.log_action("EMPLOYEE_REMOVED", f"Removed employee profile '{emp['name']}'.", session.get("email"))
            return jsonify({"success": True})
        return jsonify({"error": "Employee not found"}), 404
        
    # PUT
    body = request.get_json(force=True)
    updates = {}
    
    allowed_fields = ["skills", "experience"] if is_self and not is_pm_admin else \
                     ["name", "photo", "department", "skills", "experience", "current_workload"]
                     
    for field in allowed_fields:
        if field in body:
            updates[field] = body[field]
            
    updated = db.update("employees", id, updates)
    if updated:
        if "name" in updates:
            db.update("users", id, {"full_name": updates["name"]})
        db.log_action("EMPLOYEE_UPDATED", f"Updated employee profile '{updated['name']}'.", session.get("email"))
        return jsonify(updated)
    return jsonify({"error": "Employee not found"}), 404

@app.route("/api/employees/import-csv", methods=["POST"])
def api_import_employees_csv():
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
        
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    try:
        import io
        import csv
        stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
        csv_input = csv.DictReader(stream)
        
        imported_count = 0
        for row in csv_input:
            email = row.get("email", "").strip().lower()
            name = row.get("name", row.get("full_name", "")).strip()
            
            if not email or not name:
                continue
                
            if any(e["email"].lower() == email for e in db.get_all("employees")):
                continue
                
            emp_id = f"EMP{random.randint(100, 999)}"
            new_emp = {
                "employee_id": emp_id,
                "name": name,
                "email": email,
                "photo": row.get("photo") or "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
                "department": row.get("department", "Engineering"),
                "skills": row.get("skills", ""),
                "experience": int(row.get("experience", 2)),
                "current_workload": int(row.get("current_workload", 0))
            }
            db.insert("employees", new_emp)
            db.insert("users", {
                "id": emp_id,
                "email": email,
                "password_hash": "employee123",
                "full_name": name,
                "role": "employee",
                "created_at": datetime.datetime.utcnow().isoformat() + "Z"
            })
            imported_count += 1
            
        db.log_action("EMPLOYEES_IMPORTED", f"Imported {imported_count} employee profiles from CSV.", session.get("email"))
        return jsonify({"success": True, "count": imported_count})
    except Exception as e:
        return jsonify({"error": f"Failed to parse CSV: {str(e)}"}), 400

# ──────────────────────────────────────────────
# AI ASSIGNMENT ENGINE API
# ──────────────────────────────────────────────
@app.route("/api/assignments/assign", methods=["POST"])
def api_run_assignments():
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
        
    body = request.get_json(force=True)
    project_id = body.get("project_id")
    
    proj = db.get_by_id("projects", project_id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404
        
    required_roles = proj.get("preferred_roles", [])
    if not required_roles:
        required_roles = ["AI Engineer", "Backend Developer", "Frontend Developer", "DevOps Engineer"]
        
    employees = db.get_all("employees")
    
    # Parse required skills
    proj_skills = [s.strip().lower() for s in proj.get("required_skills", "").split(";") if s.strip()]
    
    assignments = []
    for role in required_roles:
        scored_candidates = []
        for emp in employees:
            # Semicolon skills match
            emp_skills = [s.strip().lower() for s in emp.get("skills", "").split(";") if s.strip()]
            
            matching_skills = []
            if proj_skills:
                matching_skills = [s for s in emp_skills if any(req in s or s in req for req in proj_skills)]
                skill_match_pct = len(matching_skills) / len(proj_skills) * 100
            else:
                skill_match_pct = 70.0
                
            workload_score = 100 - emp.get("current_workload", 0)
            exp_score = min(emp.get("experience", 1) * 10, 100)
            
            confidence = (skill_match_pct * 0.5) + (exp_score * 0.3) + (workload_score * 0.2)
            
            scored_candidates.append({
                "employee": emp,
                "confidence": round(confidence, 1),
                "skill_match": round(skill_match_pct, 1),
                "experience": f"{emp['experience']} yrs",
                "workload": f"{emp['current_workload']}%"
            })
            
        scored_candidates.sort(key=lambda x: x["confidence"], reverse=True)
        
        if scored_candidates:
            assigned = scored_candidates[0]
            alt = scored_candidates[1] if len(scored_candidates) > 1 else None
            
            assignments.append({
                "role": role,
                "employee_id": assigned["employee"]["employee_id"],
                "employee_name": assigned["employee"]["name"],
                "confidence": f"{assigned['confidence']}%",
                "reason": f"Optimal skill matches ({assigned['skill_match']}% matching skills), balanced availability (current load {assigned['workload']}), and {assigned['experience']} of experience.",
                "alternative": {
                    "employee_id": alt["employee"]["employee_id"] if alt else None,
                    "employee_name": alt["employee"]["name"] if alt else "N/A",
                    "reason_not_selected": f"Reduced skills alignment / experience levels ({alt['confidence']}% overall match score)." if alt else ""
                },
                "decision_trace": [
                    f"Parsed project required skills: {'; '.join(proj_skills)}.",
                    f"Scored {len(employees)} active enterprise profiles against constraints.",
                    f"Selected {assigned['employee']['name']} as the optimal team member for the {role} role."
                ]
            })
            
    return jsonify(assignments)

# ──────────────────────────────────────────────
# AI SUCCESS PREDICTOR API
# ──────────────────────────────────────────────
@app.route("/api/projects/<id>/predict", methods=["GET"])
def api_predict_project(id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    proj = db.get_by_id("projects", id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404
        
    history = db.get_all("project_history")
    tools = db.get_all("tools")
    
    proj_skills = [s.strip().lower() for s in proj.get("required_skills", "").split(";") if s.strip()]
    
    predictions = []
    recommended_tools = []
    
    # Calculate similarity with historical project data
    for h in history:
        h_skills = [s.strip().lower() for s in h.get("tools_used", "").split(";") if s.strip()]
        matches = [s for s in proj_skills if any(req in s or s in req for req in h_skills)]
        
        sim = len(matches) / len(proj_skills) if proj_skills else 0.5
        predictions.append({
            "history_id": h["history_id"],
            "project_name": h["project_name"],
            "success_score": h["success_score"],
            "similarity": sim
        })
        
    # Sort history matches by similarity descending
    predictions.sort(key=lambda x: x["similarity"], reverse=True)
    
    # Predict Success Score
    if predictions and predictions[0]["similarity"] > 0:
        best_match = predictions[0]
        # weighted score
        predicted_success = best_match["success_score"] * 100
        trace = f"{int(best_match['similarity'] * 100)}% skill similarity matched with historical project H00{best_match['history_id'][-1] if '-' not in best_match['history_id'] else '1'} ({best_match['project_name']}), which achieved a success score of {int(best_match['success_score']*100)}%."
    else:
        predicted_success = 85.0
        trace = "No direct historical match found. Derived generic success estimate based on default agile sprint parameters."
        
    # Tool Recommendations from public.tools based on project required skills
    for t in tools:
        # Check if tool purpose or name overlaps project required skills
        matches_tool = False
        for skill in proj_skills:
            if skill in t["tool_name"].lower() or skill in t["purpose"].lower() or skill in t["tool_type"].lower():
                matches_tool = True
                break
                
        # Also map popular defaults (e.g. OpenAI API for LLM, Pinecone for RAG/vector, etc.)
        if "llm" in proj_skills and t["tool_id"] in ("T001", "T005"): # OpenAI, LangChain
            matches_tool = True
        if "rag" in proj_skills and t["tool_id"] in ("T002", "T005"): # Pinecone, LangChain
            matches_tool = True
        if "sql" in proj_skills and t["tool_id"] == "T003": # PostgreSQL
            matches_tool = True
            
        if matches_tool:
            recommended_tools.append({
                "tool_id": t["tool_id"],
                "tool_name": t["tool_name"],
                "tool_type": t["tool_type"],
                "reason": f"Directly handles requested feature stack: {t['purpose']}."
            })
            
    # Ensure at least 1 tool is recommended
    if not recommended_tools and tools:
        recommended_tools.append({
            "tool_id": tools[0]["tool_id"],
            "tool_name": tools[0]["tool_name"],
            "tool_type": tools[0]["tool_type"],
            "reason": "General integration support tool."
        })
        
    return jsonify({
        "success_score": f"{round(predicted_success, 1)}%",
        "similarity_trace": trace,
        "recommended_tools": recommended_tools
    })

# ──────────────────────────────────────────────
# TASK MANAGEMENT API
# ──────────────────────────────────────────────
@app.route("/api/tasks", methods=["GET", "POST"])
def api_tasks():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    project_id = request.args.get("project_id")
    tasks = db.get_all("tasks")
    
    if project_id:
        tasks = [t for t in tasks if t["project_id"] == project_id]
        
    if session.get("role") == "employee":
        tasks = [t for t in tasks if t.get("assigned_to") == session["user_id"]]
        
    return jsonify(tasks)

@app.route("/api/tasks", methods=["POST"])
def api_create_task():
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
        
    body = request.get_json(force=True)
    project_id = body.get("project_id")
    task_name = body.get("task_name", "").strip()
    
    if not project_id or not task_name:
        return jsonify({"error": "Project ID and Task Name are required"}), 400
        
    new_task = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "task_name": task_name,
        "description": body.get("description", "").strip(),
        "assigned_to": body.get("assigned_to"),
        "priority": body.get("priority", "medium").lower(),
        "deadline": body.get("deadline", ""),
        "estimated_hours": int(body.get("estimated_hours", 4)),
        "status": "To Do",
        "comments": [],
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    db.insert("tasks", new_task)
    
    if new_task["assigned_to"]:
        db.add_notification(
            user_id=new_task["assigned_to"],
            title="Sprint Assignment Dispatch",
            message=f"You have been assigned task '{task_name}'.",
            notif_type="info"
        )
    db.log_action("TASK_ASSIGNED", f"Assigned task '{task_name}' to {new_task['assigned_to'] or 'Unassigned'}.", session.get("email"))
    return jsonify(new_task)

@app.route("/api/tasks/<id>", methods=["PUT", "DELETE"])
def api_task_detail(id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    task = db.get_by_id("tasks", id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
        
    is_pm_admin = session.get("role") in ("admin", "project_manager")
    is_assigned = task.get("assigned_to") == session["user_id"]
    
    if not is_pm_admin and not is_assigned:
        return jsonify({"error": "Forbidden"}), 403
        
    if request.method == "DELETE":
        if not is_pm_admin:
            return jsonify({"error": "Forbidden"}), 403
        db.delete("tasks", id)
        db.log_action("TASK_DELETED", f"Deleted task '{task['task_name']}'.", session.get("email"))
        return jsonify({"success": True})
        
    # PUT
    body = request.get_json(force=True)
    updates = {}
    
    allowed_fields = ["status", "comments", "deliverable", "progress_percent", "hours_worked"] if not is_pm_admin else \
                     ["task_name", "description", "assigned_to", "priority", "deadline", "estimated_hours", "status", "comments", "deliverable", "progress_percent", "hours_worked"]
                     
    for field in allowed_fields:
        if field in body:
            updates[field] = body[field]
            
    updated = db.update("tasks", id, updates)
    if updated:
        if "status" in body:
            db.log_action("TASK_UPDATED", f"Task '{task['task_name']}' status updated to '{body['status']}'.", session.get("email"))
            if body["status"] == "Completed":
                for u in db.get_all("users"):
                    if u["role"] in ("admin", "project_manager"):
                        db.add_notification(u["id"], "Task Completed", f"{session['full_name']} marked '{task['task_name']}' as Completed.", "success")
        return jsonify(updated)
    return jsonify({"error": "Task update failed"}), 400

@app.route("/api/tasks/<id>/status", methods=["PUT"])
def api_update_task_status(id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    task = db.get_by_id("tasks", id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
        
    body = request.get_json(force=True)
    status = body.get("status")
    
    if status not in ("To Do", "In Progress", "Review", "Testing", "Completed"):
        return jsonify({"error": "Invalid status value"}), 400
        
    updated = db.update("tasks", id, {"status": status})
    db.log_action("TASK_UPDATED", f"Task '{task['task_name']}' status changed to '{status}'.", session.get("email"))
    
    if status == "Completed":
        for u in db.get_all("users"):
            if u["role"] in ("admin", "project_manager"):
                db.add_notification(u["id"], "Task Completed", f"Task '{task['task_name']}' marked complete by {session['full_name']}.", "success")
                
    return jsonify(updated)

# ──────────────────────────────────────────────
# CHAT API
# ──────────────────────────────────────────────
@app.route("/api/projects/<project_id>/chat", methods=["GET", "POST"])
def api_project_chat(project_id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    if request.method == "GET":
        chats = db.get_all("chats")
        proj_chats = [c for c in chats if c["project_id"] == project_id]
        proj_chats.sort(key=lambda x: x["created_at"])
        return jsonify(proj_chats)
        
    # POST
    body = request.get_json(force=True)
    msg = body.get("message", "").strip()
    if not msg:
        return jsonify({"error": "Empty message"}), 400
        
    new_chat = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "user_id": session["user_id"],
        "user_name": session["full_name"],
        "user_role": session["role"],
        "message": msg,
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    db.insert("chats", new_chat)
    return jsonify(new_chat)

# ──────────────────────────────────────────────
# NOTIFICATIONS API
# ──────────────────────────────────────────────
@app.route("/api/notifications", methods=["GET"])
def api_notifications():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    notifs = db.get_all("notifications")
    user_notifs = [n for n in notifs if n["user_id"] == session["user_id"]]
    return jsonify(user_notifs)

@app.route("/api/notifications/<id>/read", methods=["POST"])
def api_read_notification(id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    db.update("notifications", id, {"is_read": True})
    return jsonify({"success": True})

# ──────────────────────────────────────────────
# AUDIT LOGS API
# ──────────────────────────────────────────────
@app.route("/api/audit-logs", methods=["GET"])
def api_audit_logs():
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    logs = db.get_all("audit_logs")
    logs.sort(key=lambda x: x["created_at"], reverse=True)
    return jsonify(logs[:50])

# ──────────────────────────────────────────────
# FILE UPLOAD API
# ──────────────────────────────────────────────
@app.route("/api/files/upload", methods=["POST"])
def api_upload_file():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
        
    file = request.files['file']
    project_id = request.form.get("project_id")
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if file:
        filename = secure_filename(file.filename)
        file_id = str(uuid.uuid4())
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], f"{file_id}_{filename}")
        file.save(filepath)
        
        file_record = {
            "id": file_id,
            "project_id": project_id,
            "filename": filename,
            "size": os.path.getsize(filepath),
            "filepath": f"/static/uploads/{file_id}_{filename}",
            "uploaded_by": session["full_name"]
        }
        db.insert("files", file_record)
        return jsonify(file_record)

@app.route("/api/files", methods=["GET"])
def api_get_files():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    project_id = request.args.get("project_id")
    files = db.get_all("files")
    if project_id:
        files = [f for f in files if f["project_id"] == project_id]
    return jsonify(files)

# ──────────────────────────────────────────────
# SYSTEM METRICS API (CHARTS DATA)
# ──────────────────────────────────────────────
@app.route("/api/metrics", methods=["GET"])
def api_metrics():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    if session.get("role") == "employee":
        return jsonify({"error": "Forbidden"}), 403        
    projects = db.get_all("projects")
    employees = db.get_all("employees")
    tasks = db.get_all("tasks")
    
    total_projects = len(projects)
    active_projects = len([p for p in projects if p["status"] == "active"])
    completed_projects = len([p for p in projects if p["status"] == "completed"])
    total_employees = len(employees)
    pending_tasks = len([t for t in tasks if t["status"] != "Completed"])
    completed_tasks = len([t for t in tasks if t["status"] == "Completed"])
    
    # Calculate Team Utilization
    total_util = sum([e.get("current_workload", 0) for e in employees])
    util_pct = round(total_util / len(employees), 1) if employees else 0.0
    
    metrics = {
        "kpis": {
            "total_projects": total_projects,
            "active_projects": active_projects,
            "completed_projects": completed_projects,
            "total_employees": total_employees,
            "pending_tasks": pending_tasks,
            "completed_tasks": completed_tasks,
            "team_utilization": f"{util_pct}%",
            "health_score": "95/100"
        },
        "charts": {
            "project_progress": [
                {"name": p["project_name"], "progress": 100 if p["status"] == "completed" else (60 if p["status"] == "active" else 10)}
                for p in projects
            ],
            "employee_workload": [
                {"name": e["name"], "workload": e["current_workload"]}
                for e in employees
            ],
            "department_performance": [
                {"dept": "AI Engineering", "score": 93},
                {"dept": "Data Science", "score": 95},
                {"dept": "Engineering", "score": 90},
                {"dept": "Infrastructure", "score": 88},
                {"dept": "Research", "score": 96}
            ],
            "weekly_productivity": [
                {"week": "W1", "completed": 3},
                {"week": "W2", "completed": 7},
                {"week": "W3", "completed": 10},
                {"week": "W4", "completed": 14}
            ]
        }
    }
    return jsonify(metrics)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
