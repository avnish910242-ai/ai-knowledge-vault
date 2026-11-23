"use client";

import { useEffect, useState } from "react";
import { ImportedFile, listImportedFiles, putImportedFile, removeImportedFile } from "../lib/study-library";

type IncomingFile = { id: string; sha256: string; name: string; sourceUrl: string; mimeType: string; size: number; dataUrl: string };

export default function ExtensionImportBridge() {
  const [pending, setPending] = useState<IncomingFile | null>(null);
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listImportedFiles().then(setFiles).catch(() => undefined);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== "AI_KNOWLEDGE_VAULT_IMPORT") return;
      const item = event.data.file as IncomingFile;
      if (!item || typeof item.name !== "string" || typeof item.dataUrl !== "string" || item.size > 12 * 1024 * 1024 || item.dataUrl.length > 17 * 1024 * 1024 || !/^[a-f0-9]{64}$/i.test(item.sha256)) {
        setNotice("Import rejected: invalid or oversized file.");
        return;
      }
      setPending(item);
      setNotice("");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function confirmImport() {
    if (!pending) return;
    setBusy(true);
    try {
      if ((await listImportedFiles()).some((file) => file.sha256 === pending.sha256)) throw new Error("DUPLICATE_FILE");
      const response = await fetch(pending.dataUrl);
      const blob = await response.blob();
      if (blob.size > 12 * 1024 * 1024 || blob.size !== pending.size) throw new Error("File size validation failed.");
      await putImportedFile({ id: pending.id, sha256: pending.sha256, name: pending.name, sourceUrl: pending.sourceUrl, mimeType: pending.mimeType, size: pending.size, blob, savedAt: Date.now() });
      setFiles(await listImportedFiles());
      setNotice(`${pending.name} was imported into this browser's vault.`);
      setPending(null);
      window.postMessage({ type: "AI_KNOWLEDGE_VAULT_IMPORT_RESULT", id: pending.id, success: true }, window.location.origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      setNotice(message === "DUPLICATE_FILE" ? "Duplicate file: this content is already in the vault." : `Import failed: ${message}`);
      window.postMessage({ type: "AI_KNOWLEDGE_VAULT_IMPORT_RESULT", id: pending.id, success: false, error: message }, window.location.origin);
    } finally {
      setBusy(false);
    }
  }

  async function deleteFile(id: string) {
    await removeImportedFile(id);
    setFiles(await listImportedFiles());
  }

  return <section className="mx-auto mt-5 max-w-5xl rounded-2xl border border-orange-200 bg-orange-50/70 p-4 sm:p-5" aria-label="Extension imports">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-semibold text-slate-900">Chrome imports</h2><p className="mt-1 text-xs text-slate-600">Files from AI Knowledge Vault Downloader are stored in this browser after your confirmation.</p></div>
      {notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}
    </div>
    {pending && <div className="mt-4 rounded-xl border border-orange-200 bg-white p-4">
      <p className="text-sm font-semibold">Confirm import: {pending.name}</p>
      <p className="mt-1 break-all text-xs text-slate-500">Source: {pending.sourceUrl || "Local file"} · {(pending.size / 1024).toFixed(0)} KB</p>
      <div className="mt-3 flex gap-2"><button disabled={busy} onClick={confirmImport} className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Importing…" : "Save to vault"}</button><button onClick={() => { setPending(null); setNotice("Import declined."); }} className="rounded-lg border px-3 py-2 text-sm">Decline</button></div>
    </div>}
    {files.length > 0 && <ul className="mt-4 divide-y divide-orange-100 rounded-xl bg-white px-3">
      {files.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <div className="min-w-0"><p className="truncate font-medium">{file.name}</p><a className="block max-w-xl truncate text-xs text-orange-700 underline" href={file.sourceUrl} target="_blank" rel="noreferrer">{file.sourceUrl || "Local file"}</a></div>
        <div className="flex items-center gap-3"><button onClick={() => { const url = URL.createObjectURL(file.blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }} className="text-orange-700 underline">Download</button><button onClick={() => deleteFile(file.id)} className="text-xs text-slate-500 underline">Remove</button></div>
      </li>)}
    </ul>}
  </section>;
}
