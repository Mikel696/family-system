/* App — Shell, Navigation, Modal, Toast */
const App = (() => {
  let currentSection = 'dashboard';
  let currentUser    = 'shared';
  let _modalCloseCallback = null;

  const SECTION_TITLES = {
    dashboard:    'Inicio',
    transactions: 'Transacciones',
    savings:      'Metas de Ahorro',
    debts:        'Deudas',
    budget:       'Presupuesto',
    notes:        'Notas',
    tasks:        'Tareas',
    calendar:     'Calendario',
    payments:     'Portal de Pagos',
    reports:      'Reportes',
    settings:     'Ajustes'
  };

  function init() {
    currentUser = State.getUser();
    _applyTheme(State.getSettings().theme || 'dark');
    _updateUserUI();

    // Init each module
    const now = Utils.monthKey();
    document.getElementById('txMonth').value = now;
    document.getElementById('budgetMonth').value = now;

    navigate('dashboard');
    _requestNotifPermission();

    // Init Drive sync (after GIS library may have loaded)
    setTimeout(() => { if (typeof DriveSync !== 'undefined') DriveSync.init(); }, 1500);

    // Drive sync pill click → settings
    document.getElementById('driveSyncPill')?.addEventListener('click', () => navigate('settings'));
  }

  function navigate(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item, .bnav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.section === section);
    });
    const el = document.getElementById('sec-' + section);
    if (el) el.classList.add('active');
    currentSection = section;
    document.getElementById('pageTitle').textContent = SECTION_TITLES[section] || section;

    // Render on navigate
    const renders = {
      dashboard:    () => Dashboard.render(),
      transactions: () => Transactions.filter(),
      savings:      () => Savings.render(),
      debts:        () => Debts.render(),
      budget:       () => Budget.render(),
      notes:        () => Notes.render(),
      tasks:        () => Tasks.render(),
      calendar:     () => Calendar.render(),
      payments:     () => Payments.render(),
      reports:      () => Reports.render(),
      settings:     () => Settings.render()
    };
    if (renders[section]) renders[section]();
    // Cerrar el menú lateral (móvil) al elegir una sección
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('open');
    window.scrollTo(0, 0);
  }

  function switchUser(user) {
    currentUser = user;
    State.setUser(user);
    _updateUserUI();
    navigate(currentSection);
  }

  function getUser() { return currentUser; }

  function _updateUserUI() {
    const settings = State.getSettings();
    const profiles = settings.profiles || {};
    document.querySelectorAll('.user-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.user === currentUser);
    });
    const profile = profiles[currentUser] || { name: currentUser === 'shared' ? 'Hogar' : currentUser, avatar: currentUser === 'shared' ? '🏠' : '👤' };
    document.getElementById('topbarUserAvatar').textContent = profile.avatar;
    document.getElementById('topbarUserName').textContent   = profile.name;
  }

  function toggleSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    const open     = sidebar.classList.toggle('open');
    overlay.classList.toggle('open', open);
  }

  function toggleTheme() {
    const settings = State.getSettings();
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
    State.saveSettings(settings);
    _applyTheme(settings.theme);
    const btn = document.querySelector('.topbar-actions .btn-icon');
    btn.textContent = settings.theme === 'dark' ? '🌙' : '☀️';
  }

  function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.querySelector('.topbar-actions .btn-icon');
    if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
  }

  /* MODAL */
  function openModal(title, bodyHtml, opts = {}) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML    = bodyHtml;
    const modal = document.getElementById('modal');
    modal.className = 'modal' + (opts.large ? ' modal-lg' : '');
    document.getElementById('modalOverlay').classList.add('open');
    _modalCloseCallback = opts.onClose || null;
    // Focus first input
    setTimeout(() => {
      const first = modal.querySelector('input, select, textarea');
      if (first) first.focus();
    }, 100);
  }

  function closeModal(event) {
    if (event && event.target !== document.getElementById('modalOverlay')) return;
    document.getElementById('modalOverlay').classList.remove('open');
    if (_modalCloseCallback) { _modalCloseCallback(); _modalCloseCallback = null; }
  }

  /* TOAST */
  function toast(msg, type = 'info', duration = 3000) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${Utils.escHtml(msg)}</span>`;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  /* QUICK ADD */
  function showQuickAdd() {
    const html = `
      <div class="radio-group" style="margin-bottom:16px">
        <label class="radio-chip checked" id="qaTypeIncome" onclick="App._qaSetType('income')">
          <span>📈 Ingreso</span>
        </label>
        <label class="radio-chip" id="qaTypeExpense" onclick="App._qaSetType('expense')">
          <span>📉 Gasto</span>
        </label>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <input type="text" id="qaDesc" class="form-input" placeholder="¿En qué?">
        </div>
        <div class="form-group">
          <label class="form-label">Monto (COP)</label>
          <input type="number" id="qaAmount" class="form-input" placeholder="0" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Categoría</label>
          <select id="qaCategory" class="form-select">
            <option value="">Seleccionar...</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Persona</label>
          <select id="qaPerson" class="form-select">
            <option value="shared">🏠 Compartido</option>
            <option value="karen">👩 Karen</option>
            <option value="miguel">👨 Miguel</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="App._qaSave()">Guardar</button>
      </div>`;
    openModal('Agregar Rápido', html);
    _qaSetType('income');
    document.getElementById('qaPerson').value = currentUser !== 'shared' ? currentUser : 'shared';
  }

  let _qaType = 'income';
  function _qaSetType(t) {
    _qaType = t;
    document.getElementById('qaTypeIncome').classList.toggle('checked', t === 'income');
    document.getElementById('qaTypeExpense').classList.toggle('checked', t === 'expense');
    const cats = Utils.TX_CATEGORIES[t] || [];
    const sel  = document.getElementById('qaCategory');
    sel.innerHTML = `<option value="">Seleccionar...</option>` + cats.map(c => `<option>${c}</option>`).join('');
  }

  function _qaSave() {
    const desc   = document.getElementById('qaDesc').value.trim();
    const amount = parseFloat(document.getElementById('qaAmount').value);
    const cat    = document.getElementById('qaCategory').value;
    const person = document.getElementById('qaPerson').value;
    if (!desc || !amount) return toast('Completa descripción y monto', 'warning');
    const tx = {
      id: Utils.uuid(), type: _qaType, description: desc,
      amount, category: cat || 'Otros', person,
      date: Utils.today(), recurring: false, tags: [],
      attachments: [], voiceNotes: [], notes: '',
      createdAt: new Date().toISOString()
    };
    State.saveTransaction(tx);
    closeModal();
    toast(_qaType === 'income' ? 'Ingreso registrado ✓' : 'Gasto registrado ✓', 'success');
    if (currentSection === 'dashboard') Dashboard.render();
    if (currentSection === 'transactions') Transactions.filter();
  }

  function showUserMenu() {
    const settings = State.getSettings();
    const profiles = settings.profiles;
    openModal('Cambiar Usuario', `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${['karen','miguel','shared'].map(u => {
          const p = profiles[u] || { avatar: u==='shared'?'🏠':'👤', name: u };
          return `<button class="profile-row" onclick="App.switchUser('${u}');App.closeModal()" style="cursor:pointer">
            <span class="profile-avatar">${p.avatar}</span>
            <div class="profile-info">
              <div class="profile-name">${Utils.escHtml(p.name || u)}</div>
              <div class="profile-role">${u === 'shared' ? 'Vista compartida' : u === 'karen' ? 'Perfil Karen' : 'Perfil Miguel'}</div>
            </div>
            ${currentUser === u ? '<span style="color:var(--success)">✓</span>' : ''}
          </button>`;
        }).join('')}
      </div>
      <button class="btn-outline" style="width:100%;margin-top:14px" onclick="App.closeModal();Auth.logout()">🔒 Cerrar sesión</button>`);
  }

  function toggleMoreMenu() {
    document.getElementById('moreMenu').classList.toggle('open');
  }

  function _requestNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(() => {
        if (typeof Alerts !== 'undefined') Alerts.check();
      });
    }
  }

  return {
    init, navigate, switchUser, getUser, toggleSidebar, toggleTheme,
    openModal, closeModal, toast, showQuickAdd, _qaSetType, _qaSave,
    showUserMenu, toggleMoreMenu,
    _qaType: () => _qaType
  };
})();

/* Boot — Auth controla el arranque (muestra login o entra a la app) */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined') Auth.init();
  else App.init();
});

/* Close more menu on outside click */
document.addEventListener('click', e => {
  const menu = document.getElementById('moreMenu');
  if (menu && menu.classList.contains('open') && !e.target.closest('.bnav-more') && !e.target.closest('.more-menu')) {
    menu.classList.remove('open');
  }
  if (e.target === document.getElementById('sidebarOverlay')) App.toggleSidebar();
});
