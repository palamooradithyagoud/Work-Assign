/**
 * AssignIQ v2 — Enterprise Workflow Engine
 * Complete multi-role project management JavaScript
 */

// ═══════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════
let currentUser     = null;
let currentProject  = null;     // project being worked on in PM workflow
let currentTeamId   = null;     // team being edited (lead selection)
let currentApprovalId = null;   // approval being reviewed by admin
let currentAIAssignments = [];  // AI assignments in review step
let replacingAssignmentIdx = -1;
let allProjects     = [];
let allEmployees    = [];
let allUsers        = [];
let notifInterval   = null;
let workloadChart   = null;

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const resp = await fetch('/api/auth/me');
    if (!resp.ok) { window.location.href = '/login'; return; }
    currentUser = await resp.json();
    initApp();
  } catch { window.location.href = '/login'; }
});

function initApp() {
  setupSidebar();
  setupTopbar();
  setupNotifications();
  setupGlobalListeners();
  const first = getDefaultView();
  switchView(first);
  loadViewData(first);
}

function getDefaultView() {
  switch (currentUser.role) {
    case 'admin':           return 'view-admin-overview';
    case 'project_manager': return 'view-pm-dashboard';
    case 'team_lead':       return 'view-tl-dashboard';
    default:                return 'view-emp-overview';
  }
}

// ═══════════════════════════════════════════════════
// SIDEBAR & TOPBAR
// ═══════════════════════════════════════════════════
function setupSidebar() {
  const roleNavMap = {
    admin:           'nav-admin',
    project_manager: 'nav-pm',
    team_lead:       'nav-tl',
    employee:        'nav-emp'
  };
  const navId = roleNavMap[currentUser.role];
  if (navId) document.getElementById(navId).style.display = 'block';

  // Username display
  document.getElementById('sidebar-username').textContent = currentUser.full_name || currentUser.email;
  document.getElementById('sidebar-role').textContent = currentUser.role.replace('_', ' ');
  const initial = (currentUser.full_name || 'U')[0].toUpperCase();
  document.getElementById('sidebar-initial').textContent = initial;

  // Nav item click routing
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchView(view);
      loadViewData(view);
    });
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });

  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
}

function setupTopbar() {
  const titles = {
    'view-admin-overview': 'Overview',
    'view-admin-projects': 'All Projects',
    'view-admin-approvals': 'Approvals',
    'view-admin-employees': 'Employees',
    'view-admin-users': 'User Management',
    'view-pm-dashboard': 'My Dashboard',
    'view-pm-projects': 'My Projects',
    'view-pm-workflow': 'Project Workflow',
    'view-tl-dashboard': 'Team Lead Dashboard',
    'view-tl-team': 'My Team',
    'view-tl-tasks': 'Sprint Tasks',
    'view-emp-overview': 'My Overview',
    'view-emp-tasks': 'My Tasks',
    'view-emp-profile': 'My Profile',
    'view-audit-logs': 'Audit Logs',
    'view-pm-employees': 'Employees'
  };
  window._viewTitles = titles;
}

function updateTopbarTitle(viewId) {
  document.getElementById('topbar-title').textContent = window._viewTitles[viewId] || 'AssignIQ';
}

function setupGlobalListeners() {
  // Notification panel toggle
  document.getElementById('notif-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('notif-panel').classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#notif-wrap')) document.getElementById('notif-panel').classList.remove('open');
  });
}

// ═══════════════════════════════════════════════════
// VIEW ROUTING
// ═══════════════════════════════════════════════════
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add('active');
    updateTopbarTitle(viewId);
  }
}

async function loadViewData(viewId) {
  switch (viewId) {
    case 'view-admin-overview':   await loadAdminOverview(); break;
    case 'view-admin-projects':   await loadAdminProjects(); break;
    case 'view-admin-approvals':  await loadApprovals(); break;
    case 'view-admin-employees':  await loadAdminEmployees(); break;
    case 'view-admin-users':      await loadUsers(); break;
    case 'view-audit-logs':       await loadAuditLogs('audit-tbody-pm'); break;
    case 'view-pm-dashboard':     await loadPMDashboard(); break;
    case 'view-pm-projects':      await loadPMProjects(); break;
    case 'view-pm-employees':     await loadEmployeeGrid('pm-emp-grid'); break;
    case 'view-tl-dashboard':     await loadTLDashboard(); break;
    case 'view-tl-team':          await loadTLTeam(); break;
    case 'view-tl-tasks':         await loadTLTasks(); break;
    case 'view-emp-overview':     await loadEmpOverview(); break;
    case 'view-emp-tasks':        await loadEmpTasks(); break;
    case 'view-emp-profile':      await loadEmpProfile(); break;
  }
}

// ═══════════════════════════════════════════════════
// ADMIN: OVERVIEW
// ═══════════════════════════════════════════════════
async function loadAdminOverview() {
  try {
    const [metricsResp, pendingResp] = await Promise.all([
      fetch('/api/metrics/v2'),
      fetch('/api/admin/pending-projects')
    ]);

    if (!metricsResp.ok || !pendingResp.ok) {
      console.error('Admin overview fetch failed', metricsResp.status, pendingResp.status);
      toast('Failed to load dashboard data.', 'error');
      return;
    }

    const metrics = await metricsResp.json();
    allProjects   = await pendingResp.json();   // use enriched list for pipeline too

    const k = metrics.kpis || {};
    document.getElementById('kpi-total-projects').textContent    = k.total_projects    ?? allProjects.length;
    document.getElementById('kpi-active-projects').textContent   = k.active_projects   ?? allProjects.filter(p => p.workflow_status === 'active').length;
    document.getElementById('kpi-pending-approvals').textContent = allProjects.filter(p => p.workflow_status === 'awaiting_admin_approval').length;
    document.getElementById('kpi-total-employees').textContent   = k.total_employees   ?? '—';
    document.getElementById('kpi-total-teams').textContent       = k.total_teams       ?? '—';
    document.getElementById('kpi-avg-perf').textContent          = (k.avg_performance != null ? k.avg_performance + '%' : '—');

    // Update approval count badge in sidebar
    const pendingCount = allProjects.filter(p => p.workflow_status === 'awaiting_admin_approval').length;
    const badge = document.getElementById('approval-count-badge');
    if (badge) { badge.textContent = pendingCount; badge.style.display = pendingCount > 0 ? 'flex' : 'none'; }

    // Recent projects pipeline
    const recentProjs = allProjects.slice(-6).reverse();
    const projListEl  = document.getElementById('admin-projects-list');
    if (projListEl) {
      if (recentProjs.length === 0) {
        projListEl.innerHTML = `<div class="empty-state" style="padding:24px"><i class="fa-solid fa-folder-open"></i><p>No projects yet. Click <strong>New Project</strong> to get started.</p></div>`;
      } else {
        projListEl.innerHTML = recentProjs.map(p => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.project_name)}</div>
              <div style="font-size:11px;color:var(--text-muted)">${esc(p.client || '—')} • PM: ${esc(p.assigned_pm || 'Unassigned')}</div>
            </div>
            <span class="badge ${wsBadgeClass(p.workflow_status)}">${wsLabel(p.workflow_status)}</span>
            <span class="badge priority-${p.priority}">${p.priority || '—'}</span>
          </div>
        `).join('');
      }
    }

    // Plan approvals widget — projects waiting for Admin sign-off
    const appWidget = document.getElementById('admin-approvals-widget');
    if (appWidget) {
      const awaitingPlans = allProjects.filter(p => p.workflow_status === 'awaiting_admin_approval');
      if (awaitingPlans.length === 0) {
        appWidget.innerHTML = `<div class="empty-state" style="padding:20px"><i class="fa-regular fa-circle-check"></i><p>No pending plan approvals</p></div>`;
      } else {
        appWidget.innerHTML = awaitingPlans.slice(0, 4).map(p => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openApprovalDetail('${p.project_id}')">
            <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#6C63FF,#4F9AFF);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0">${esc(p.project_name)[0]}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.project_name)}</div>
              <div style="font-size:11px;color:var(--text-muted)">PM: ${esc(p.assigned_pm || '—')} • Awaiting your approval</div>
            </div>
            <span class="badge badge-amber">Review</span>
          </div>
        `).join('');
      }
    }
  } catch(e) {
    console.error('loadAdminOverview error:', e);
    toast('Error loading admin overview.', 'error');
  }
}

function renderWorkloadChart(data) {
  const ctx = document.getElementById('chart-workload');
  if (!ctx) return;
  if (workloadChart) workloadChart.destroy();
  const topN = data.slice(0, 8);
  workloadChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topN.map(d => d.name.split(' ')[0]),
      datasets: [{
        data: topN.map(d => d.workload),
        backgroundColor: topN.map(d => d.workload > 70 ? '#EF444466' : d.workload > 50 ? '#F59E0B66' : '#10B98166'),
        borderColor:     topN.map(d => d.workload > 70 ? '#EF4444'  : d.workload > 50 ? '#F59E0B'  : '#10B981'),
        borderWidth: 2,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8B8FAE', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8B8FAE', font: { size: 10 } }, max: 100 }
      }
    }
  });
}

// ═══════════════════════════════════════════════════
// ADMIN: ALL PROJECTS TABLE
// ═══════════════════════════════════════════════════
async function loadAdminProjects() {
  try {
    const resp = await fetch('/api/projects');
    allProjects = await resp.json();
    renderProjectsTable(allProjects);
  } catch(e) { console.error(e); }
}

function renderProjectsTable(projects) {
  const tbody = document.getElementById('admin-projects-tbody');
  if (projects.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:40px"><i class="fa-solid fa-folder-open"></i><p>No projects found</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = projects.map(p => `
    <tr>
      <td>
        <div style="font-weight:700;font-size:13px">${esc(p.project_name)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${esc(p.description || '').substring(0,50)}…</div>
      </td>
      <td class="td-muted">${esc(p.client || '—')}</td>
      <td><span class="badge priority-${p.priority}">${p.priority}</span></td>
      <td class="td-muted">${esc(p.assigned_pm || '—')}</td>
      <td><span class="badge ${wsBadgeClass(p.workflow_status)}">${wsLabel(p.workflow_status)}</span></td>
      <td class="td-muted">${esc(p.budget || '—')}</td>
      <td class="td-muted" style="font-size:11px">${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openAdminProjectWorkflow('${p.project_id}')" data-tip="View Workflow"><i class="fa-solid fa-diagram-project"></i></button>
          <button class="btn btn-ghost btn-sm" style="color:var(--accent-red)" onclick="deleteProject('${p.project_id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterProjectsTable() {
  const q = document.getElementById('projects-search').value.toLowerCase();
  const s = document.getElementById('projects-filter-status').value;
  const filtered = allProjects.filter(p =>
    (!q || p.project_name.toLowerCase().includes(q) || (p.client || '').toLowerCase().includes(q)) &&
    (!s || (p.workflow_status || '') === s)
  );
  renderProjectsTable(filtered);
}

async function deleteProject(id) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  toast('Project deleted.', 'success');
  loadAdminProjects();
}

function openAdminProjectWorkflow(projId) {
  // Admin can view workflow state
  currentProject = allProjects.find(p => p.project_id === projId);
  switchView('view-pm-workflow');
  loadWorkflowView(projId, true);
}

// ═══════════════════════════════════════════════════
// ADMIN: APPROVALS
// ═══════════════════════════════════════════════════
async function loadApprovals() {
  try {
    const filter = document.getElementById('approval-filter')?.value || '';
    const resp = await fetch(`/api/admin/pending-projects${filter ? '?status=' + filter : ''}`);
    const projects = await resp.json();
    const container = document.getElementById('approvals-list');
    
    // Update badge count
    const pendingCount = projects.filter(p => p.workflow_status === 'awaiting_admin_approval').length;
    const badge = document.getElementById('approval-count-badge');
    if (badge) {
      badge.textContent = pendingCount;
      badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    }

    if (projects.length === 0) {
      container.innerHTML = `<div class="empty-state card"><i class="fa-solid fa-shield-check" style="font-size:48px;color:var(--text-muted)"></i><h3>No Pending Plans</h3><p>No project execution plans awaiting review.</p></div>`;
      return;
    }

    container.innerHTML = projects.map(p => `
      <div class="approval-card ${p.workflow_status === 'awaiting_admin_approval' ? 'pending' : p.workflow_status === 'approved' ? 'approved' : 'rejected'}">
        <div class="approval-header">
          <div>
            <div class="approval-title"><i class="fa-solid fa-folder-tree" style="color:var(--accent-purple)"></i> Project Plan: ${esc(p.project_name)}</div>
            <div class="approval-sub">Client: ${esc(p.client || '—')} • PM: ${esc(p.assigned_pm || '—')} • Priority: ${esc(p.priority)}</div>
          </div>
          <div>
            <span class="badge ${wsBadgeClass(p.workflow_status)}">${wsLabel(p.workflow_status)}</span>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <div style="font-size:12px; color:var(--text-muted)">Budget: ${esc(p.budget || '—')} • Duration: ${esc(p.estimated_duration || '—')}</div>
          <div>
            <button class="btn btn-primary btn-sm" onclick="openApprovalDetail('${p.project_id}')"><i class="fa-solid fa-magnifying-glass"></i> Review Plan & Decide</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch(e) { console.error(e); }
}

function openApprovalDetail(projId) {
  openModal('modal-approval-detail');
  fetchAndRenderApprovalDetail(projId);
}

async function fetchAndRenderApprovalDetail(projId) {
  const body = document.getElementById('approval-detail-body');
  const footer = document.getElementById('approval-detail-footer');
  body.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
  footer.style.display = 'none';

  try {
    const resp = await fetch(`/api/projects/${projId}/workflow`);
    const data = await resp.json();
    currentProject = data.project;

    const plan = data.project.ai_plan || {};
    const assignments = plan.assignments || [];

    let planSectionsHtml = aiPlanSectionsKeys.map(s => {
      const val = plan[s.key] || "";
      let sectionValText = "";
      if (Array.isArray(val)) {
        sectionValText = val.map(v => `• ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('<br/>');
      } else if (typeof val === 'object') {
        sectionValText = Object.entries(val).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join('<br/>');
      } else {
        sectionValText = val;
      }
      return `
        <div style="margin-bottom:12px; padding:10px; border-bottom:1px solid var(--border)">
          <div style="font-weight:700; font-size:12px; color:var(--text-secondary); margin-bottom:4px;">${s.label}</div>
          <div style="font-size:13px; color:var(--text-muted); line-height:1.4;">${sectionValText || '<em>No plan details.</em>'}</div>
        </div>
      `;
    }).join('');

    let assignmentsHtml = assignments.map(a => `
      <div style="border: 1px solid var(--border); border-radius:6px; padding:10px; margin-bottom:8px; background:rgba(255,255,255,0.01);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:700; font-size:13px;">${esc(a.employee_name)}</div>
          <div style="font-size:11px; color:var(--accent-purple); font-weight:700;">Fit Match Score: ${a.confidence_score}%</div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Role: ${esc(a.assigned_role)} • Module: ${esc(a.assigned_module)}</div>
        <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;"><strong>Selection Reason:</strong> ${esc(a.reason_for_selection)}</div>
      </div>
    `).join('') || `<div style="font-size:12px; color:var(--text-muted);">No employees assigned.</div>`;

    body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card" style="padding:14px; background:rgba(255,255,255,0.01)">
          <h4 style="font-weight:800; font-size:14px; margin-bottom:8px; color:var(--accent-purple)"><i class="fa-solid fa-wand-magic-sparkles"></i> 23-Section Execution Plan Details</h4>
          ${planSectionsHtml}
        </div>
        <div class="card" style="padding:14px; background:rgba(255,255,255,0.01)">
          <h4 style="font-weight:800; font-size:14px; margin-bottom:8px; color:var(--accent-green)"><i class="fa-solid fa-users"></i> AI Team Assignment Fit Matrix</h4>
          ${assignmentsHtml}
        </div>
      </div>
    `;

    if (data.project.workflow_status === 'awaiting_admin_approval') {
      footer.style.display = 'flex';
    } else {
      footer.style.display = 'none';
      const feedback = data.project.pm_comment ? `<div style="font-size:12px; color:var(--accent-red); margin-top:6px;"><strong>Feedback Log:</strong> ${esc(data.project.pm_comment)}</div>` : '';
      body.innerHTML += `
        <div class="badge ${wsBadgeClass(data.project.workflow_status)}" style="font-size:13px; padding:8px 16px; margin-top:12px;">Decision: ${wsLabel(data.project.workflow_status)}</div>
        ${feedback}
      `;
    }
  } catch(e) {
    console.error(e);
    body.innerHTML = `<div class="empty-state"><p>Error fetching plan details.</p></div>`;
  }
}

async function decideApproval(decision) {
  const comment = document.getElementById('approval-comment-input').value.trim();
  if (decision === 'reject' && !comment) { toast('Please add a comment when rejecting.', 'warning'); return; }
  try {
    await fetch(`/api/lead-approvals/${currentApprovalId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, comment })
    });
    toast(`Lead ${decision}d successfully!`, decision === 'approve' ? 'success' : 'error');
    closeModal('modal-approval-detail');
    loadApprovals();
    loadAdminOverview();
  } catch(e) { console.error(e); }
}

async function quickApprove(approvalId) {
  await fetch(`/api/lead-approvals/${approvalId}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'approve', comment: 'Approved by Admin.' })
  });
  toast('Lead approved!', 'success');
  loadApprovals();
  loadAdminOverview();
}

// ═══════════════════════════════════════════════════
// ADMIN: EMPLOYEES
// ═══════════════════════════════════════════════════
async function loadAdminEmployees() {
  try {
    const resp = await fetch('/api/employees');
    allEmployees = await resp.json();
    renderEmpGrid('admin-emp-grid', allEmployees);
  } catch(e) { console.error(e); }
}

function filterAdminEmployees() {
  const q = document.getElementById('admin-emp-search').value.toLowerCase();
  const filtered = allEmployees.filter(e =>
    e.name.toLowerCase().includes(q) ||
    (e.skills || '').toLowerCase().includes(q) ||
    (e.department || '').toLowerCase().includes(q)
  );
  renderEmpGrid('admin-emp-grid', filtered);
}

function renderEmpGrid(containerId, employees) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (employees.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-users"></i><p>No employees found</p></div>`;
    return;
  }
  container.innerHTML = employees.map(e => {
    const skillsArr = (e.skills || '').split(';').filter(Boolean);
    const wl = e.current_workload || 0;
    const wlClass = wl > 70 ? 'workload-high' : wl > 50 ? 'workload-medium' : 'workload-low';
    return `
      <div class="emp-card">
        <img class="emp-avatar-lg" src="${e.photo || ''}" alt="${esc(e.name)}"
          onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(e.name)}&background=6C63FF&color=fff'"/>
        <div class="emp-name">${esc(e.name)}</div>
        <div class="emp-title">${esc(e.role || '—')}</div>
        <div class="emp-dept">${esc(e.department || '—')}</div>
        <div class="emp-stats">
          <div class="emp-stat"><div class="emp-stat-val">${e.experience || 0}y</div><div class="emp-stat-lbl">Exp</div></div>
          <div class="emp-stat"><div class="emp-stat-val" style="color:var(--accent-green)">${e.performance_score || 0}%</div><div class="emp-stat-lbl">Perf</div></div>
          <div class="emp-stat"><div class="emp-stat-val">${e.completed_projects || 0}</div><div class="emp-stat-lbl">Done</div></div>
        </div>
        <div class="workload-bar w-full">
          <div class="workload-track" style="flex:1"><div class="workload-fill ${wlClass}" style="width:${wl}%"></div></div>
          <div class="workload-pct" style="color:${wl>70?'var(--accent-red)':wl>50?'var(--accent-amber)':'var(--accent-green)'}">${wl}%</div>
        </div>
        <div class="emp-skills">
          ${skillsArr.slice(0,3).map(s => `<span class="skill-chip">${esc(s)}</span>`).join('')}
          ${skillsArr.length > 3 ? `<span class="skill-chip">+${skillsArr.length - 3}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function loadEmployeeGrid(containerId) {
  try {
    const resp = await fetch('/api/employees');
    allEmployees = await resp.json();
    renderEmpGrid(containerId, allEmployees);
  } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════════════
// ADMIN: USERS
// ═══════════════════════════════════════════════════
async function loadUsers() {
  try {
    const resp = await fetch('/api/admin/users');
    allUsers = await resp.json();
    renderUsersTable(allUsers);
  } catch(e) { console.error(e); }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td style="font-weight:700">${esc(u.full_name)}</td>
      <td class="td-muted">${esc(u.email)}</td>
      <td><span class="badge badge-purple" style="text-transform:capitalize">${u.role.replace('_',' ')}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" style="color:var(--accent-red)" onclick="deleteUser('${u.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function filterUsers() {
  const q = document.getElementById('user-search').value.toLowerCase();
  const filtered = allUsers.filter(u => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  renderUsersTable(filtered);
}

async function createUser() {
  const name = document.getElementById('cu-name').value.trim();
  const email = document.getElementById('cu-email').value.trim();
  const pass = document.getElementById('cu-pass').value.trim();
  const role = document.getElementById('cu-role').value;
  if (!name || !email || !pass) { toast('Please fill all required fields.', 'warning'); return; }
  try {
    const resp = await fetch('/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: name, email, password: pass, role })
    });
    if (resp.ok) {
      toast('User created!', 'success');
      closeModal('modal-create-user');
      loadUsers();
    } else {
      const err = await resp.json();
      toast(err.error || 'Failed to create user.', 'error');
    }
  } catch(e) { console.error(e); }
}

async function deleteUser(id) {
  if (!confirm('Delete this user?')) return;
  await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  toast('User deleted.', 'success');
  loadUsers();
}

// ═══════════════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════════════
async function loadAuditLogs(tbodyId) {
  try {
    const resp = await fetch('/api/audit-logs');
    const logs = await resp.json();
    const tbody = document.getElementById(tbodyId);
    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:32px"><p>No audit entries</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td style="font-size:11px;color:var(--text-muted);white-space:nowrap">${new Date(l.created_at).toLocaleString()}</td>
        <td><span class="badge badge-purple">${esc(l.action)}</span></td>
        <td style="font-size:12px;color:var(--text-secondary)">${esc(l.details)}</td>
        <td style="font-size:11px;color:var(--text-muted)">${esc(l.user_email || '—')}</td>
      </tr>
    `).join('');
  } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════════════
// CREATE PROJECT (Admin)
// ═══════════════════════════════════════════════════
async function loadPMsIntoDropdown() {
  try {
    const resp = await fetch('/api/users/project-managers');
    const pms = await resp.json();
    const sel = document.getElementById('cp-pm');
    sel.innerHTML = `<option value="">— Select Project Manager —</option>` +
      pms.map(pm => `<option value="${pm.id}">${esc(pm.full_name)}</option>`).join('');
  } catch(e) { console.error(e); }
}

async function createProject() {
  // Admin only provides: Name, Description, Client, Priority, Budget, Deadline, PM
  const name     = document.getElementById('cp-name').value.trim();
  const desc     = document.getElementById('cp-desc').value.trim();
  const client   = document.getElementById('cp-client').value.trim();
  const priority = document.getElementById('cp-priority').value;
  const budget   = document.getElementById('cp-budget').value.trim();
  const deadline = parseInt(document.getElementById('cp-deadline').value) || 60;
  const pm_id    = document.getElementById('cp-pm').value;

  if (!name || !desc || !client) {
    toast('Project Name, Description and Client are required.', 'warning');
    return;
  }
  if (!pm_id) {
    toast('Please select a Project Manager.', 'warning');
    return;
  }

  try {
    const resp = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_name: name,
        description:  desc,
        client,
        priority,
        budget:          budget || null,
        deadline_days:   deadline,
        workflow_status: 'pending_pm',
        created_by:      currentUser.id
      })
    });
    if (!resp.ok) { toast('Failed to create project.', 'error'); return; }
    const proj = await resp.json();

    // Assign PM — PM gets notified automatically
    await fetch(`/api/projects/${proj.project_id}/assign-pm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pm_id })
    });

    toast('Project created & PM notified!', 'success');
    closeModal('modal-create-project');
    // Clear form
    ['cp-name','cp-desc','cp-client','cp-budget'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    loadAdminProjects();
    loadAdminOverview();
  } catch(e) { console.error(e); toast('Error creating project.', 'error'); }
}

// ═══════════════════════════════════════════════════
// PM: DASHBOARD
// ═══════════════════════════════════════════════════
async function loadPMDashboard() {
  const greeting = document.getElementById('pm-greeting');
  if (greeting) greeting.textContent = `Good day, ${currentUser.full_name?.split(' ')[0] || 'PM'}`;
  try {
    const projResp = await fetch('/api/projects');
    const myProjects = await projResp.json();

    document.getElementById('pm-kpi-total').textContent   = myProjects.length;
    document.getElementById('pm-kpi-pending').textContent = myProjects.filter(p => p.workflow_status === 'pending_pm').length;
    document.getElementById('pm-kpi-active').textContent  = myProjects.filter(p => p.workflow_status === 'active').length;
    document.getElementById('pm-kpi-teams').textContent   = '—';

    // Action required items
    const actionEl = document.getElementById('pm-action-required');
    const needAction = myProjects.filter(p => p.workflow_status === 'pending_pm');
    if (needAction.length > 0) {
      actionEl.innerHTML = `
        <div class="card" style="border-left:4px solid var(--accent-amber);margin-bottom:0">
          <div class="card-header">
            <div class="card-title"><i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-amber)"></i> Action Required</div>
          </div>
          ${needAction.map(p => `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
              <span class="badge badge-amber">Review Needed</span>
              <span style="flex:1;font-weight:700">${esc(p.project_name)}</span>
              <button class="btn btn-primary btn-sm" onclick="openWorkflow('${p.project_id}')">Review <i class="fa-solid fa-arrow-right"></i></button>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      actionEl.innerHTML = '';
    }

    // Projects list
    const listEl = document.getElementById('pm-projects-list');
    if (myProjects.length === 0) {
      listEl.innerHTML = `<div class="empty-state" style="padding:32px"><i class="fa-solid fa-folder-open"></i><p>No projects assigned to you yet</p></div>`;
    } else {
      listEl.innerHTML = myProjects.map(p => `
        <div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:700">${esc(p.project_name)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${esc(p.client || '—')} • ${esc(p.required_skills || '').substring(0,40)}</div>
          </div>
          <span class="badge priority-${p.priority}">${p.priority}</span>
          <span class="badge ${wsBadgeClass(p.workflow_status)}">${wsLabel(p.workflow_status)}</span>
          <button class="btn btn-primary btn-sm" onclick="openWorkflow('${p.project_id}')"><i class="fa-solid fa-arrow-right"></i> Manage</button>
        </div>
      `).join('');
    }
  } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════════════
// PM: PROJECTS CARDS
// ═══════════════════════════════════════════════════
async function loadPMProjects() {
  const container = document.getElementById('pm-projects-cards');
  try {
    const resp = await fetch('/api/projects');
    const mine = await resp.json();
    if (mine.length === 0) {
      container.innerHTML = `<div class="empty-state card"><i class="fa-solid fa-folder-open"></i><h3>No Projects Assigned</h3><p>You haven't been assigned to any projects yet.</p></div>`;
      return;
    }
    container.innerHTML = mine.map(p => `
      <div class="card" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-size:16px;font-weight:800;margin-bottom:4px">${esc(p.project_name)}</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">${esc(p.description || '').substring(0,100)}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span class="badge priority-${p.priority}">${p.priority}</span>
            <span class="badge ${wsBadgeClass(p.workflow_status)}">${wsLabel(p.workflow_status)}</span>
            ${p.client ? `<span class="badge badge-blue">${esc(p.client)}</span>` : ''}
          </div>
        </div>
        <div class="info-list" style="min-width:160px">
          <div class="info-item"><span class="info-key">Budget</span><span class="info-val">${esc(p.budget || '—')}</span></div>
          <div class="info-item"><span class="info-key">Team Size</span><span class="info-val">${p.team_size || '—'}</span></div>
          <div class="info-item"><span class="info-key">Duration</span><span class="info-val">${esc(p.estimated_duration || '—')}</span></div>
        </div>
        <button class="btn btn-primary" onclick="openWorkflow('${p.project_id}')">
          <i class="fa-solid fa-diagram-project"></i> Manage Workflow
        </button>
      </div>
    `).join('');
  } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════════════
// PM / ADMIN: WORKFLOW VIEW
// ═══════════════════════════════════════════════════
async function openWorkflow(projId) {
  switchView('view-pm-workflow');
  await loadWorkflowView(projId, currentUser.role === 'admin');
}

async function loadWorkflowView(projId, isAdmin = false) {
  try {
    const resp = await fetch(`/api/projects/${projId}/workflow`);
    const data = await resp.json();
    currentProject = data.project;

    // Fill header
    document.getElementById('wf-proj-name').textContent     = currentProject.project_name;
    document.getElementById('wf-proj-desc').textContent     = currentProject.description || '';
    document.getElementById('wf-proj-priority').textContent = currentProject.priority || '—';
    document.getElementById('wf-proj-priority').className   = `badge priority-${currentProject.priority}`;
    document.getElementById('wf-proj-status').textContent   = wsLabel(currentProject.workflow_status);
    document.getElementById('wf-proj-status').className     = `badge ${wsBadgeClass(currentProject.workflow_status)}`;
    document.getElementById('wf-proj-client').textContent   = currentProject.client || '—';
    document.getElementById('wf-proj-budget').textContent   = currentProject.budget || '—';
    document.getElementById('wf-proj-duration').textContent = currentProject.estimated_duration || '—';
    document.getElementById('wf-proj-teamsize').textContent = currentProject.team_size || '—';
    document.getElementById('wf-proj-skills').textContent   = (currentProject.required_skills || '').replace(/;/g, ', ') || '—';

    updateWorkflowStepper(currentProject.workflow_status);
    showWorkflowPanel(currentProject, data, isAdmin);
  } catch(e) { console.error(e); toast('Error loading workflow.', 'error'); }
}

function updateWorkflowStepper(status) {
  const wsOrder = {
    'draft': 1,
    'pending_review': 1,
    'pending_pm': 1,
    'ai_planning': 3,
    'ai_assigned': 4,
    'pm_reviewing': 5,
    'awaiting_admin_approval': 6,
    'rejected': 6,
    'approved': 8,
    'active': 8
  };
  const current = wsOrder[status] || 1;
  for (let i = 1; i <= 8; i++) {
    const el = document.getElementById(`step-${i}`);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < current) el.classList.add('done');
    else if (i === current) el.classList.add('active');
  }
}

function showWorkflowPanel(proj, data, isAdmin) {
  const panels = ['wf-panel-review', 'wf-panel-ai-plan', 'wf-panel-ai', 'wf-panel-waiting', 'wf-panel-publish'];
  panels.forEach(p => { const el = document.getElementById(p); if (el) el.style.display = 'none'; });

  const ws = proj.workflow_status || 'draft';
  if (ws === 'draft' || ws === 'pending_review' || ws === 'pending_pm') {
    showPanel('wf-panel-review');
    populateReviewPanel(proj);
  } else if (ws === 'ai_planning') {
    showPanel('wf-panel-ai-plan');
    renderAIPlanEditor(proj.ai_plan || {});
  } else if (ws === 'ai_assigned' || ws === 'pm_reviewing') {
    showPanel('wf-panel-ai');
    currentAIAssignments = (proj.ai_plan || {}).assignments || [];
    renderReviewAssignments(currentAIAssignments);
  } else if (ws === 'awaiting_admin_approval' || ws === 'rejected') {
    showPanel('wf-panel-waiting');
    const waitingText = document.getElementById('waiting-status-text');
    if (ws === 'rejected') {
      waitingText.innerHTML = `<span style="color:var(--accent-red); font-weight:700">Project Plan Rejected by Admin.</span> Please review feedback below and re-submit.`;
      document.getElementById('admin-feedback-comment').textContent = proj.pm_comment || 'No feedback comment provided.';
      // Add edit/re-submit buttons
      waitingText.innerHTML += `<br/><br/><button class="btn btn-primary" onclick="replanProject()"><i class="fa-solid fa-redo"></i> Re-plan Project</button>`;
    } else {
      waitingText.textContent = "The project plan and team assignments have been submitted. Sarah Connor (Admin) has been notified.";
      document.getElementById('admin-feedback-comment').textContent = "Awaiting decision...";
    }
  } else if (ws === 'approved' || ws === 'active') {
    showPanel('wf-panel-publish');
    loadActiveSprintDashboard(proj.project_id);
  }
}

function showPanel(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function populateReviewPanel(proj) {
  const reqEl = document.getElementById('review-requirements');
  reqEl.innerHTML = `
    <div class="info-item"><span class="info-key">Client</span><span class="info-val">${esc(proj.client || '—')}</span></div>
    <div class="info-item"><span class="info-key">Priority</span><span class="info-val"><span class="badge priority-${proj.priority}">${proj.priority}</span></span></div>
    <div class="info-item"><span class="info-key">Budget</span><span class="info-val">${esc(proj.budget || '—')}</span></div>
    <div class="info-item"><span class="info-key">Deadline</span><span class="info-val">${proj.deadline_days || '—'} days</span></div>
    <div class="info-item"><span class="info-key">Status</span><span class="info-val">${esc(proj.workflow_status || '—')}</span></div>
  `;
}

// ═══════════════════════════════════════════════════
// STEP 2: AI PLAN GENERATION
// ═══════════════════════════════════════════════════
async function triggerAIAnalysis() {
  const btn = document.getElementById('btn-trigger-analysis');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Running AI Analysis…';
  }
  toast('Sending requirements to Groq Llama API...', 'info');
  try {
    const resp = await fetch(`/api/projects/${currentProject.project_id}/ai-plan`, {
      method: 'POST'
    });
    if (resp.ok) {
      toast('AI Plan generated successfully!', 'success');
      await loadWorkflowView(currentProject.project_id);
    } else {
      toast('Failed to analyze with AI.', 'error');
    }
  } catch(e) {
    console.error(e);
    toast('Network error — check connection.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Analyze with AI';
    }
  }
}

// ═══════════════════════════════════════════════════
// STEP 3: REVIEW & EDIT AI PLAN
// ═══════════════════════════════════════════════════
const aiPlanSectionsKeys = [
  { key: "project_summary", label: "Project Summary", type: "text" },
  { key: "project_objectives", label: "Project Objectives", type: "list" },
  { key: "project_scope", label: "Project Scope", type: "list" },
  { key: "functional_modules", label: "Functional Modules (System Modules)", type: "modules" },
  { key: "non_functional_requirements", label: "Non-functional Requirements", type: "list" },
  { key: "recommended_technology_stack", label: "Recommended Technology Stack", type: "tech" },
  { key: "security_recommendations", label: "Security Recommendations", type: "list" },
  { key: "estimated_team_size", label: "Estimated Team Size", type: "text" },
  { key: "recommended_roles", label: "Recommended Roles", type: "list" },
  { key: "number_of_teams_required", label: "Number of Teams Required", type: "number" },
  { key: "employees_per_team", label: "Employees per Team", type: "number" },
  { key: "estimated_timeline", label: "Estimated Timeline", type: "timeline" },
  { key: "estimated_cost", label: "Estimated Cost", type: "text" },
  { key: "potential_risks", label: "Potential Risks", type: "list" },
  { key: "risk_mitigation_plan", label: "Risk Mitigation Plan", type: "list" },
  { key: "project_complexity", label: "Project Complexity", type: "text" },
  { key: "priority_matrix", label: "Priority Matrix", type: "text" },
  { key: "expected_deliverables", label: "Expected Deliverables", type: "list" },
  { key: "success_metrics", label: "Success Metrics", type: "list" },
  { key: "testing_strategy", label: "Testing Strategy", type: "text" },
  { key: "deployment_strategy", label: "Deployment Strategy", type: "text" },
  { key: "maintenance_plan", label: "Maintenance Plan", type: "text" },
  { key: "project_documentation_checklist", label: "Project Documentation Checklist", type: "list" }
];

function renderAIPlanEditor(plan) {
  const container = document.getElementById('ai-plan-editor-sections');
  if (!container) return;

  container.innerHTML = aiPlanSectionsKeys.map((s, idx) => {
    const rawVal = plan[s.key] || "";
    let displayHtml = '';
    
    if (s.type === 'text' || s.type === 'number') {
      displayHtml = `<textarea class="form-control" rows="2" id="plan-input-${s.key}">${rawVal}</textarea>`;
    } else if (s.type === 'list') {
      const items = Array.isArray(rawVal) ? rawVal : [];
      displayHtml = `<textarea class="form-control" rows="3" id="plan-input-${s.key}" placeholder="One item per line">${items.join('\n')}</textarea>`;
    } else if (s.type === 'tech') {
      displayHtml = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div class="form-group"><label class="form-label">Frontend</label><input class="form-control" id="plan-tech-front" value="${rawVal.frontend_technologies || ''}"/></div>
          <div class="form-group"><label class="form-label">Backend</label><input class="form-control" id="plan-tech-back" value="${rawVal.backend_technologies || ''}"/></div>
          <div class="form-group"><label class="form-label">Database</label><input class="form-control" id="plan-tech-db" value="${rawVal.database || ''}"/></div>
          <div class="form-group"><label class="form-label">Cloud Services</label><input class="form-control" id="plan-tech-cloud" value="${rawVal.cloud_services || ''}"/></div>
          <div class="form-group"><label class="form-label">DevOps</label><input class="form-control" id="plan-tech-devops" value="${rawVal.devops_tools || ''}"/></div>
        </div>
      `;
    } else if (s.type === 'modules') {
      const mods = Array.isArray(rawVal) ? rawVal : [];
      displayHtml = mods.map((m, mIdx) => `
        <div style="border: 1px solid var(--border); padding:10px; border-radius:6px; margin-bottom:8px; display:flex; flex-direction:column; gap:6px;">
          <div style="font-weight:700">Module ${mIdx+1}</div>
          <div class="form-group"><label class="form-label">Name</label><input class="form-control" id="plan-mod-name-${mIdx}" value="${m.module_name || ''}"/></div>
          <div class="form-group"><label class="form-label">Description</label><input class="form-control" id="plan-mod-desc-${mIdx}" value="${m.description || ''}"/></div>
          <div class="form-group"><label class="form-label">Skills Required</label><input class="form-control" id="plan-mod-skills-${mIdx}" value="${m.required_skills || ''}"/></div>
        </div>
      `).join('') + `<button class="btn btn-secondary btn-sm" onclick="addModuleToAIPlan()"><i class="fa-solid fa-plus"></i> Add Module</button>`;
    } else if (s.type === 'timeline') {
      const phases = Array.isArray(rawVal.project_phases) ? rawVal.project_phases : [];
      displayHtml = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div class="form-group"><label class="form-label">Total Duration</label><input class="form-control" id="plan-timeline-total" value="${rawVal.total_duration || ''}"/></div>
          <div style="font-weight:700; margin-top:6px;">Phases:</div>
          ${phases.map((p, pIdx) => `
            <div style="display:flex; gap:10px;">
              <input class="form-control" style="flex:2" id="plan-timeline-phase-name-${pIdx}" value="${p.phase || ''}"/>
              <input class="form-control" style="flex:1" id="plan-timeline-phase-dur-${pIdx}" value="${p.duration || ''}"/>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="accordion-item" style="border:1px solid var(--border); border-radius:8px; overflow:hidden; margin-bottom: 8px;">
        <div class="accordion-header" onclick="toggleAccordion('acc-${s.key}')" style="background:rgba(255,255,255,0.02); padding:12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
          <span style="font-weight:700; font-size:13px;"><i class="fa-solid fa-chevron-right" id="icon-acc-${s.key}" style="margin-right:8px; transition:transform 0.2s;"></i> ${s.label}</span>
          <span style="font-size:11px; color:var(--text-muted)">Editable</span>
        </div>
        <div class="accordion-body" id="body-acc-${s.key}" style="display:none; padding:16px; border-top:1px solid var(--border)">
          ${displayHtml}
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px">
            <button class="btn btn-secondary btn-sm" style="color:var(--accent-red)" onclick="deletePlanSection('${s.key}')"><i class="fa-solid fa-trash"></i> Clear</button>
            <button class="btn btn-primary btn-sm" onclick="savePlanSection('${s.key}', ${idx})"><i class="fa-solid fa-save"></i> Save Section</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleAccordion(id) {
  const el = document.getElementById(`body-${id}`);
  const icon = document.getElementById(`icon-${id}`);
  if (el) {
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    if (icon) icon.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
  }
}

async function savePlanSection(key, idx) {
  const plan = currentProject.ai_plan || {};
  const s = aiPlanSectionsKeys[idx];

  if (s.type === 'text' || s.type === 'number') {
    plan[key] = document.getElementById(`plan-input-${key}`).value;
  } else if (s.type === 'list') {
    plan[key] = document.getElementById(`plan-input-${key}`).value.split('\n').map(l => l.trim()).filter(Boolean);
  } else if (s.type === 'tech') {
    plan[key] = {
      frontend_technologies: document.getElementById('plan-tech-front').value,
      backend_technologies: document.getElementById('plan-tech-back').value,
      database: document.getElementById('plan-tech-db').value,
      cloud_services: document.getElementById('plan-tech-cloud').value,
      devops_tools: document.getElementById('plan-tech-devops').value
    };
  } else if (s.type === 'modules') {
    const mods = plan[key] || [];
    mods.forEach((m, mIdx) => {
      m.module_name = document.getElementById(`plan-mod-name-${mIdx}`).value;
      m.description = document.getElementById(`plan-mod-desc-${mIdx}`).value;
      m.required_skills = document.getElementById(`plan-mod-skills-${mIdx}`).value;
    });
    plan[key] = mods;
  } else if (s.type === 'timeline') {
    const timeline = plan[key] || {};
    timeline.total_duration = document.getElementById('plan-timeline-total').value;
    const phases = timeline.project_phases || [];
    phases.forEach((p, pIdx) => {
      p.phase = document.getElementById(`plan-timeline-phase-name-${pIdx}`).value;
      p.duration = document.getElementById(`plan-timeline-phase-dur-${pIdx}`).value;
    });
    timeline.project_phases = phases;
    plan[key] = timeline;
  }

  // Update DB
  try {
    const resp = await fetch(`/api/projects/${currentProject.project_id}/ai-plan`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_plan: plan })
    });
    if (resp.ok) {
      toast(`${s.label} section saved!`, 'success');
      currentProject.ai_plan = plan;
    } else {
      toast('Failed to save section.', 'error');
    }
  } catch(e) { console.error(e); }
}

function deletePlanSection(key) {
  const plan = currentProject.ai_plan || {};
  if (Array.isArray(plan[key])) plan[key] = [];
  else if (typeof plan[key] === 'object') plan[key] = {};
  else plan[key] = "";
  
  toast('Section cleared locally. Click Save to apply.', 'warning');
  renderAIPlanEditor(plan);
}

function addModuleToAIPlan() {
  const plan = currentProject.ai_plan || {};
  if (!plan.functional_modules) plan.functional_modules = [];
  plan.functional_modules.push({
    module_name: "New Functional Module",
    description: "Brief module responsibility details...",
    required_skills: "Python;React;SQL",
    complexity: "Medium",
    duration: "2 weeks"
  });
  renderAIPlanEditor(plan);
}

async function approveAIPlan() {
  toast('AI Plan approved! Automatically triggering assignments engine...', 'info');
  await runFullAIAssignment();
}

// ═══════════════════════════════════════════════════
// STEP 4 & 5: AI EMPLOYEE TEAM ASSIGNMENTS
// ═══════════════════════════════════════════════════
async function runFullAIAssignment() {
  const btn = document.getElementById('btn-run-ai');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Generating Assignments…';
  }
  document.getElementById('ai-assignment-results').innerHTML =
    `<div class="empty-state"><div class="spinner spinner-lg"></div><p>AI Engine is analyzing employee dataset and forming modules teams…</p></div>`;

  try {
    const resp = await fetch(`/api/projects/${currentProject.project_id}/ai-assign-all`, {
      method: 'POST'
    });
    if (!resp.ok) {
      toast('AI assignment failed.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Team Assignment';
      }
      return;
    }
    const data = await resp.json();
    currentAIAssignments = data.assignments || [];
    toast(`AI successfully formed teams and assigned employees!`, 'success');
    await loadWorkflowView(currentProject.project_id);
  } catch(e) {
    console.error(e);
    toast('Error running assignment engine.', 'error');
  }
}

function renderReviewAssignments(assignments) {
  const container = document.getElementById('ai-assignment-results');
  if (!container) return;
  
  if (!assignments.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-robot"></i><p>No team assignments generated yet. Click 'Generate Team Assignment'.</p></div>`;
    const wrap = document.getElementById('pm-submit-admin-wrap');
    if (wrap) wrap.style.display = 'none';
    return;
  }

  // Build a lookup: globalIdx → assignment, keeping team grouping
  const byTeam = {};
  assignments.forEach((a, globalIdx) => {
    const key = a.team_name || "Unassigned Module Team";
    if (!byTeam[key]) byTeam[key] = [];
    byTeam[key].push({ ...a, _globalIdx: globalIdx });
  });

  const acceptedCount = assignments.filter(a => a.accepted).length;

  container.innerHTML = Object.entries(byTeam).map(([teamName, members]) => `
    <div class="card mb-16">
      <div class="card-header" style="background: rgba(255,255,255,0.01); padding: 12px 16px;">
        <div class="card-title"><i class="fa-solid fa-people-group"></i> ${esc(teamName)} — ${esc(members[0].assigned_module)}</div>
        <span class="badge badge-purple">${members.filter(m => m.accepted).length}/${members.length} Selected</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px; padding: 16px;">
        ${members.map((a) => {
          const gi = a._globalIdx;
          return `
          <div class="ai-decision-card" id="assign-card-${gi}" style="margin-bottom:0; border: 1px solid ${a.accepted ? 'var(--accent-green)' : 'var(--border)'}; padding: 16px; border-radius: 8px; background: ${a.accepted ? 'rgba(56,161,105,0.06)' : 'rgba(255,255,255,0.01)'}; transition: all 0.25s ease;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <div style="display:flex; gap:12px; align-items:center;">
                <img style="width:36px; height:36px; border-radius:50%; object-fit:cover;" src="https://ui-avatars.com/api/?name=${encodeURIComponent(a.employee_name)}&background=6C63FF&color=fff"/>
                <div>
                  <div style="font-weight:800; font-size:14px;">${esc(a.employee_name)}</div>
                  <div style="font-size:12px; color:var(--text-muted);">${esc(a.assigned_role)}</div>
                </div>
              </div>
              <div style="text-align:right">
                <div class="ai-metric-label">Performance</div>
                <div class="ai-metric-track"><div class="ai-metric-fill green" style="width:${a.performance || 85}%"></div></div>
                <div class="ai-metric-val">${a.performance || 85}%</div>
              </div>
            </div>

            <div class="ai-trace-list">
              ${(a.decision_trace || []).map(t => `<div class="ai-trace-item"><i class="fa-solid fa-check-circle"></i>${esc(t)}</div>`).join('')}
            </div>

            <div class="ai-card-actions" style="margin-top:12px;">
              ${a.accepted ? `
                <span class="badge badge-success" style="padding: 8px 16px; font-size:13px; border-radius: 8px; display:inline-flex; align-items:center; gap:6px;">
                  <i class="fa-solid fa-circle-check"></i> Selected
                </span>
              ` : `
                <button class="btn btn-ghost btn-sm" onclick="openReplaceModal(${gi}, '${a.team_id}')">
                  <i class="fa-solid fa-user-pen"></i> Replace
                </button>
                <button class="btn btn-success btn-sm" onclick="acceptAssignment(${gi})">
                  <i class="fa-solid fa-check"></i> Accept
                </button>
              `}
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
  `).join('');

  // Always show the Next button at the bottom after assignments load
  const wrap = document.getElementById('pm-submit-admin-wrap');
  if (wrap) {
    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px; padding: 20px; background: rgba(108,99,255,0.06); border: 1px solid rgba(108,99,255,0.2); border-radius: 12px; margin-top: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:800; font-size:15px; margin-bottom:4px;">Review Complete</div>
            <div style="font-size:13px; color:var(--text-secondary);">
              ${acceptedCount} of ${assignments.length} assignments confirmed. 
              ${acceptedCount < assignments.length ? `<span style="color:var(--accent-amber);">${assignments.length - acceptedCount} pending review.</span>` : `<span style="color:var(--accent-green);">All confirmed!</span>`}
            </div>
          </div>
          <button class="btn btn-primary" onclick="saveAndProceedPublish()" style="padding: 12px 28px; font-size:14px; display:flex; align-items:center; gap:8px;">
            Next <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;
  }
}

async function saveAndProceedPublish() {
  if (!currentAIAssignments.length) { toast('Run AI assignment first.', 'warning'); return; }
  
  const btn = document.querySelector('#pm-submit-admin-wrap button.btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Submitting…'; }
  
  try {
    // 1. Save assignments
    const saveResp = await fetch(`/api/projects/${currentProject.project_id}/save-assignments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: currentAIAssignments })
    });
    if (!saveResp.ok) { toast('Failed to save assignments.', 'error'); return; }

    // 2. Submit to admin for approval (advances workflow_status to awaiting_admin_approval)
    const submitResp = await fetch(`/api/projects/${currentProject.project_id}/submit-to-admin`, {
      method: 'POST'
    });
    if (!submitResp.ok) { toast('Failed to submit to admin.', 'error'); return; }

    toast('Plan submitted to Admin for approval! ✅', 'success');
    await loadWorkflowView(currentProject.project_id);
  } catch(e) {
    console.error(e);
    toast('Network error submitting plan.', 'error');
  }
}

async function publishProject() {
  try {
    const resp = await fetch(`/api/projects/${currentProject.project_id}/publish`, { method: 'POST' });
    const data = await resp.json();
    toast(`Project published! ${data.notified} employees notified.`, 'success');
    document.getElementById('publish-ready-state').style.display = 'none';
    document.getElementById('publish-done-state').style.display = 'block';
    await loadWorkflowView(currentProject.project_id);
  } catch(e) { console.error(e); }
}

// Replace employee in AI assignments
function acceptAssignment(idx) {
  if (idx >= 0 && idx < currentAIAssignments.length) {
    currentAIAssignments[idx].accepted = true;
    toast(`Accepted ${currentAIAssignments[idx].employee_name} assignment.`, 'success');
    renderReviewAssignments(currentAIAssignments);
  }
}

// Replace employee in AI assignments with AI Recommendation
async function openReplaceModal(idx, teamId) {
  replacingAssignmentIdx = idx;
  
  // Show modal
  openModal('modal-replace-emp');
  
  const loading = document.getElementById('replace-emp-loading');
  const recSection = document.getElementById('replace-emp-ai-recommendation');
  const manualSection = document.getElementById('replace-emp-manual-section');
  const footer = document.getElementById('replace-modal-footer');
  
  // Reset visibility states
  loading.style.display = 'block';
  recSection.style.display = 'none';
  manualSection.style.display = 'none';
  footer.style.display = 'none';
  
  try {
    const assignedIds = currentAIAssignments.map(a => a.employee_id);
    const replacingEmpId = currentAIAssignments[idx].employee_id;
    
    const resp = await fetch(`/api/projects/${currentProject.project_id}/recommend-replacement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: replacingEmpId,
        team_id: teamId,
        assigned_ids: assignedIds
      })
    });
    
    if (!resp.ok) {
      toast('Failed to load AI recommendation.', 'error');
      closeModal('modal-replace-emp');
      return;
    }
    
    const data = await resp.json();
    const recEmp = data.recommended_employee;
    const aiReason = data.ai_reason;
    const recId = data.recommended_id;
    
    // Set AI recommended candidate details
    document.getElementById('replace-rec-name').textContent = recEmp.name;
    document.getElementById('replace-rec-role').textContent = recEmp.role || 'Employee';
    document.getElementById('replace-rec-reason').innerHTML = `"${esc(aiReason)}"`;
    
    const photoEl = document.getElementById('replace-rec-photo');
    photoEl.src = recEmp.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(recEmp.name)}&background=6C63FF&color=fff`;
    
    // Get confidence/score of the recommended one
    const scoredRec = data.candidates.find(c => c.employee_id === recId);
    document.getElementById('replace-rec-confidence').textContent = scoredRec ? `${scoredRec.confidence}% Match` : '90% Match';
    
    // Wire up AI recommend choice button
    document.getElementById('btn-use-recommendation').onclick = function() {
      applyReplacement(recEmp, aiReason);
    };
    
    // Populate alternative manual select (excluding the recommended one to prevent duplication)
    const sel = document.getElementById('replace-emp-select');
    sel.innerHTML = data.candidates
      .filter(c => c.employee_id !== recId)
      .map(c => `<option value="${c.employee_id}">${esc(c.name)} — ${esc(c.role || '')} (${c.confidence}% Match)</option>`)
      .join('');
      
    // Toggle displays
    loading.style.display = 'none';
    recSection.style.display = 'block';
    manualSection.style.display = 'block';
    footer.style.display = 'flex';
    
  } catch (e) {
    console.error(e);
    toast('Error querying recommendation engine.', 'error');
    closeModal('modal-replace-emp');
  }
}

function applyReplacement(emp, reason) {
  if (replacingAssignmentIdx < 0) return;
  currentAIAssignments[replacingAssignmentIdx].employee_id   = emp.employee_id;
  currentAIAssignments[replacingAssignmentIdx].employee_name = emp.name;
  currentAIAssignments[replacingAssignmentIdx].assigned_role = emp.role;
  currentAIAssignments[replacingAssignmentIdx].confidence_score = "100%";
  currentAIAssignments[replacingAssignmentIdx].reason_for_selection = reason;
  
  // Format matching trace
  currentAIAssignments[replacingAssignmentIdx].decision_trace = [
    `1. Replaced with AI recommendation: ${emp.name}`,
    `2. Evaluated skills: ${emp.skills || 'General'}`,
    `3. Verified availability and workload constraints`
  ];
  
  toast(`Replaced with ${emp.name}.`, 'success');
  closeModal('modal-replace-emp');
  renderReviewAssignments(currentAIAssignments);
}

function confirmReplaceEmployee() {
  const sel = document.getElementById('replace-emp-select');
  const newEmpId = sel.value;
  if (!newEmpId || replacingAssignmentIdx < 0) return;
  
  const newEmp = allEmployees.find(e => e.employee_id === newEmpId);
  if (!newEmp) return;
  
  applyReplacement(newEmp, "Manually replaced by PM using alternative candidates list.");
}

// ═══════════════════════════════════════════════════
// MODULE SELECTOR IN TEAM MODAL
// ═══════════════════════════════════════════════════
function populateModuleSelector() {
  const sel = document.getElementById('team-module');
  sel.innerHTML = `<option value="">— No specific module —</option>` +
    (_currentModulesForTeamModal || []).map(m => `<option value="${m.module_id}">${esc(m.module_name)}</option>`).join('');
}

// ═══════════════════════════════════════════════════
// TEAM LEAD DASHBOARD
// ═══════════════════════════════════════════════════
async function loadTLDashboard() {
  const greeting = document.getElementById('tl-greeting');
  if (greeting) greeting.textContent = `Welcome, ${currentUser.full_name?.split(' ')[0] || 'Lead'}`;
  const container = document.getElementById('tl-team-cards');
  try {
    const resp = await fetch('/api/teamlead/dashboard');
    const teamData = await resp.json();
    if (!teamData.length) {
      container.innerHTML = `<div class="empty-state card"><i class="fa-solid fa-people-group"></i><h3>No Teams Yet</h3><p>You haven't been approved as a team lead yet.</p></div>`;
      return;
    }
    container.innerHTML = teamData.map(td => {
      const done = td.completed_tasks;
      const total = td.total_tasks;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      return `
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i class="fa-solid fa-people-group"></i> ${esc(td.team?.team_name || 'My Team')}</div>
            <span class="badge badge-blue">${esc(td.project?.project_name || '—')}</span>
          </div>
          <div class="kpi-grid" style="margin-bottom:16px">
            <div class="kpi-card" style="padding:14px"><div class="kpi-value" style="font-size:24px">${td.members.length}</div><div class="kpi-label">Members</div></div>
            <div class="kpi-card green" style="padding:14px"><div class="kpi-value" style="font-size:24px">${done}</div><div class="kpi-label">Done</div></div>
            <div class="kpi-card amber" style="padding:14px"><div class="kpi-value" style="font-size:24px">${total - done}</div><div class="kpi-label">Pending</div></div>
          </div>
          <div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:12px;color:var(--text-secondary)">Sprint Progress</span>
              <span style="font-size:12px;font-weight:700">${pct}%</span>
            </div>
            <div class="progress-bar"><div class="progress-fill ${pct>70?'green':pct>40?'':'amber'}" style="width:${pct}%"></div></div>
          </div>
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px">Team Members</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${td.members.map(m => `
                <div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg-surface);border-radius:8px">
                  <img src="${m.photo||''}" style="width:32px;height:32px;border-radius:50%;object-fit:cover"
                    onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(m.name||'?')}&background=6C63FF&color=fff'"/>
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:700">${esc(m.name||'?')}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${esc(m.assigned_role||m.role||'—')}</div>
                  </div>
                  <div style="text-align:right;font-size:11px">
                    <div style="color:var(--accent-green)">${m.completed_tasks} done</div>
                    <div style="color:var(--text-muted)">${m.pending_tasks} pending</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch(e) { console.error(e); }
}

async function loadTLTeam() {
  try {
    const resp = await fetch('/api/teamlead/my-teams');
    const teams = await resp.json();
    const container = document.getElementById('tl-team-grid');
    let members = [];
    teams.forEach(t => members.push(...(t.members || [])));
    renderEmpGrid('tl-team-grid', members);
  } catch(e) { console.error(e); }
}

async function loadTLTasks() {
  // TL manages tasks via project tasks
  try {
    const resp = await fetch('/api/tasks');
    const tasks = await resp.json();
    const kanban = document.getElementById('tl-kanban-board');
    kanban.innerHTML = '';
    const statuses = ['To Do', 'In Progress', 'Review', 'Completed'];
    const emps = {};
    (await (await fetch('/api/employees')).json()).forEach(e => emps[e.employee_id] = e);
    statuses.forEach(status => {
      const col = document.createElement('div');
      col.className = 'kanban-col';
      const colTasks = tasks.filter(t => t.status === status);
      col.innerHTML = `
        <div class="kanban-col-header">
          <div class="kanban-col-name">${status}</div>
          <div class="kanban-count">${colTasks.length}</div>
        </div>
        <div class="kanban-items">
          ${colTasks.map(t => {
            const assignee = emps[t.assigned_to];
            return `
              <div class="kanban-card">
                <div class="kanban-card-title">${esc(t.task_name)}</div>
                <span class="badge priority-${t.priority}">${t.priority}</span>
                <div class="kanban-card-footer">
                  <div class="kanban-card-assignee">
                    ${assignee ? `<img src="${assignee.photo||''}" style="width:20px;height:20px;border-radius:50%" onerror="this.style.display='none'"/> ${esc(assignee.name)}` : 'Unassigned'}
                  </div>
                  <span style="font-size:10px;color:var(--text-muted)">${t.deadline || ''}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      kanban.appendChild(col);
    });
  } catch(e) { console.error(e); }
}

async function createTask() {
  const name     = document.getElementById('task-name-input').value.trim();
  const desc     = document.getElementById('task-desc-input').value.trim();
  const assignTo = document.getElementById('task-assign-input').value;
  const priority = document.getElementById('task-priority-input').value;
  const deadline = document.getElementById('task-deadline-input').value;
  const hours    = parseInt(document.getElementById('task-hours-input').value);
  if (!name) { toast('Task name required.', 'warning'); return; }
  // Find project_id from team
  let projId = '';
  try {
    const resp = await fetch('/api/teamlead/my-teams');
    const teams = await resp.json();
    if (teams.length) projId = teams[0].project_id;
  } catch {}
  try {
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_name: name, description: desc, assigned_to: assignTo,
        priority, deadline, estimated_hours: hours, project_id: projId, status: 'To Do', comments: []
      })
    });
    toast('Task created!', 'success');
    closeModal('modal-create-task');
    loadTLTasks();
  } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════════════
// EMPLOYEE VIEWS
// ═══════════════════════════════════════════════════
async function loadEmpOverview() {
  const greeting = document.getElementById('emp-greeting');
  if (greeting) greeting.textContent = `Welcome back, ${currentUser.full_name?.split(' ')[0] || 'there'}!`;
  try {
    // My Assignment
    const aResp = await fetch('/api/employee/my-assignment');
    const aData = await aResp.json();
    const container = document.getElementById('emp-assignment-card');

    if (aData.assignments?.length) {
      const a = aData.assignments[0];
      const proj = a.project;
      const team = a.team;
      const mod  = a.module;
      const lead = a.team_lead;
      container.innerHTML = `
        <div class="card" style="border-left:4px solid var(--accent-green)">
          <div class="card-header">
            <div class="card-title"><i class="fa-solid fa-briefcase"></i> My Assignment</div>
            <span class="badge badge-green">Active</span>
          </div>
          <div class="two-col">
            <div class="info-list">
              <div class="info-item"><span class="info-key">Project</span><span class="info-val">${esc(proj?.project_name || '—')}</span></div>
              <div class="info-item"><span class="info-key">Client</span><span class="info-val">${esc(proj?.client || '—')}</span></div>
              <div class="info-item"><span class="info-key">My Role</span><span class="info-val">${esc(a.membership?.assigned_role || '—')}</span></div>
              <div class="info-item"><span class="info-key">Team</span><span class="info-val">${esc(team?.team_name || '—')}</span></div>
            </div>
            <div class="info-list">
              <div class="info-item"><span class="info-key">Module</span><span class="info-val">${esc(mod?.module_name || '—')}</span></div>
              <div class="info-item"><span class="info-key">Priority</span><span class="info-val"><span class="badge priority-${proj?.priority}">${proj?.priority}</span></span></div>
              <div class="info-item"><span class="info-key">Team Lead</span><span class="info-val">${esc(lead?.name || '—')}</span></div>
            </div>
          </div>
        </div>
      `;
    }

    // My Tasks summary
    const tResp = await fetch('/api/tasks');
    const tasks = await tResp.json();
    const myTasks = tasks.filter(t => t.assigned_to === currentUser.id);
    const summaryEl = document.getElementById('emp-tasks-summary');
    summaryEl.innerHTML = myTasks.slice(0, 4).map(t => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
        <span class="badge priority-${t.priority}">${t.priority}</span>
        <span style="flex:1;font-weight:600;font-size:13px">${esc(t.task_name)}</span>
        <span class="badge ${t.status==='Completed'?'badge-green':t.status==='In Progress'?'badge-blue':'badge-default'}">${t.status}</span>
      </div>
    `).join('') || `<div class="empty-state" style="padding:24px"><p>No tasks assigned yet</p></div>`;

    // Performance
    const empResp = await fetch('/api/employees');
    const emps = await empResp.json();
    const me = emps.find(e => e.email === currentUser.email);
    if (me) {
      const perfEl = document.getElementById('emp-performance');
      perfEl.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:12px;color:var(--text-secondary)">Performance Score</span>
              <span style="font-size:12px;font-weight:700;color:var(--accent-green)">${me.performance_score || 0}%</span>
            </div>
            <div class="progress-bar"><div class="progress-fill green" style="width:${me.performance_score || 0}%"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:12px;color:var(--text-secondary)">Current Workload</span>
              <span style="font-size:12px;font-weight:700">${me.current_workload || 0}%</span>
            </div>
            <div class="progress-bar"><div class="progress-fill ${(me.current_workload||0)>70?'red':'amber'}" style="width:${me.current_workload || 0}%"></div></div>
          </div>
          <div class="info-list">
            <div class="info-item"><span class="info-key">Experience</span><span class="info-val">${me.experience || 0} years</span></div>
            <div class="info-item"><span class="info-key">Projects Done</span><span class="info-val">${me.completed_projects || 0}</span></div>
          </div>
        </div>
      `;
    }
  } catch(e) { console.error(e); }
}

async function loadEmpTasks() {
  const container = document.getElementById('emp-tasks-list');
  try {
    const resp = await fetch('/api/tasks');
    const tasks = await resp.json();
    const mine = tasks.filter(t => t.assigned_to === currentUser.id);
    if (!mine.length) {
      container.innerHTML = `<div class="empty-state card"><i class="fa-solid fa-list-check"></i><h3>No Tasks Yet</h3><p>You don't have any tasks assigned.</p></div>`;
      return;
    }
    container.innerHTML = mine.map(t => `
      <div class="card" style="border-left: 4px solid ${t.help_requested ? 'var(--accent-red)' : t.status === 'Completed' ? 'var(--accent-green)' : 'var(--accent-blue)'}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px">
          <div>
            <div style="font-size:15px;font-weight:700;margin-bottom:4px">${esc(t.task_name)}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${esc(t.description || '')}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <span class="badge priority-${t.priority}">${t.priority}</span>
            <span class="badge ${t.status==='Completed'?'badge-green':t.status==='In Progress'?'badge-blue':'badge-default'}">${t.status}</span>
          </div>
        </div>
        
        ${t.help_requested ? `
          <div style="background:rgba(255, 77, 77, 0.08); border-radius:6px; padding:8px 12px; font-size:11px; color:var(--accent-red); margin-bottom:12px; font-weight:700;">
            <i class="fa-solid fa-triangle-exclamation"></i> HELP REQUESTED: "${esc(t.help_comment || '')}"
          </div>
        ` : ''}

        <div class="info-list" style="margin-bottom:12px">
          <div class="info-item"><span class="info-key">Deadline</span><span class="info-val">${t.deadline || '—'}</span></div>
          <div class="info-item"><span class="info-key">Est. Hours</span><span class="info-val">${t.estimated_hours || 0}h</span></div>
          <div class="info-item">
            <span class="info-key">Progress</span>
            <span class="info-val" style="font-weight:700">${t.progress_percent || 0}%</span>
          </div>
        </div>

        <!-- Task Update Controls -->
        ${t.status !== 'Completed' ? `
          <div style="display:flex; flex-direction:column; gap:10px; padding:12px; border:1px solid var(--border); border-radius:6px; margin-bottom:12px; background:rgba(255,255,255,0.01)">
            <!-- Status Transitions -->
            <div style="display:flex; gap:8px;">
              ${t.status === 'To Do' ? `<button class="btn btn-primary btn-sm" onclick="updateTaskStatus('${t.id}', 'In Progress')"><i class="fa-solid fa-play"></i> Start Task</button>` : ''}
              ${t.status === 'In Progress' ? `<button class="btn btn-success btn-sm" onclick="updateTaskStatus('${t.id}', 'Review')"><i class="fa-solid fa-paper-plane"></i> Submit for Review</button>` : ''}
            </div>

            <!-- Progress range slider -->
            <div class="form-group" style="margin: 0;">
              <label class="form-label" style="display:flex; justify-content:space-between; font-size:11px;">
                <span>Update Progress %</span>
                <span>${t.progress_percent || 0}%</span>
              </label>
              <input type="range" class="form-control" min="0" max="100" value="${t.progress_percent || 0}" onchange="updateTaskProgress('${t.id}', this.value)" style="padding: 0; background: transparent; cursor: pointer;"/>
            </div>

            <!-- Deliverable & Comments -->
            <div style="display:flex; gap:8px;">
              <input class="form-control" id="task-comment-input-${t.id}" style="font-size:11px;" placeholder="Add progress comment..."/>
              <button class="btn btn-secondary btn-sm" onclick="submitTaskComment('${t.id}')">Post</button>
            </div>

            <!-- Help Request Toggle -->
            <div style="display:flex; justify-content:flex-end; border-top: 1px solid var(--border); padding-top: 8px;">
              <button class="btn btn-ghost btn-sm" style="color:var(--accent-amber); font-size:11px; padding: 4px;" onclick="promptRequestHelp('${t.id}', ${t.help_requested})">
                <i class="fa-solid fa-hands-helping"></i> ${t.help_requested ? 'Cancel Help Request' : 'Request Help (Critical flag)'}
              </button>
            </div>
          </div>
        ` : `<span class="badge badge-green"><i class="fa-solid fa-check"></i> Completed</span>`}
      </div>
    `).join('');
  } catch(e) { console.error(e); }
}

async function updateTaskStatus(taskId, status) {
  try {
    await fetch(`/api/tasks/${taskId}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    toast(`Task updated to ${status}.`, 'success');
    loadEmpTasks();
  } catch(e) { console.error(e); }
}

async function updateTaskProgress(taskId, progress) {
  try {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress_percent: parseInt(progress) })
    });
    toast('Progress updated!', 'success');
    loadEmpTasks();
  } catch(e) { console.error(e); }
}

async function submitTaskComment(taskId) {
  const commentInput = document.getElementById(`task-comment-input-${taskId}`);
  const comment = commentInput ? commentInput.value.trim() : "";
  if (!comment) return;

  try {
    const resp = await fetch(`/api/tasks/${taskId}`);
    const task = await resp.json();
    const commentsList = Array.isArray(task.comments) ? task.comments : [];
    commentsList.push({
      author: currentUser.full_name,
      text: comment,
      timestamp: new Date().toISOString()
    });

    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comments: commentsList })
    });

    toast('Comment posted!', 'success');
    if (commentInput) commentInput.value = "";
    loadEmpTasks();
  } catch(e) { console.error(e); }
}

async function promptRequestHelp(taskId, currentlyRequested) {
  if (currentlyRequested) {
    if (!confirm('Cancel help request on this task?')) return;
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ help_requested: false, help_comment: '' })
      });
      toast('Help request cancelled.', 'success');
      loadEmpTasks();
    } catch(e) { console.error(e); }
  } else {
    const reason = prompt('Please explain what help is required (sent to PM):');
    if (!reason) return;
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ help_requested: true, help_comment: reason })
      });
      toast('Help request sent to Project Manager!', 'warning');
      loadEmpTasks();
    } catch(e) { console.error(e); }
  }
}


async function loadEmpProfile() {
  try {
    const resp = await fetch('/api/employees');
    const emps = await resp.json();
    const me = emps.find(e => e.email === currentUser.email);
    if (!me) return;
    document.getElementById('emp-profile-photo').src  = me.photo || '';
    document.getElementById('emp-profile-name').textContent = me.name;
    document.getElementById('emp-profile-role').textContent = me.role;
    document.getElementById('emp-profile-dept').textContent = me.department || '—';
    document.getElementById('emp-skills-input').value = me.skills || '';
    document.getElementById('emp-cert-input').value   = me.certifications || '';
    const wl = me.current_workload || 0;
    document.getElementById('emp-workload-pct').textContent = wl + '%';
    document.getElementById('emp-workload-bar').style.width = wl + '%';
    document.getElementById('emp-workload-bar').className = `progress-fill ${wl>70?'red':wl>50?'amber':'green'}`;
    document.getElementById('emp-perf-pct').textContent = (me.performance_score || 0) + '%';
    document.getElementById('emp-perf-bar').style.width = (me.performance_score || 0) + '%';
    document.getElementById('emp-experience').textContent = (me.experience || 0) + ' years';
    document.getElementById('emp-completed-projects').textContent = me.completed_projects || 0;
    document.getElementById('emp-department').textContent = me.department || '—';
    window._myEmpId = me.employee_id;
  } catch(e) { console.error(e); }
}

async function saveEmpProfile() {
  const skills = document.getElementById('emp-skills-input').value.trim();
  const certs  = document.getElementById('emp-cert-input').value.trim();
  if (!window._myEmpId) return;
  try {
    await fetch(`/api/employees/${window._myEmpId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills, certifications: certs })
    });
    toast('Profile saved!', 'success');
  } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════
function setupNotifications() {
  loadNotifications();
  notifInterval = setInterval(loadNotifications, 12000);
}

async function loadNotifications() {
  try {
    const resp = await fetch('/api/notifications');
    if (!resp.ok) return;
    const notifs = await resp.json();
    const unread = notifs.filter(n => !n.is_read);
    const badge = document.getElementById('notif-count');
    if (unread.length > 0) { badge.textContent = unread.length; badge.style.display = 'flex'; }
    else badge.style.display = 'none';

    const list = document.getElementById('notif-list');
    if (!notifs.length) {
      list.innerHTML = `<div class="empty-state" style="padding:24px"><i class="fa-regular fa-bell-slash"></i><p>No notifications</p></div>`;
      return;
    }
    list.innerHTML = notifs.slice(0, 12).map(n => {
      const iconMap = { success:'fa-check-circle', info:'fa-info-circle', warning:'fa-triangle-exclamation', error:'fa-circle-xmark' };
      return `
        <div class="notif-item ${!n.is_read ? 'unread' : ''}">
          <div class="notif-icon ${n.type || 'info'}"><i class="fa-solid ${iconMap[n.type] || 'fa-bell'}"></i></div>
          <div class="notif-content">
            <div class="notif-title">${esc(n.title || '')}</div>
            <div class="notif-message">${esc(n.message || '')}</div>
            <div class="notif-time">${n.created_at ? timeAgo(n.created_at) : ''}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch(e) {}
}

async function markAllRead() {
  try {
    await fetch('/api/notifications/mark-read', { method: 'POST' });
    loadNotifications();
  } catch {}
}

// ═══════════════════════════════════════════════════
// MODAL HELPERS
// ═══════════════════════════════════════════════════
function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.style.display = 'flex';
  // Force reflow so the transition plays
  overlay.offsetHeight;
  overlay.classList.add('open');
  // Special on-open actions
  if (id === 'modal-create-project') loadPMsIntoDropdown();
  if (id === 'modal-add-team') populateModuleSelector();
  if (id === 'modal-create-task') populateTaskAssignees();
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('open');
  // Hide after CSS transition finishes (200ms)
  setTimeout(() => { overlay.style.display = 'none'; }, 220);
}

function handleOverlayClick(e, id) {
  if (e.target === e.currentTarget) closeModal(id);
}

async function populateTaskAssignees() {
  try {
    const resp = await fetch('/api/teamlead/my-teams');
    const teams = await resp.json();
    let members = [];
    teams.forEach(t => members.push(...(t.members || [])));
    const sel = document.getElementById('task-assign-input');
    sel.innerHTML = `<option value="">— Unassigned —</option>` +
      members.map(m => `<option value="${m.employee_id}">${esc(m.name||'?')}</option>`).join('');
  } catch {}
}

// ═══════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════
function toggleTheme() {
  document.body.classList.toggle('light-theme');
  document.body.classList.toggle('dark-theme');
  localStorage.setItem('theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
}

(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
  }
})();

// ═══════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════
function toast(message, type = 'info') {
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type] || 'fa-circle-info'}"></i><span>${esc(message)}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; setTimeout(() => el.remove(), 300); }, 3500);
}

// Legacy alias
function showAlert(msg, type) { toast(msg, type); }

// ═══════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function wsBadgeClass(ws) {
  const map = {
    draft:'ws-draft', pending_pm:'ws-pending_pm', pm_approved:'ws-pm_approved',
    changes_requested:'ws-changes_requested', modules_defined:'ws-modules_defined',
    teams_forming:'ws-teams_forming', leads_pending:'ws-leads_pending',
    leads_approved:'ws-leads_approved', ai_assigned:'ws-ai_assigned',
    pm_reviewing:'ws-pm_reviewing', published:'ws-published', active:'ws-active',
    completed:'ws-completed'
  };
  return 'badge ' + (map[ws] || 'ws-draft');
}

function wsLabel(ws) {
  const map = {
    draft:'Draft', pending_pm:'Pending PM Review', pm_approved:'PM Approved',
    changes_requested:'Changes Requested', modules_defined:'Modules Defined',
    teams_forming:'Teams Forming', leads_pending:'Leads Pending Approval',
    leads_approved:'Leads Approved', ai_assigned:'AI Assigned',
    pm_reviewing:'PM Reviewing', published:'Published', active:'Active',
    completed:'Completed'
  };
  return map[ws] || (ws || 'Draft');
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = (Date.now() - new Date(isoStr)) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}
