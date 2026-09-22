import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Search } from "lucide-react";
import { PageHeader } from "../ui/OperationsUI.tsx";
import { getRouteDefinition } from "../../utils/routes.ts";
import { navigateInApp, type AppNavigate } from "../../utils/clientNavigation.ts";
import {
  HELP_CATEGORIES,
  HELP_TOPICS,
  getHelpTopic,
  helpTopicPath,
  searchHelpTopics,
  type HelpCategoryId,
  type HelpTopic,
} from "../../help/helpCatalog.ts";

export interface HelpCenterPageProps {
  readonly search: string;
  readonly onNavigatePath?: AppNavigate;
}

function queryState(search: string) {
  const query = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return {
    topicId: query.get("topic")?.trim() || undefined,
    query: query.get("q")?.trim() || "",
  };
}

function navigate(path: string, onNavigatePath?: AppNavigate, replace = false) {
  if (onNavigatePath) onNavigatePath(path, replace);
  else navigateInApp(path, replace);
}

function TopicLink({ topic, onNavigatePath, className = "" }: { topic: HelpTopic; onNavigatePath?: AppNavigate; className?: string }) {
  const path = helpTopicPath(topic.id);
  return (
    <a
      href={path}
      data-help-topic-id={topic.id}
      onClick={(event) => {
        if (!onNavigatePath && typeof window === "undefined") return;
        event.preventDefault();
        navigate(path, onNavigatePath);
      }}
      className={`group flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${className}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-black text-slate-950">{topic.title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-600">{topic.summary}</span>
      </span>
      <ArrowRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}

export function HelpCenterPage({ search, onNavigatePath }: HelpCenterPageProps) {
  const requested = useMemo(() => queryState(search), [search]);
  const [query, setQuery] = useState(requested.query);
  const [activeCategory, setActiveCategory] = useState<HelpCategoryId | "all">("all");
  const selectedTopic = requested.topicId ? getHelpTopic(requested.topicId) : undefined;
  const invalidTopic = Boolean(requested.topicId && !selectedTopic);

  useEffect(() => {
    setQuery(requested.query);
  }, [requested.query]);

  const matchingTopics = useMemo(() => {
    const topics = query.trim() ? searchHelpTopics(query, { limit: 24 }) : [...HELP_TOPICS];
    return activeCategory === "all" ? topics : topics.filter((topic) => topic.categoryId === activeCategory);
  }, [activeCategory, query]);

  const startHere = ["getting-started", "invoice-review", "project-costing", "cash-banking"]
    .map((topicId) => getHelpTopic(topicId))
    .filter((topic): topic is HelpTopic => Boolean(topic));
  const selectedCategory = selectedTopic ? HELP_CATEGORIES.find((category) => category.id === selectedTopic.categoryId) : undefined;
  const returnPath = selectedTopic ? getRouteDefinition(selectedTopic.routeId)?.path : undefined;

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const nextQuery = new URLSearchParams();
    if (query.trim()) nextQuery.set("q", query.trim());
    navigate(`/help${nextQuery.toString() ? `?${nextQuery.toString()}` : ""}`, onNavigatePath, true);
  };

  return (
    <div data-help-center="true" className="space-y-5">
      <PageHeader
        eyebrow="Workspace guidance"
        title="Help Center"
        description="Find task guidance, workflow boundaries, and safe recovery paths for the current workspace."
        helpTopicId={null}
      />

      <form onSubmit={submitSearch} role="search" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <label htmlFor="help-center-search" className="sr-only">Search Help</label>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="help-center-search"
              aria-label="Search Help"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by task, workflow, or business noun"
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <Search aria-hidden="true" className="h-3.5 w-3.5" /> Search
          </button>
        </div>
      </form>

      {invalidTopic && (
        <div data-help-invalid-topic="true" role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950">
          That Help topic is not available. Browse the current topics below or search for a different task.
        </div>
      )}

      {selectedTopic ? (
        <article data-help-article="true" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <nav data-help-breadcrumbs="true" aria-label="Help breadcrumbs" className="flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-500">
            <a href="/help" onClick={(event) => { event.preventDefault(); navigate("/help", onNavigatePath); }} className="hover:text-indigo-700">Help Center</a>
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{selectedCategory?.label || "Topic"}</span>
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="text-slate-800">{selectedTopic.title}</span>
          </nav>
          <div className="mt-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">{selectedCategory?.label}</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">{selectedTopic.title}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{selectedTopic.summary}</p>
            </div>
            {returnPath && <a href={returnPath} onClick={(event) => { if (!onNavigatePath) return; event.preventDefault(); onNavigatePath(returnPath); }} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Return to workspace</a>}
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0 space-y-5">
              <section aria-labelledby="help-purpose-heading">
                <h3 id="help-purpose-heading" className="text-sm font-black text-slate-950">What this helps you do</h3>
                <p className="mt-1 text-sm leading-6 text-slate-700">{selectedTopic.article.purpose}</p>
              </section>
              <section aria-labelledby="help-steps-heading">
                <h3 id="help-steps-heading" className="text-sm font-black text-slate-950">Steps</h3>
                <ol className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                  {selectedTopic.article.steps.map((step, index) => <li key={step} className="flex gap-2.5"><span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-black text-indigo-700">{index + 1}</span><span>{step}</span></li>)}
                </ol>
              </section>
              {selectedTopic.article.important?.length ? <section aria-labelledby="help-important-heading" className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3.5"><h3 id="help-important-heading" className="text-sm font-black text-indigo-950">Important boundaries</h3><ul className="mt-2 space-y-1.5 text-sm leading-5 text-indigo-950">{selectedTopic.article.important.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}</ul></section> : null}
              {selectedTopic.article.recovery?.length ? <section aria-labelledby="help-recovery-heading"><h3 id="help-recovery-heading" className="text-sm font-black text-slate-950">If something blocks you</h3><ul className="mt-2 space-y-1.5 text-sm leading-5 text-slate-700">{selectedTopic.article.recovery.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}</ul></section> : null}
            </div>
            <aside className="min-w-0 rounded-lg bg-slate-50 p-3.5" aria-label="Related Help topics">
              <div className="flex items-center gap-2 text-sm font-black text-slate-950"><BookOpen aria-hidden="true" className="h-4 w-4 text-indigo-600" /> Related topics</div>
              <div className="mt-2 space-y-2">{(selectedTopic.article.relatedTopicIds || []).map((topicId) => { const related = getHelpTopic(topicId); return related ? <TopicLink key={related.id} topic={related} onNavigatePath={onNavigatePath} className="bg-white p-2.5" /> : null; })}</div>
            </aside>
          </div>
        </article>
      ) : (
        <section className="space-y-5" aria-label="Help topic index">
          <div>
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-black text-slate-950">Start here</h2><p className="mt-1 text-sm text-slate-600">Common paths for getting oriented and resolving the most important workflows.</p></div><BookOpen aria-hidden="true" className="h-5 w-5 text-indigo-600" /></div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">{startHere.map((topic) => <TopicLink key={topic.id} topic={topic} onNavigatePath={onNavigatePath} />)}</div>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <nav data-help-category-list="true" aria-label="Help categories" className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <button type="button" aria-pressed={activeCategory === "all"} onClick={() => setActiveCategory("all")} className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-black ${activeCategory === "all" ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-50"}`}><span>All topics</span><span>{HELP_TOPICS.length}</span></button>
              <div className="mt-1 space-y-0.5">{HELP_CATEGORIES.map((category) => { const count = HELP_TOPICS.filter((topic) => topic.categoryId === category.id).length; return <button key={category.id} type="button" aria-pressed={activeCategory === category.id} onClick={() => setActiveCategory(category.id)} className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold ${activeCategory === category.id ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-50"}`}><span className="min-w-0">{category.label}</span><span className="shrink-0 text-[10px] text-slate-400">{count}</span></button>; })}</div>
            </nav>
            <section className="min-w-0" aria-label="Help topics"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-black text-slate-950">{query.trim() ? "Search results" : "Topics"}</h2><p className="mt-1 text-sm text-slate-600">{matchingTopics.length ? `${matchingTopics.length} topic${matchingTopics.length === 1 ? "" : "s"}` : "No topics match this search."}</p></div></div><div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">{matchingTopics.map((topic) => <TopicLink key={topic.id} topic={topic} onNavigatePath={onNavigatePath} />)}</div></section>
          </div>
        </section>
      )}
    </div>
  );
}
