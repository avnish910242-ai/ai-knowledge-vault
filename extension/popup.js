const statusNode = document.getElementById("status");
const listNode = document.getElementById("fileList");
const urlInput = document.getElementById("sourceUrl");
const params = new URLSearchParams(location.search);
const fromContextMenu = params.get("contextImport") === "1";

function status(message, error = false) {
  statusNode.textContent = message;
  statusNode.style.color = error ? "#b91c1c" : "#9a3412";
}
function formatSize(size) { return size < 1024 * 1024 ? `${(size / 1024).toFixed(0)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function downloadNameFrom(response, url) {
  const disposition = response.headers.get("content-disposition") || "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  try { return decodeURIComponent(encoded || plain || new URL(url).pathname.split("/").pop() || "download"); } catch { return "download"; }
}
function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not prepare file for transfer."));
    reader.readAsDataURL(blob);
  });
}
async function transferToVault(item) {
  const tabs = await chrome.tabs.query({ url: ["http://localhost:3000/*", "http://127.0.0.1:3000/*"] });
  const tab = tabs.find((candidate) => candidate.id);
  if (!tab?.id) throw new Error("Open your AI Knowledge Vault at http://localhost:3000 first.");
  const dataUrl = await toDataUrl(item.blob);
  const payload = { id: item.id, sha256: item.sha256, name: item.name, sourceUrl: item.sourceUrl, mimeType: item.mimeType, size: item.size, dataUrl };
  const result = await chrome.tabs.sendMessage(tab.id, { type: "KV_IMPORT_FILE", file: payload });
  if (!result?.success) throw new Error(result?.error || "Vault did not confirm the import.");
  status(`${item.name} imported into AI Knowledge Vault.`);
}
function allowedUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("Enter a valid http or https URL."); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("Only public http/https file URLs are supported.");
  return url;
}
async function importUrl(raw) {
  const url = allowedUrl(raw);
  const originPermission = `${url.origin}/*`;
  const granted = await chrome.permissions.request({ origins: [originPermission] });
  if (!granted) throw new Error("Website permission was not granted; no file was fetched.");
  status("Permission granted. Fetching the file…");
  const response = await fetch(url.href, { credentials: "omit", redirect: "follow", cache: "no-store" });
  if (!response.ok) throw new Error(`Download failed (${response.status}).`);
  if (new URL(response.url).origin !== url.origin) throw new Error("The file redirected to another website. Enter its URL and grant permission separately.");
  const announcedSize = Number(response.headers.get("content-length") || 0);
  if (announcedSize > KVStore.MAX_BYTES) throw new Error("Files must be 12 MB or smaller.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The website did not return a readable file.");
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > KVStore.MAX_BYTES) {
      await reader.cancel();
      throw new Error("Files must be 12 MB or smaller.");
    }
    chunks.push(value);
  }
  const blob = new Blob(chunks, { type: response.headers.get("content-type")?.split(";")[0] || "application/octet-stream" });
  const file = new File([blob], downloadNameFrom(response, url.href), { type: response.headers.get("content-type")?.split(";")[0] || blob.type });
  const item = await KVStore.save(file, url.href);
  status(`Saved ${item.name} (${formatSize(item.size)}).`);
  return item;
}

async function renderList() {
  try {
    const items = await KVStore.all();
    listNode.replaceChildren();
    if (!items.length) { const empty = document.createElement("li"); empty.textContent = "No files downloaded yet."; listNode.append(empty); return; }
    for (const item of items) {
      const li = document.createElement("li");
      const title = document.createElement("strong"); title.textContent = item.name;
      const meta = document.createElement("small"); meta.textContent = `${formatSize(item.size)} · ${item.sourceUrl || "Local file"}`;
      const row = document.createElement("div"); row.className = "row";
      const download = document.createElement("button"); download.className = "light"; download.textContent = "Download";
      download.addEventListener("click", () => {
        const objectUrl = URL.createObjectURL(item.blob);
        const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = item.name; anchor.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      });
      const importButton = document.createElement("button"); importButton.textContent = "Import to Vault";
      importButton.addEventListener("click", async () => {
        importButton.disabled = true;
        try { await transferToVault(item); } catch (error) { status(error.message || "Import failed.", true); }
        finally { importButton.disabled = false; }
      });
      const removeButton = document.createElement("button"); removeButton.className = "light"; removeButton.textContent = "Remove";
      removeButton.addEventListener("click", async () => { await KVStore.remove(item.id); await renderList(); status("Removed from extension downloads."); });
      row.append(download, importButton, removeButton); li.append(title, meta, row); listNode.append(li);
    }
  } catch (error) { status(error.message || "Could not read local downloads.", true); }
}

document.getElementById("openVault").addEventListener("click", () => chrome.tabs.create({ url: "http://localhost:3000" }));
document.getElementById("downloadUrl").addEventListener("click", async (event) => {
  const button = event.currentTarget; button.disabled = true;
  try { const item = await importUrl(urlInput.value.trim()); await renderList(); await transferToVault(item); }
  catch (error) { status(error.message || "Could not import URL.", true); }
  finally { button.disabled = false; }
});
document.getElementById("localFile").addEventListener("change", async (event) => {
  const file = event.currentTarget.files?.[0]; if (!file) return;
  try { const item = await KVStore.save(file, ""); await renderList(); status(`Saved ${item.name} (${formatSize(item.size)}).`); }
  catch (error) { status(error.message || "Could not save file.", true); }
  event.currentTarget.value = "";
});
chrome.storage.session.get("pendingSource").then(({ pendingSource }) => {
  if (pendingSource && fromContextMenu) urlInput.value = pendingSource;
  if (fromContextMenu && !pendingSource) status("The selected image URL is no longer available.", true);
  if (fromContextMenu && pendingSource) status("Review the URL, then click import to request that site's permission.");
});
renderList();
