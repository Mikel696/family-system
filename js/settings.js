const Settings = (() => {
  function render() {
    _renderProfiles();
    _renderCurrency();
    _renderNotif();
    _renderTheme();
    _renderDriveSync();
    _renderData();
  }

  function _renderProfiles() {
    const s = State.getSettings();
    const profiles = s.profiles || {};
    document.getElementById('settingsProfiles').innerHTML = `
      <div class="profile-editor">
        ${['karen','miguel'].map(u => {
          const p = profiles[u] || { name: u, avatar: u==='karen'?'👩':'👨', color: '#8B5CF6' };
          return `
            <div class="profile-row">
              <div style="font-size:36px;cursor:pointer" onclick="Settings._editAvatar('${u}')" title="Cambiar emoji">${p.avatar}</div>
              <div class="profile-info">
                <div class="profile-name">
                  <input type="text" class="form-input" value="${Utils.escHtml(p.name)}" id="pName-${u}" placeholder="Nombre" style="max-width:180px" oninput="Settings._saveName('${u}',this.value)">
                </div>
                <div class="profile-role">${u === 'karen' ? 'Perfil Karen' : 'Perfil Miguel'}</div>
              </div>
            </div>`;
        }).join('')}
        <div class="profile-row" style="opacity:0.7">
          <div style="font-size:36px">🏠</div>
          <div class="profile-info">
            <div class="profile-name fw-700">Hogar</div>
            <div class="profile-role">Vista compartida</div>
          </div>
        </div>
      </div>`;
  }

  function _editAvatar(user) {
    const emojis = ['👩','👨','👱‍♀️','👱','🧑','👩‍💼','👨‍💼','👩‍🎓','👨‍🎓','👸','🤴','🦸‍♀️','🦸‍♂️','🧝‍♀️','🧝‍♂️'];
    App.openModal(`Cambiar Avatar — ${user}`, `
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
        ${emojis.map(e=>`<button style="font-size:36px;padding:8px;border-radius:12px;border:2px solid var(--border);background:var(--bg3);cursor:pointer" onclick="Settings._saveAvatar('${user}','${e}');App.closeModal()">${e}</button>`).join('')}
      </div>`);
  }

  function _saveAvatar(user, avatar) {
    const s = State.getSettings();
    s.profiles = s.profiles || {};
    s.profiles[user] = { ...(s.profiles[user]||{}), avatar };
    State.saveSettings(s);
    render();
  }

  function _saveName(user, name) {
    const s = State.getSettings();
    s.profiles = s.profiles || {};
    s.profiles[user] = { ...(s.profiles[user]||{}), name };
    State.saveSettings(s);
  }

  function _renderCurrency() {
    const s = State.getSettings();
    document.getElementById('settingsCurrency').innerHTML = `
      <div class="setting-item">
        <div><div class="setting-label">Moneda</div><div class="setting-desc">Moneda principal</div></div>
        <select class="form-select" id="setCurrency" onchange="Settings._saveCurrency()">
          <option value="COP" ${(s.currency||'COP')==='COP'?'selected':''}>🇨🇴 COP — Peso Colombiano</option>
          <option value="USD" ${s.currency==='USD'?'selected':''}>🇺🇸 USD — Dólar</option>
          <option value="EUR" ${s.currency==='EUR'?'selected':''}>🇪🇺 EUR — Euro</option>
        </select>
      </div>
      <div class="setting-item">
        <div><div class="setting-label">Símbolo</div><div class="setting-desc">Símbolo de moneda</div></div>
        <input type="text" class="form-input" style="max-width:80px" id="setCurrSym" value="${Utils.escHtml(s.currencySymbol||'$')}" oninput="Settings._saveCurrSym(this.value)" maxlength="3">
      </div>`;
  }

  function _saveCurrency() {
    const s = State.getSettings();
    s.currency = document.getElementById('setCurrency')?.value || 'COP';
    State.saveSettings(s);
    App.toast('Moneda actualizada','success');
  }

  function _saveCurrSym(v) {
    const s = State.getSettings();
    s.currencySymbol = v;
    State.saveSettings(s);
  }

  function _renderNotif() {
    const s = State.getSettings();
    document.getElementById('settingsNotif').innerHTML = `
      <div class="setting-item">
        <div><div class="setting-label">Notificaciones</div><div class="setting-desc">Alertas de pagos próximos</div></div>
        <label class="toggle"><input type="checkbox" id="setNotif" ${s.notifications?'checked':''} onchange="Settings._saveNotif(this.checked)"><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-item">
        <div><div class="setting-label">Días de anticipación</div><div class="setting-desc">Avisar con X días</div></div>
        <input type="number" class="form-input" style="max-width:80px" value="${s.notifDays||3}" min="1" max="30" id="setNotifDays" oninput="Settings._saveNotifDays(this.value)">
      </div>
      <div style="margin-top:8px">
        <button class="btn-outline" onclick="Settings._testNotif()">🔔 Probar notificación</button>
      </div>`;
  }

  function _saveNotif(v) {
    const s = State.getSettings();
    s.notifications = v;
    State.saveSettings(s);
    if (v && 'Notification' in window) Notification.requestPermission();
  }

  function _saveNotifDays(v) {
    const s = State.getSettings();
    s.notifDays = parseInt(v)||3;
    State.saveSettings(s);
  }

  function _testNotif() {
    if ('Notification' in window) {
      Notification.requestPermission().then(p => {
        if (p === 'granted') {
          new Notification('💜 Family System', { body: 'Las notificaciones funcionan correctamente ✓' });
        }
      });
    }
    App.toast('Notificación enviada','info');
  }

  function _renderTheme() {
    const s = State.getSettings();
    document.getElementById('settingsTheme').innerHTML = `
      <div class="setting-item">
        <div><div class="setting-label">Modo Oscuro</div><div class="setting-desc">Tema predeterminado</div></div>
        <label class="toggle"><input type="checkbox" ${(s.theme||'dark')==='dark'?'checked':''} onchange="Settings._saveTheme(this.checked)"><span class="toggle-slider"></span></label>
      </div>
      <div style="margin-top:12px">
        <button class="btn-outline" onclick="App.toggleTheme()">🌙 Cambiar Tema</button>
      </div>`;
  }

  function _saveTheme(isDark) {
    const s = State.getSettings();
    s.theme = isDark ? 'dark' : 'light';
    State.saveSettings(s);
    document.documentElement.setAttribute('data-theme', s.theme);
  }

  function _renderDriveSync() {
    const clientId  = State.get('drive_client_id', '');
    const connected = DriveSync.isConnected();
    const lastSync  = State.get('drive_last_sync');
    const el        = document.getElementById('settingsDrive');
    if (!el) return;
    el.innerHTML = `
      <div class="drive-setup-box">
        <h4>¿Cómo configurar Google Drive Sync?</h4>
        <p>Para sincronizar tus datos en tiempo real entre dispositivos necesitas un <b>Client ID de Google OAuth2</b>. Es gratuito y toma 5 minutos:</p>
        <ol class="drive-steps">
          <li>Ve a <a href="https://console.cloud.google.com/" target="_blank">console.cloud.google.com</a></li>
          <li>Crea un proyecto → <b>APIs y Servicios → Credenciales</b></li>
          <li>Haz clic en <b>+ Crear credenciales → ID de cliente de OAuth 2.0</b></li>
          <li>Tipo: <b>Aplicación web</b></li>
          <li>En "Orígenes de JavaScript autorizados" agrega: <code style="background:var(--bg);padding:2px 6px;border-radius:4px;font-size:11px">${window.location.origin}</code></li>
          <li>Copia el <b>Client ID</b> y pégalo abajo</li>
          <li>Ve a <b>Biblioteca</b> y activa la <b>Google Drive API</b></li>
        </ol>
      </div>
      <div class="form-group">
        <label class="form-label">Google OAuth2 Client ID</label>
        <input type="text" id="driveClientId" class="form-input"
          value="${Utils.escHtml(clientId)}"
          placeholder="XXXXXXXXXXXXX.apps.googleusercontent.com">
        <div style="font-size:11px;color:var(--text-m);margin-top:4px">
          Tu Client ID se guarda solo en este dispositivo, nunca se envía a terceros.
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <span id="driveSyncDot" style="width:10px;height:10px;border-radius:50%;background:#6B7280;display:inline-block"></span>
        <span id="driveSyncLabel" style="font-size:13px;color:var(--text-m)">${connected ? 'Conectado' : 'No conectado'}</span>
        <span id="driveLastSync" style="font-size:11px;color:var(--text-s)">${lastSync ? 'Última sync: ' + Utils.formatDateTime(lastSync) : ''}</span>
      </div>
      <div class="btn-group">
        <button class="btn-primary" onclick="Settings._saveClientId()">💾 Guardar Client ID</button>
        ${connected
          ? `<button class="btn-success"  onclick="DriveSync.push()">🔄 Sincronizar ahora</button>
             <button class="btn-outline"  onclick="DriveSync.pull()">⬇️ Descargar desde Drive</button>
             <button class="btn-danger"   onclick="DriveSync.disconnect()">🔌 Desconectar</button>`
          : `<button class="btn-success"  onclick="DriveSync.connect()">🔗 Conectar con Google</button>`
        }
      </div>`;
    // Restore dot color
    DriveSync._setStatus(DriveSync.getStatus());
  }

  function _saveClientId() {
    const val = document.getElementById('driveClientId')?.value.trim();
    if (!val) { App.toast('Pega tu Client ID primero', 'warning'); return; }
    State.set('drive_client_id', val);
    App.toast('Client ID guardado. Haz clic en Conectar.', 'success');
    DriveSync.init();
    render();
  }

  function _renderData() {
    const txCount  = State.getTransactions().length;
    const noteCount = State.getNotes().length;
    const taskCount = State.getTaskLists().reduce((s,l)=>s+(l.tasks||[]).length,0);
    const size      = JSON.stringify(localStorage).length;

    document.getElementById('settingsData').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">
        <div class="stat-card"><div class="stat-icon">💸</div><div class="stat-label">Transacciones</div><div class="stat-value">${txCount}</div></div>
        <div class="stat-card"><div class="stat-icon">📝</div><div class="stat-label">Notas</div><div class="stat-value">${noteCount}</div></div>
        <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-label">Tareas</div><div class="stat-value">${taskCount}</div></div>
        <div class="stat-card"><div class="stat-icon">💾</div><div class="stat-label">Datos</div><div class="stat-value">${Utils.fileSize(size)}</div></div>
      </div>
      <div class="btn-group">
        <button class="btn-primary" onclick="Settings.exportData()">📤 Exportar Backup</button>
        <button class="btn-outline" onclick="Settings.importData()">📥 Importar Backup</button>
        <button class="btn-outline" onclick="Reports.exportCSV()">📊 Exportar CSV</button>
        <button class="btn-danger" onclick="Settings.clearData()">🗑️ Limpiar Datos</button>
      </div>
      <input type="file" id="importFileInput" style="display:none" accept=".json" onchange="Settings._doImport(this.files[0])">`;
  }

  function exportData() {
    const data = {
      version:      '1.0',
      exportedAt:   new Date().toISOString(),
      transactions: State.getTransactions(),
      savings:      State.getSavings(),
      debts:        State.getDebts(),
      notes:        State.getNotes(),
      taskLists:    State.getTaskLists(),
      paymentServices: State.getPaymentServices(),
      settings:     State.getSettings()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `family-system-backup-${Utils.today()}.json`; a.click();
    URL.revokeObjectURL(url);
    App.toast('Backup exportado ✓','success');
  }

  function importData() {
    document.getElementById('importFileInput')?.click();
  }

  function _doImport(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!confirm(`¿Importar backup del ${Utils.formatDate(data.exportedAt)}? Esto reemplazará los datos actuales.`)) return;
        if (data.transactions)     State.set('transactions', data.transactions);
        if (data.savings)          State.set('savings', data.savings);
        if (data.debts)            State.set('debts', data.debts);
        if (data.notes)            State.set('notes', data.notes);
        if (data.taskLists)        State.set('tasklists', data.taskLists);
        if (data.paymentServices)  State.set('payment_services', data.paymentServices);
        if (data.settings)         State.set('settings', data.settings);
        App.toast('Backup importado ✓','success');
        render();
        Dashboard.render();
      } catch { App.toast('Error al leer el archivo','error'); }
    };
    reader.readAsText(file);
  }

  function clearData() {
    if (!confirm('⚠️ ¿Eliminar TODOS los datos? Esta acción no se puede deshacer.')) return;
    if (!confirm('¿Estás seguro? Se eliminarán todas las transacciones, notas, tareas, etc.')) return;
    ['transactions','savings','debts','notes','tasklists','payment_services'].forEach(k => State.set(k, []));
    App.toast('Datos eliminados','info');
    render();
    Dashboard.render();
  }

  return { render, exportData, importData, _doImport, clearData, _editAvatar, _saveAvatar, _saveName, _saveCurrency, _saveCurrSym, _saveNotif, _saveNotifDays, _testNotif, _saveTheme, _saveClientId, _renderDriveSync };
})();
