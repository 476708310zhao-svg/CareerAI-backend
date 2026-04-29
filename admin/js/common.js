// admin/js/common.js
// Shared admin utilities: auth, request helpers, layout, toast, modal and table helpers.

function getToken() {
  return localStorage.getItem('adminToken');
}

function getUsername() {
  return localStorage.getItem('adminUsername') || 'Admin';
}

function logout() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUsername');
  window.location.href = '/admin/index.html';
}

function requireAuth() {
  if (!getToken()) {
    window.location.replace('/admin/index.html');
    return false;
  }
  return true;
}

async function api(path, opts = {}) {
  const token = getToken();
  const isFormData = opts.body instanceof FormData;
  const headers = { Authorization: `Bearer ${token}` };
  if (!isFormData) headers['Content-Type'] = 'application/json';
  Object.assign(headers, opts.headers || {});

  const res = await fetch(window.ADMIN_API + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? (isFormData ? opts.body : JSON.stringify(opts.body)) : undefined
  });

  if (res.status === 401) {
    logout();
    return null;
  }
  return res.json();
}

const GET = path => api(path);
const POST = (path, body) => api(path, { method: 'POST', body });
const PUT = (path, body) => api(path, { method: 'PUT', body });
const DELETE = path => api(path, { method: 'DELETE' });

function toast(msg, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icon = type === 'success' ? 'check' : type === 'error' ? 'xmark' : 'info';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid fa-${icon}"></i><span>${esc(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function confirm(msg, onOk) {
  const existing = document.getElementById('confirmOverlay');
  if (existing) existing.remove();

  const html = `
    <div id="confirmOverlay" class="modal-overlay show" onclick="if(event.target===this)this.remove()">
      <div class="modal-box confirm-box">
        <div class="modal-header">
          <h3>确认操作</h3>
          <button class="modal-close" onclick="document.getElementById('confirmOverlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <p class="confirm-text">${esc(msg)}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="document.getElementById('confirmOverlay').remove()">取消</button>
          <button class="btn btn-danger" id="confirmOk">确认</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('confirmOk').onclick = () => {
    document.getElementById('confirmOverlay').remove();
    onOk();
  };
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
}

function renderPagination(containerId, currentPage, total, pageSize, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  let html = `<button class="pagi-btn" ${currentPage <= 1 ? 'disabled' : ''} onclick="(${onPageChange})(${currentPage - 1})">‹</button>`;

  for (let p = start; p <= end; p += 1) {
    html += `<button class="pagi-btn ${p === currentPage ? 'active' : ''}" onclick="(${onPageChange})(${p})">${p}</button>`;
  }

  html += `<button class="pagi-btn" ${currentPage >= totalPages ? 'disabled' : ''} onclick="(${onPageChange})(${currentPage + 1})">›</button>`;
  html += `<span class="pagi-info">共 ${total} 条 / ${totalPages} 页</span>`;
  container.innerHTML = html;
}

const NAV_ITEMS = [
  { id: 'dashboard', icon: 'fa-gauge-high', label: '概览', href: 'dashboard.html' },
  { id: 'banners', icon: 'fa-images', label: 'Banner管理', href: 'banners.html' },
  { id: 'jobs', icon: 'fa-briefcase', label: '岗位管理', href: 'jobs.html' },
  { id: 'companies', icon: 'fa-building-user', label: '公司管理', href: 'companies.html' },
  { id: 'experiences', icon: 'fa-file-lines', label: '面经管理', href: 'experiences.html' },
  { id: 'comments', icon: 'fa-comments', label: '评论管理', href: 'comments.html' },
  { id: 'campus', icon: 'fa-calendar-days', label: '校招日历', href: 'campus.html' },
  { id: 'agencies', icon: 'fa-building', label: '机构管理', href: 'agencies.html' },
  { id: 'announcements', icon: 'fa-newspaper', label: '资讯公告', href: 'announcements.html' },
  { id: 'users', icon: 'fa-users', label: '用户管理', href: 'users.html' },
  { id: 'resumes', icon: 'fa-id-card', label: '简历管理', href: 'resumes.html' }
];

function renderNav(activeId) {
  return NAV_ITEMS.map(item => `
    <a class="nav-item ${item.id === activeId ? 'active' : ''}" href="${item.href}">
      <i class="fa-solid ${item.icon}"></i>
      <span>${item.label}</span>
    </a>`).join('');
}

function hydrateShell(activeId, pageTitle) {
  const brandTitle = document.querySelector('.brand-title');
  const brandSub = document.querySelector('.brand-sub');
  const navTitle = document.querySelector('.nav-section-title');
  const nav = document.getElementById('sidebarNav');
  const adminUsername = document.getElementById('adminUsername');
  const adminUsername2 = document.getElementById('adminUsername2');
  const title = document.getElementById('pageTitle');
  const logoutButtons = document.querySelectorAll('.sidebar-footer .nav-item span, .btn-logout');

  if (brandTitle) brandTitle.innerHTML = '<span class="brand-mark">Z</span><span>求职助手</span>';
  if (brandSub) brandSub.textContent = '管理后台';
  if (navTitle) navTitle.textContent = '功能模块';
  if (nav) nav.innerHTML = renderNav(activeId);
  if (adminUsername) adminUsername.textContent = getUsername();
  if (adminUsername2) adminUsername2.textContent = getUsername();
  if (title) title.textContent = pageTitle;
  logoutButtons.forEach(btn => {
    if (btn.classList && btn.classList.contains('btn-logout')) btn.textContent = '退出';
    if (btn.tagName === 'SPAN' && btn.textContent.includes('退')) btn.textContent = '退出登录';
  });
}

function renderLayout(activeId, pageTitle) {
  if (!requireAuth()) return;
  document.body.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-title"><span class="brand-mark">Z</span><span>求职助手</span></div>
          <div class="brand-sub">管理后台</div>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-section-title">功能模块</div>
          <div id="sidebarNav">${renderNav(activeId)}</div>
        </nav>
        <div class="sidebar-footer">
          <div class="admin-name" id="adminUsername">${getUsername()}</div>
          <button class="nav-item" style="margin-top:6px" onclick="logout()">
            <i class="fa-solid fa-right-from-bracket"></i><span>退出登录</span>
          </button>
        </div>
      </aside>
      <div class="main">
        <div class="topbar">
          <span class="topbar-title" id="pageTitle">${pageTitle}</span>
          <div class="topbar-right">
            <span class="topbar-user" id="adminUsername2">${getUsername()}</span>
            <button class="btn-logout" onclick="logout()">退出</button>
          </div>
        </div>
        <div class="content" id="pageContent"></div>
      </div>
    </div>`;
}

function initPage(activeId, pageTitle, renderFn) {
  if (!requireAuth()) return;
  hydrateShell(activeId, pageTitle);
  renderFn && renderFn();
}

function fmtDate(str) {
  if (!str) return '-';
  return String(str).slice(0, 10);
}

function truncate(str, len = 30) {
  if (!str) return '-';
  const text = String(str);
  return text.length > len ? `${text.slice(0, len)}...` : text;
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
