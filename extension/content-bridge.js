chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "KV_IMPORT_FILE") return;
  const file = message.file;
  let answered = false;
  const onResult = (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== "AI_KNOWLEDGE_VAULT_IMPORT_RESULT" || event.data.id !== file.id) return;
    window.removeEventListener("message", onResult);
    answered = true;
    sendResponse(event.data);
  };
  window.addEventListener("message", onResult);
  window.postMessage({ type: "AI_KNOWLEDGE_VAULT_IMPORT", file }, location.origin);
  setTimeout(() => {
    if (!answered) {
      window.removeEventListener("message", onResult);
      sendResponse({ success: false, error: "Open the vault page and confirm the import." });
    }
  }, 60000);
  return true;
});
