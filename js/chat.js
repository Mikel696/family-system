/* Chat — Botón flotante de chat en tiempo real entre Karen y Miguel.
 * Usa la tabla `messages` de Supabase + Realtime.
 * También permite enviar "sugerencias" sobre items del otro perfil.
 */
const Chat = (() => {
  let _client   = null;
  let _profile  = null;
  let _channel  = null;
  let _messages = [];
  let _unread   = 0;

  function init(client, profile) {
    _client  = client;
    _profile = profile;
    _renderUI();
    _loadHistory();
    _subscribe();
  }

  async function _loadHistory() {
    if (!_client) return;
    const { data, error } = await _client
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) { console.warn('chat history', error); return; }
    _messages = data || [];
    // Cuenta mensajes del otro perfil que llegaron después del último que vi
    const lastRead = State.get('chat_last_read', 0);
    _unread = _messages.filter(m =>
      m.from_profile !== _profile &&
      new Date(m.created_at).getTime() > lastRead
    ).length;
    _updateBadge();
    _renderMessages();
  }

  function _subscribe() {
    if (!_client) return;
    if (_channel) { try { _channel.unsubscribe(); } catch(e){} }
    _channel = _client.channel('chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        if (!payload.new) return;
        _messages.push(payload.new);
        if (payload.new.from_profile !== _profile) {
          const open = document.getElementById('chatPanel')?.classList.contains('open');
          if (!open) {
            _unread++;
            _updateBadge();
            const who = payload.new.from_profile === 'karen' ? '👩 Karen' : '👨 Miguel';
            const txt = (payload.new.text || '').slice(0, 80);
            if (typeof App !== 'undefined') App.toast(who + ': ' + txt, 'info', 3500);
          }
        }
        _renderMessages();
      })
      .subscribe();
  }

  function _renderUI() {
    if (document.getElementById('chatFab')) return;
    const fab = document.createElement('button');
    fab.id = 'chatFab';
    fab.className = 'chat-fab';
    fab.title = 'Chat familiar';
    fab.innerHTML = `💬<span id="chatBadge" class="chat-badge" style="display:none">0</span>`;
    fab.onclick = open;
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'chatPanel';
    panel.className = 'chat-panel';
    panel.innerHTML = `
      <div class="chat-header">
        <span>💬 Chat familiar</span>
        <button class="chat-close" onclick="Chat.close()" title="Cerrar">✕</button>
      </div>
      <div id="chatMessages" class="chat-messages"></div>
      <div class="chat-input-row">
        <input id="chatInput" class="chat-input" placeholder="Escribe un mensaje…"
          onkeydown="if(event.key==='Enter')Chat.send()">
        <button class="chat-send" onclick="Chat.send()" title="Enviar">➤</button>
      </div>`;
    document.body.appendChild(panel);
  }

  function _updateBadge() {
    const b = document.getElementById('chatBadge');
    if (b) {
      b.textContent = _unread > 99 ? '99+' : _unread;
      b.style.display = _unread > 0 ? 'flex' : 'none';
    }
    const fab = document.getElementById('chatFab');
    if (fab) fab.classList.toggle('has-unread', _unread > 0);
  }

  function open() {
    const p = document.getElementById('chatPanel');
    if (!p) return;
    p.classList.add('open');
    _unread = 0;
    _updateBadge();
    _renderMessages();
    // Marcar todo como leído hasta este momento (timestamp del último mensaje o ahora)
    const latest = _messages.length
      ? new Date(_messages[_messages.length - 1].created_at).getTime()
      : Date.now();
    State.set('chat_last_read', latest);
    setTimeout(() => document.getElementById('chatInput')?.focus(), 100);
  }

  function close() {
    document.getElementById('chatPanel')?.classList.remove('open');
  }

  function _renderMessages() {
    const el = document.getElementById('chatMessages');
    if (!el) return;
    if (!_messages.length) {
      el.innerHTML = `<div class="chat-empty">Aún no hay mensajes.<br>Empieza la conversación 💜</div>`;
      return;
    }
    const labelMap = { miguel: '👨 Miguel', karen: '👩 Karen' };
    el.innerHTML = _messages.map(m => {
      const own  = m.from_profile === _profile;
      const time = m.created_at ? new Date(m.created_at).toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' }) : '';
      const sug  = m.suggest_for
        ? `<div class="chat-suggest">💡 Sugerencia: <b>${Utils.escHtml(m.suggest_for.label || '(item)')}</b></div>`
        : '';
      return `<div class="chat-msg ${own ? 'own' : 'other'}">
        <div class="chat-msg-from">${labelMap[m.from_profile] || m.from_profile} · ${time}</div>
        ${sug}
        <div class="chat-msg-text">${Utils.escHtml(m.text || '')}</div>
      </div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  async function send(text) {
    const input = document.getElementById('chatInput');
    const t = (text || (input ? input.value : '') || '').trim();
    if (!t || !_client) return;
    if (input) input.value = '';
    const { error } = await _client.from('messages').insert({ from_profile: _profile, text: t });
    if (error && typeof App !== 'undefined') App.toast('No se pudo enviar: ' + error.message, 'error');
  }

  /* Envía una sugerencia con referencia a un item de otra persona */
  async function sendSuggestion(type, id, label) {
    if (!_client) return;
    // Si no se pasa label, lo buscamos según el tipo
    if (!label) {
      if (type === 'transaction') {
        const tx = State.getTransactions().find(t => t.id === id);
        label = tx ? (tx.description + ' — ' + (tx.amount||0)) : '(transacción)';
      } else {
        label = '(item)';
      }
    }
    const text = prompt('Sugerencia para: ' + label);
    if (!text || !text.trim()) return;
    const { error } = await _client.from('messages').insert({
      from_profile: _profile,
      text: text.trim(),
      suggest_for: { type, id, label }
    });
    if (error) { App.toast('No se envió: ' + error.message, 'error'); return; }
    App.toast('💡 Sugerencia enviada', 'success');
    open();
  }

  return { init, open, close, send, sendSuggestion };
})();
