chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "save-to-ai-kv", title: "Save to AI Knowledge Vault", contexts: ["image"] });
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== "save-to-ai-kv" || !info.srcUrl) return;
  chrome.storage.session.set({ pendingSource: info.srcUrl }).then(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?contextImport=1") });
  });
});
