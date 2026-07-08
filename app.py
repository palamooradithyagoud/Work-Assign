import os
import json
import uuid
import datetime
import random
import threading
from flask import Flask, request, jsonify, send_from_directory, session
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
import db
from ai_project_manager import run_analysis, ask_ai

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
@app.route("/api/debug-db")
def api_debug_db():
    import traceback
    url = os.getenv("DATABASE_URL", "postgresql://postgres:ADITHYAGOUD%40789@db.jxnacpjbrnbihgmcydwr.supabase.co:5432/postgres")
    masked_url = url
    try:
        if "@" in url:
            parts = url.split("@")
            prefix = parts[0]
            if ":" in prefix:
                user_part = prefix.split(":")[0] + ":****"
                masked_url = user_part + "@" + parts[1]
    except Exception:
        pass

    info = {
        "status": "testing",
        "database_url_configured": os.getenv("DATABASE_URL") is not None,
        "masked_database_url": masked_url,
        "environment": {
            "VERCEL": os.environ.get("VERCEL"),
            "FLASK_ENV": os.environ.get("FLASK_ENV")
        }
    }
    
    try:
        conn = db.get_conn()
        cur = conn.cursor()
        cur.execute("SELECT version() as ver;")
        version = cur.fetchone()["ver"]
        
        cur.execute("SELECT COUNT(*) as cnt FROM public.users;")
        users_count = cur.fetchone()["cnt"]
        
        cur.close()
        conn.close()
        
        info["status"] = "success"
        info["db_version"] = version
        info["users_count"] = users_count
    except Exception as e:
        info["status"] = "failed"
        info["error"] = str(e)
        info["traceback"] = traceback.format_exc()
        
    return jsonify(info)

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
# ADMIN: PENDING PROJECTS (for overview + approvals)
# ──────────────────────────────────────────────
@app.route("/api/admin/pending-projects", methods=["GET"])
def api_admin_pending_projects():
    if session.get("role") != "admin":
        return jsonify({"error": "Forbidden"}), 403
    try:
        all_projects = db.get_all("projects")
        status_filter = request.args.get("status", "")
        if status_filter:
            filtered = [p for p in all_projects if p.get("workflow_status") == status_filter]
        else:
            filtered = all_projects

        # Enrich with PM name — users table PK is "id", not "user_id"
        all_users = db.get_all("users")
        user_map = {u["id"]: u.get("full_name") or u.get("email") or "—" for u in all_users}

        for p in filtered:
            pm_id = p.get("assigned_pm")
            p["assigned_pm"] = user_map.get(pm_id, pm_id or "Unassigned")

        return jsonify(filtered)
    except Exception as e:
        print(f"[ERROR] api_admin_pending_projects: {e}")
        return jsonify({"error": str(e)}), 500

# ──────────────────────────────────────────────
# PROJECTS MANAGEMENT API
# ──────────────────────────────────────────────
@app.route("/api/projects", methods=["GET", "POST"])
def api_projects():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    if request.method == "GET":
        role = session.get("role")
        if role == "project_manager":
            return jsonify(db.get_where("projects", "assigned_pm", session["user_id"]))
        if role == "employee":
            tasks = db.get_where("tasks", "assigned_to", session["user_id"])
            assigned_project_ids = {t["project_id"] for t in tasks if t.get("project_id")}
            if not assigned_project_ids:
                return jsonify([])
            projects = db.get_all("projects")
            return jsonify([p for p in projects if p["project_id"] in assigned_project_ids])
        return jsonify(db.get_all("projects"))
        
    # POST - Create project (Admin only creates the project, enters minimal details, selects PM)
    if session.get("role") != "admin":
        return jsonify({"error": "Forbidden"}), 403
        
    body = request.get_json(force=True)
    project_name = body.get("project_name", "").strip()
    if not project_name:
        return jsonify({"error": "Project name is required"}), 400
        
    pm_id = body.get("assigned_pm", "").strip()
    
    new_proj = {
        "project_id": f"PRJ{random.randint(100, 999)}",
        "project_name": (body.get("project_name") or "").strip(),
        "client": (body.get("client") or "").strip(),
        "description": (body.get("description") or "").strip(),
        "priority": body.get("priority", "Medium"),
        "deadline_days": int(body.get("deadline_days", 30)) if body.get("deadline_days") else 30,
        "budget": (body.get("budget") or "").strip(),
        "assigned_pm": pm_id or None,
        "workflow_status": "pending_pm" if pm_id else "draft",
        "status": "planning",
        "created_by": session["user_id"],
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    db.insert("projects", new_proj)
    db.log_action("PROJECT_CREATED", f"Project '{project_name}' was created by Admin.", session.get("email"))
    
    if pm_id:
        db.add_notification(pm_id, "Project Assigned to You",
            f"You have been assigned as Project Manager for '{project_name}'. Please review and analyze.",
            "info")
            
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
    for field in ["project_name", "description", "deadline_days", "priority", "estimated_duration", "budget", "required_skills", "preferred_tech", "preferred_roles", "team_size", "status", "workflow_status", "pm_comment", "client", "assigned_pm"]:
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
@app.route("/api/projects/<id>/ai-plan", methods=["POST", "PUT"])
def api_ai_plan(id):
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
        
    proj = db.get_by_id("projects", id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404
        
    if request.method == "PUT":
        # Step 3: PM edits AI Plan
        body = request.get_json(force=True)
        plan = body.get("ai_plan")
        if not plan:
            return jsonify({"error": "ai_plan is required"}), 400
        updated = db.update("projects", id, {"ai_plan": plan, "workflow_status": "ai_planning"})
        db.log_action("AI_PLAN_UPDATED", f"AI plan updated by PM for project '{proj['project_name']}'.", session.get("email"))
        return jsonify(updated)
        
    # POST - Analyze with AI
    employees = db.get_all("employees")
    csv_data = [
        {
            "name": "employees.csv",
            "content": "employee_id,name,role,skills,experience,current_workload\n" + \
                       "\n".join([f"{e['employee_id']},{e['name']},{e['role']},\"{e['skills']}\",{e['experience']},{e['current_workload']}" for e in employees])
        }
    ]
    
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    try:
        # Run Groq Llama project plan generation (returns 23 required sections)
        result = run_analysis(
            groq_key=GROQ_API_KEY,
            project_name=proj["project_name"],
            csv_sources=csv_data,
            project_description=proj.get("description", ""),
            preferred_roles=proj.get("preferred_roles", []),
            team_size_hint=str(proj.get("team_size", 5)),
            tech_preferences=proj.get("preferred_tech", ""),
            duration_hint=f"{proj.get('deadline_days')} days"
        )
        db.update("projects", id, {"ai_plan": result, "workflow_status": "ai_planning"})
        db.log_action("AI_PLAN_GENERATED", f"AI generated project plan for '{proj['project_name']}'.", session.get("email"))
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
# APPROVE & SAVE ASSIGNMENT TO DATABASE
# ──────────────────────────────────────────────
@app.route("/api/assignments/approve", methods=["POST"])
def api_approve_assignment():
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403

    body = request.get_json(force=True)
    project_id  = body.get("project_id")
    employee_id = body.get("employee_id")
    role        = body.get("role", "Team Member")
    confidence  = body.get("confidence", "N/A")
    reason      = body.get("reason", "")

    if not project_id or not employee_id:
        return jsonify({"error": "project_id and employee_id are required"}), 400

    proj = db.get_by_id("projects", project_id)
    emp  = db.get_by_id("employees", employee_id)

    if not proj:
        return jsonify({"error": "Project not found"}), 404
    if not emp:
        return jsonify({"error": "Employee not found"}), 404

    # Create an assigned task for this team member
    task_id = str(uuid.uuid4())
    deadline = (datetime.date.today() + datetime.timedelta(days=int(proj.get("deadline_days", 30)))).isoformat()
    task = {
        "id": task_id,
        "project_id": project_id,
        "task_name": f"{role} — {proj['project_name']}",
        "description": f"Assigned as {role} with {confidence} match confidence. {reason}",
        "assigned_to": employee_id,
        "priority": proj.get("priority", "medium").lower(),
        "deadline": deadline,
        "estimated_hours": 40,
        "status": "To Do",
        "comments": [],
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    db.insert("tasks", task)

    # Increase workload by 20 (capped at 100)
    new_workload = min(emp.get("current_workload", 0) + 20, 100)
    db.update("employees", employee_id, {"current_workload": new_workload})

    # Notify the assigned employee
    db.add_notification(
        user_id=employee_id,
        title="You've Been Assigned to a Project!",
        message=f"You have been assigned as {role} on '{proj['project_name']}'. Deadline: {deadline}.",
        notif_type="success"
    )

    db.log_action(
        "ASSIGNMENT_APPROVED",
        f"'{emp['name']}' approved as '{role}' on project '{proj['project_name']}' (confidence: {confidence}).",
        session.get("email")
    )

    return jsonify({
        "success": True,
        "task_id": task_id,
        "employee_name": emp["name"],
        "role": role,
        "project_name": proj["project_name"]
    })

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

    if request.method == "POST":
        # Allow admin, project_manager, and team_lead to create tasks
        if session.get("role") not in ("admin", "project_manager", "team_lead"):
            return jsonify({"error": "Forbidden"}), 403

        body = request.get_json(force=True)
        project_id = body.get("project_id", "").strip()
        task_name = body.get("task_name", "").strip()

        if not task_name:
            return jsonify({"error": "Task Name is required"}), 400

        new_task = {
            "id": str(uuid.uuid4()),
            "project_id": project_id or None,
            "task_name": task_name,
            "description": body.get("description", "").strip(),
            "assigned_to": body.get("assigned_to") or None,
            "priority": body.get("priority", "medium").lower(),
            "deadline": body.get("deadline", ""),
            "estimated_hours": int(body.get("estimated_hours", 4)),
            "status": body.get("status", "To Do"),
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
        return jsonify(new_task), 201

    # GET
    project_id = request.args.get("project_id")
    tasks = db.get_all("tasks")

    if project_id:
        tasks = [t for t in tasks if t.get("project_id") == project_id]

    if session.get("role") == "employee":
        tasks = [t for t in tasks if t.get("assigned_to") == session["user_id"]]

    return jsonify(tasks)

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
    
    allowed_fields = ["status", "comments", "deliverable", "progress_percent", "hours_worked", "help_requested", "help_comment"] if not is_pm_admin else \
                     ["task_name", "description", "assigned_to", "priority", "deadline", "estimated_hours", "status", "comments", "deliverable", "progress_percent", "hours_worked", "help_requested", "help_comment"]
                     
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
        if body.get("help_requested") is True:
            # Notify PM
            proj = db.get_by_id("projects", task["project_id"])
            pm_id = proj.get("assigned_pm") if proj else None
            if pm_id:
                db.add_notification(pm_id, "Employee Requested Help", 
                    f"'{session['full_name']}' requested help on task '{task['task_name']}': {body.get('help_comment', '')}", 
                    "warning")
            db.log_action("TASK_HELP_REQUESTED", f"Employee requested help on task '{task['task_name']}'.", session.get("email"))
            
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

@app.route("/api/notifications/mark-read", methods=["POST"])
def api_mark_all_notifications_read():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    uid = session["user_id"]
    notifs = db.get_all("notifications")
    user_notifs = [n for n in notifs if n["user_id"] == uid and not n.get("is_read")]
    for n in user_notifs:
        db.update("notifications", n["id"], {"is_read": True})
    return jsonify({"success": True, "marked": len(user_notifs)})

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


# ══════════════════════════════════════════════════════════
# ASSIGNIQ v2 — ENTERPRISE WORKFLOW API ROUTES
# ══════════════════════════════════════════════════════════

def _score_employees_for_role(employees, required_skills_str, exclude_ids=None):
    """Enhanced AI scoring: skill match + experience + availability + performance."""
    exclude_ids = exclude_ids or []
    req_skills = [s.strip().lower() for s in required_skills_str.split(";") if s.strip()]
    scored = []
    for emp in employees:
        if emp["employee_id"] in exclude_ids:
            continue
        emp_skills = [s.strip().lower() for s in (emp.get("skills") or "").split(";") if s.strip()]
        if req_skills:
            matching = [s for s in emp_skills if any(r in s or s in r for r in req_skills)]
            skill_pct = round(len(matching) / len(req_skills) * 100, 1)
        else:
            skill_pct = 70.0
        exp_pct    = min((emp.get("experience", 1) or 1) * 10, 100)
        avail_pct  = emp.get("availability", 100) or 100
        workload   = emp.get("current_workload", 0) or 0
        perf       = emp.get("performance_score", 80) or 80
        comp_proj  = min((emp.get("completed_projects", 0) or 0) * 5, 100)
        confidence = (
            skill_pct   * 0.35 +
            exp_pct     * 0.20 +
            (100 - workload) * 0.15 +
            avail_pct   * 0.15 +
            perf        * 0.10 +
            comp_proj   * 0.05
        )
        scored.append({
            "employee": emp,
            "confidence": round(confidence, 1),
            "skill_match": skill_pct,
            "experience_pct": exp_pct,
            "availability_pct": avail_pct,
            "workload_pct": workload,
            "performance": perf,
            "matching_skills": [s for s in emp_skills if any(r in s or s in r for r in req_skills)]
        })
    scored.sort(key=lambda x: x["confidence"], reverse=True)
    return scored


# ─── User helpers ───────────────────────────────────────────────────────────
@app.route("/api/users/project-managers", methods=["GET"])
def api_get_pms():
    if session.get("role") != "admin":
        return jsonify({"error": "Forbidden"}), 403
    users = db.get_all("users")
    return jsonify([u for u in users if u["role"] == "project_manager"])

@app.route("/api/users/team-leads", methods=["GET"])
def api_get_tls():
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    users = db.get_all("users")
    return jsonify([u for u in users if u["role"] == "team_lead"])

# ─── Project Workflow ────────────────────────────────────────────────────────
@app.route("/api/projects/<id>/assign-pm", methods=["POST"])
def api_assign_pm(id):
    if session.get("role") != "admin":
        return jsonify({"error": "Forbidden"}), 403
    body = request.get_json(force=True)
    pm_id = body.get("pm_id", "").strip()
    if not pm_id:
        return jsonify({"error": "pm_id is required"}), 400
    pm = db.get_by_id("users", pm_id)
    if not pm or pm["role"] != "project_manager":
        return jsonify({"error": "Invalid project manager"}), 400
    proj = db.get_by_id("projects", id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404
    updated = db.update("projects", id, {"assigned_pm": pm_id, "workflow_status": "pending_pm"})
    db.add_notification(pm_id, "Project Assigned to You",
        f"You have been assigned as Project Manager for '{proj['project_name']}'. Please review and approve.",
        "info")
    db.log_action("PM_ASSIGNED", f"PM '{pm['full_name']}' assigned to '{proj['project_name']}'.", session.get("email"))
    return jsonify({"success": True, "pm": pm, "project": updated})

@app.route("/api/projects/<id>/pm-review", methods=["POST"])
def api_pm_review(id):
    role = session.get("role")
    if role not in ("project_manager", "admin"):
        return jsonify({"error": "Forbidden"}), 403
    body = request.get_json(force=True)
    action  = body.get("action")  # "approve" | "request_changes"
    comment = body.get("comment", "").strip()
    if action not in ("approve", "request_changes"):
        return jsonify({"error": "action must be approve or request_changes"}), 400
    proj = db.get_by_id("projects", id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404
    # Only enforce PM ownership check for non-admin users
    if role == "project_manager" and proj.get("assigned_pm") and proj.get("assigned_pm") != session["user_id"]:
        return jsonify({"error": "You are not assigned to this project"}), 403
    new_status = "pm_approved" if action == "approve" else "changes_requested"
    updated = db.update("projects", id, {"workflow_status": new_status, "pm_comment": comment})
    
    # Notify all Admins
    for u in db.get_all("users"):
        if u["role"] == "admin":
            if action == "approve":
                db.add_notification(u["id"], "Project Approved by PM",
                    f"'{proj['project_name']}' approved. PM is now defining modules.", "success")
            else:
                db.add_notification(u["id"], "PM Requested Changes",
                    f"PM requested changes for '{proj['project_name']}': {comment}", "warning")
                    
    if action == "approve":
        db.log_action("PROJECT_PM_APPROVED", f"PM approved '{proj['project_name']}'.", session.get("email"))
    else:
        db.log_action("PROJECT_CHANGES_REQUESTED", f"PM requested changes for '{proj['project_name']}'.", session.get("email"))
    return jsonify(updated)

@app.route("/api/projects/<id>/workflow", methods=["GET"])
def api_project_workflow(id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        proj = db.get_by_id("projects", id)
        if not proj:
            return jsonify({"error": "Project not found"}), 404
        modules   = db.get_where("modules", "project_id", id)
        teams     = db.get_where("teams", "project_id", id)
        team_ids  = [t["team_id"] for t in teams]
        members   = db.get_where_in("team_members", "team_id", team_ids) if team_ids else []
        approvals = db.get_where("lead_approvals", "project_id", id)

        team_members_map = {tid: [] for tid in team_ids}
        for m in members:
            if m["team_id"] in team_members_map:
                team_members_map[m["team_id"]].append(m)
        for t in teams:
            t["members"] = team_members_map.get(t["team_id"], [])

        pm_id   = (proj.get("assigned_pm") or "").strip()
        pm_user = db.get_by_id("users", pm_id) if pm_id else None

        return jsonify({
            "project": proj,
            "pm": pm_user,
            "modules": modules,
            "teams": teams,
            "lead_approvals": approvals
        })
    except Exception as e:
        print(f"[ERROR] api_project_workflow {id}: {e}")
        return jsonify({"error": str(e)}), 500

# ─── Modules ────────────────────────────────────────────────────────────────
@app.route("/api/projects/<id>/modules", methods=["GET", "POST"])
def api_project_modules(id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    if request.method == "GET":
        all_m = db.get_all("modules")
        return jsonify([m for m in all_m if m["project_id"] == id])
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    body = request.get_json(force=True)
    if not body.get("module_name", "").strip():
        return jsonify({"error": "module_name is required"}), 400
    new_m = {
        "module_id": f"MOD{random.randint(1000,9999)}",
        "project_id": id,
        "module_name": body["module_name"].strip(),
        "description": body.get("description", ""),
        "estimated_duration": body.get("estimated_duration", ""),
        "required_skills": body.get("required_skills", ""),
        "complexity": body.get("complexity", "Medium"),
        "status": "planning",
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    saved = db.insert("modules", new_m)
    db.update("projects", id, {"workflow_status": "modules_defined"})
    db.log_action("MODULE_CREATED", f"Module '{new_m['module_name']}' added to project {id}.", session.get("email"))
    return jsonify(saved)

@app.route("/api/modules/<mid>", methods=["PUT", "DELETE"])
def api_module_detail(mid):
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    if request.method == "DELETE":
        db.delete("modules", mid)
        return jsonify({"success": True})
    body = request.get_json(force=True)
    fields = ["module_name", "description", "estimated_duration", "required_skills", "complexity", "status"]
    updates = {f: body[f] for f in fields if f in body}
    return jsonify(db.update("modules", mid, updates))

# ─── Teams ───────────────────────────────────────────────────────────────────
@app.route("/api/projects/<id>/teams", methods=["GET", "POST"])
def api_project_teams(id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    if request.method == "GET":
        all_t = db.get_all("teams")
        teams = [t for t in all_t if t["project_id"] == id]
        members = db.get_all("team_members")
        for t in teams:
            t["members"] = [m for m in members if m["team_id"] == t["team_id"]]
        return jsonify(teams)
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    body = request.get_json(force=True)
    if not body.get("team_name", "").strip():
        return jsonify({"error": "team_name is required"}), 400
    new_t = {
        "team_id": f"TEAM{random.randint(1000,9999)}",
        "project_id": id,
        "module_id": body.get("module_id", ""),
        "team_name": body["team_name"].strip(),
        "required_skills": body.get("required_skills", ""),
        "team_size": int(body.get("team_size", 3)),
        "team_lead_id": None,
        "lead_approved": False,
        "status": "forming",
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    saved = db.insert("teams", new_t)
    db.update("projects", id, {"workflow_status": "teams_forming"})
    db.log_action("TEAM_CREATED", f"Team '{new_t['team_name']}' created for project {id}.", session.get("email"))
    return jsonify(saved)

@app.route("/api/teams/<tid>", methods=["GET", "PUT", "DELETE"])
def api_team_detail(tid):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    if request.method == "GET":
        team = db.get_by_id("teams", tid)
        if not team:
            return jsonify({"error": "Team not found"}), 404
        members = [m for m in db.get_all("team_members") if m["team_id"] == tid]
        team["members"] = members
        return jsonify(team)
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    if request.method == "DELETE":
        db.delete("teams", tid)
        return jsonify({"success": True})
    body = request.get_json(force=True)
    fields = ["team_name", "module_id", "required_skills", "team_size", "status"]
    updates = {f: body[f] for f in fields if f in body}
    return jsonify(db.update("teams", tid, updates))

# ─── Team Lead Selection & Admin Approval ────────────────────────────────────
@app.route("/api/teams/<tid>/select-lead", methods=["POST"])
def api_select_team_lead(tid):
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    body = request.get_json(force=True)
    emp_id = body.get("employee_id", "").strip()
    reason = body.get("reason", "")
    confidence = float(body.get("confidence", 0))
    alt_ids = body.get("alternative_ids", [])
    if not emp_id:
        return jsonify({"error": "employee_id is required"}), 400
    team = db.get_by_id("teams", tid)
    if not team:
        return jsonify({"error": "Team not found"}), 404
    emp  = db.get_by_id("employees", emp_id)
    if not emp:
        return jsonify({"error": "Employee not found"}), 404
    proj = db.get_by_id("projects", team["project_id"])
    approval = {
        "id": str(uuid.uuid4()),
        "team_id": tid,
        "project_id": team["project_id"],
        "team_name": team["team_name"],
        "project_name": proj["project_name"] if proj else "",
        "selected_employee_id": emp_id,
        "requested_by": session["user_id"],
        "status": "pending",
        "ai_reason": reason,
        "confidence_score": confidence,
        "alternative_ids": alt_ids,
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    db.insert("lead_approvals", approval)
    db.update("teams", tid, {"status": "lead_pending", "team_lead_id": emp_id})
    db.update("projects", team["project_id"], {"workflow_status": "leads_pending"})
    # Notify all admins
    for u in db.get_all("users"):
        if u["role"] == "admin":
            db.add_notification(u["id"], "Team Lead Approval Required",
                f"PM selected '{emp['name']}' as lead for '{team['team_name']}' on '{proj['project_name'] if proj else ''}'. Your approval is needed.",
                "warning")
    db.log_action("LEAD_SELECTED", f"'{emp['name']}' selected as lead for team '{team['team_name']}'.", session.get("email"))
    return jsonify({"success": True, "approval_id": approval["id"]})

@app.route("/api/lead-approvals", methods=["GET"])
def api_lead_approvals_list():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    approvals = db.get_all("lead_approvals")
    status_filter = request.args.get("status", "")
    if status_filter:
        approvals = [a for a in approvals if a["status"] == status_filter]
    # Enrich with employee data
    for a in approvals:
        emp = db.get_by_id("employees", a.get("selected_employee_id", ""))
        a["employee"] = emp
        alts = []
        for aid in (a.get("alternative_ids") or []):
            ae = db.get_by_id("employees", aid)
            if ae:
                alts.append(ae)
        a["alternatives"] = alts
    approvals.sort(key=lambda x: x["created_at"], reverse=True)
    return jsonify(approvals)

@app.route("/api/lead-approvals/<aid>", methods=["GET"])
def api_lead_approval_detail(aid):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    approval = db.get_by_id("lead_approvals", aid)
    if not approval:
        return jsonify({"error": "Not found"}), 404
    approval["employee"] = db.get_by_id("employees", approval.get("selected_employee_id", ""))
    alts = []
    for eid in (approval.get("alternative_ids") or []):
        ae = db.get_by_id("employees", eid)
        if ae:
            alts.append(ae)
    approval["alternatives"] = alts
    approval["team"] = db.get_by_id("teams", approval.get("team_id", ""))
    approval["project"] = db.get_by_id("projects", approval.get("project_id", ""))
    return jsonify(approval)

@app.route("/api/lead-approvals/<aid>/decide", methods=["POST"])
def api_lead_approval_decide(aid):
    if session.get("role") != "admin":
        return jsonify({"error": "Forbidden"}), 403
    body = request.get_json(force=True)
    decision = body.get("decision")  # "approve" | "reject"
    comment  = body.get("comment", "")
    if decision not in ("approve", "reject"):
        return jsonify({"error": "decision must be approve or reject"}), 400
    approval = db.get_by_id("lead_approvals", aid)
    if not approval:
        return jsonify({"error": "Approval not found"}), 404
    now = datetime.datetime.utcnow().isoformat() + "Z"
    db.update("lead_approvals", aid, {"status": decision + "d", "admin_comment": comment, "decided_at": now})
    team = db.get_by_id("teams", approval["team_id"])
    proj = db.get_by_id("projects", approval["project_id"])
    emp  = db.get_by_id("employees", approval["selected_employee_id"])
    if decision == "approve":
        db.update("teams", approval["team_id"], {"lead_approved": True, "status": "lead_approved"})
        # Check if ALL teams for project have approved leads
        all_teams = [t for t in db.get_all("teams") if t["project_id"] == approval["project_id"]]
        all_approved = all(t.get("lead_approved") for t in all_teams)
        if all_approved:
            db.update("projects", approval["project_id"], {"workflow_status": "leads_approved"})
        # Notify PM
        pm_id = proj.get("assigned_pm") if proj else None
        if pm_id:
            db.add_notification(pm_id, "Team Lead Approved",
                f"Admin approved '{emp['name']}' as Team Lead for '{team['team_name'] if team else ''}'.",
                "success")
        # Notify the Team Lead employee
        if emp:
            db.add_notification(approval["selected_employee_id"],
                "You are now a Team Lead!",
                f"You have been approved as Team Lead for '{team['team_name'] if team else ''}' on '{proj['project_name'] if proj else ''}'.",
                "success")
        db.log_action("LEAD_APPROVED", f"Admin approved '{emp['name'] if emp else '?'}' as lead.", session.get("email"))
    else:
        db.update("teams", approval["team_id"], {"status": "forming", "team_lead_id": None})
        pm_id = proj.get("assigned_pm") if proj else None
        if pm_id:
            db.add_notification(pm_id, "Team Lead Rejected",
                f"Admin rejected '{emp['name'] if emp else '?'}' as lead for '{team['team_name'] if team else ''}'. Comment: {comment}",
                "error")
        db.log_action("LEAD_REJECTED", f"Admin rejected lead for team '{team['team_name'] if team else '?'}'.", session.get("email"))
    return jsonify({"success": True, "decision": decision})

# ─── Score employees for lead selection display ──────────────────────────────
@app.route("/api/teams/<tid>/score-employees", methods=["GET"])
def api_score_employees_for_team(tid):
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    team = db.get_by_id("teams", tid)
    if not team:
        return jsonify({"error": "Team not found"}), 404
    employees = db.get_all("employees")
    existing_members = [m["employee_id"] for m in db.get_all("team_members") if m["team_id"] == tid]
    scored = _score_employees_for_role(employees, team.get("required_skills", ""), exclude_ids=existing_members)
    results = []
    for s in scored[:10]:
        e = s["employee"]
        results.append({
            "employee_id": e["employee_id"],
            "name": e["name"],
            "role": e.get("role", ""),
            "department": e.get("department", ""),
            "experience": e.get("experience", 0),
            "performance_score": e.get("performance_score", 0),
            "completed_projects": e.get("completed_projects", 0),
            "current_workload": e.get("current_workload", 0),
            "skills": e.get("skills", ""),
            "photo": e.get("photo", ""),
            "confidence": s["confidence"],
            "skill_match": s["skill_match"],
            "matching_skills": s["matching_skills"],
            "experience_pct": s["experience_pct"],
            "availability_pct": s["availability_pct"]
        })
    return jsonify(results)

# ─── AI Full-Team Assignment ─────────────────────────────────────────────────
@app.route("/api/projects/<id>/ai-assign-all", methods=["POST"])
def api_ai_assign_all(id):
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    proj = db.get_by_id("projects", id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404
        
    ai_plan = proj.get("ai_plan") or {}
    modules = ai_plan.get("functional_modules", [])
    if not modules:
        # Fallback default modules
        modules = [
            {"module_name": "Authentication Module", "required_skills": "JWT;FastAPI;OAuth2"},
            {"module_name": "Billing Module", "required_skills": "Stripe;PostgreSQL;REST API"},
            {"module_name": "Reports Module", "required_skills": "React;Chart.js;Pandas"}
        ]
        
    employees = db.get_all("employees")
    existing_assigned = set()
    all_assignments = []
    
    # Automatically create teams for each module in the AI plan
    existing_teams = db.get_where("teams", "project_id", id)
    for idx, mod in enumerate(modules):
        mod_name = mod.get("module_name", f"Module {idx+1}")
        req_skills = mod.get("required_skills", "")
        
        # Check if team already exists for this module, else create it
        team = None
        for t in existing_teams:
            if t["module_id"] == mod_name:
                team = t
                break
        if not team:
            team_id = f"TEAM{random.randint(1000, 9999)}"
            team = {
                "team_id": team_id,
                "project_id": id,
                "module_id": mod_name,
                "team_name": f"Team {mod_name.replace(' Module', '').replace(' module', '')}",
                "required_skills": req_skills,
                "team_size": 5,
                "team_lead_id": None,
                "lead_approved": True,
                "status": "active",
                "created_at": datetime.datetime.utcnow().isoformat() + "Z"
            }
            db.insert("teams", team)
            existing_teams.append(team)
            
        # Score eligible candidates using 5-factor scoring engine
        scored = _score_employees_for_role(employees, req_skills, exclude_ids=list(existing_assigned))
        if not scored:
            # Re-score without exclusions if we run out of employees
            scored = _score_employees_for_role(employees, req_skills)
            
        # Assign members (up to 5 per team/module)
        slots = min(5, len(scored))
        for i in range(slots):
            s = scored[i]
            e = s["employee"]
            alt = scored[i + 1] if i + 1 < len(scored) else None
            
            # Format alternatives
            alts_list = []
            if alt:
                alts_list.append({
                    "name": alt["employee"]["name"],
                    "confidence": f"{alt['confidence']}%",
                    "reason_not_selected": f"Lower skill alignment ({alt['skill_match']}% match) or higher workload."
                })
                
            # Create assignment details
            assignment = {
                "id": str(uuid.uuid4()),
                "employee_id": e["employee_id"],
                "employee_name": e["name"],
                "assigned_role": e.get("role", "Software Engineer"),
                "assigned_module": mod_name,
                "team_id": team["team_id"],
                "team_name": team["team_name"],
                "skill_match": f"{s['skill_match']}%",
                "experience_score": f"{e.get('experience', 1)} years",
                "availability": f"{100 - e.get('current_workload', 0)}%",
                "current_workload": f"{e.get('current_workload', 0)}%",
                "performance": float(e.get("performance_score") or 85.0),
                "confidence_score": f"{s['confidence']}%",
                "reason_for_selection": (
                    f"Selected due to {s['skill_match']}% skill match with {mod_name} requirements, "
                    f"{e.get('experience', 1)} years experience, and balanced workload."
                ),
                "alternative_candidates": alts_list,
                "decision_trace": [
                    f"1. Evaluated candidate against skills: {req_skills}",
                    f"2. Checked current workload ({e.get('current_workload', 0)}%) and availability",
                    f"3. Derived experience score ({e.get('experience', 1)}y) and performance score ({e.get('performance_score', 85)}%)",
                    f"4. Ranked #1 among all available employees based on composite score of {s['confidence']}%"
                ]
            }
            all_assignments.append(assignment)
            existing_assigned.add(e["employee_id"])
            
    # Save assignments inside project's ai_plan
    ai_plan["assignments"] = all_assignments
    db.update("projects", id, {"ai_plan": ai_plan, "workflow_status": "ai_assigned"})
    db.log_action("AI_ASSIGNMENTS_GENERATED", f"AI generated team assignments for project '{proj['project_name']}'.", session.get("email"))
    return jsonify({"assignments": all_assignments, "total": len(all_assignments)})

@app.route("/api/projects/<id>/save-assignments", methods=["POST"])
def api_save_assignments(id):
    """PM reviews and saves AI assignments to DB (ai_plan nested list)."""
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    body = request.get_json(force=True)
    assignments = body.get("assignments", [])
    proj = db.get_by_id("projects", id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404
        
    ai_plan = proj.get("ai_plan") or {}
    ai_plan["assignments"] = assignments
    db.update("projects", id, {"ai_plan": ai_plan, "workflow_status": "pm_reviewing"})
    db.log_action("PROJECT_ASSIGNMENTS_SAVED", f"PM reviewed and saved assignments for project '{proj['project_name']}'.", session.get("email"))
    return jsonify({"success": True, "saved": len(assignments)})

@app.route("/api/projects/<id>/recommend-replacement", methods=["POST"])
def api_recommend_replacement(id):
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    proj = db.get_by_id("projects", id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404
        
    body = request.get_json(force=True)
    replacing_emp_id = body.get("employee_id")
    team_id = body.get("team_id")
    assigned_ids = body.get("assigned_ids", [])
    
    # 1. Fetch team to find required skills
    team = db.get_by_id("teams", team_id) if team_id else None
    required_skills = team.get("required_skills", "") if team else ""
    
    # 2. Find available candidates (excluding assigned employees and the one being replaced)
    employees = db.get_all("employees")
    available = [
        e for e in employees 
        if e["employee_id"] not in assigned_ids and e["employee_id"] != replacing_emp_id
    ]
    
    if not available:
        return jsonify({"error": "No other available employees in the organization."}), 400
        
    # 3. Score them using our 5-factor scoring engine
    scored = _score_employees_for_role(available, required_skills)
    
    # Take top 5 candidates to show/send to Groq
    top_candidates = scored[:5]
    
    # Format candidates list for Groq
    candidates_info = []
    for s in top_candidates:
        c = s["employee"]
        candidates_info.append({
            "employee_id": c["employee_id"],
            "name": c["name"],
            "role": c.get("role", ""),
            "skills": c.get("skills", ""),
            "experience": c.get("experience", 1),
            "performance_score": c.get("performance_score", 85.0),
            "current_workload": c.get("current_workload", 0),
            "confidence_score": f"{s['confidence']}%"
        })
        
    # 4. Prompt Groq for recommendation
    prompt = f"""
We need to replace an employee in the following project team.
Team/Module: {team.get('team_name', '') if team else ''}
Required Skills: {required_skills}

Here are the top available candidate employees:
{json.dumps(candidates_info, indent=2)}

Please select the best candidate from the list to replace the employee.
Respond strictly in valid JSON format matching this schema:
{{
  "recommended_employee_id": "the employee_id of the chosen candidate",
  "ai_reason": "a professional, concise 2-3 sentence explanation of why they are the best fit, highlighting matching skills, experience, and availability."
}}
Do not include any markdown formatting, explanations or text outside the JSON block.
"""
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    
    recommended_id = None
    ai_reason = ""
    
    if GROQ_API_KEY:
        try:
            response_text = ask_ai(prompt, GROQ_API_KEY)
            # Remove potential markdown formatting from JSON
            if response_text.startswith("```"):
                lines = response_text.splitlines()
                if lines[0].startswith("```json"):
                    response_text = "\n".join(lines[1:-1])
                else:
                    response_text = "\n".join(lines[1:-1])
            result = json.loads(response_text.strip())
            recommended_id = result.get("recommended_employee_id")
            ai_reason = result.get("ai_reason")
        except Exception as e:
            print(f"[AssignIQ] AI Replacement recommendation failed: {e}")
            
    # Fallback to top scored candidate if Groq key is missing or failed
    if not recommended_id or not any(c["employee_id"] == recommended_id for c in candidates_info):
        top_s = top_candidates[0]
        recommended_id = top_s["employee"]["employee_id"]
        ai_reason = (
            f"Recommended {top_s['employee']['name']} as the best fit based on {top_s['skill_match']}% "
            f"skill match with module requirements, {top_s['employee'].get('experience', 1)} years of experience, "
            f"and balanced workload ({100 - top_s['employee'].get('availability', 100)}%)."
        )
        
    # Assemble response
    recommended_emp = next(c["employee"] for c in top_candidates if c["employee"]["employee_id"] == recommended_id)
    
    # Return recommendation, reasoning, and full list of top candidates
    formatted_candidates = []
    for s in scored:
        c = s["employee"]
        formatted_candidates.append({
            "employee_id": c["employee_id"],
            "name": c["name"],
            "role": c.get("role", ""),
            "skills": c.get("skills", ""),
            "experience": c.get("experience", 1),
            "performance_score": c.get("performance_score", 85.0),
            "current_workload": c.get("current_workload", 0),
            "photo": c.get("photo", ""),
            "confidence": s["confidence"]
        })
        
    return jsonify({
        "recommended_id": recommended_id,
        "ai_reason": ai_reason,
        "recommended_employee": {
            "employee_id": recommended_emp["employee_id"],
            "name": recommended_emp["name"],
            "role": recommended_emp.get("role", ""),
            "skills": recommended_emp.get("skills", ""),
            "experience": recommended_emp.get("experience", 1),
            "performance_score": recommended_emp.get("performance_score", 85.0),
            "current_workload": recommended_emp.get("current_workload", 0),
            "photo": recommended_emp.get("photo", "")
        },
        "candidates": formatted_candidates
    })

@app.route("/api/projects/<id>/submit-to-admin", methods=["POST"])
def api_submit_to_admin(id):
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    proj = db.get_by_id("projects", id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404
        
    db.update("projects", id, {"workflow_status": "awaiting_admin_approval"})
    
    # Notify Admin
    for u in db.get_all("users"):
        if u["role"] == "admin":
            db.add_notification(u["id"], "Project Execution Plan Awaiting Approval",
                f"PM submitted execution plan for '{proj['project_name']}'. Please review and approve.",
                "warning")
                
    db.log_action("PROJECT_SUBMITTED_TO_ADMIN", f"Project plan for '{proj['project_name']}' submitted to Admin.", session.get("email"))
    return jsonify({"success": True})

@app.route("/api/projects/<id>/admin-decision", methods=["POST"])
def api_admin_decision(id):
    if session.get("role") != "admin":
        return jsonify({"error": "Forbidden"}), 403
    body = request.get_json(force=True)
    decision = body.get("decision")  # "approve" | "reject"
    comment = body.get("comment", "").strip()
    if decision not in ("approve", "reject"):
        return jsonify({"error": "decision must be approve or reject"}), 400

    proj = db.get_by_id("projects", id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404

    new_status = "approved" if decision == "approve" else "rejected"

    # ── 1. Update project status immediately ──────────────────────────────────
    db.update("projects", id, {
        "workflow_status": new_status,
        "status": "active" if decision == "approve" else "planning",
        "pm_comment": comment
    })

    # ── 2. Notify PM immediately ───────────────────────────────────────────────
    pm_id = proj.get("assigned_pm")
    if pm_id:
        if decision == "approve":
            title = "🎉 Project Approved — Start Now!"
            msg = (
                f"Admin has approved the execution plan for '{proj['project_name']}'.\n"
                f"The project is now ACTIVE. You can start the project from your dashboard.\n"
                f"Your team has been assigned and notified. Kickoff when ready!"
            )
            notif_type = "success"
        else:
            title = "❌ Project Plan Rejected"
            msg = (
                f"Admin rejected the execution plan for '{proj['project_name']}'.\n"
                f"Feedback: {comment}\n"
                f"Please review the feedback, update the plan, and re-submit."
            )
            notif_type = "error"
        db.add_notification(pm_id, title, msg, notif_type)

    db.log_action("PROJECT_ADMIN_DECISION",
                  f"Admin {decision}d plan for '{proj['project_name']}'.",
                  session.get("email"))

    # ── 3. Return SUCCESS immediately — heavy work runs in background ──────────
    if decision == "approve":
        def _background_setup(proj_snapshot, project_id):
            try:
                ai_plan = proj_snapshot.get("ai_plan") or {}
                assignments = ai_plan.get("assignments", []) if isinstance(ai_plan, dict) else []
                timeline = ai_plan.get("estimated_timeline") or {}
                phases = timeline.get("project_phases", []) if isinstance(timeline, dict) else []

                team_leads_assigned = set()
                for a in assignments:
                    try:
                        team_id = a.get("team_id", "")
                        emp_id  = a.get("employee_id", "")
                        if not emp_id:
                            continue

                        is_first_in_team = team_id and team_id not in team_leads_assigned
                        if is_first_in_team:
                            team_leads_assigned.add(team_id)
                            if team_id:
                                db.update("teams", team_id, {"team_lead_id": emp_id})

                        # Parse confidence score safely
                        raw_conf = a.get("confidence_score", "85")
                        try:
                            ai_conf = float(str(raw_conf).replace("%", "").strip())
                        except (ValueError, AttributeError):
                            ai_conf = 85.0

                        # Insert team member
                        db.insert("team_members", {
                            "id": str(uuid.uuid4()),
                            "team_id": team_id,
                            "employee_id": emp_id,
                            "assigned_role": a.get("assigned_role", ""),
                            "assigned_at": datetime.datetime.utcnow().isoformat() + "Z",
                            "ai_confidence": ai_conf,
                            "ai_reason": a.get("reason_for_selection", ""),
                            "is_lead": bool(is_first_in_team)
                        })

                        # Notify employee
                        emp_msg = (
                            f"Project: {proj_snapshot.get('project_name', '')}\n"
                            f"Module: {a.get('assigned_module', '')} | Role: {a.get('assigned_role', '')}\n"
                            f"Team: {a.get('team_name', '')}\n"
                            f"Deadline: {proj_snapshot.get('deadline_days', 30)} days | "
                            f"Priority: {proj_snapshot.get('priority', 'Medium')}"
                        )
                        db.add_notification(emp_id, "Work Assignment Dispatched", emp_msg, "info")

                        # Create up to 2 starter tasks (not 3) to reduce DB calls
                        for idx, phase in enumerate(phases[:2]):
                            try:
                                phase_name = phase.get("phase", f"Phase {idx+1}") if isinstance(phase, dict) else str(phase)
                                db.insert("tasks", {
                                    "project_id": project_id,
                                    "task_name": f"[{a.get('assigned_module','')}] {phase_name}",
                                    "description": f"Complete {phase_name} for {a.get('assigned_module','')}",
                                    "assigned_to": emp_id,
                                    "priority": proj_snapshot.get("priority", "Medium"),
                                    "deadline": (datetime.date.today() + datetime.timedelta(days=15)).isoformat(),
                                    "estimated_hours": 12,
                                    "status": "To Do",
                                    "progress_percent": 0
                                })
                            except Exception:
                                pass  # Skip task creation errors silently
                    except Exception as ae:
                        print(f"[BG] Assignment processing error: {ae}")
            except Exception as e:
                print(f"[BG] Background setup error: {e}")

        t = threading.Thread(target=_background_setup, args=(proj, id), daemon=True)
        t.start()

    return jsonify({"success": True, "workflow_status": new_status})

@app.route("/api/projects/<id>/publish", methods=["POST"])
def api_publish_project(id):
    """Fallback compatibility endpoint."""
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    db.update("projects", id, {"workflow_status": "approved", "status": "active"})
    return jsonify({"success": True, "notified": 0})


# ─── Team Lead Dashboard ─────────────────────────────────────────────────────
@app.route("/api/teamlead/dashboard", methods=["GET"])
def api_tl_dashboard():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    uid = session["user_id"]
    # Find teams where this user is the lead
    all_teams = db.get_all("teams")
    my_teams  = [t for t in all_teams if t.get("team_lead_id") == uid]
    all_members = db.get_all("team_members")
    all_tasks   = db.get_all("tasks")
    all_emps    = {e["employee_id"]: e for e in db.get_all("employees")}
    all_projs   = {p["project_id"]: p for p in db.get_all("projects")}
    result = []
    for team in my_teams:
        members = [m for m in all_members if m["team_id"] == team["team_id"]]
        member_details = []
        for m in members:
            emp = all_emps.get(m["employee_id"], {})
            member_tasks = [t for t in all_tasks if t.get("assigned_to") == m["employee_id"]
                           and t.get("project_id") == team["project_id"]]
            member_details.append({
                **emp,
                "assigned_role": m.get("assigned_role"),
                "pending_tasks": len([t for t in member_tasks if t["status"] != "Completed"]),
                "completed_tasks": len([t for t in member_tasks if t["status"] == "Completed"])
            })
        proj = all_projs.get(team.get("project_id", ""), {})
        result.append({
            "team": team,
            "project": proj,
            "members": member_details,
            "total_tasks": len([t for t in all_tasks if t.get("project_id") == team["project_id"]]),
            "completed_tasks": len([t for t in all_tasks if t.get("project_id") == team["project_id"] and t["status"] == "Completed"])
        })
    return jsonify(result)

@app.route("/api/teamlead/my-teams", methods=["GET"])
def api_tl_my_teams():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    uid = session["user_id"]
    all_teams = db.get_all("teams")
    my_teams  = [t for t in all_teams if t.get("team_lead_id") == uid]
    members   = db.get_all("team_members")
    employees = {e["employee_id"]: e for e in db.get_all("employees")}
    for team in my_teams:
        tm = [m for m in members if m["team_id"] == team["team_id"]]
        team["members"] = [{**employees.get(m["employee_id"], {}), **m} for m in tm]
    return jsonify(my_teams)

# ─── Employee Assignment View ────────────────────────────────────────────────
@app.route("/api/employee/my-assignment", methods=["GET"])
def api_emp_my_assignment():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    uid = session["user_id"]
    members = db.get_all("team_members")
    my_memberships = [m for m in members if m["employee_id"] == uid]
    if not my_memberships:
        return jsonify({"assignments": []})
    result = []
    all_teams = {t["team_id"]: t for t in db.get_all("teams")}
    all_projs = {p["project_id"]: p for p in db.get_all("projects")}
    all_mods  = {m["module_id"]: m for m in db.get_all("modules")}
    for m in my_memberships:
        team = all_teams.get(m["team_id"], {})
        proj = all_projs.get(team.get("project_id", ""), {})
        mod  = all_mods.get(team.get("module_id", ""), {})
        lead_emp = None
        if team.get("team_lead_id"):
            lead_emp = db.get_by_id("employees", team["team_lead_id"])
        result.append({
            "membership": m,
            "team": team,
            "project": proj,
            "module": mod,
            "team_lead": lead_emp
        })
    return jsonify({"assignments": result})

# ─── Comments ────────────────────────────────────────────────────────────────
@app.route("/api/comments", methods=["GET", "POST"])
def api_comments():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    if request.method == "GET":
        entity_type = request.args.get("entity_type", "")
        entity_id   = request.args.get("entity_id", "")
        all_c = db.get_all("comments")
        filtered = [c for c in all_c
                    if (not entity_type or c["entity_type"] == entity_type)
                    and (not entity_id   or c["entity_id"]   == entity_id)]
        filtered.sort(key=lambda x: x["created_at"])
        return jsonify(filtered)
    body = request.get_json(force=True)
    content = body.get("content", "").strip()
    if not content:
        return jsonify({"error": "content is required"}), 400
    new_c = {
        "id": str(uuid.uuid4()),
        "entity_type": body.get("entity_type", "project"),
        "entity_id": body.get("entity_id", ""),
        "user_id": session["user_id"],
        "user_name": session.get("full_name", "Unknown"),
        "content": content,
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    return jsonify(db.insert("comments", new_c))

# ─── Enhanced Metrics (v2) ────────────────────────────────────────────────────
@app.route("/api/metrics/v2", methods=["GET"])
def api_metrics_v2():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    projects  = db.get_all("projects")
    employees = db.get_all("employees")
    tasks     = db.get_all("tasks")
    teams     = db.get_all("teams")
    pending_approvals = [a for a in db.get_all("lead_approvals") if a["status"] == "pending"]
    statuses = {}
    for p in projects:
        s = p.get("workflow_status") or p.get("status") or "draft"
        statuses[s] = statuses.get(s, 0) + 1
    avg_perf = round(sum(e.get("performance_score") or 85 for e in employees) / max(len(employees), 1), 1)
    return jsonify({
        "kpis": {
            "total_projects": len(projects),
            "active_projects": len([p for p in projects if p.get("workflow_status") == "active"]),
            "total_employees": len(employees),
            "total_teams": len(teams),
            "pending_approvals": len(pending_approvals),
            "completed_tasks": len([t for t in tasks if t["status"] == "Completed"]),
            "avg_performance": avg_perf
        },
        "project_status_dist": statuses,
        "department_dist": {},
        "workload_chart": [{"name": e["name"], "workload": e.get("current_workload", 0)} for e in employees],
        "project_timeline": [{"name": p["project_name"], "status": p.get("workflow_status","draft")} for p in projects[-8:]]
    })

# ─── Project status update (admin/PM force-set) ──────────────────────────────
@app.route("/api/projects/<id>/set-status", methods=["POST"])
def api_set_project_status(id):
    if session.get("role") not in ("admin", "project_manager"):
        return jsonify({"error": "Forbidden"}), 403
    body = request.get_json(force=True)
    new_ws = body.get("workflow_status")
    if new_ws:
        db.update("projects", id, {"workflow_status": new_ws})
    return jsonify({"success": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
