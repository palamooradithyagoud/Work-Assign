// ──────────────────────────────────────────────
// ASSIGNIQ CORE FRONTEND APP ENGINE
// ──────────────────────────────────────────────

let activeView = "view-overview";
let currentProject = null;
let allProjects = [];
let allEmployees = [];
let allTasks = [];
let allUsers = [];
let notifTimer = null;
let chatTimer = null;

// Chart references for cleanup
let chartDept = null;
let chartWorkload = null;
let chartProductivity = null;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Authenticate user
  const user = await requireAuth();
  if (!user) return;
  
  initApp(user);
});

async function initApp(user) {
  currentUser = user;
  
  // Set User Badge details
  document.getElementById("session-username").textContent = user.full_name;
  document.getElementById("session-role").textContent = user.role.replace("_", " ");
  
  // Create avatar initials fallback
  const initials = user.full_name.split(" ").map(n => n[0]).join("").toUpperCase();
  document.getElementById("avatar-fallback").innerHTML = `<span style="font-weight:700;font-size:13px">${initials}</span>`;

  // 2. Hide/Show Nav sections depending on user role
  renderSidebarForRole(user.role);

  // 3. Bind UI elements
  setupTheme();
  setupNavigation();
  setupNotifications();
  setupChatDrawer();
  
  // 4. Load initial view
  const defaultView = user.role === "employee" ? "view-emp-dashboard" : "view-overview";
  switchView(defaultView);
}

function renderSidebarForRole(role) {
  const pmAdminSec = document.querySelector(".pm-admin-only");
  const employeeSec = document.querySelector(".employee-only");
  const adminSec = document.querySelector(".admin-only");

  if (role === "admin") {
    pmAdminSec.style.display = "block";
    employeeSec.style.display = "none";
    adminSec.style.display = "block";
  } else if (role === "project_manager") {
    pmAdminSec.style.display = "block";
    employeeSec.style.display = "none";
    adminSec.style.display = "none";
  } else { // employee
    pmAdminSec.style.display = "none";
    employeeSec.style.display = "block";
    adminSec.style.display = "none";
  }
}

// ──────────────────────────────────────────────
// NAVIGATION CONTROLLER
// ──────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      
      const targetView = item.getAttribute("data-view");
      switchView(targetView);
    });
  });
}

function switchView(viewId) {
  activeView = viewId;
  document.querySelectorAll(".view-panel").forEach(panel => {
    panel.classList.remove("active");
  });
  
  const targetPanel = document.getElementById(viewId);
  if (targetPanel) {
    targetPanel.classList.add("active");
  }
  
  // Set topbar title
  const titleMap = {
    "view-overview": "Overview Dashboard",
    "view-projects": "Projects Management",
    "view-employees": "Employee Directory",
    "view-kanban": "Kanban Sprint Board",
    "view-emp-dashboard": "My Overview Space",
    "view-emp-tasks": "My Sprint Tasks",
    "view-emp-profile": "My Personal Skills & Certs",
    "view-emp-calendar": "My Team Calendar",
    "view-audit-logs": "Audit Security Feed",
    "view-admin-users": "System Access Controls"
  };
  
  document.getElementById("view-title").textContent = titleMap[viewId] || "Dashboard";
  
  // Load data for specific views
  if (viewId === "view-overview") {
    loadOverviewMetrics();
  } else if (viewId === "view-projects") {
    loadProjects();
  } else if (viewId === "view-employees") {
    loadEmployees();
  } else if (viewId === "view-kanban") {
    initKanbanView();
  } else if (viewId === "view-emp-dashboard") {
    loadEmployeeDashboard();
  } else if (viewId === "view-emp-tasks") {
    loadEmployeeTasks();
  } else if (viewId === "view-emp-profile") {
    loadEmployeeProfile();
  } else if (viewId === "view-emp-calendar") {
    loadCalendar();
  } else if (viewId === "view-audit-logs") {
    loadAuditLogs();
  } else if (viewId === "view-admin-users") {
    loadAdminUsers();
  }
}

// Helper to flash alerts
function showAlert(message, type = "info") {
  const alert = document.getElementById("global-alert");
  alert.textContent = message;
  alert.className = `alert alert-${type} show`;
  setTimeout(() => { alert.className = "alert"; }, 4000);
}

// ──────────────────────────────────────────────
// LIGHT / DARK THEME TOGGLER
// ──────────────────────────────────────────────
function setupTheme() {
  const themeBtn = document.getElementById("theme-btn");
  const storedTheme = localStorage.getItem("theme") || "dark-theme";
  
  document.body.className = storedTheme;
  updateThemeIcon(storedTheme);
  
  themeBtn.addEventListener("click", () => {
    let nextTheme = "dark-theme";
    if (document.body.classList.contains("dark-theme")) {
      nextTheme = "light-theme";
    }
    document.body.className = nextTheme;
    localStorage.setItem("theme", nextTheme);
    updateThemeIcon(nextTheme);
    
    // Re-render charts to support color changes if on overview
    if (activeView === "view-overview") {
      loadOverviewMetrics();
    }
  });
}

function updateThemeIcon(theme) {
  const icon = document.querySelector("#theme-btn i");
  if (theme === "dark-theme") {
    icon.className = "fa-regular fa-sun";
  } else {
    icon.className = "fa-regular fa-moon";
  }
}

// Demo quick switch utility
async function demoQuickSwitch(role) {
  try {
    // Simulate updating user role on backend or recreate mock session
    // For demo simplicity, we change client role and re-init sidebar navigation views
    currentUser.role = role;
    document.getElementById("session-role").textContent = role.replace("_", " ");
    renderSidebarForRole(role);
    
    // Switch to appropriate dashboard
    const defaultView = role === "employee" ? "view-emp-dashboard" : "view-overview";
    
    // Set active item in sidebar nav
    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.remove("active");
      if (item.getAttribute("data-view") === defaultView) {
        item.classList.add("active");
      }
    });
    
    switchView(defaultView);
    showAlert(`Switched to demo ${role.toUpperCase()} workspace.`, "info");
  } catch(e) {
    console.error(e);
  }
}

// ──────────────────────────────────────────────
// OVERVIEW METRICS & CHART.JS
// ──────────────────────────────────────────────
async function loadOverviewMetrics() {
  try {
    const resp = await fetch("/api/metrics");
    if (!resp.ok) return;
    const data = await resp.json();

    // Set KPI cards
    document.getElementById("kpi-total-projects").textContent = data.kpis.total_projects;
    document.getElementById("kpi-active-projects").textContent = data.kpis.active_projects;
    document.getElementById("kpi-completed-projects").textContent = data.kpis.completed_projects;
    document.getElementById("kpi-utilization").textContent = data.kpis.team_utilization;
    document.getElementById("kpi-pending-tasks").textContent = data.kpis.pending_tasks;
    document.getElementById("kpi-health").textContent = data.kpis.health_score;

    // Charts Color Palettes based on active theme
    const isDark = document.body.classList.contains("dark-theme");
    const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    const textColor = isDark ? "#94a3b8" : "#475569";

    // 1. Department Chart
    if (chartDept) chartDept.destroy();
    const ctxDept = document.getElementById("chart-department").getContext("2d");
    chartDept = new Chart(ctxDept, {
      type: "radar",
      data: {
        labels: data.charts.department_performance.map(d => d.dept),
        datasets: [{
          label: "Performance Score",
          data: data.charts.department_performance.map(d => d.score),
          backgroundColor: "rgba(99, 102, 241, 0.2)",
          borderColor: "#6366f1",
          borderWidth: 2,
          pointBackgroundColor: "#a855f7"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            grid: { color: gridColor },
            angleLines: { color: gridColor },
            ticks: { backdropColor: "transparent", color: textColor, font: { family: "Plus Jakarta Sans" } },
            pointLabels: { color: textColor, font: { family: "Plus Jakarta Sans", weight: "bold" } }
          }
        }
      }
    });

    // 2. Workload Chart
    if (chartWorkload) chartWorkload.destroy();
    const ctxWorkload = document.getElementById("chart-workload").getContext("2d");
    chartWorkload = new Chart(ctxWorkload, {
      type: "bar",
      data: {
        labels: data.charts.employee_workload.map(e => e.name),
        datasets: [{
          label: "Allocation %",
          data: data.charts.employee_workload.map(e => e.workload),
          backgroundColor: data.charts.employee_workload.map(e => e.workload > 80 ? "#ef4444" : "#6366f1"),
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor },
            min: 0,
            max: 100
          },
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { family: "Plus Jakarta Sans" } }
          }
        }
      }
    });

    // 3. Weekly Productivity Chart
    if (chartProductivity) chartProductivity.destroy();
    const ctxProd = document.getElementById("chart-productivity").getContext("2d");
    chartProductivity = new Chart(ctxProd, {
      type: "line",
      data: {
        labels: data.charts.weekly_productivity.map(w => w.week),
        datasets: [{
          label: "Tasks Completed",
          data: data.charts.weekly_productivity.map(w => w.completed),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          fill: true,
          tension: 0.3,
          borderWidth: 2.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: gridColor }, ticks: { color: textColor } },
          x: { grid: { display: false }, ticks: { color: textColor } }
        }
      }
    });

  } catch (e) {
    console.error("Load metrics failed:", e);
  }
}

// ──────────────────────────────────────────────
// PROJECTS MODULE
// ──────────────────────────────────────────────
async function loadProjects() {
  try {
    const resp = await fetch("/api/projects");
    if (!resp.ok) return;
    allProjects = await resp.json();
    renderProjectsTable(allProjects);
  } catch (e) {
    console.error(e);
  }
}

function renderProjectsTable(projects) {
  const tbody = document.getElementById("projects-table-body");
  if (projects.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No projects found. Create one to get started.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = projects.map(p => {
    return `
      <tr>
        <td style="font-weight: 700; cursor: pointer; color: var(--accent-primary)" onclick="showProjectDetails('${p.project_id}')">${esc(p.project_name)}</td>
        <td><span class="badge badge-${p.priority}">${p.priority}</span></td>
        <td>${p.deadline_days} days</td>
        <td>${p.team_size} members</td>
        <td>$${p.budget || "0"}</td>
        <td><span class="badge badge-${p.status.replace(" ", "")}">${p.status}</span></td>
        <td>
          <div style="display:flex; gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="openEditProjectModal('${p.project_id}')"><i class="fa-regular fa-pen-to-square"></i></button>
            <button class="btn btn-secondary btn-sm" onclick="archiveProject('${p.project_id}')" title="Archive"><i class="fa-solid fa-box-archive"></i></button>
            <button class="btn btn-logout btn-sm" onclick="deleteProject('${p.project_id}')" style="padding:6px;width:30px;height:30px"><i class="fa-regular fa-trash-can"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterProjects() {
  const query = document.getElementById("project-search").value.toLowerCase();
  const filtered = allProjects.filter(p => p.project_name.toLowerCase().includes(query));
  renderProjectsTable(filtered);
}

function showProjectDetails(projId) {
  currentProject = allProjects.find(p => p.project_id === projId);
  if (!currentProject) return;

  document.getElementById("project-detail-panel").style.display = "block";
  document.getElementById("detail-proj-name").textContent = currentProject.project_name;
  document.getElementById("detail-proj-desc").textContent = currentProject.description || "No description provided.";
  
  // Show Project Chat Drawer trigger
  document.getElementById("chat-drawer").style.display = "block";
  document.getElementById("chat-proj-title").textContent = `Chat: ${currentProject.project_name}`;

  renderAIPlanResults();
  renderAssignmentsResults();
  loadProjectPredictor(projId);

  // Scroll details panel smoothly into view
  document.getElementById("project-detail-panel").scrollIntoView({ behavior: "smooth" });
}

// AI Success Predictor & Tool Recommender
async function loadProjectPredictor(projectId) {
  try {
    const resp = await fetch(`/api/projects/${projectId}/predict`);
    if (!resp.ok) return;
    const data = await resp.json();
    
    document.getElementById("ai-predictor-card").style.display = "block";
    document.getElementById("predicted-success-badge").innerText = `Probability: ${data.success_score}`;
    document.getElementById("predictor-trace").innerText = data.similarity_trace;
    
    const list = document.getElementById("recommended-tools-list");
    list.innerHTML = "";
    data.recommended_tools.forEach(t => {
      const pill = document.createElement("span");
      pill.className = "tool-pill";
      pill.style.background = "rgba(139, 92, 246, 0.15)";
      pill.style.border = "1px solid rgba(139, 92, 246, 0.3)";
      pill.style.color = "#c084fc";
      pill.style.padding = "4px 10px";
      pill.style.borderRadius = "6px";
      pill.style.fontSize = "12px";
      pill.style.display = "inline-flex";
      pill.style.alignItems = "center";
      pill.style.gap = "6px";
      pill.innerHTML = `<i class="fa-solid fa-screwdriver-wrench"></i> <strong>${t.tool_name}</strong> (${t.tool_type})`;
      pill.title = t.reason;
      list.appendChild(pill);
    });
  } catch (err) {
    console.error("Predictor fetch error:", err);
  }
}

// ──────────────────────────────────────────────
// AI PROJECT PLANNER INTERFACE
// ──────────────────────────────────────────────
async function generateAIPlan() {
  if (!currentProject) return;

  const skeleton = document.getElementById("ai-plan-skeleton");
  const results = document.getElementById("ai-plan-results");

  skeleton.style.display = "block";
  results.style.display = "none";

  try {
    const resp = await fetch(`/api/projects/${currentProject.project_id}/ai-plan`, { method: "POST" });
    if (!resp.ok) {
      showAlert("AI Planning Engine failed.", "error");
      skeleton.style.display = "none";
      return;
    }
    
    const data = await resp.json();
    currentProject.ai_plan = data;
    renderAIPlanResults();
    
    // Refresh task view if currently open
    loadProjects();
    
  } catch (e) {
    console.error(e);
  } finally {
    skeleton.style.display = "none";
  }
}

function renderAIPlanResults() {
  const container = document.getElementById("ai-plan-results");
  if (!currentProject.ai_plan) {
    container.style.display = "block";
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-wand-magic-sparkles" style="font-size:32px;margin-bottom:12px;color:var(--text-muted)"></i>
        <p>No AI Project Plan generated yet.</p>
        <button class="btn btn-primary btn-sm" onclick="generateAIPlan()" style="margin-top:10px">Generate AI Plan</button>
      </div>
    `;
    return;
  }

  const plan = currentProject.ai_plan;
  container.style.display = "grid";
  container.innerHTML = `
    <div class="ai-card full-width">
      <h3>Project Summary Overview</h3>
      <p style="font-size:13.5px;line-height:1.7;color:var(--text-sub)">${esc(plan.project_overview)}</p>
    </div>
    <div class="ai-card">
      <h3>System Architecture</h3>
      <p style="font-size:13.5px;color:var(--text-sub)">${esc(plan.architecture || "Three-tier cloud web stack.")}</p>
    </div>
    <div class="ai-card">
      <h3>Timeline Estimation</h3>
      <p style="font-size:13.5px;color:var(--text-sub)">${esc(plan.timeline_summary || plan.estimated_duration?.summary || "8-12 weeks based on complexity.")}</p>
    </div>
    <div class="ai-card">
      <h3>Risks & Mitigations</h3>
      <ul style="padding-left:20px;font-size:13.5px;color:var(--text-sub)">
        ${(plan.risk_analysis || plan.risks || []).map(r => `<li><strong>${esc(r.risk)}</strong>: ${esc(r.mitigation)}</li>`).join("")}
      </ul>
    </div>
    <div class="ai-card">
      <h3>Recommended Tech Stack</h3>
      <div class="badge-list">
        ${(plan.recommended_tech_stack || plan.tech_stack || []).map(t => `<span class="badge badge-default">${esc(t.technology || t.tech_name)}</span>`).join("")}
      </div>
    </div>
    <div class="ai-card">
      <h3>Estimated Budget Allocation</h3>
      <p style="font-size:15px;font-weight:700;color:var(--accent-secondary)">${esc(plan.estimated_cost || `$${currentProject.budget || "0"}`)}</p>
    </div>
    <div class="ai-card">
      <h3>Expected Completion Time</h3>
      <p style="font-size:15px;font-weight:700;color:var(--status-todo)">${esc(plan.expected_completion_time || currentProject.deadline_days + " Days")}</p>
    </div>
  `;
}

// ──────────────────────────────────────────────
// AI ASSIGNMENT ENGINE INTERFACE
// ──────────────────────────────────────────────
async function runAIAssignment() {
  if (!currentProject) return;

  const skeleton = document.getElementById("assign-skeleton");
  const results = document.getElementById("assignments-results");

  skeleton.style.display = "block";
  results.style.display = "none";

  try {
    const resp = await fetch("/api/assignments/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: currentProject.project_id })
    });
    
    if (!resp.ok) {
      showAlert("AI Assignment Engine failed.", "error");
      skeleton.style.display = "none";
      return;
    }
    
    const assignments = await resp.json();
    currentProject.assignments = assignments;
    renderAssignmentsResults();
    
  } catch (e) {
    console.error(e);
  } finally {
    skeleton.style.display = "none";
  }
}

function renderAssignmentsResults() {
  const container = document.getElementById("assignments-results");
  if (!currentProject.assignments || currentProject.assignments.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-users-gear" style="font-size:32px;margin-bottom:12px;color:var(--text-muted)"></i>
        <p>No resource allocations analyzed yet.</p>
        <button class="btn btn-purple btn-sm" onclick="runAIAssignment()" style="margin-top:10px">Run Assignment Engine</button>
      </div>
    `;
    return;
  }

  const assigns = currentProject.assignments;
  container.innerHTML = `
    <div class="section-header" style="margin-bottom:15px">
      <h3><i class="fa-solid fa-graduation-cap"></i> Auditable Decision Panel (XAI)</h3>
    </div>
    ${assigns.map(a => {
      return `
        <div class="assignment-role-card">
          <div class="role-card-header">
            <h4>Role: ${esc(a.role)}</h4>
            <span class="badge badge-completed">Match: ${a.confidence}</span>
          </div>
          <div class="decision-grid">
            <div>
              <p><strong>Assigned Resource:</strong> ${esc(a.employee_name)}</p>
              <p style="color:var(--text-sub);margin-top:6px"><strong>Reasoning:</strong> ${esc(a.reason)}</p>
              <ul class="trace-list">
                ${a.decision_trace.map(t => `<li><i class="fa-solid fa-check" style="color:#10b981;margin-right:6px"></i> ${esc(t)}</li>`).join("")}
              </ul>
            </div>
            <div style="border-left: 1px solid var(--border-color); padding-left:20px">
              <p style="font-weight:700;font-size:12px;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">Alternative Option</p>
              <p><strong>Employee:</strong> ${esc(a.alternative.employee_name)}</p>
              <p style="font-size:11.5px;color:var(--text-muted);margin-top:4px">${esc(a.alternative.reason_not_selected)}</p>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:15px; border-top:1px solid var(--border-color); padding-top:12px">
            <button class="btn btn-secondary btn-sm" onclick="openModifyAssignmentModal('${a.role}')">Modify</button>
            <button class="btn btn-primary btn-sm" id="approve-btn-${a.role.replace(/\s+/g,'-')}" onclick="approveAssignment('${a.role}', '${a.employee_id}')">Approve & Assign Worker</button>
          </div>
        </div>
      `;
    }).join("")}
  `;
}

async function approveAssignment(role, empId) {
  if (!currentProject) return;

  const btnId = "approve-btn-" + role.replace(/\s+/g, '-');
  const btn = document.getElementById(btnId) || event.currentTarget;
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const assignment = (currentProject.assignments || []).find(a => a.role === role);
    const resp = await fetch("/api/assignments/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id:  currentProject.project_id,
        employee_id: empId,
        role:        role,
        confidence:  assignment ? assignment.confidence : "N/A",
        reason:      assignment ? assignment.reason : ""
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      btn.textContent = "\u2713 Assigned";
      btn.style.background = "#10b981";
      btn.style.color = "#fff";
      showAlert(`${data.employee_name} assigned as ${data.role} on '${data.project_name}'. Task created & worker notified!`, "success");
    } else {
      const err = await resp.json();
      showAlert(err.error || "Failed to approve assignment.", "error");
      btn.disabled = false;
      btn.textContent = "Approve & Assign Worker";
    }
  } catch (e) {
    console.error(e);
    showAlert("Network error while approving assignment.", "error");
    btn.disabled = false;
    btn.textContent = "Approve & Assign Worker";
  }
}

// ──────────────────────────────────────────────
// EMPLOYEE DIRECTORY
// ──────────────────────────────────────────────
async function loadEmployees() {
  try {
    const resp = await fetch("/api/employees");
    if (!resp.ok) return;
    allEmployees = await resp.json();
    renderEmployeesGrid(allEmployees);
  } catch (e) {
    console.error(e);
  }
}

function renderEmployeesGrid(employees) {
  const container = document.getElementById("employees-card-grid");
  if (employees.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column: span 3">No employees found in directory.</div>`;
    return;
  }

  container.innerHTML = employees.map(e => {
    const skillsArr = e.skills ? e.skills.split(";").filter(Boolean) : [];
    return `
      <div class="glass employee-card">
        <img class="emp-avatar" src="${e.photo}" alt="${esc(e.name)}" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'"/>
        <h3>${esc(e.name)}</h3>
        <span class="emp-dept">${esc(e.department)}</span>
        <div style="margin-top:10px">
          <div class="badge-list" style="justify-content:center">
            ${skillsArr.slice(0, 3).map(s => `<span class="badge badge-default">${esc(s)}</span>`).join("")}
            ${skillsArr.length > 3 ? `<span class="badge badge-default">+${skillsArr.length - 3}</span>` : ""}
          </div>
        </div>
        
        <div class="emp-stats">
          <div class="emp-stat-item">
            <span class="esi-value">${e.experience}y</span>
            <span class="esi-label">Exp</span>
          </div>
          <div class="emp-stat-item">
            <span class="esi-value" style="color:${e.current_workload > 80 ? 'var(--priority-critical)' : 'var(--text-main)'}">${e.current_workload}%</span>
            <span class="esi-label">Load</span>
          </div>
          <div class="emp-stat-item">
            <span class="esi-value">90%</span>
            <span class="esi-label">Perf</span>
          </div>
        </div>
        
        <div style="display:flex; gap:10px; width:100%; margin-top:20px; border-top:1px solid var(--border-color); padding-top:16px">
          <button class="btn btn-secondary btn-sm" style="flex:1" onclick="openEditEmployeeModal('${e.employee_id}')">Profile</button>
          <button class="btn btn-logout btn-sm" onclick="removeEmployee('${e.employee_id}')"><i class="fa-regular fa-trash-can"></i></button>
        </div>
      </div>
    `;
  }).join("");
}

function filterEmployees() {
  const query = document.getElementById("employee-search").value.toLowerCase();
  const filtered = allEmployees.filter(e => 
    e.name.toLowerCase().includes(query) || 
    (e.skills && e.skills.toLowerCase().includes(query))
  );
  renderEmployeesGrid(filtered);
}

function renderEmployeesGrid(employees) {
  const container = document.getElementById("employees-card-grid");
  if (employees.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column: span 3">No employees found in directory.</div>`;
    return;
  }

  container.innerHTML = employees.map(e => {
    const skillsArr = e.skills ? e.skills.split(";").filter(Boolean) : [];
    return `
      <div class="glass employee-card">
        <img class="emp-avatar" src="${e.photo}" alt="${esc(e.name)}" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'"/>
        <h3>${esc(e.name)}</h3>
        <span class="emp-dept">${esc(e.department)}</span>
        <div style="margin-top:10px">
          <div class="badge-list" style="justify-content:center">
            ${skillsArr.slice(0, 3).map(s => `<span class="badge badge-default">${esc(s)}</span>`).join("")}
            ${skillsArr.length > 3 ? `<span class="badge badge-default">+${skillsArr.length - 3}</span>` : ""}
          </div>
        </div>
        
        <div class="emp-stats">
          <div class="emp-stat-item">
            <span class="esi-value">${e.experience}y</span>
            <span class="esi-label">Exp</span>
          </div>
          <div class="emp-stat-item">
            <span class="esi-value" style="color:${e.current_workload > 80 ? 'var(--priority-critical)' : 'var(--text-main)'}">${e.current_workload}%</span>
            <span class="esi-label">Load</span>
          </div>
          <div class="emp-stat-item">
            <span class="esi-value">90%</span>
            <span class="esi-label">Perf</span>
          </div>
        </div>
        
        <div style="display:flex; gap:10px; width:100%; margin-top:20px; border-top:1px solid var(--border-color); padding-top:16px">
          <button class="btn btn-secondary btn-sm" style="flex:1" onclick="openEditEmployeeModal('${e.employee_id}')">Profile</button>
          <button class="btn btn-logout btn-sm" onclick="removeEmployee('${e.employee_id}')"><i class="fa-regular fa-trash-can"></i></button>
        </div>
      </div>
    `;
  }).join("");
}

function filterEmployees() {
  const query = document.getElementById("employee-search").value.toLowerCase();
  const filtered = allEmployees.filter(e => 
    e.name.toLowerCase().includes(query) || 
    (e.skills && e.skills.toLowerCase().includes(query))
  );
  renderEmployeesGrid(filtered);
}



// ──────────────────────────────────────────────
// KANBAN SPRINT TASK BOARD
// ──────────────────────────────────────────────
async function initKanbanView() {
  try {
    // Load projects for project dropdown selector
    const resp = await fetch("/api/projects");
    if (!resp.ok) return;
    allProjects = await resp.json();
    
    const sel = document.getElementById("kanban-project-select");
    sel.innerHTML = allProjects.map(p => `<option value="${p.project_id}">${esc(p.project_name)}</option>`).join("");
    
    if (allProjects.length > 0) {
      loadProjectTasks(allProjects[0].project_id);
    }
  } catch(e) {
    console.error(e);
  }
}

async function loadProjectTasks(projId) {
  try {
    const resp = await fetch(`/api/tasks?project_id=${projId}`);
    if (!resp.ok) return;
    allTasks = await resp.json();
    
    // Fill task assignee dropdown in form
    const employeesResp = await fetch("/api/employees");
    const employees = await employeesResp.json();
    const assignSel = document.getElementById("task-form-assign");
    assignSel.innerHTML = '<option value="">Unassigned</option>' + 
      employees.map(e => `<option value="${e.employee_id}">${esc(e.name)}</option>`).join("");
      
    renderKanbanColumns(allTasks, employees);
  } catch (e) {
    console.error(e);
  }
}

function renderKanbanColumns(tasks, employees) {
  const colTodo = document.getElementById("cards-todo");
  const colInprogress = document.getElementById("cards-inprogress");
  const colReview = document.getElementById("cards-review");
  const colTesting = document.getElementById("cards-testing");
  const colCompleted = document.getElementById("cards-completed");
  
  colTodo.innerHTML = "";
  colInprogress.innerHTML = "";
  colReview.innerHTML = "";
  colTesting.innerHTML = "";
  colCompleted.innerHTML = "";
  
  let cTodo = 0, cIp = 0, cRev = 0, cTest = 0, cComp = 0;
  
  tasks.forEach(t => {
    const assignee = employees.find(e => e.employee_id === t.assigned_to);
    const assigneeName = assignee ? assignee.name : "Unassigned";
    
    const cardHtml = `
      <div class="task-card" draggable="true" ondragstart="drag(event, '${t.id}')">
        <div class="task-card-header">
          <span class="badge badge-${t.priority}">${t.priority}</span>
          <div style="display:flex; gap:6px">
            <button class="btn-ghost" style="padding:2px" onclick="openEditTaskModal('${t.id}')"><i class="fa-solid fa-pencil"></i></button>
            <button class="btn-ghost" style="padding:2px;color:var(--priority-critical)" onclick="deleteTask('${t.id}')"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        <h4>${esc(t.task_name)}</h4>
        <p style="font-size:12px;color:var(--text-sub);line-height:1.4">${esc(t.description || "No description.")}</p>
        <div class="task-card-footer">
          <span class="task-assignee"><i class="fa-regular fa-circle-user"></i> ${esc(assigneeName)}</span>
          <span>${t.deadline ? new Date(t.deadline).toLocaleDateString() : ""}</span>
        </div>
      </div>
    `;
    
    if (t.status === "To Do") { colTodo.innerHTML += cardHtml; cTodo++; }
    else if (t.status === "In Progress") { colInprogress.innerHTML += cardHtml; cIp++; }
    else if (t.status === "Review") { colReview.innerHTML += cardHtml; cRev++; }
    else if (t.status === "Testing") { colTesting.innerHTML += cardHtml; cTest++; }
    else if (t.status === "Completed") { colCompleted.innerHTML += cardHtml; cComp++; }
  });
  
  document.getElementById("count-todo").textContent = cTodo;
  document.getElementById("count-inprogress").textContent = cIp;
  document.getElementById("count-review").textContent = cRev;
  document.getElementById("count-testing").textContent = cTest;
  document.getElementById("count-completed").textContent = cComp;
}

// Drag & Drop simulation functions
function allowDrop(ev) {
  ev.preventDefault();
  ev.currentTarget.classList.add("drag-over");
}

function drag(ev, taskId) {
  ev.dataTransfer.setData("text", taskId);
}

async function drop(ev, status) {
  ev.preventDefault();
  ev.currentTarget.classList.remove("drag-over");
  const taskId = ev.dataTransfer.getData("text");
  
  try {
    const resp = await fetch(`/api/tasks/${taskId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (resp.ok) {
      const projId = document.getElementById("kanban-project-select").value;
      loadProjectTasks(projId);
      showAlert(`Task moved to ${status}.`, "success");
    }
  } catch(e) {
    console.error(e);
  }
}

// ──────────────────────────────────────────────
// EMPLOYEE DASHBOARD PORTAL
// ──────────────────────────────────────────────
async function loadEmployeeDashboard() {
  try {
    const resp = await fetch("/api/tasks");
    const tasks = await resp.json();
    
    const myTasks = tasks; // already filtered by role in backend
    document.getElementById("emp-kpi-total-tasks").textContent = myTasks.length;
    document.getElementById("emp-kpi-pending-tasks").textContent = myTasks.filter(t => t.status !== "Completed").length;
    document.getElementById("emp-kpi-completed-tasks").textContent = myTasks.filter(t => t.status === "Completed").length;
    
    // Render Today's tasks
    const container = document.getElementById("emp-today-tasks");
    const pendingToday = myTasks.filter(t => t.status !== "Completed");
    if (pendingToday.length === 0) {
      container.innerHTML = `<p class="empty-state">No pending tasks assigned to you.</p>`;
    } else {
      container.innerHTML = pendingToday.map(t => {
        return `
          <div class="simple-task-row">
            <span><strong>${esc(t.task_name)}</strong> <span class="badge badge-${t.priority}" style="margin-left:8px">${t.priority}</span></span>
            <span style="font-size:12px;color:var(--text-muted)">Due: ${t.deadline || "N/A"}</span>
          </div>
        `;
      }).join("");
    }
    
    // Notifications list
    loadNotificationsList();
  } catch (e) {
    console.error(e);
  }
}

async function loadEmployeeTasks() {
  try {
    const resp = await fetch("/api/tasks");
    const tasks = await resp.json();
    const container = document.getElementById("emp-tasks-container");
    
    if (tasks.length === 0) {
      container.innerHTML = `<div class="empty-state">No sprint tasks allocated to your account.</div>`;
      return;
    }
    
    container.innerHTML = tasks.map(t => {
      return `
        <div class="glass card" style="padding:24px;margin-bottom:16px">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px">
            <span class="badge badge-${t.priority}">${t.priority}</span>
            <span class="badge badge-${t.status.replace(" ", "")}">${t.status}</span>
          </div>
          <h3>${esc(t.task_name)}</h3>
          <p style="color:var(--text-sub);font-size:13.5px;margin-top:8px">${esc(t.description || "No description context provided.")}</p>
          <div style="margin-top:15px; font-size:12px; color:var(--text-muted)">
            <div><strong>Hours Allotted:</strong> ${t.estimated_hours} hrs</div>
            <div><strong>Due Date:</strong> ${t.deadline || "N/A"}</div>
          </div>
          
          <div style="display:flex; gap:10px; margin-top:20px; border-top:1px solid var(--border-color); padding-top:16px">
            ${t.status === "To Do" ? `<button class="btn btn-primary btn-sm" onclick="updateTaskState('${t.id}', 'In Progress')">Start Task</button>` : ""}
            ${t.status === "In Progress" ? `<button class="btn btn-secondary btn-sm" onclick="updateTaskState('${t.id}', 'Review')">Request Review</button>` : ""}
            ${t.status !== "Completed" ? `<button class="btn btn-primary btn-sm" onclick="openDeliverableUploadModal('${t.id}')">Upload Deliverable / Complete</button>` : ""}
            <button class="btn btn-secondary btn-sm" onclick="requestTaskHelp('${t.id}')">Request Help</button>
          </div>
        </div>
      `;
    }).join("");
  } catch (e) {
    console.error(e);
  }
}

async function updateTaskState(taskId, state) {
  try {
    const resp = await fetch(`/api/tasks/${taskId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: state })
    });
    if (resp.ok) {
      loadEmployeeTasks();
      showAlert(`Task updated to ${state}.`, "success");
    }
  } catch (e) {
    console.error(e);
  }
}

async function requestTaskHelp(taskId) {
  showAlert("Help request ticket dispatched to Project Manager.", "info");
}

// ──────────────────────────────────────────────
// EMPLOYEE PROFILE MANAGEMENT
// ──────────────────────────────────────────────
async function loadEmployeeProfile() {
  try {
    const resp = await fetch(`/api/employees/${currentUser.id}`);
    if (!resp.ok) {
      // Create empty profile view if profile not found
      return;
    }
    const emp = await resp.json();
    
    document.getElementById("emp-prof-photo").src = emp.photo;
    document.getElementById("emp-prof-name").textContent = emp.name;
    document.getElementById("emp-prof-dept").textContent = emp.department;
    document.getElementById("emp-prof-avail").textContent = `${100 - emp.current_workload}%`;
    document.getElementById("emp-prof-workload").textContent = `${emp.current_workload}%`;
    document.getElementById("emp-prof-exp").textContent = `${emp.experience} years`;
    
    const skillsList = document.getElementById("emp-prof-skills-list");
    const skillsArr = emp.skills ? emp.skills.split(";").filter(Boolean) : [];
    skillsList.innerHTML = skillsArr.map(s => `<span class="badge badge-default">${esc(s)}</span>`).join("");
    
    const certsList = document.getElementById("emp-prof-certs-list");
    const certsArr = emp.certifications || [];
    certsList.innerHTML = certsArr.map(c => `<li><i class="fa-solid fa-award text-amber" style="margin-right:8px"></i> ${esc(c)}</li>`).join("");
  } catch(e) {
    console.error(e);
  }
}

async function addEmployeeSkill() {
  const input = document.getElementById("add-skill-input");
  const skill = input.value.trim();
  if (!skill) return;
  
  try {
    // Get current skills list
    const resp = await fetch(`/api/employees/${currentUser.id}`);
    const emp = await resp.json();
    
    let skillsArr = emp.skills ? emp.skills.split(";").filter(Boolean) : [];
    if (skillsArr.includes(skill)) return;
    skillsArr.push(skill);
    const skillsStr = skillsArr.join(";");
    
    const upd = await fetch(`/api/employees/${currentUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills: skillsStr })
    });
    
    if (upd.ok) {
      input.value = "";
      loadEmployeeProfile();
      showAlert("Skill added to profile.", "success");
    }
  } catch(e) {
    console.error(e);
  }
}

async function addEmployeeCert() {
  const input = document.getElementById("add-cert-input");
  const cert = input.value.trim();
  if (!cert) return;
  
  try {
    const resp = await fetch(`/api/employees/${currentUser.id}`);
    const emp = await resp.json();
    
    let certsArr = emp.certifications || [];
    if (certsArr.includes(cert)) return;
    certsArr.push(cert);
    
    const upd = await fetch(`/api/employees/${currentUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certifications: certsArr })
    });
    
    if (upd.ok) {
      input.value = "";
      loadEmployeeProfile();
      showAlert("Certification details uploaded successfully.", "success");
    }
  } catch(e) {
    console.error(e);
  }
}

// ──────────────────────────────────────────────
// CALENDAR PORTAL
// ──────────────────────────────────────────────
function loadCalendar() {
  const datesContainer = document.querySelector(".calendar-grid");
  // Clean dates first
  const dateElements = datesContainer.querySelectorAll(".calendar-date");
  dateElements.forEach(el => el.remove());
  
  // Render demo calendar dates
  for (let i = 1; i <= 31; i++) {
    const dateCard = document.createElement("div");
    dateCard.className = "calendar-date";
    if (i === 8) dateCard.classList.add("active");
    
    let eventHtml = "";
    if (i === 10) eventHtml = `<div class="date-event">Launch Chatbot</div>`;
    if (i === 15) eventHtml = `<div class="date-event">Migration Deadline</div>`;
    if (i === 20) eventHtml = `<div class="date-event">Sprint Sync</div>`;
    
    dateCard.innerHTML = `
      <span class="date-num">${i}</span>
      ${eventHtml}
    `;
    datesContainer.appendChild(dateCard);
  }
}

// ──────────────────────────────────────────────
// CHAT ENGINE
// ──────────────────────────────────────────────
function setupChatDrawer() {
  const chatInput = document.getElementById("chat-msg-input");
  
  // Set up polling for messages
  if (chatTimer) clearInterval(chatTimer);
  chatTimer = setInterval(() => {
    if (document.getElementById("chat-box-wrap").style.display === "flex") {
      fetchChatMessages();
    }
  }, 3000);
}

function toggleChatDrawer() {
  const wrap = document.getElementById("chat-box-wrap");
  const state = wrap.style.display;
  
  if (state === "none") {
    wrap.style.display = "flex";
    document.getElementById("chat-unread").style.display = "none";
    fetchChatMessages();
  } else {
    wrap.style.display = "none";
  }
}

async function fetchChatMessages() {
  if (!currentProject) return;
  try {
    const resp = await fetch(`/api/projects/${currentProject.project_id}/chat`);
    if (!resp.ok) return;
    const msgs = await resp.json();
    renderChatMessages(msgs);
  } catch (e) {
    console.error(e);
  }
}

function renderChatMessages(msgs) {
  const container = document.getElementById("chat-msg-list");
  const atBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 40;
  
  container.innerHTML = msgs.map(m => {
    const sideClass = m.user_id === currentUser.id ? "outgoing" : "incoming";
    return `
      <div class="chat-bubble ${sideClass}">
        <span class="chat-bubble-sender">${esc(m.user_name)} (${m.user_role.replace("_", " ")})</span>
        <span>${esc(m.message)}</span>
      </div>
    `;
  }).join("");
  
  if (atBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

async function sendChatMessage() {
  const input = document.getElementById("chat-msg-input");
  const msg = input.value.trim();
  if (!msg || !currentProject) return;
  
  try {
    const resp = await fetch(`/api/projects/${currentProject.project_id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg })
    });
    if (resp.ok) {
      input.value = "";
      fetchChatMessages();
    }
  } catch (e) {
    console.error(e);
  }
}

// ──────────────────────────────────────────────
// AUDIT LOG FEED
// ──────────────────────────────────────────────
async function loadAuditLogs() {
  try {
    const resp = await fetch("/api/audit-logs");
    if (!resp.ok) return;
    const logs = await resp.json();
    
    const tbody = document.getElementById("audit-table-body");
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No audits logged.</td></tr>`;
      return;
    }
    
    tbody.innerHTML = logs.map(l => {
      return `
        <tr>
          <td style="color:var(--text-muted)">${new Date(l.created_at).toLocaleString()}</td>
          <td><strong>${l.action}</strong></td>
          <td style="color:var(--text-sub)">${esc(l.details)}</td>
          <td>${l.user_email}</td>
        </tr>
      `;
    }).join("");
  } catch (e) {
    console.error(e);
  }
}

// ──────────────────────────────────────────────
// ADMIN USER MANAGEMENT
// ──────────────────────────────────────────────
async function loadAdminUsers() {
  try {
    const resp = await fetch("/api/admin/users");
    if (!resp.ok) return;
    allUsers = await resp.json();
    renderUsersTable(allUsers);
  } catch (e) {
    console.error(e);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById("users-table-body");
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No users in database.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = users.map(u => {
    return `
      <tr>
        <td style="font-weight:700">${esc(u.full_name)}</td>
        <td>${esc(u.email)}</td>
        <td><span class="badge badge-default" style="text-transform:capitalize">${u.role.replace("_", " ")}</span></td>
        <td>
          <div style="display:flex; gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="openEditUserModal('${u.id}')"><i class="fa-regular fa-pen-to-square"></i></button>
            <button class="btn btn-logout btn-sm" onclick="deleteUser('${u.id}')"><i class="fa-regular fa-trash-can"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function filterUsers() {
  const query = document.getElementById("user-search").value.toLowerCase();
  const filtered = allUsers.filter(u => u.full_name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query));
  renderUsersTable(filtered);
}

// ──────────────────────────────────────────────
// NOTIFICATIONS SYSTEM
// ──────────────────────────────────────────────
function setupNotifications() {
  const notifBtn = document.getElementById("notif-btn");
  const panel = document.getElementById("notif-dropdown");
  
  notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("active");
    if (panel.classList.contains("active")) {
      loadNotificationsList();
    }
  });
  
  document.addEventListener("click", () => {
    panel.classList.remove("active");
  });
  
  // Polling notifications
  if (notifTimer) clearInterval(notifTimer);
  notifTimer = setInterval(loadNotificationsList, 5000);
}

async function loadNotificationsList() {
  try {
    const resp = await fetch("/api/notifications");
    if (!resp.ok) return;
    const notifs = await resp.json();
    
    // Update Badge
    const unread = notifs.filter(n => !n.is_read);
    const badge = document.getElementById("notif-badge");
    if (unread.length > 0) {
      badge.textContent = unread.length;
      badge.style.display = "flex";
      document.getElementById("chat-unread").style.display = "block";
    } else {
      badge.style.display = "none";
    }
    
    const container = document.getElementById("notif-list");
    const sidebarFeed = document.getElementById("emp-notif-feed");
    
    if (notifs.length === 0) {
      const empty = `<p class="empty-state">No new notifications</p>`;
      container.innerHTML = empty;
      if (sidebarFeed) sidebarFeed.innerHTML = empty;
      return;
    }
    
    const listHtml = notifs.map(n => {
      return `
        <div class="dropdown-item ${n.is_read ? '' : 'unread'}" onclick="markNotifRead('${n.id}')">
          <div class="dropdown-item-title">${esc(n.title)}</div>
          <div class="dropdown-item-desc">${esc(n.message)}</div>
        </div>
      `;
    }).join("");
    
    container.innerHTML = listHtml;
    if (sidebarFeed) sidebarFeed.innerHTML = listHtml;
    
  } catch (e) {
    console.error(e);
  }
}

async function markNotifRead(id) {
  try {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    loadNotificationsList();
  } catch (e) {
    console.error(e);
  }
}

async function markAllNotificationsRead() {
  try {
    const resp = await fetch("/api/notifications");
    const notifs = await resp.json();
    for (let n of notifs) {
      if (!n.is_read) {
        await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
      }
    }
    loadNotificationsList();
    showAlert("All notifications marked as read.", "success");
  } catch (e) {
    console.error(e);
  }
}

// ──────────────────────────────────────────────
// MODAL DIALOG CRUD HANDLERS
// ──────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add("active");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

// Project Create/Edit
function openCreateProjectModal() {
  document.getElementById("proj-form").reset();
  document.getElementById("proj-form-id").value = "";
  document.getElementById("proj-modal-title").textContent = "Create New Project";
  openModal("proj-modal");
}

function openEditProjectModal(id) {
  const p = allProjects.find(p => p.project_id === id);
  if (!p) return;
  
  document.getElementById("proj-form-id").value = p.project_id;
  document.getElementById("proj-form-name").value = p.project_name;
  document.getElementById("proj-form-desc").value = p.description;
  document.getElementById("proj-form-deadline").value = p.deadline_days;
  document.getElementById("proj-form-priority").value = p.priority;
  document.getElementById("proj-form-duration").value = p.estimated_duration;
  document.getElementById("proj-form-budget").value = p.budget;
  document.getElementById("proj-form-skills").value = p.required_skills;
  document.getElementById("proj-form-roles").value = p.preferred_roles ? p.preferred_roles.join(", ") : "";
  document.getElementById("proj-form-teamsize").value = p.team_size;
  
  document.getElementById("proj-modal-title").textContent = "Edit Project details";
  openModal("proj-modal");
}

async function handleProjectSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("proj-form-id").value;
  const project_name = document.getElementById("proj-form-name").value.trim();
  const description = document.getElementById("proj-form-desc").value.trim();
  const deadline_days = parseInt(document.getElementById("proj-form-deadline").value) || 30;
  const priority = document.getElementById("proj-form-priority").value;
  const estimated_duration = document.getElementById("proj-form-duration").value.trim();
  const budget = document.getElementById("proj-form-budget").value.trim();
  const required_skills = document.getElementById("proj-form-skills").value.trim();
  const preferred_roles = document.getElementById("proj-form-roles").value.split(",").map(r => r.trim()).filter(Boolean);
  const team_size = parseInt(document.getElementById("proj-form-teamsize").value) || 2;
  
  const payload = { project_name, description, deadline_days, priority, estimated_duration, budget, required_skills, preferred_roles, team_size };
  
  try {
    let resp;
    if (id) { // Edit
      resp = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else { // Create
      resp = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    
    if (resp.ok) {
      closeModal("proj-modal");
      loadProjects();
      showAlert("Project details saved successfully.", "success");
    } else {
      const err = await resp.json();
      showAlert(err.error || "Failed to save project.", "error");
    }
  } catch(e) {
    console.error(e);
  }
}

async function archiveProject(id) {
  if (!confirm("Are you sure you want to archive this project?")) return;
  try {
    const resp = await fetch(`/api/projects/${id}/archive`, { method: "POST" });
    if (resp.ok) {
      loadProjects();
      showAlert("Project archived.", "info");
    }
  } catch (e) {
    console.error(e);
  }
}

async function deleteProject(id) {
  if (!confirm("Are you sure you want to permanently delete this project?")) return;
  try {
    const resp = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (resp.ok) {
      loadProjects();
      showAlert("Project deleted.", "success");
    }
  } catch (e) {
    console.error(e);
  }
}

// Employee Add/Edit
function openAddEmployeeModal() {
  document.getElementById("emp-form").reset();
  document.getElementById("emp-form-id").value = "";
  document.getElementById("emp-modal-title").textContent = "Add Employee Profile";
  openModal("emp-modal");
}

function openEditEmployeeModal(id) {
  const emp = allEmployees.find(e => e.employee_id === id);
  if (!emp) return;
  
  document.getElementById("emp-form-id").value = emp.employee_id;
  document.getElementById("emp-form-name").value = emp.name;
  document.getElementById("emp-form-email").value = emp.email;
  document.getElementById("emp-form-dept").value = emp.department;
  document.getElementById("emp-form-exp").value = emp.experience;
  document.getElementById("emp-form-workload").value = emp.current_workload;
  document.getElementById("emp-form-skills").value = emp.skills;
  document.getElementById("emp-form-certs").value = emp.certifications ? emp.certifications.join(", ") : "";
  
  document.getElementById("emp-modal-title").textContent = "Modify Employee Profile";
  openModal("emp-modal");
}

async function handleEmployeeSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("emp-form-id").value;
  const name = document.getElementById("emp-form-name").value.trim();
  const email = document.getElementById("emp-form-email").value.trim().toLowerCase();
  const department = document.getElementById("emp-form-dept").value;
  const experience = parseInt(document.getElementById("emp-form-exp").value) || 1;
  const current_workload = parseInt(document.getElementById("emp-form-workload").value) || 40;
  const skills = document.getElementById("emp-form-skills").value.trim();
  const certifications = document.getElementById("emp-form-certs").value.split(",").map(c => c.trim()).filter(Boolean);
  
  const payload = { name, email, department, experience, current_workload, skills, certifications };
  
  try {
    let resp;
    if (id) {
      resp = await fetch(`/api/employees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      resp = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    
    if (resp.ok) {
      closeModal("emp-modal");
      loadEmployees();
      showAlert("Employee record saved.", "success");
    } else {
      const err = await resp.json();
      showAlert(err.error || "Failed to save profile.", "error");
    }
  } catch (e) {
    console.error(e);
  }
}

async function removeEmployee(id) {
  if (!confirm("Are you sure you want to remove this employee profile?")) return;
  try {
    const resp = await fetch(`/api/employees/${id}`, { method: "DELETE" });
    if (resp.ok) {
      loadEmployees();
      showAlert("Employee removed from directory.", "success");
    }
  } catch (e) {
    console.error(e);
  }
}

// Upload CSV file
async function uploadCSV(input) {
  const file = input.files[0];
  if (!file) return;
  
  const formData = new FormData();
  formData.append("file", file);
  
  try {
    const resp = await fetch("/api/employees/import-csv", {
      method: "POST",
      body: formData
    });
    if (resp.ok) {
      const res = await resp.json();
      loadEmployees();
      showAlert(`Successfully imported ${res.count} employee profiles from CSV.`, "success");
    } else {
      showAlert("Failed to import CSV.", "error");
    }
  } catch(e) {
    console.error(e);
  }
}

// Task Create/Edit
function openCreateTaskModal() {
  document.getElementById("task-form").reset();
  document.getElementById("task-form-id").value = "";
  document.getElementById("task-modal-title").textContent = "Create Sprint Task";
  openModal("task-modal");
}

function openEditTaskModal(id) {
  const t = allTasks.find(t => t.id === id);
  if (!t) return;
  
  document.getElementById("task-form-id").value = t.id;
  document.getElementById("task-form-name").value = t.task_name;
  document.getElementById("task-form-desc").value = t.description;
  document.getElementById("task-form-assign").value = t.assigned_to || "";
  document.getElementById("task-form-priority").value = t.priority;
  document.getElementById("task-form-deadline").value = t.deadline;
  document.getElementById("task-form-hours").value = t.estimated_hours;
  
  document.getElementById("task-modal-title").textContent = "Edit Sprint Task Details";
  openModal("task-modal");
}

async function handleTaskSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("task-form-id").value;
  const project_id = document.getElementById("kanban-project-select").value;
  const task_name = document.getElementById("task-form-name").value.trim();
  const description = document.getElementById("task-form-desc").value.trim();
  const assigned_to = document.getElementById("task-form-assign").value || null;
  const priority = document.getElementById("task-form-priority").value;
  const deadline = document.getElementById("task-form-deadline").value;
  const estimated_hours = parseInt(document.getElementById("task-form-hours").value) || 8;
  
  const payload = { project_id, task_name, description, assigned_to, priority, deadline, estimated_hours };
  
  try {
    let resp;
    if (id) {
      resp = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      resp = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    
    if (resp.ok) {
      closeModal("task-modal");
      loadProjectTasks(project_id);
      showAlert("Task saved.", "success");
    } else {
      showAlert("Failed to save task.", "error");
    }
  } catch(e) {
    console.error(e);
  }
}

async function deleteTask(id) {
  if (!confirm("Delete this task from sprint?")) return;
  try {
    const resp = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (resp.ok) {
      const projId = document.getElementById("kanban-project-select").value;
      loadProjectTasks(projId);
      showAlert("Task removed.", "success");
    }
  } catch(e) {
    console.error(e);
  }
}

// User CRUD (Admin Control Panel)
function openCreateUserModal() {
  document.getElementById("user-form").reset();
  document.getElementById("user-form-id").value = "";
  document.getElementById("user-modal-title").textContent = "Add System Access User";
  document.getElementById("user-form-pass").required = true;
  openModal("user-modal");
}

function openEditUserModal(id) {
  const u = allUsers.find(user => user.id === id);
  if (!u) return;
  
  document.getElementById("user-form-id").value = u.id;
  document.getElementById("user-form-name").value = u.full_name;
  document.getElementById("user-form-email").value = u.email;
  document.getElementById("user-form-role").value = u.role;
  document.getElementById("user-form-pass").required = false;
  
  document.getElementById("user-modal-title").textContent = "Edit User Controls";
  openModal("user-modal");
}

async function handleUserSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("user-form-id").value;
  const full_name = document.getElementById("user-form-name").value.trim();
  const email = document.getElementById("user-form-email").value.trim().toLowerCase();
  const role = document.getElementById("user-form-role").value;
  const password = document.getElementById("user-form-pass").value;
  
  const payload = { full_name, email, role };
  if (password) payload.password = password;
  
  try {
    let resp;
    if (id) {
      resp = await fetch(`/api/admin/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      resp = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    
    if (resp.ok) {
      closeModal("user-modal");
      loadAdminUsers();
      showAlert("User configurations saved successfully.", "success");
    } else {
      const err = await resp.json();
      showAlert(err.error || "Failed to save user.", "error");
    }
  } catch (e) {
    console.error(e);
  }
}

async function deleteUser(id) {
  if (!confirm("Are you sure you want to revoke this user's access?")) return;
  try {
    const resp = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (resp.ok) {
      loadAdminUsers();
      showAlert("User access revoked.", "success");
    }
  } catch (e) {
    console.error(e);
  }
}

// Deliverable upload modal triggers
function openDeliverableUploadModal(taskId) {
  document.getElementById("deliverable-form-task-id").value = taskId;
  document.getElementById("deliverable-file").value = "";
  document.getElementById("deliverable-comment").value = "";
  openModal("deliverable-modal");
}

async function handleDeliverableSubmit(e) {
  e.preventDefault();
  const taskId = document.getElementById("deliverable-form-task-id").value;
  const fileInput = document.getElementById("deliverable-file");
  const comment = document.getElementById("deliverable-comment").value.trim();
  
  const file = fileInput.files[0];
  if (!file) return;
  
  const formData = new FormData();
  formData.append("file", file);
  
  try {
    // 1. Upload file
    const fileResp = await fetch("/api/files/upload", {
      method: "POST",
      body: formData
    });
    
    if (!fileResp.ok) {
      showAlert("Failed to upload deliverable file.", "error");
      return;
    }
    
    const fileRecord = await fileResp.json();
    
    // 2. Complete task and set details
    const taskResp = await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "Completed",
        deliverable: fileRecord,
        comments: [{ user_name: currentUser.full_name, text: `Deliverable uploaded: ${fileRecord.filename}. Note: ${comment}`, created_at: new Date().toISOString() }]
      })
    });
    
    if (taskResp.ok) {
      closeModal("deliverable-modal");
      loadEmployeeTasks();
      showAlert("Sprint task successfully completed and deliverable archived.", "success");
    }
  } catch(e) {
    console.error(e);
  }
}

// ──────────────────────────────────────────────
// PDF EXPORT UTILITY
// ──────────────────────────────────────────────
async function downloadPDF() {
  if (!currentProject) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // Styling configurations
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(99, 102, 241); // Indigo theme color
  doc.text("AssignIQ Enterprise Project Report", 20, 25);
  
  doc.setLineWidth(0.5);
  doc.setDrawColor(99, 102, 241);
  doc.line(20, 30, 190, 30);
  
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  
  doc.text(`Project Name: ${currentProject.name}`, 20, 42);
  doc.text(`Priority Level: ${currentProject.priority.toUpperCase()}`, 20, 48);
  doc.text(`Sprint Deadline: ${currentProject.deadline || "N/A"}`, 20, 54);
  doc.text(`Target Budget: $${currentProject.budget || "N/A"}`, 20, 60);
  doc.text(`Team Allocation: ${currentProject.team_size} active resources`, 20, 66);
  
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text("Scope & Context", 20, 80);
  
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(71, 85, 105);
  const splitDesc = doc.splitTextToSize(currentProject.description || "No context description.", 170);
  doc.text(splitDesc, 20, 86);
  
  if (currentProject.ai_plan) {
    doc.addPage();
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(99, 102, 241);
    doc.text("AI Generation Plan Insights", 20, 25);
    doc.line(20, 29, 190, 29);
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text("Architecture Framework", 20, 40);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(71, 85, 105);
    doc.text(doc.splitTextToSize(currentProject.ai_plan.architecture || "Not available.", 170), 20, 46);
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text("Milestones & Phases", 20, 70);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(71, 85, 105);
    doc.text(doc.splitTextToSize(currentProject.ai_plan.timeline_summary || "Not available.", 170), 20, 76);
  }
  
  doc.save(`AssignIQ_${currentProject.name.replace(/\s+/g, '_')}_Report.pdf`);
  showAlert("PDF Report downloaded successfully.", "success");
}

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
function esc(str) {
  if (!str) return "";
  return str.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
