"use client";
/* eslint-disable @next/next/no-img-element -- Diagram assets are runtime data URLs used for offline saving. */

import { FormEvent, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DiagramViewer from "./components/DiagramViewer";
import ExtensionImportBridge from "./components/ExtensionImportBridge";
import { classifySubject, listTopics, putTopic, removeTopic, SUBJECTS, StudyTopic, Subject, SavedDiagram } from "./lib/study-library";

type View = "Home" | "My Study Library" | "Subjects";
type DiagramResult = { id: string; provider: string; title: string; description: string; image: string; sourceUrl: string; creator: string; license: string; licenseUrl: string };

function titleFromAnswer(answer: string, fallback: string) {
  return answer.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback.trim();
}

export default function Home() {
  const [view, setView] = useState<View>("Home");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [diagram, setDiagram] = useState<SavedDiagram | null>(null);
  const [loading, setLoading] = useState(false);
  const [diagramLoading, setDiagramLoading] = useState(false);
  const [error, setError] = useState("");
  const [diagramNotice, setDiagramNotice] = useState("");
  const [topics, setTopics] = useState<StudyTopic[]>([]);
  const [current, setCurrent] = useState<StudyTopic | null>(null);
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<Subject | "All">("All");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    listTopics().then(setTopics).catch(() => setSaveError("Could not read the local library in this browser.")).finally(() => setReady(true));
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const visibleTopics = useMemo(() => topics.filter((topic) =>
    (subjectFilter === "All" || topic.subject === subjectFilter) &&
    topic.title.toLowerCase().includes(searchText.toLowerCase())
  ), [topics, subjectFilter, searchText]);

  async function refreshTopics() {
    setTopics(await listTopics());
  }

  async function searchTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const topic = query.trim();
    if (!topic || !online) return;
    setCurrent(null);
    setLoading(true);
    setDiagramLoading(true);
    setError("");
    setSaveError("");
    setDiagramNotice("");
    setAnswer("");
    setDiagram(null);

    const answerTask = fetch("/api/ask", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: topic }),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Explanation could not be generated.");
      setAnswer(data.answer || "No answer was returned.");
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Explanation could not be generated.");
    }).finally(() => setLoading(false));

    const diagramTask = findDiagram(topic);
    await Promise.all([answerTask, diagramTask]);
  }

  async function findDiagram(topic: string) {
    try {
      const response = await fetch("/api/hybrid-diagram", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: topic }),
      });
      const data = await response.json();
      const results: DiagramResult[] = data.results || [];
      if (!response.ok) throw new Error(data.error || "Image search failed.");
      if (results[0]) {
        const selected = results[0];
        try {
          const analyzed = await fetch("/api/hybrid-diagram/analyze", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: selected.image, title: selected.title, description: selected.description }),
          });
          const result = await analyzed.json();
          if (!analyzed.ok || !result.success || !result.imageData) throw new Error(result.error || "Diagram analysis unavailable.");
          setDiagram({
            kind: "commons", imageData: result.imageData, title: selected.title, provider: selected.provider,
            sourceUrl: selected.sourceUrl, creator: selected.creator, license: selected.license,
            licenseUrl: selected.licenseUrl, analysis: result.analysis,
          });
          setDiagramLoading(false);
          return;
        } catch {
          try {
            const original = await fetch("/api/hybrid-diagram/analyze", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: selected.image, title: selected.title, description: selected.description, imageOnly: true }),
            });
            const source = await original.json();
            if (!original.ok || !source.imageData) throw new Error("Source image could not be downloaded for offline use.");
            setDiagramNotice("Diagram labels could not be analyzed. Showing the original with attribution.");
            setDiagram({ kind: "commons", imageData: source.imageData, title: selected.title, provider: selected.provider, sourceUrl: selected.sourceUrl, creator: selected.creator, license: selected.license, licenseUrl: selected.licenseUrl });
            setDiagramLoading(false);
            return;
          } catch {
            setDiagramNotice("The source image could not be saved locally. Trying a generated 2D fallback.");
          }
        }
      }
      setDiagramNotice("No relevant Commons image was verified. Creating a labeled 2D fallback.");
    } catch (reason) {
      setDiagramNotice(reason instanceof Error ? `${reason.message} Trying the generated 2D fallback.` : "Image search failed. Trying a generated 2D fallback.");
    }
    try {
      const response = await fetch("/api/diagram", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: topic }),
      });
      const data = await response.json();
      if (!response.ok || !data.image) throw new Error(data.error || "Could not create a diagram.");
      setDiagram({ kind: "generated", imageData: data.image, svg: data.svg, title: data.title || topic, provider: "AI-generated by Gemini" });
    } catch (reason) {
      setDiagramNotice((previous) => `${previous ? `${previous} ` : ""}${reason instanceof Error ? reason.message : "No diagram is available."}`);
    } finally {
      setDiagramLoading(false);
    }
  }

  async function saveTopic() {
    if (!answer || !query.trim()) return;
    setSaveError("");
    const title = titleFromAnswer(answer, query);
    const subject = classifySubject(title, answer);
    const topic: StudyTopic = {
      id: crypto.randomUUID(), title, subject, explanation: answer, diagram: diagram || undefined, savedAt: Date.now(),
    };
    try {
      await putTopic(topic);
      await refreshTopics();
      setCurrent(topic);
      setView("My Study Library");
    } catch (reason) {
      setSaveError(reason instanceof Error ? `${reason.message} This topic was not saved.` : "This topic was not saved.");
    }
  }

  async function deleteTopic(id: string) {
    try {
      await removeTopic(id);
      await refreshTopics();
      if (current?.id === id) setCurrent(null);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Could not delete this topic.");
    }
  }

  async function changeSubject(topic: StudyTopic, subject: Subject) {
    const updated = { ...topic, subject };
    await putTopic(updated);
    await refreshTopics();
    if (current?.id === topic.id) setCurrent(updated);
  }

  function openTopic(topic: StudyTopic) {
    setCurrent(topic);
    setQuery(topic.title);
    setAnswer(topic.explanation);
    setDiagram(topic.diagram || null);
    setView("Home");
    setDiagramNotice("");
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-900 md:flex">
      <aside className="border-b border-slate-200 bg-white px-5 py-5 md:min-h-screen md:w-64 md:border-b-0 md:border-r md:px-6">
        <a href="#home" onClick={(event) => { event.preventDefault(); setView("Home"); setCurrent(null); }} className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">A</span>
          <span><strong className="block text-sm">AI Study Library</strong><span className="text-xs text-slate-500">Learn, understand, remember</span></span>
        </a>
        <nav className="mt-7 flex gap-2 overflow-x-auto md:flex-col" aria-label="Main navigation">
          {(["Home", "My Study Library", "Subjects"] as View[]).map((item) => (
            <button key={item} onClick={() => { setView(item); setCurrent(null); }} className={`rounded-xl px-4 py-3 text-left text-sm font-medium ${view === item ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}>
              {item === "Home" ? "⌂" : item === "Subjects" ? "▦" : "▤"}<span className="ml-3">{item}</span>
            </button>
          ))}
        </nav>
        <div className="mt-7 flex items-center gap-2 text-xs text-slate-500" role="status">
          <span className={`size-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} />
          {online ? "Online · saved topics available offline" : "Offline · saved topics only"}
        </div>
        <p className="mt-3 text-xs text-slate-400">{topics.length} saved {topics.length === 1 ? "topic" : "topics"}</p>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-12">
        <ExtensionImportBridge />
        {view === "Home" && <>
          {!current && !answer && <header className="mx-auto mt-8 max-w-3xl text-center sm:mt-14">
            <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">YOUR PERSONAL STUDY SPACE</span>
            <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">Understand any topic.<br /><span className="text-indigo-600">Keep what you learn.</span></h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500">Search school subjects, get a clear explanation in Hindi, and save complete topics for offline study.</p>
          </header>}

          <form onSubmit={searchTopic} className={`mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-indigo-400 ${answer || current ? "" : "mt-9"}`}>
            <span className="pl-3 text-xl text-slate-400" aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} disabled={!online || loading} placeholder="Search a topic or ask a question…" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" aria-label="Topic or question" />
            <button type="submit" disabled={!online || loading || !query.trim()} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{loading ? "Explaining…" : "Search"}</button>
          </form>
          {!online && <p className="mx-auto mt-2 max-w-3xl text-xs text-amber-700">Search needs an internet connection. Open a saved topic from your library to read offline.</p>}

          {loading && <section className="mx-auto mt-7 max-w-3xl rounded-2xl border bg-white p-6 text-center text-sm text-slate-500">Preparing your explanation…</section>}
          {error && <p className="mx-auto mt-5 max-w-3xl rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
          {answer && <div className="mx-auto mt-7 max-w-5xl">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Study notes</p><h2 className="mt-1 text-2xl font-bold">{titleFromAnswer(answer, query)}</h2></div>
                {current ? <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">Saved for offline reading</span> : <button onClick={saveTopic} disabled={!ready || diagramLoading} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{diagramLoading ? "Preparing diagram…" : "Save Topic"}</button>}
              </div>
              {saveError && <p className="mt-3 text-sm text-rose-600">{saveError}</p>}
              <article className="prose prose-slate mt-6 max-w-none text-sm leading-7 prose-headings:scroll-mt-4 prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-h2:text-indigo-700 prose-h3:text-lg prose-strong:text-slate-900 prose-a:text-indigo-700 prose-li:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
              </article>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Visual learning</p><h2 className="mt-1 text-xl font-bold">Diagram or model</h2></div>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600">2D image · not interactive 3D</span>
              </div>
              {diagramLoading && <p className="mt-4 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700">Looking for a relevant educational image. A Gemini 2D diagram is the fallback.</p>}
              {diagramNotice && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{diagramNotice}</p>}
              {diagram && <>
                <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{diagram.provider}</span>{diagram.creator && <span>· Creator: {diagram.creator}</span>}{diagram.license && <span>· License: {diagram.license}</span>}</div>
                {diagram.kind === "generated" && diagram.svg ? <DiagramViewer image={diagram.imageData} svg={diagram.svg} title={diagram.title} /> : <div className="relative mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white"><img src={diagram.imageData} alt={diagram.title} className="block max-h-[620px] w-full object-contain" />{diagram.analysis?.labels.map((label, index) => <span key={`${label.english}-${index}`} title={`${label.hindi} (${label.english})`} className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-xs font-bold text-white shadow" style={{ left: `${label.x}%`, top: `${label.y}%` }}>{index + 1}</span>)}</div>}
                {diagram.kind === "commons" && diagram.analysis?.labels.length ? <p className="mt-2 text-xs text-slate-500">Numbered markers show approximate positions identified by Gemini; see the part explanations below.</p> : null}
                {diagram.kind === "commons" && diagram.sourceUrl && <p className="mt-3 text-sm"><a href={diagram.sourceUrl} target="_blank" rel="noreferrer" className="text-indigo-700 underline">Original source and attribution</a>{diagram.licenseUrl && <> · <a href={diagram.licenseUrl} target="_blank" rel="noreferrer" className="text-indigo-700 underline">License details</a></>}</p>}
                {diagram.kind === "generated" && <p className="mt-3 text-xs text-slate-500">AI-generated 2D SVG · Gemini. Verify scientific details for important work.</p>}
                {diagram.analysis && <div className="mt-6 space-y-5">
                  <div><h3 className="font-bold">{diagram.analysis.titleHindi} <span className="font-normal text-slate-500">({diagram.analysis.titleEnglish})</span></h3>{diagram.analysis.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{diagram.analysis.summary}</p>}</div>
                  {diagram.analysis.labels.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{diagram.analysis.labels.map((label, index) => <div key={`${label.english}-${index}`} className="rounded-xl border border-slate-200 p-4"><strong>{label.hindi}</strong><p className="text-sm text-indigo-700">{label.english}</p><p className="mt-2 text-sm leading-6 text-slate-600">{label.explanation}</p></div>)}</div>}
                  {diagram.analysis.howItWorks.length > 0 && <div><h3 className="font-bold">How it works</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">{diagram.analysis.howItWorks.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
                  {diagram.analysis.process.length > 0 && <div><h3 className="font-bold">Process and arrow direction</h3><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6">{diagram.analysis.process.map((item, index) => <li key={index}>{item}</li>)}</ol></div>}
                  {diagram.analysis.keyFacts.length > 0 && <div><h3 className="font-bold">Key facts</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">{diagram.analysis.keyFacts.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
                </div>}
                {diagram.kind === "commons" && !diagram.analysis && <p className="mt-4 text-sm text-slate-500">This is the original image. It could not be analyzed, so no labels are inferred.</p>}
              </>}
            </section>
          </div>}
          {!answer && !loading && <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2">{["Human heart", "Photosynthesis", "Newton’s laws", "Indian Constitution"].map((sample) => <button key={sample} onClick={() => setQuery(sample)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 hover:border-indigo-300">{sample}</button>)}</div>}
        </>}

        {view === "My Study Library" && <section className="mx-auto max-w-5xl">
          <header className="mb-6"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Your collection</p><h1 className="mt-1 text-3xl font-bold">My Study Library</h1><p className="mt-2 text-sm text-slate-500">Saved explanations and downloaded diagram assets are available offline in this browser.</p></header>
          <div className="mb-5 flex flex-wrap gap-3"><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Find a saved topic" className="min-w-48 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-indigo-500" /><select aria-label="Filter by subject" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value as Subject | "All")} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option>All</option>{SUBJECTS.map((subject) => <option key={subject}>{subject}</option>)}</select></div>
          {visibleTopics.length ? <div className="grid gap-3 sm:grid-cols-2">{visibleTopics.map((topic) => <article key={topic.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><button onClick={() => openTopic(topic)} className="text-left text-lg font-bold hover:text-indigo-700">{topic.title}</button><p className="mt-1 text-xs text-slate-500">{topic.subject} · {topic.diagram ? "Diagram saved" : "Text saved"}</p></div><button onClick={() => deleteTopic(topic.id)} className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Delete</button></div><p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{topic.explanation.replace(/[#*_`]/g, " ").slice(0, 230)}</p><button onClick={() => openTopic(topic)} className="mt-4 text-sm font-semibold text-indigo-700">Open topic →</button></article>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="font-semibold">{ready ? "No saved topics here yet" : "Loading your library…"}</h2><p className="mt-2 text-sm text-slate-500">Search a topic and choose Save Topic to keep it for later.</p><button onClick={() => setView("Home")} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Search a topic</button></div>}
        </section>}

        {view === "Subjects" && <section className="mx-auto max-w-5xl">
          <header className="mb-6"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Browse by subject</p><h1 className="mt-1 text-3xl font-bold">Subjects</h1><p className="mt-2 text-sm text-slate-500">Topics are grouped automatically. You can change a subject whenever a suggestion is wrong.</p></header>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{SUBJECTS.map((subject) => {
            const group = topics.filter((topic) => topic.subject === subject);
            return <article key={subject} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-bold">{subject}</h2><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{group.length}</span></div>
              {group.length ? <ul className="mt-4 space-y-3">{group.map((topic) => <li key={topic.id} className="border-t border-slate-100 pt-3"><button onClick={() => openTopic(topic)} className="text-left text-sm font-medium hover:text-indigo-700">{topic.title}</button><div className="mt-1 flex items-center justify-between"><span className="text-xs text-slate-400">{new Date(topic.savedAt).toLocaleDateString()}</span><select aria-label={`Change subject for ${topic.title}`} value={topic.subject} onChange={(event) => changeSubject(topic, event.target.value as Subject)} className="max-w-32 bg-transparent text-xs text-indigo-700"><option value={topic.subject}>Change subject…</option>{SUBJECTS.filter((option) => option !== topic.subject).map((option) => <option key={option} value={option}>{option}</option>)}</select></div></li>)}</ul> : <p className="mt-4 text-sm text-slate-400">No saved topics yet</p>}
            </article>;
          })}</div>
        </section>}
        <footer className="mx-auto mt-12 max-w-5xl border-t border-slate-200 py-6 text-center text-xs text-slate-400">Your saved library stays on this device. It is not synced between browsers.</footer>
      </main>
    </div>
  );
}
