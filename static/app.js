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
    'view-admin-audit': 'Audit Logs',
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
    case 'view-admin-audit':      await loadAuditLogs('audit-tbody'); break;
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
    const [metricsResp, projectsResp, approvalsResp] = await Promise.all([
      fetch('/api/metrics/v2'),
      fetch('/api/projects'),
      fetch('/api/lead-approvals?status=pending')
    ]);
    const metrics   = await metricsResp.json();
    allProjects     = await projectsResp.json();
    const approvals = await approvalsResp.json();

    const k = metrics.kpis;
    document.getElementById('kpi-total-projects').textContent  = k.total_projects;
    document.getElementById('kpi-active-projects').textContent = k.active_projects;
    document.getElementById('kpi-pending-approvals').textContent = k.pending_approvals;
    document.getElementById('kpi-total-employees').textContent = k.total_employees;
    document.getElementById('kpi-total-teams').textContent     = k.total_teams;
    document.getElementById('kpi-avg-perf').textContent        = k.avg_performance + '%';

    // Update approval count badge
    const badge = document.getElementById('approval-count-badge');
    if (k.pending_approvals > 0) { badge.textContent = k.pending_approvals; badge.style.display = 'flex'; }
    else badge.style.display = 'none';

    // Recent projects list
    const recentProjs = allProjects.slice(-6).reverse();
    const projListEl = document.getElementById('admin-projects-list');
    if (recentProjs.length === 0) {
      projListEl.innerHTML = `<div class="empty-state" style="padding:24px"><i class="fa-solid fa-folder-open"></i><p>No projects yet</p></div>`;
    } else {
      projListEl.innerHTML = recentProjs.map(p => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.project_name)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${p.client || '—'}</div>
          </div>
          <span class="badge ${wsBadgeClass(p.workflow_status)}">${wsLabel(p.workflow_status)}</span>
          <span class="badge priority-${p.priority}">${p.priority}</span>
          <button class="btn btn-ghost btn-sm" onclick="openWorkflow('${p.project_id}')"><i class="fa-solid fa-arrow-right"></i></button>
        </div>
      `).join('');
    }

    // Approvals widget
    const appWidget = document.getElementById('admin-approvals-widget');
    if (approvals.length === 0) {
      appWidget.innerHTML = `<div class="empty-state" style="padding:20px"><i class="fa-regular fa-circle-check"></i><p>All clear!</p></div>`;
    } else {
      appWidget.innerHTML = approvals.slice(0, 4).map(a => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openApprovalDetail('${a.id}')">
          <div class="user-avatar" style="width:32px;height:32px;font-size:11px">${(a.employee?.name || '?')[0]}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700">${esc(a.employee?.name || '?')}</div>
            <div style="font-size:11px;color:var(--text-muted)">${esc(a.team_name)} • ${esc(a.project_name)}</div>
          </div>
          <span class="badge badge-amber">Pending</span>
        </div>
      `).join('');
    }

    // Workload chart
    renderWorkloadChart(metrics.workload_chart || []);
  } catch(e) { console.error(e); }
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
  const status = document.getElementById('approval-filter')?.value || '';
  try {
    const resp = await fetch(`/api/lead-approvals${status ? '?status=' + status : ''}`);
    const approvals = await resp.json();
    const container = document.getElementById('approvals-list');
    if (approvals.length === 0) {
      container.innerHTML = `<div class="empty-state card"><i class="fa-solid fa-shield-check" style="font-size:48px;color:var(--text-muted)"></i><h3>No Approvals</h3><p>No team lead approval requests.</p></div>`;
      return;
    }
    container.innerHTML = approvals.map(a => `
      <div class="approval-card ${a.status === 'pending' ? 'pending' : a.status === 'approved' ? 'approved' : 'rejected'}">
        <div class="approval-header">
          <div>
            <div class="approval-title"><i class="fa-solid fa-crown" style="color:var(--accent-amber)"></i> Team Lead: ${esc(a.team_name)}</div>
            <div class="approval-sub">Project: ${esc(a.project_name)} • Submitted ${a.created_at ? timeAgo(a.created_at) : '—'}</div>
          </div>
          <span class="badge ${a.status === 'pending' ? 'badge-amber' : a.status === 'approved' ? 'badge-green' : 'badge-red'}">${a.status}</span>
        </div>
        <div class="approval-emp-row">
          <img class="approval-emp-avatar" src="${a.employee?.photo || ''}" onerror="this.src=''" alt="${esc(a.employee?.name || '?')}" style="background:var(--bg-surface)"/>
          <div>
            <div class="approval-emp-info-name">${esc(a.employee?.name || '?')}</div>
            <div class="approval-emp-info-sub">${esc(a.employee?.role || '—')} • ${esc(a.employee?.department || '—')}</div>
          </div>
          <div class="approval-metrics" style="margin-left:auto">
            <div class="approval-metric">
              <div class="approval-metric-val">${a.employee?.experience || 0}y</div>
              <div class="approval-metric-lbl">Experience</div>
            </div>
            <div class="approval-metric">
              <div class="approval-metric-val" style="color:var(--accent-green)">${a.employee?.performance_score || 0}%</div>
              <div class="approval-metric-lbl">Performance</div>
            </div>
            <div class="approval-metric">
              <div class="approval-metric-val">${a.employee?.current_workload || 0}%</div>
              <div class="approval-metric-lbl">Workload</div>
            </div>
          </div>
        </div>
        ${a.ai_reason ? `<div class="approval-reason"><strong>PM's Reason:</strong> ${esc(a.ai_reason)}</div>` : ''}
        ${a.alternatives?.length ? `
          <div style="font-size:12px;color:var(--text-secondary)">
            <strong>Alternatives:</strong> ${a.alternatives.map(e => esc(e.name)).join(', ')}
          </div>` : ''}
        ${a.status === 'pending' ? `
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-danger btn-sm" onclick="openApprovalDetail('${a.id}')"><i class="fa-solid fa-xmark"></i> Review & Decide</button>
            <button class="btn btn-success btn-sm" onclick="quickApprove('${a.id}')"><i class="fa-solid fa-check"></i> Quick Approve</button>
          </div>` :
          a.admin_comment ? `<div class="approval-reason"><strong>Admin Comment:</strong> ${esc(a.admin_comment)}</div>` : ''
        }
      </div>
    `).join('');
  } catch(e) { console.error(e); }
}

function openApprovalDetail(approvalId) {
  currentApprovalId = approvalId;
  openModal('modal-approval-detail');
  fetchAndRenderApprovalDetail(approvalId);
}

async function fetchAndRenderApprovalDetail(aid) {
  const body = document.getElementById('approval-detail-body');
  const footer = document.getElementById('approval-detail-footer');
  body.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
  try {
    const resp = await fetch(`/api/lead-approvals/${aid}`);
    const a = await resp.json();
    const emp = a.employee || {};
    body.innerHTML = `
      <div class="approval-emp-row" style="margin-bottom:16px">
        <img class="approval-emp-avatar" src="${emp.photo || ''}" style="width:56px;height:56px" onerror="this.style.display='none'"/>
        <div>
          <div style="font-size:16px;font-weight:800">${esc(emp.name || '?')}</div>
          <div style="font-size:13px;color:var(--text-muted)">${esc(emp.role || '—')} • ${esc(emp.department || '—')}</div>
        </div>
      </div>
      <div class="approval-metrics" style="margin-bottom:16px">
        <div class="approval-metric"><div class="approval-metric-val">${emp.experience || 0} yrs</div><div class="approval-metric-lbl">Experience</div></div>
        <div class="approval-metric"><div class="approval-metric-val" style="color:var(--accent-green)">${emp.performance_score || 0}%</div><div class="approval-metric-lbl">Performance</div></div>
        <div class="approval-metric"><div class="approval-metric-val">${emp.completed_projects || 0}</div><div class="approval-metric-lbl">Projects Done</div></div>
      </div>
      <div class="info-list" style="margin-bottom:16px">
        <div class="info-item"><span class="info-key">Skills</span><span class="info-val" style="font-size:11px">${esc(emp.skills || '—')}</span></div>
        <div class="info-item"><span class="info-key">Current Workload</span><span class="info-val">${emp.current_workload || 0}%</span></div>
        <div class="info-item"><span class="info-key">Team</span><span class="info-val">${esc(a.team_name || '—')}</span></div>
        <div class="info-item"><span class="info-key">Project</span><span class="info-val">${esc(a.project_name || '—')}</span></div>
        <div class="info-item"><span class="info-key">Confidence Score</span><span class="info-val" style="color:var(--accent-purple)">${a.confidence_score || 0}%</span></div>
      </div>
      ${a.ai_reason ? `<div class="approval-reason" style="margin-bottom:16px"><strong>PM's Reason:</strong> ${esc(a.ai_reason)}</div>` : ''}
      ${a.alternatives?.length ? `
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-secondary)">Alternative Candidates:</div>
        ${a.alternatives.map(ae => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg-surface);border-radius:8px;margin-bottom:6px">
            <img src="${ae.photo||''}" style="width:32px;height:32px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'"/>
            <div><div style="font-size:12px;font-weight:700">${esc(ae.name)}</div><div style="font-size:11px;color:var(--text-muted)">${esc(ae.role||'—')}</div></div>
            <div style="margin-left:auto;font-size:11px;color:var(--text-muted)">${ae.performance_score||0}% perf</div>
          </div>
        `).join('')}` : ''}
    `;
    if (a.status === 'pending') {
      footer.style.display = 'flex';
    } else {
      footer.style.display = 'none';
      const existComment = a.admin_comment ? `<div class="approval-reason"><strong>Admin Comment:</strong> ${esc(a.admin_comment)}</div>` : '';
      body.innerHTML += `<div class="badge ${a.status === 'approved' ? 'badge-green' : 'badge-red'}" style="font-size:13px;padding:8px 16px;margin-top:8px">Decision: ${a.status}</div>${existComment}`;
    }
  } catch(e) { console.error(e); body.innerHTML = `<div class="empty-state"><p>Error loading approval.</p></div>`; }
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
  const name     = document.getElementById('cp-name').value.trim();
  const desc     = document.getElementById('cp-desc').value.trim();
  const client   = document.getElementById('cp-client').value.trim();
  const priority = document.getElementById('cp-priority').value;
  const budget   = document.getElementById('cp-budget').value.trim();
  const deadline = parseInt(document.getElementById('cp-deadline').value);
  const duration = document.getElementById('cp-duration').value.trim();
  const teamsize = parseInt(document.getElementById('cp-teamsize').value);
  const skills   = document.getElementById('cp-skills').value.trim();
  const tech     = document.getElementById('cp-tech').value.trim();
  const pm_id    = document.getElementById('cp-pm').value;

  if (!name || !desc || !client) { toast('Please fill in required fields.', 'warning'); return; }

  try {
    const resp = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_name: name, description: desc, client, priority,
        budget, deadline_days: deadline, estimated_duration: duration,
        team_size: teamsize, required_skills: skills, preferred_tech: tech,
        workflow_status: 'draft', created_by: currentUser.id
      })
    });
    if (!resp.ok) { toast('Failed to create project.', 'error'); return; }
    const proj = await resp.json();
    // Assign PM if selected
    if (pm_id) {
      await fetch(`/api/projects/${proj.project_id}/assign-pm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pm_id })
      });
    }
    toast('Project created' + (pm_id ? ' and PM notified!' : '!'), 'success');
    closeModal('modal-create-project');
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
    const [projResp, teamsResp] = await Promise.all([
      fetch('/api/projects'),
      fetch('/api/projects')
    ]);
    const allP = await projResp.json();
    const myProjects = allP.filter(p => p.assigned_pm === currentUser.id);

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
    const all = await resp.json();
    const mine = all.filter(p => p.assigned_pm === currentUser.id);
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
  const steps = ['review', 'modules', 'teams', 'leads', 'waiting', 'ai', 'review-assign', 'publish'];
  const wsOrder = {
    'draft': 0, 'pending_pm': 0,
    'pm_approved': 1, 'changes_requested': 0,
    'modules_defined': 2,
    'teams_forming': 3,
    'leads_pending': 4,
    'leads_approved': 5,
    'ai_assigned': 6,
    'pm_reviewing': 7,
    'active': 8, 'published': 8
  };
  const current = wsOrder[status] || 0;
  for (let i = 1; i <= 8; i++) {
    const el = document.getElementById(`step-${i}`);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i - 1 < current) el.classList.add('done');
    else if (i - 1 === current) el.classList.add('active');
  }
}

function showWorkflowPanel(proj, data, isAdmin) {
  const panels = ['wf-panel-review','wf-panel-modules','wf-panel-teams','wf-panel-leads','wf-panel-waiting','wf-panel-ai','wf-panel-review-assignments','wf-panel-publish'];
  panels.forEach(p => { const el = document.getElementById(p); if (el) el.style.display = 'none'; });

  const ws = proj.workflow_status || 'draft';
  if (ws === 'draft' || ws === 'pending_pm' || ws === 'changes_requested') {
    showPanel('wf-panel-review');
    populateReviewPanel(proj);
  } else if (ws === 'pm_approved' || ws === 'modules_defined') {
    showPanel('wf-panel-modules');
    renderModulesList(data.modules || []);
  } else if (ws === 'teams_forming') {
    showPanel('wf-panel-modules');
    showPanel('wf-panel-teams');
    renderModulesList(data.modules || []);
    renderTeamsList(data.teams || [], data.modules || []);
  } else if (ws === 'leads_pending') {
    showPanel('wf-panel-modules');
    showPanel('wf-panel-teams');
    showPanel('wf-panel-leads');
    renderModulesList(data.modules || []);
    renderTeamsList(data.teams || [], data.modules || []);
    renderLeadSelectionList(data.teams || [], data.modules || []);
    // Also show waiting panel if all leads submitted
    const allSubmitted = (data.teams || []).every(t => t.team_lead_id);
    if (allSubmitted) {
      showPanel('wf-panel-waiting');
      renderApprovalStatusList(data.lead_approvals || []);
    }
  } else if (ws === 'leads_approved') {
    showPanel('wf-panel-ai');
  } else if (ws === 'ai_assigned') {
    showPanel('wf-panel-review-assignments');
  } else if (ws === 'pm_reviewing') {
    showPanel('wf-panel-review-assignments');
    showPanel('wf-panel-publish');
  } else if (ws === 'active' || ws === 'published') {
    showPanel('wf-panel-publish');
    document.getElementById('publish-ready-state').style.display = 'none';
    document.getElementById('publish-done-state').style.display = 'block';
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
    <div class="info-item"><span class="info-key">Duration</span><span class="info-val">${esc(proj.estimated_duration || '—')}</span></div>
    <div class="info-item"><span class="info-key">Team Size</span><span class="info-val">${proj.team_size || '—'}</span></div>
  `;
  const skillsEl = document.getElementById('review-skills');
  const skills = (proj.required_skills || '').split(';').filter(Boolean);
  skillsEl.innerHTML = skills.map(s => `<span class="skill-chip">${esc(s)}</span>`).join('');
}

async function pmReview(action) {
  const comment = document.getElementById('pm-review-comment').value.trim();
  if (!currentProject) { toast('No project loaded.', 'warning'); return; }
  try {
    const resp = await fetch(`/api/projects/${currentProject.project_id}/pm-review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, comment })
    });
    if (resp.ok) {
      toast(action === 'approve' ? 'Project approved! Now define modules.' : 'Changes requested.', action === 'approve' ? 'success' : 'warning');
      await loadWorkflowView(currentProject.project_id);
    } else {
      toast('Failed to submit review.', 'error');
    }
  } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════════════
// MODULES
// ═══════════════════════════════════════════════════
function renderModulesList(modules) {
  const el = document.getElementById('modules-list');
  if (!modules.length) {
    el.innerHTML = `<div class="empty-state" style="padding:24px"><i class="fa-solid fa-sitemap"></i><p>Add modules to break the project into components</p></div>`;
    return;
  }
  el.innerHTML = modules.map(m => `
    <div class="module-card">
      <div class="module-card-header">
        <div>
          <div class="module-name">${esc(m.module_name)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${esc(m.description || '')}</div>
        </div>
        <div style="display:flex;gap:6px">
          <span class="badge ${m.complexity === 'High' ? 'badge-red' : m.complexity === 'Low' ? 'badge-green' : 'badge-amber'}">${m.complexity}</span>
          <button class="btn btn-ghost btn-sm" style="color:var(--accent-red)" onclick="deleteModule('${m.module_id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="module-meta">
        ${m.estimated_duration ? `<div class="module-meta-item"><i class="fa-solid fa-clock"></i>${esc(m.estimated_duration)}</div>` : ''}
      </div>
      <div class="module-skills">
        ${(m.required_skills || '').split(';').filter(Boolean).map(s => `<span class="skill-chip">${esc(s)}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

async function addModule() {
  const name = document.getElementById('mod-name').value.trim();
  if (!name) { toast('Module name is required.', 'warning'); return; }
  const body = {
    module_name: name,
    description: document.getElementById('mod-desc').value.trim(),
    estimated_duration: document.getElementById('mod-duration').value.trim(),
    complexity: document.getElementById('mod-complexity').value,
    required_skills: document.getElementById('mod-skills').value.trim()
  };
  try {
    await fetch(`/api/projects/${currentProject.project_id}/modules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    toast('Module added!', 'success');
    closeModal('modal-add-module');
    document.getElementById('mod-name').value = '';
    document.getElementById('mod-desc').value = '';
    await loadWorkflowView(currentProject.project_id);
  } catch(e) { console.error(e); }
}

async function deleteModule(mid) {
  if (!confirm('Delete this module?')) return;
  await fetch(`/api/modules/${mid}`, { method: 'DELETE' });
  toast('Module deleted.', 'success');
  await loadWorkflowView(currentProject.project_id);
}

async function proceedToTeams() {
  const resp = await fetch(`/api/projects/${currentProject.project_id}/modules`);
  const modules = await resp.json();
  if (!modules.length) { toast('Add at least one module first.', 'warning'); return; }
  await fetch(`/api/projects/${currentProject.project_id}/set-status`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow_status: 'teams_forming' })
  });
  await loadWorkflowView(currentProject.project_id);
}

// ═══════════════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════════════
let _currentModulesForTeamModal = [];
function renderTeamsList(teams, modules) {
  _currentModulesForTeamModal = modules;
  const el = document.getElementById('teams-list');
  if (!teams.length) {
    el.innerHTML = `<div class="empty-state" style="padding:24px;grid-column:1/-1"><i class="fa-solid fa-people-roof"></i><p>Create teams for each module</p></div>`;
    return;
  }
  el.innerHTML = teams.map(t => {
    const mod = modules.find(m => m.module_id === t.module_id);
    const members = t.members || [];
    return `
      <div class="team-card">
        <div class="team-card-header">
          <div>
            <div class="team-name">${esc(t.team_name)}</div>
            ${mod ? `<div class="team-module-tag">${esc(mod.module_name)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="badge ${t.lead_approved ? 'badge-green' : t.status === 'lead_pending' ? 'badge-amber' : 'badge-default'}">${t.lead_approved ? 'Lead Approved' : t.status}</span>
            <button class="btn btn-ghost btn-sm" style="color:var(--accent-red)" onclick="deleteTeam('${t.team_id}')"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        <div class="info-list">
          <div class="info-item"><span class="info-key">Size</span><span class="info-val">${t.team_size} members</span></div>
          <div class="info-item"><span class="info-key">Skills</span><span class="info-val" style="font-size:11px">${esc((t.required_skills || '').replace(/;/g,', ') || '—')}</span></div>
        </div>
        <div class="module-skills">
          ${(t.required_skills || '').split(';').filter(Boolean).slice(0,4).map(s => `<span class="skill-chip">${esc(s)}</span>`).join('')}
        </div>
        ${t.team_lead_id ? `
          <div class="team-lead-row">
            <i class="fa-solid fa-crown" style="color:var(--accent-amber)"></i>
            <div class="team-lead-info-name">Lead: ${esc(t.team_lead_name || t.team_lead_id)}</div>
            ${t.lead_approved ? '<span class="badge badge-green" style="margin-left:auto">Approved</span>' : '<span class="badge badge-amber" style="margin-left:auto">Pending</span>'}
          </div>` : `
          <button class="btn btn-secondary btn-sm w-full" onclick="openLeadModal('${t.team_id}')">
            <i class="fa-solid fa-crown"></i> Select Team Lead
          </button>`}
      </div>
    `;
  }).join('');
}

async function createTeam() {
  const name   = document.getElementById('team-name').value.trim();
  const modId  = document.getElementById('team-module').value;
  const skills = document.getElementById('team-skills').value.trim();
  const size   = parseInt(document.getElementById('team-size').value);
  if (!name) { toast('Team name is required.', 'warning'); return; }
  try {
    await fetch(`/api/projects/${currentProject.project_id}/teams`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_name: name, module_id: modId, required_skills: skills, team_size: size })
    });
    toast('Team created!', 'success');
    closeModal('modal-add-team');
    document.getElementById('team-name').value = '';
    await loadWorkflowView(currentProject.project_id);
  } catch(e) { console.error(e); }
}

async function deleteTeam(tid) {
  if (!confirm('Delete this team?')) return;
  await fetch(`/api/teams/${tid}`, { method: 'DELETE' });
  toast('Team deleted.', 'success');
  await loadWorkflowView(currentProject.project_id);
}

async function proceedToLeadSelection() {
  const resp = await fetch(`/api/projects/${currentProject.project_id}/teams`);
  const teams = await resp.json();
  if (!teams.length) { toast('Create at least one team first.', 'warning'); return; }
  await loadWorkflowView(currentProject.project_id);
}

function renderLeadSelectionList(teams, modules) {
  const el = document.getElementById('lead-selection-list');
  el.innerHTML = teams.map(t => {
    const mod = modules.find(m => m.module_id === t.module_id);
    return `
      <div class="card" style="border-left:4px solid ${t.lead_approved ? 'var(--accent-green)' : t.team_lead_id ? 'var(--accent-amber)' : 'var(--border)'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div>
            <div style="font-size:14px;font-weight:700">${esc(t.team_name)}</div>
            ${mod ? `<div style="font-size:11px;color:var(--accent-blue)">${esc(mod.module_name)}</div>` : ''}
          </div>
          <span class="badge ${t.lead_approved ? 'badge-green' : t.team_lead_id ? 'badge-amber' : 'badge-default'}">
            ${t.lead_approved ? '✓ Lead Approved' : t.team_lead_id ? 'Pending Admin Approval' : 'No Lead Selected'}
          </span>
        </div>
        ${!t.lead_approved ? `
          <button class="btn btn-primary btn-sm" onclick="openLeadModal('${t.team_id}')">
            <i class="fa-solid fa-crown"></i> ${t.team_lead_id ? 'Change Lead' : 'Select Lead'}
          </button>
        ` : ''}
      </div>
    `;
  }).join('');
}

function renderApprovalStatusList(approvals) {
  const el = document.getElementById('approval-status-list');
  el.innerHTML = approvals.map(a => `
    <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--bg-surface);border-radius:8px;margin-bottom:8px">
      <span class="badge ${a.status==='pending'?'badge-amber':a.status==='approved'?'badge-green':'badge-red'}">${a.status}</span>
      <span style="font-weight:600">${esc(a.team_name)}</span>
      <span style="color:var(--text-muted);font-size:12px">${esc(a.selected_employee_id)}</span>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════
// LEAD SELECTION MODAL
// ═══════════════════════════════════════════════════
let _selectedLeadEmpId = null;
let _selectedLeadScore = 0;
let _leadModalTeamId   = null;

async function openLeadModal(teamId) {
  _leadModalTeamId = teamId;
  _selectedLeadEmpId = null;
  _selectedLeadScore = 0;
  document.getElementById('btn-submit-lead').disabled = true;

  // Set team name in modal
  const resp = await fetch(`/api/teams/${teamId}`);
  const team = await resp.json();
  document.getElementById('lead-modal-team-name').textContent = team.team_name;

  openModal('modal-select-lead');
  loadLeadCandidates(teamId);
}

async function loadLeadCandidates(teamId) {
  const tbody = document.getElementById('lead-candidates-tbody');
  tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding:24px"><div class="spinner" style="margin:auto"></div></td></tr>`;
  try {
    const resp = await fetch(`/api/teams/${teamId}/score-employees`);
    const candidates = await resp.json();
    if (!candidates.length) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state" style="padding:24px"><p>No eligible candidates</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = candidates.map((c, idx) => `
      <tr class="lead-candidate-row" id="cand-row-${c.employee_id}" onclick="selectLeadCandidate('${c.employee_id}', ${c.confidence})" style="cursor:pointer">
        <td style="font-size:11px;font-weight:700;color:var(--text-muted)">#${idx+1}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <img src="${c.photo||''}" style="width:32px;height:32px;border-radius:50%;object-fit:cover"
              onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=6C63FF&color=fff'"/>
            <div>
              <div style="font-weight:700;font-size:13px">${esc(c.name)}</div>
              <div style="font-size:11px;color:var(--text-muted)">${esc(c.role||'—')}</div>
            </div>
          </div>
        </td>
        <td style="font-size:12px;color:var(--text-secondary)">${esc(c.department||'—')}</td>
        <td style="font-size:12px">${c.experience}y</td>
        <td><span style="font-size:12px;font-weight:700;color:var(--accent-green)">${c.performance_score}%</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div class="progress-bar" style="width:60px"><div class="progress-fill ${c.current_workload>70?'red':c.current_workload>50?'amber':''}" style="width:${c.current_workload}%"></div></div>
            <span style="font-size:11px">${c.current_workload}%</span>
          </div>
        </td>
        <td style="font-size:12px">${c.completed_projects}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div class="progress-bar" style="width:60px"><div class="progress-fill" style="width:${c.skill_match}%"></div></div>
            <span style="font-size:11px">${c.skill_match}%</span>
          </div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:4px">
            <div class="progress-bar" style="width:60px"><div class="progress-fill ${c.confidence<50?'red':c.confidence<70?'amber':''}" style="width:${c.confidence}%"></div></div>
            <span style="font-size:11px;font-weight:700;color:${c.confidence>=70?'var(--accent-green)':c.confidence>=50?'var(--accent-amber)':'var(--accent-red)'}">${c.confidence}%</span>
          </div>
        </td>
        <td>
          <input type="radio" name="lead-candidate" value="${c.employee_id}" style="accent-color:var(--accent-purple)"/>
        </td>
      </tr>
    `).join('');
    // Store alternatives
    window._leadCandidates = candidates;
  } catch(e) { console.error(e); }
}

function selectLeadCandidate(empId, confidence) {
  _selectedLeadEmpId = empId;
  _selectedLeadScore = confidence;
  document.getElementById('btn-submit-lead').disabled = false;
  document.querySelectorAll('.lead-candidate-row').forEach(row => {
    row.style.background = '';
    row.style.borderLeft = '';
  });
  const row = document.getElementById(`cand-row-${empId}`);
  if (row) {
    row.style.background = 'rgba(108,99,255,0.08)';
    row.style.borderLeft = '3px solid var(--accent-purple)';
  }
  // Check radio
  const radio = row?.querySelector('input[type=radio]');
  if (radio) radio.checked = true;
}

async function submitLeadSelection() {
  if (!_selectedLeadEmpId) { toast('Please select a candidate.', 'warning'); return; }
  const reason = document.getElementById('lead-selection-reason').value.trim();
  const altIds = (window._leadCandidates || [])
    .filter(c => c.employee_id !== _selectedLeadEmpId)
    .slice(0, 2)
    .map(c => c.employee_id);

  try {
    const resp = await fetch(`/api/teams/${_leadModalTeamId}/select-lead`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: _selectedLeadEmpId,
        reason: reason || 'Best overall candidate score.',
        confidence: _selectedLeadScore,
        alternative_ids: altIds
      })
    });
    if (resp.ok) {
      toast('Lead selection submitted! Waiting for Admin approval.', 'success');
      closeModal('modal-select-lead');
      await loadWorkflowView(currentProject.project_id);
    } else {
      toast('Failed to submit lead selection.', 'error');
    }
  } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════════════
// AI ASSIGNMENT
// ═══════════════════════════════════════════════════
async function runFullAIAssignment() {
  const btn = document.getElementById('btn-run-ai');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Running AI…';
  document.getElementById('ai-assignment-results').innerHTML =
    `<div class="empty-state"><div class="spinner spinner-lg"></div><p>AI is scoring ${20} employees across all teams…</p></div>`;

  try {
    const resp = await fetch(`/api/projects/${currentProject.project_id}/ai-assign-all`, {
      method: 'POST'
    });
    if (!resp.ok) { toast('AI assignment failed.', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Run AI Assignment Engine'; return; }
    const data = await resp.json();
    currentAIAssignments = data.assignments || [];
    toast(`AI assigned ${currentAIAssignments.length} employees!`, 'success');
    // Move to review panel
    await loadWorkflowView(currentProject.project_id);
    renderReviewAssignments(currentAIAssignments);
  } catch(e) {
    console.error(e);
    toast('Error running AI.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Re-run AI';
  }
}

function renderReviewAssignments(assignments) {
  const container = document.getElementById('review-assignments-list');
  if (!container) return;
  if (!assignments.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-robot"></i><p>No assignments generated. Ensure teams have approved leads.</p></div>`;
    return;
  }
  // Group by team
  const byTeam = {};
  assignments.forEach(a => {
    if (!byTeam[a.team_id]) byTeam[a.team_id] = { team_name: a.team_name, members: [] };
    byTeam[a.team_id].members.push(a);
  });

  container.innerHTML = Object.entries(byTeam).map(([tid, group]) => `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa-solid fa-people-group"></i> ${esc(group.team_name)}</div>
        <span class="badge badge-green">${group.members.length} members assigned</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${group.members.map((a, idx) => `
          <div class="ai-decision-card" id="ai-card-${a.id}" style="padding-left:24px">
            <div class="ai-card-header">
              <img class="ai-card-avatar" src="${'https://ui-avatars.com/api/?name=' + encodeURIComponent(a.employee_name) + '&background=6C63FF&color=fff'}" alt="${esc(a.employee_name)}"/>
              <div class="ai-card-emp-info">
                <div class="ai-card-emp-name">${esc(a.employee_name)}</div>
                <div class="ai-card-emp-role">${esc(a.assigned_role)}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:20px;font-weight:800;color:var(--accent-purple)">${a.ai_confidence}%</div>
                <div style="font-size:10px;color:var(--text-muted)">Confidence</div>
              </div>
            </div>

            <div class="ai-metric-bars">
              <div class="ai-metric-bar">
                <div class="ai-metric-label">Skill Match</div>
                <div class="ai-metric-track"><div class="ai-metric-fill" style="width:${a.skill_match}%"></div></div>
                <div class="ai-metric-val">${a.skill_match}%</div>
              </div>
              <div class="ai-metric-bar">
                <div class="ai-metric-label">Experience</div>
                <div class="ai-metric-track"><div class="ai-metric-fill green" style="width:${a.experience_pct}%"></div></div>
                <div class="ai-metric-val">${a.experience_pct}%</div>
              </div>
              <div class="ai-metric-bar">
                <div class="ai-metric-label">Availability</div>
                <div class="ai-metric-track"><div class="ai-metric-fill amber" style="width:${a.availability_pct}%"></div></div>
                <div class="ai-metric-val">${a.availability_pct}%</div>
              </div>
              <div class="ai-metric-bar">
                <div class="ai-metric-label">Performance</div>
                <div class="ai-metric-track"><div class="ai-metric-fill green" style="width:${a.performance}%"></div></div>
                <div class="ai-metric-val">${a.performance}%</div>
              </div>
            </div>

            <div class="ai-trace-list">
              ${(a.decision_trace || []).map(t => `<div class="ai-trace-item"><i class="fa-solid fa-check-circle"></i>${esc(t)}</div>`).join('')}
            </div>

            ${a.alternative ? `
              <div class="ai-alternative">
                <div class="ai-alt-label">Alternative</div>
                <div class="ai-alt-name">${esc(a.alternative.employee_name || 'None')}</div>
                <div class="ai-alt-reason">${esc(a.alternative.reason_not_selected || '')}</div>
              </div>
            ` : ''}

            <div class="ai-card-actions">
              <button class="btn btn-ghost btn-sm" onclick="openReplaceModal(${JSON.stringify(idx)}, '${a.team_id}')">
                <i class="fa-solid fa-user-pen"></i> Replace
              </button>
              <button class="btn btn-success btn-sm">
                <i class="fa-solid fa-check"></i> Accept
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

async function saveAndProceedPublish() {
  if (!currentAIAssignments.length) { toast('Run AI assignment first.', 'warning'); return; }
  try {
    await fetch(`/api/projects/${currentProject.project_id}/save-assignments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: currentAIAssignments })
    });
    toast('Assignments saved! Ready to publish.', 'success');
    await loadWorkflowView(currentProject.project_id);
  } catch(e) { console.error(e); }
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
function openReplaceModal(idx, teamId) {
  replacingAssignmentIdx = idx;
  openModal('modal-replace-emp');
  const sel = document.getElementById('replace-emp-select');
  const assignedIds = new Set(currentAIAssignments.map(a => a.employee_id));
  sel.innerHTML = allEmployees
    .filter(e => !assignedIds.has(e.employee_id))
    .map(e => `<option value="${e.employee_id}">${esc(e.name)} — ${esc(e.role||'')}</option>`)
    .join('');
}

function confirmReplaceEmployee() {
  const sel = document.getElementById('replace-emp-select');
  const newEmpId = sel.value;
  const newEmp = allEmployees.find(e => e.employee_id === newEmpId);
  if (!newEmp || replacingAssignmentIdx < 0) return;
  currentAIAssignments[replacingAssignmentIdx].employee_id   = newEmpId;
  currentAIAssignments[replacingAssignmentIdx].employee_name = newEmp.name;
  currentAIAssignments[replacingAssignmentIdx].assigned_role = newEmp.role;
  currentAIAssignments[replacingAssignmentIdx].ai_confidence = 0;
  currentAIAssignments[replacingAssignmentIdx].ai_reason     = 'Manually replaced by PM.';
  toast(`Replaced with ${newEmp.name}.`, 'success');
  closeModal('modal-replace-emp');
  renderReviewAssignments(currentAIAssignments);
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
      <div class="card">
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
        <div class="info-list" style="margin-bottom:12px">
          <div class="info-item"><span class="info-key">Deadline</span><span class="info-val">${t.deadline || '—'}</span></div>
          <div class="info-item"><span class="info-key">Est. Hours</span><span class="info-val">${t.estimated_hours || 0}h</span></div>
        </div>
        ${t.status !== 'Completed' ? `
          <div style="display:flex;gap:8px">
            ${t.status === 'To Do' ? `<button class="btn btn-primary btn-sm" onclick="updateTaskStatus('${t.id}', 'In Progress')"><i class="fa-solid fa-play"></i> Start Task</button>` : ''}
            ${t.status === 'In Progress' ? `<button class="btn btn-success btn-sm" onclick="updateTaskStatus('${t.id}', 'Review')"><i class="fa-solid fa-paper-plane"></i> Submit for Review</button>` : ''}
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
  requestAnimationFrame(() => overlay.classList.add('open'));
  // Special on-open actions
  if (id === 'modal-create-project') loadPMsIntoDropdown();
  if (id === 'modal-add-team') populateModuleSelector();
  if (id === 'modal-create-task') populateTaskAssignees();
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => overlay.style.display = '', 200);
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
