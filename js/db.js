/* IndexedDB wrapper for file attachments & voice notes */
const DB = (() => {
  const DB_NAME = 'SistemaKarenDB';
  const DB_VER  = 1;
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('attachments')) {
          db.createObjectStore('attachments', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('voices')) {
          db.createObjectStore('voices', { keyPath: 'id' });
        }
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function saveAttachment(id, file) {
    const db = await open();
    const data = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('attachments', 'readwrite');
      tx.objectStore('attachments').put({
        id, name: file.name, type: file.type,
        size: file.size, data, createdAt: new Date().toISOString()
      });
      tx.oncomplete = () => resolve(id);
      tx.onerror    = e => reject(e.target.error);
    });
  }

  async function getAttachment(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('attachments', 'readonly');
      const req = tx.objectStore('attachments').get(id);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function deleteAttachment(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('attachments', 'readwrite');
      tx.objectStore('attachments').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = e => reject(e.target.error);
    });
  }

  async function saveVoice(id, blob) {
    const db = await open();
    const data = await blob.arrayBuffer();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('voices', 'readwrite');
      tx.objectStore('voices').put({
        id, type: blob.type, size: blob.size, data, createdAt: new Date().toISOString()
      });
      tx.oncomplete = () => resolve(id);
      tx.onerror    = e => reject(e.target.error);
    });
  }

  async function getVoice(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('voices', 'readonly');
      const req = tx.objectStore('voices').get(id);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function deleteVoice(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('voices', 'readwrite');
      tx.objectStore('voices').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = e => reject(e.target.error);
    });
  }

  async function openAttachment(id) {
    const record = await getAttachment(id);
    if (!record) return;
    const blob = new Blob([record.data], { type: record.type });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function downloadAttachment(id) {
    const record = await getAttachment(id);
    if (!record) return;
    const blob = new Blob([record.data], { type: record.type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = record.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return { saveAttachment, getAttachment, deleteAttachment, openAttachment, downloadAttachment, saveVoice, getVoice, deleteVoice };
})();
