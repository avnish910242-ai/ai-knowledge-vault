# AI Knowledge Vault Downloader

This local Manifest V3 extension saves supported images, PDFs, and common documents in the extension's own IndexedDB. It can then transfer a selected file to the AI Knowledge Vault running in the same Chrome profile. The Vault asks for a second confirmation before writing the file to its separate browser IndexedDB. Nothing is uploaded to a server.

## Local development installation

1. Start the existing app from the project root with `npm run dev` and leave it running at `http://localhost:3000`.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and select this project's `extension` folder.
4. Pin **AI Knowledge Vault Downloader** if you want the popup readily available.
5. Open the Vault at `http://localhost:3000`. The extension bridge runs on the two local development addresses `localhost:3000` and `127.0.0.1:3000`.

## Use

- Right-click an image and choose **Save to AI Knowledge Vault**. The extension opens with its image URL filled in. Review it and click **Request permission & import**. Chrome asks for access to that image's website; the extension fetches only after the grant.
- Or open the extension popup, choose a local file, or enter a supported file URL and click **Request permission & import**.
- Extension downloads appear in the popup. Click **Import to Vault** beside one, then confirm **Save to vault** in the Vault page. **Open AI Knowledge Vault** opens the local app.

Supported files are images, PDF, TXT, Markdown, CSV, JSON, and common DOC/DOCX, PPT/PPTX, and XLS/XLSX formats. The maximum file size is 12 MB. Duplicate content is detected with SHA-256 in both extension and Vault storage. Website requests omit cookies and credentials; redirects to another origin are rejected. The extension does not read page content, passwords, or private form data and does not fetch files in the background.

## Connecting to the local Vault

Keep the app at `http://localhost:3000` (or `http://127.0.0.1:3000`) and open it in a tab before transferring. Imports pass through a content-script bridge and are saved directly to the Vault's browser IndexedDB after confirmation; no backend endpoint, database credentials, or external account is used. Files remain local to this Chrome profile and browser origin.
