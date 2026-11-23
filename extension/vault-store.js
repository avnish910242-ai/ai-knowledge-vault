(() => {
  const DB_NAME = "ai-kv-downloader";
  const STORE = "downloads";
  const MAX_BYTES = 12 * 1024 * 1024;
  const allowedExtensions = /\.(png|jpe?g|gif|webp|avif|svg|bmp|tiff?|pdf|txt|md|csv|json|docx?|pptx?|xlsx?)$/i;

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function all() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => { db.close(); resolve(request.result.sort((a, b) => b.savedAt - a.savedAt)); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }
  async function save(file, sourceUrl) {
    if (!file || file.size < 1 || file.size > MAX_BYTES) throw new Error("Files must be between 1 byte and 12 MB.");
    const name = (file.name || "download").replace(/[\u0000-\u001f]/g, "").slice(0, 180);
    if (!allowedExtensions.test(name)) throw new Error("Unsupported file type. Choose an image, PDF, or common document file.");
    const mimeType = file.type || "application/octet-stream";
    if (!/^(image\/(png|jpeg|gif|webp|avif|svg\+xml|bmp|tiff)|application\/pdf|text\/(plain|markdown|csv)|application\/(json|vnd\.openxmlformats|msword|vnd\.ms-|vnd\.oasis))/.test(mimeType) && !allowedExtensions.test(name)) {
      throw new Error("Unsupported file type.");
    }
    const bytes = await file.arrayBuffer();
    const hashBytes = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(hashBytes)].map((n) => n.toString(16).padStart(2, "0")).join("");
    const existing = await all();
    if (existing.some((entry) => entry.sha256 === hash)) throw new Error("Duplicate: this file is already in the extension.");
    const item = { id: crypto.randomUUID(), sha256: hash, name, sourceUrl: sourceUrl || "", mimeType, size: file.size, blob: new Blob([bytes], { type: mimeType }), savedAt: Date.now() };
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).add(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return item;
  }
  async function remove(id) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }
  globalThis.KVStore = { all, save, remove, MAX_BYTES };
})();
