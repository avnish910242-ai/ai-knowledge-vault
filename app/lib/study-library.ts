export const SUBJECTS = [
  "Physics",
  "Chemistry",
  "Biology",
  "History",
  "Geography",
  "Computer Science",
  "GK/GS",
  "Mathematics",
  "Other",
] as const;

export type Subject = (typeof SUBJECTS)[number];

export type SavedDiagram = {
  kind: "commons" | "generated";
  imageData: string;
  svg?: string;
  title: string;
  provider: string;
  sourceUrl?: string;
  creator?: string;
  license?: string;
  licenseUrl?: string;
  analysis?: {
    titleHindi: string;
    titleEnglish: string;
    summary?: string;
    labels: { english: string; hindi: string; explanation: string; x: number; y: number }[];
    howItWorks: string[];
    process: string[];
    keyFacts: string[];
  };
};

export type StudyTopic = {
  id: string;
  title: string;
  subject: Subject;
  explanation: string;
  diagram?: SavedDiagram;
  savedAt: number;
};

const DB_NAME = "ai-study-library";
const STORE_NAME = "topics";
const DB_VERSION = 2;

export type ImportedFile = {
  id: string;
  sha256: string;
  name: string;
  sourceUrl: string;
  mimeType: string;
  size: number;
  blob: Blob;
  savedAt: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("subject", "subject");
        store.createIndex("savedAt", "savedAt");
      }
      if (!db.objectStoreNames.contains("imports")) {
        const imports = db.createObjectStore("imports", { keyPath: "id" });
        imports.createIndex("sha256", "sha256", { unique: true });
        imports.createIndex("savedAt", "savedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local study library."));
  });
}

export async function listImportedFiles(): Promise<ImportedFile[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("imports", "readonly");
    const request = transaction.objectStore("imports").getAll();
    request.onsuccess = () => resolve((request.result as ImportedFile[]).sort((a, b) => b.savedAt - a.savedAt));
    request.onerror = () => reject(request.error ?? new Error("Could not load imported files."));
    transaction.oncomplete = () => db.close();
  });
}

export async function putImportedFile(file: ImportedFile): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("imports", "readwrite");
    transaction.objectStore("imports").add(file);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("This file may already exist in the vault.")); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Import was interrupted.")); };
  });
}

export async function removeImportedFile(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("imports", "readwrite");
    transaction.objectStore("imports").delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Could not remove imported file.")); };
  });
}

export async function listTopics(): Promise<StudyTopic[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as StudyTopic[]).sort((a, b) => b.savedAt - a.savedAt));
    request.onerror = () => reject(request.error ?? new Error("Could not load saved topics."));
    transaction.oncomplete = () => db.close();
  });
}

export async function putTopic(topic: StudyTopic): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(topic);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Could not save this topic.")); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Saving this topic was interrupted.")); };
  });
}

export async function removeTopic(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Could not delete this topic.")); };
  });
}

export function classifySubject(title: string, explanation: string): Subject {
  const text = `${title} ${explanation.slice(0, 1800)}`.toLowerCase();
  const matchers: [Subject, RegExp][] = [
    ["Physics", /physics|force|motion|energy|gravity|electric|magnet|wave|optics|thermodynamic|बल|गति|ऊर्जा/],
    ["Chemistry", /chemistry|chemical|atom|molecule|reaction|element|compound|acid|base|धातु|रासायनिक/],
    ["Biology", /biology|cell|organ|heart|brain|plant|animal|blood|photosynthesis|जीव|कोशिका|पौधा/],
    ["History", /history|historical|empire|civilization|revolution|dynasty|war|इतिहास|साम्राज्य/],
    ["Geography", /geography|continent|climate|river|mountain|earthquake|latitude|longitude|भूगोल|जलवायु/],
    ["Computer Science", /computer|software|algorithm|programming|internet|cpu|database|artificial intelligence|कंप्यूटर/],
    ["Mathematics", /mathematics|math|algebra|geometry|equation|theorem|fraction|calculus|गणित|त्रिकोणमिति/],
    ["GK/GS", /general knowledge|current affairs|constitution|government|economy|polity|gk|gs|सामान्य ज्ञान/],
  ];
  return matchers.find(([, pattern]) => pattern.test(text))?.[0] ?? "Other";
}
