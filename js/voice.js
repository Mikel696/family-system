/* Voice Notes — MediaRecorder API */
const Voice = (() => {
  let mediaRecorder = null;
  let chunks        = [];
  let timerInterval = null;
  let paused        = false;
  let _onSave       = null;   // callback(id, duration)
  let _segStart     = 0;      // start time of the current (un-paused) segment
  let _elapsed      = 0;      // seconds accumulated before the current segment

  function _supportedType() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const t of types) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }

  function start(onSave) {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      App.toast('Tu navegador no soporta grabación de audio', 'error');
      return;
    }
    if (mediaRecorder) { App.toast('Ya hay una grabación en curso', 'warning'); return; }
    _onSave = onSave;
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        chunks = []; paused = false; _elapsed = 0;
        const mime = _supportedType();
        mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
        mediaRecorder.start(250); // emit a chunk every 250ms
        _segStart = Date.now();
        document.getElementById('voiceRecorder').style.display = 'block';
        document.getElementById('voiceToggleBtn').textContent = '⏸';
        document.getElementById('voiceTime').textContent = '0:00';
        _startTimer();
      })
      .catch(err => {
        console.error('Mic error', err);
        App.toast('No se pudo acceder al micrófono. Revisa los permisos.', 'error');
        _onSave = null;
      });
  }

  function toggle() {
    if (!mediaRecorder) return;
    if (paused) {
      mediaRecorder.resume();
      paused = false;
      _segStart = Date.now();
      document.getElementById('voiceToggleBtn').textContent = '⏸';
      _startTimer();
    } else {
      mediaRecorder.pause();
      paused = true;
      _elapsed += (Date.now() - _segStart) / 1000;
      document.getElementById('voiceToggleBtn').textContent = '▶';
      clearInterval(timerInterval);
    }
  }

  function _currentSeconds() {
    return Math.round(_elapsed + (paused ? 0 : (Date.now() - _segStart) / 1000));
  }

  /* Stop recording. The blob is built and saved inside `onstop` so the final
     audio chunk (flushed asynchronously by MediaRecorder.stop()) is included. */
  function stop(save) {
    if (!mediaRecorder) return;
    clearInterval(timerInterval);
    const duration = Math.max(1, _currentSeconds());
    const rec = mediaRecorder;
    const cb  = _onSave;
    mediaRecorder = null;
    _onSave       = null;

    rec.onstop = () => {
      try { rec.stream.getTracks().forEach(t => t.stop()); } catch(e) {}
      const recEl = document.getElementById('voiceRecorder');
      if (recEl) recEl.style.display = 'none';
      if (!save) { chunks = []; return; }
      if (!chunks.length) { App.toast('La grabación quedó vacía', 'warning'); chunks = []; return; }
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      chunks = [];
      const id = Utils.uuid();
      DB.saveVoice(id, blob)
        .then(() => {
          App.toast('Nota de voz guardada ✓', 'success');
          if (cb) cb(id, duration);
        })
        .catch(err => {
          console.error('Voice save error', err);
          App.toast('No se pudo guardar la nota de voz', 'error');
        });
    };

    try {
      if (rec.state !== 'inactive') rec.stop();   // fires final dataavailable, then onstop
      else rec.onstop();
    } catch(e) {
      console.error('Voice stop error', e);
      try { rec.onstop(); } catch(_) {}
    }
  }

  function _startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const secs = _currentSeconds();
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      const el = document.getElementById('voiceTime');
      if (el) el.textContent = `${m}:${String(s).padStart(2,'0')}`;
    }, 500);
  }

  async function renderPlayer(voiceId, duration, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
      const record = await DB.getVoice(voiceId);
      const div = document.createElement('div');
      div.className = 'voice-player';
      if (!record) {
        div.innerHTML = `<span>🎙️</span><span style="font-size:12px;color:var(--text-m)">Audio guardado en otro dispositivo</span>`;
        container.appendChild(div);
        return;
      }
      const blob = new Blob([record.data], { type: record.type || 'audio/webm' });
      const url  = URL.createObjectURL(blob);
      const dur  = duration ? Math.floor(duration/60) + ':' + String(duration%60).padStart(2,'0') : '';
      div.innerHTML = `<span>🎙️</span><audio controls src="${url}" style="flex:1;height:32px"></audio>
        <span style="font-size:12px;color:var(--text-m)">${dur}</span>`;
      container.appendChild(div);
    } catch(e) { console.error('renderPlayer', e); }
  }

  return { start, toggle, stop, renderPlayer };
})();
