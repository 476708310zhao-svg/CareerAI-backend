// admin/js/common.js — 公共工具：鉴权、请求、导航、Toast

// ─── 鉴权 ─────────────────────────────────────────────────────────────────────
function getToken()    { return localStorage.getItem('adminToken'); }
function getUsername() { return localStorage.getItem('adminUsername') || 'Admin'; }
function logout() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUsername');
  window.location.href = '/admin/index.html';
}
function requireAuth() {
  if (!getToken()) { window.location.replace('/admin/index.html'); return false; }
  return true;
}

// ─── 请求封装 ─────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const token = getToken();
  const isFormData = opts.body instanceof FormData;
  const headers = { 'Authorization': 'Bearer ' + token };
  if (!isFormData) headers['Content-Type'] = 'application/json';
  Object.assign(headers, opts.headers || {});

  const res = await fetch(window.ADMIN_API + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body
      ? (isFormData ? opts.body : JSON.stringify(opts.body))
      : undefined
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}
const GET    = (path)        => api(path);
const POST   = (path, body)  => api(path, { method: 'POST',   body });
const PUT    = (path, body)  => api(path, { method: 'PUT',    body });
const DELETE = (path)        => api(path, { method: 'DELETE' });

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid fa-${type==='success'?'check':type==='error'?'xmark':'info'}"></i> ${msg}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── 确认对话框 ───────────────────────────────────────────────────────────────
function confirm(msg, onOk) {
  const existing = document.getElementById('confirmOverlay');
  if (existing) existing.remove();
  const html = `
    <div id="confirmOverlay" class="modal-overlay show" onclick="if(event.target===this)this.remove()">
      <div class="modal-box" style="max-width:380px">
        <div class="modal-header"><h3>确认操作</h3></div>
        <div class="modal-body"><p style="font-size:14px;color:#374151">${msg}</p></div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="document.getElementById('confirmOverlay').remove()">取消</button>
          <button class="btn btn-danger" id="confirmOk">确认删除</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('confirmOk').onclick = () => {
    document.getElementById('confirmOverlay').remove();
    onOk();
  };
}

// ─── Modal 工具 ───────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function closeAllModals() {
  document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
}

// ─── 分页组件 ─────────────────────────────────────────────────────────────────
function renderPagination(containerId, currentPage, total, pageSize, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const totalPages = Math.ceil(total / pageSize);
  let html = `<button class="pagi-btn" ${currentPage<=1?'disabled':''} onclick="(${onPageChange})(${currentPage-1})">‹</button>`;
  const start = Math.max(1, currentPage - 2);
  const end   = Math.min(totalPages, start + 4);
  for (let p = start; p <= end; p++) {
    html += `<button class="pagi-btn ${p===currentPage?'active':''}" onclick="(${onPageChange})(${p})">${p}</button>`;
  }
  html += `<button class="pagi-btn" ${currentPage>=totalPages?'disabled':''} onclick="(${onPageChange})(${currentPage+1})">›</button>`;
  html += `<span class="pagi-info">共 ${total} 条 / ${totalPages} 页</span>`;
  container.innerHTML = html;
}

// ─── 侧边栏 ───────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard',     icon: 'fa-gauge',        label: '概览',      href: 'dashboard.html' },
  { id: 'banners',       icon: 'fa-images',        label: 'Banner管理', href: 'banners.html' },
  { id: 'jobs',          icon: 'fa-briefcase',    label: '岗位管理',  href: 'jobs.html' },
  { id: 'companies',     icon: 'fa-building-user', label: '公司管理',  href: 'companies.html' },
  { id: 'experiences',   icon: 'fa-file-lines',   label: '面经管理',  href: 'experiences.html' },
  { id: 'comments',      icon: 'fa-comments',     label: '评论管理',  href: 'comments.html' },
  { id: 'campus',        icon: 'fa-calendar-days', label: '校招日历', href: 'campus.html' },
  { id: 'agencies',      icon: 'fa-building',     label: '机构管理',  href: 'agencies.html' },
  { id: 'announcements', icon: 'fa-newspaper',    label: '资讯公告',  href: 'announcements.html' },
  { id: 'users',         icon: 'fa-users',        label: '用户管理',  href: 'users.html' },
  { id: 'resumes',       icon: 'fa-id-card',      label: '简历管理',  href: 'resumes.html' },
];

function renderLayout(activeId, pageTitle) {
  if (!requireAuth()) return;
  const nav = NAV_ITEMS.map(item => `
    <a class="nav-item ${item.id===activeId?'active':''}" href="${item.href}">
      <i class="fa-solid ${item.icon}"></i>
      <span>${item.label}</span>
    </a>`).join('');

  document.body.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-title">🎯 求职助手</div>
          <div class="brand-sub">管理后台</div>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-section-title">功能模块</div>
          ${nav}
        </nav>
        <div class="sidebar-footer">
          <div class="admin-name">${getUsername()}</div>
          <button class="nav-item" style="margin-top:6px" onclick="logout()">
            <i class="fa-solid fa-right-from-bracket"></i><span>退出登录</span>
          </button>
        </div>
      </aside>
      <div class="main">
        <div class="topbar">
          <span class="topbar-title">${pageTitle}</span>
          <div class="topbar-right">
            <span style="font-size:13px;color:#6b7280">${getUsername()}</span>
            <button class="btn-logout" onclick="logout()">退出</button>
          </div>
        </div>
        <div class="content" id="pageContent"></div>
      </div>
    </div>` + document.body.innerHTML.replace(/<div class="layout">[\s\S]*/, '');
}

// 简化版：仅渲染框架壳，内容区由各页面自填
function initPage(activeId, pageTitle, renderFn) {
  if (!requireAuth()) return;

  const sidebarNav = NAV_ITEMS.map(item => `
    <a class="nav-item ${item.id===activeId?'active':''}" href="${item.href}">
      <i class="fa-solid ${item.icon}"></i>
      <span>${item.label}</span>
    </a>`).join('');

  document.getElementById('sidebarNav').innerHTML = sidebarNav;
  document.getElementById('adminUsername').textContent = getUsername();
  document.getElementById('adminUsername2').textContent = getUsername();
  document.getElementById('pageTitle').textContent = pageTitle;

  renderFn && renderFn();
}

// ─── 日期格式化 ───────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '-';
  return str.slice(0, 10);
}

// ─── 文本截断 ─────────────────────────────────────────────────────────────────
function truncate(str, len = 30) {
  if (!str) return '-';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

// ─── HTML 转义 ────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
