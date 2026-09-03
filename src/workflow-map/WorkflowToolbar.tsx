import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  Filter,
  Layers,
  RotateCcw,
  AlertTriangle,
  Focus,
  ChevronDown,
  X,
  Compass,
  Check,
  Shield,
  Upload,
  CheckCircle2,
  AlertOctagon,
  MinusCircle,
  CircleDot,
  Trash2,
  Image as ImageIcon,
  Info,
  Calendar,
  GitCommit,
  GitBranch,
} from "lucide-react";
import type { WorkflowDomain, WorkflowGraph, WorkflowNodeType } from "../../scripts/workflow-map/types.ts";
import type { WorkflowMapEvidenceModel } from "../../scripts/workflow-map/evidence.ts";
import type { WorkflowCanvasFilter, WorkflowCanvasPreset, WorkflowEvidenceMode } from "./workflowCanvasTypes.ts";
import {
  ALL_NODE_TYPES,
  DOMAIN_META,
  NODE_TYPE_META,
  getGraphDomains,
  getCanvasPresets,
  searchNodes,
} from "./workflowCanvasUtils.ts";

interface WorkflowToolbarProps {
  readonly graph: WorkflowGraph;
  readonly filter: WorkflowCanvasFilter;
  readonly evidenceModel?: WorkflowMapEvidenceModel | null;
  readonly onFilterChange: (update: Partial<WorkflowCanvasFilter>) => void;
  readonly onResetFilter: () => void;
  readonly onOpenInvariantsModal: () => void;
  readonly onSelectSearchNode: (nodeId: string) => void;
  readonly onLoadEvidenceFile: (file: File) => Promise<void>;
  readonly onAttachScreenshots?: (files: FileList | File[]) => void;
  readonly onClearEvidence: () => void;
  readonly onFocusFailures?: () => void;
}

export function WorkflowToolbar({
  graph,
  filter,
  evidenceModel,
  onFilterChange,
  onResetFilter,
  onOpenInvariantsModal,
  onSelectSearchNode,
  onLoadEvidenceFile,
  onAttachScreenshots,
  onClearEvidence,
  onFocusFailures,
}: WorkflowToolbarProps) {
  const presets = getCanvasPresets(graph);
  const graphDomains = getGraphDomains(graph);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [evidenceDropdownOpen, setEvidenceDropdownOpen] = useState(false);
  const [provenanceModalOpen, setProvenanceModalOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const manifestInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  const searchResults = filter.searchQuery.trim()
    ? searchNodes(graph.nodes, filter.searchQuery).slice(0, 8)
    : [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDomainToggle = (domain: WorkflowDomain) => {
    const isSelected = filter.selectedDomains.includes(domain);
    const updated = isSelected
      ? filter.selectedDomains.filter((d) => d !== domain)
      : [...filter.selectedDomains, domain];
    onFilterChange({ selectedDomains: updated });
  };

  const handleNodeTypeToggle = (type: WorkflowNodeType) => {
    const isSelected = filter.selectedNodeTypes.includes(type);
    const updated = isSelected
      ? filter.selectedNodeTypes.filter((t) => t !== type)
      : [...filter.selectedNodeTypes, type];
    onFilterChange({ selectedNodeTypes: updated });
  };

  const handleEvidenceModeChange = (mode: WorkflowEvidenceMode) => {
    onFilterChange({ evidenceMode: mode });
  };

  const handleManifestFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadEvidenceFile(file);
      setEvidenceDropdownOpen(false);
      // reset input value so re-uploading same file triggers change
      e.target.value = "";
    }
  };

  const handleScreenshotFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onAttachScreenshots) {
      onAttachScreenshots(e.target.files);
      setEvidenceDropdownOpen(false);
      e.target.value = "";
    }
  };

  const hasActiveFilters =
    filter.presetId !== "overview" ||
    filter.selectedDomains.length > 0 ||
    filter.selectedNodeTypes.length > 0 ||
    filter.filterInvariantOnly ||
    filter.focusNeighborhood ||
    filter.searchQuery.trim() !== "";

  const summary = evidenceModel?.summary;
  const provenance = evidenceModel?.provenance;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
      {/* Hidden File Inputs for Manifest and Screenshots */}
      <input
        ref={manifestInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleManifestFileChange}
      />
      <input
        ref={screenshotInputRef}
        type="file"
        accept="image/png,image/*"
        multiple
        className="hidden"
        onChange={handleScreenshotFilesChange}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Branding + Preset selector + Evidence Mode / Provenance */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 font-black text-white shadow-xs text-xs">
              EX
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black tracking-tight text-slate-900 dark:text-slate-100">
                  Engoryx Workflow Map
                </span>
                <span className="rounded bg-indigo-50 px-1.5 py-0.2 text-[9px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  WM-4
                </span>
                <span className="hidden rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-mono font-semibold text-slate-600 sm:inline-block dark:bg-slate-800 dark:text-slate-400">
                  READ ONLY
                </span>
              </div>
            </div>
          </div>

          {/* Preset Selector */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="preset-select" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              View Preset:
            </label>
            <div className="relative">
              <select
                id="preset-select"
                value={filter.presetId}
                onChange={(e) => onFilterChange({ presetId: e.target.value, focusNeighborhood: false })}
                className="appearance-none rounded-lg border border-slate-300 bg-slate-50 py-1.5 pl-2.5 pr-7 text-xs font-semibold text-slate-800 shadow-2xs transition-colors hover:bg-white focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750"
              >
                <optgroup label="Curated Flow Views">
                  {presets
                    .filter((p) => p.category === "curated")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Domain Views">
                  {presets
                    .filter((p) => p.category === "domain")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Platform">
                  {presets
                    .filter((p) => p.category === "all")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </optgroup>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {/* Evidence Overlay Mode Controls & Provenance */}
          <div className="flex items-center gap-2 border-l border-slate-200 pl-3 dark:border-slate-800">
            {!evidenceModel ? (
              <button
                type="button"
                onClick={() => manifestInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50 px-2.5 py-1.5 text-xs font-semibold text-purple-750 shadow-2xs hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300 dark:hover:bg-purple-900/60"
                title="Load a local QA-1 manifest JSON file (manifest.json)"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Load QA Evidence</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {/* Mode segmented control: OFF | STATUS | FAILURES */}
                <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => handleEvidenceModeChange("off")}
                    className={`rounded-md px-2 py-1 text-[11px] transition-all ${
                      filter.evidenceMode === "off"
                        ? "bg-white font-bold text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-slate-100"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                    title="Disable evidence overlay on canvas"
                  >
                    Off
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEvidenceModeChange("status")}
                    className={`rounded-md px-2 py-1 text-[11px] transition-all ${
                      filter.evidenceMode === "status"
                        ? "bg-white font-bold text-indigo-700 shadow-2xs dark:bg-slate-900 dark:text-indigo-300"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                    title="Show QA status badges on mapped nodes"
                  >
                    Status
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEvidenceModeChange("failures")}
                    className={`rounded-md px-2 py-1 text-[11px] transition-all ${
                      filter.evidenceMode === "failures"
                        ? "bg-white font-bold text-rose-700 shadow-2xs dark:bg-slate-900 dark:text-rose-300"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                    title="Emphasize failing nodes and dim passing/unrelated nodes"
                  >
                    Failures
                  </button>
                </div>

                {/* Focus Failures Button (if failing nodes exist) */}
                {summary && summary.failCount > 0 && onFocusFailures && (
                  <button
                    type="button"
                    onClick={onFocusFailures}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-800 shadow-2xs hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
                    title={`Focus on ${summary.failCount} failing graph node(s)`}
                  >
                    <AlertOctagon className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                    <span>Focus Failures ({summary.failCount})</span>
                  </button>
                )}

                {/* Provenance & Evidence Actions Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setEvidenceDropdownOpen(!evidenceDropdownOpen)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50/80 px-2.5 py-1.5 text-xs font-semibold text-purple-800 shadow-2xs hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300"
                    title="View QA Evidence provenance and actions"
                  >
                    <Layers className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                    <span className="font-mono text-[11px]">
                      {provenance ? provenance.commitSha.slice(0, 7) : "Evidence"}
                    </span>
                    <ChevronDown className="h-3 w-3 text-purple-500" />
                  </button>

                  {/* Dropdown Menu */}
                  {evidenceDropdownOpen && summary && provenance && (
                    <div className="absolute left-0 top-full mt-1.5 w-80 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl z-50 dark:border-slate-700 dark:bg-slate-850">
                      <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-750">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Loaded QA Evidence Run
                        </span>
                        <button
                          type="button"
                          onClick={() => setEvidenceDropdownOpen(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Provenance metadata */}
                      <div className="space-y-1.5 text-[11px] border-b border-slate-100 pb-2.5 dark:border-slate-750">
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="flex items-center gap-1">
                            <GitCommit className="h-3 w-3" />
                            <span>Commit SHA:</span>
                          </span>
                          <code className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            {provenance.commitSha.slice(0, 10)}
                          </code>
                        </div>
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            <span>Branch:</span>
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                            {provenance.branch}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Run Date:</span>
                          </span>
                          <span>{new Date(provenance.timestamp).toLocaleDateString()} {new Date(provenance.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Trigger:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{provenance.trigger}</span>
                        </div>
                      </div>

                      {/* Summary Breakdown counts */}
                      <div className="my-2.5 space-y-1.5 text-[11px]">
                        <div className="text-[10px] font-bold uppercase text-slate-400">Node Evidence Breakdown</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="flex items-center justify-between rounded bg-emerald-50 px-2 py-1 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <span>PASS:</span>
                            <span className="font-bold">{summary.passCount}</span>
                          </div>
                          <div className="flex items-center justify-between rounded bg-rose-50 px-2 py-1 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            <span>FAIL:</span>
                            <span className="font-bold">{summary.failCount}</span>
                          </div>
                          <div className="flex items-center justify-between rounded bg-amber-50 px-2 py-1 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            <span>PARTIAL:</span>
                            <span className="font-bold">{summary.partialCount}</span>
                          </div>
                          <div className="flex items-center justify-between rounded bg-slate-100 px-2 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <span>NOT RUN:</span>
                            <span className="font-bold">{summary.notRunCount}</span>
                          </div>
                        </div>
                        {summary.unmappedRuntimeScenariosCount > 0 && (
                          <div className="text-[10px] text-slate-500 pt-1">
                            • {summary.unmappedRuntimeScenariosCount} runtime scenario(s) not mapped in graph.
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="space-y-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-750">
                        {onAttachScreenshots && (
                          <button
                            type="button"
                            onClick={() => screenshotInputRef.current?.click()}
                            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750"
                          >
                            <ImageIcon className="h-3.5 w-3.5 text-purple-600" />
                            <span>Attach Screenshot PNGs</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => manifestInputRef.current?.click()}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750"
                        >
                          <Upload className="h-3.5 w-3.5 text-indigo-600" />
                          <span>Replace Evidence JSON</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClearEvidence();
                            setEvidenceDropdownOpen(false);
                          }}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-50 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Clear Evidence</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center/Right: Search + Filter toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Fast Search with Autocomplete */}
          <div ref={searchContainerRef} className="relative w-44 sm:w-60">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={filter.searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  onFilterChange({ searchQuery: e.target.value });
                  setSearchOpen(true);
                }}
                placeholder="Search nodes, routes, IDs…"
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder-slate-400 shadow-2xs focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
              {filter.searchQuery && (
                <button
                  type="button"
                  onClick={() => onFilterChange({ searchQuery: "" })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Autocomplete Dropdown */}
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-850 z-50">
                <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400">
                  Matching Nodes ({searchResults.length})
                </div>
                {searchResults.map((match) => (
                  <div
                    key={match.id}
                    onClick={() => {
                      onSelectSearchNode(match.id);
                      setSearchOpen(false);
                    }}
                    className="flex cursor-pointer items-center justify-between rounded-lg p-2 text-xs transition-colors hover:bg-indigo-50 dark:hover:bg-slate-700"
                  >
                    <div className="overflow-hidden pr-2">
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {match.label}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                        <span>{match.id}</span>
                        {match.route?.canonicalPath && (
                          <span className="text-blue-500 font-semibold">{match.route.canonicalPath}</span>
                        )}
                      </div>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${DOMAIN_META[match.domain]?.colorBadge}`}>
                      {match.domain}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filters Button / Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition-colors ${
                filter.selectedDomains.length > 0 || filter.selectedNodeTypes.length > 0
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Filters</span>
              {(filter.selectedDomains.length > 0 || filter.selectedNodeTypes.length > 0) && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                  {filter.selectedDomains.length + filter.selectedNodeTypes.length}
                </span>
              )}
            </button>

            {/* Filter Dropdown Popover */}
            {filterDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl z-50 dark:border-slate-700 dark:bg-slate-850">
                <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-750">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Filter Nodes
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilterDropdownOpen(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Domain filter pills */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">By Domain</div>
                  <div className="flex flex-wrap gap-1">
                    {graphDomains.map((domain) => {
                      const meta = DOMAIN_META[domain];
                      const active = filter.selectedDomains.includes(domain);
                      return (
                        <button
                          key={domain}
                          type="button"
                          onClick={() => handleDomainToggle(domain)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border transition-all ${
                            active
                              ? `${meta.colorBadge} ring-1 ring-indigo-500`
                              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.colorDot}`} />
                          <span>{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Node type filter pills */}
                <div className="mt-3 space-y-1.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">By Node Type</div>
                  <div className="flex flex-wrap gap-1">
                    {ALL_NODE_TYPES.map((type) => {
                      const meta = NODE_TYPE_META[type];
                      const active = filter.selectedNodeTypes.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => handleNodeTypeToggle(type)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border transition-all ${
                            active
                              ? `${meta.colorBg} ${meta.colorText} ${meta.colorBorder} ring-1 ring-indigo-500 font-bold`
                              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          <span>{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Clear filters button */}
                {(filter.selectedDomains.length > 0 || filter.selectedNodeTypes.length > 0) && (
                  <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-750">
                    <button
                      type="button"
                      onClick={() => onFilterChange({ selectedDomains: [], selectedNodeTypes: [] })}
                      className="w-full rounded-md bg-slate-100 py-1 text-center text-[10px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    >
                      Clear Domain & Type Filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Invariants Only toggle */}
          <button
            type="button"
            onClick={() => onFilterChange({ filterInvariantOnly: !filter.filterInvariantOnly })}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition-colors ${
              filter.filterInvariantOnly
                ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750"
            }`}
            title="Show only nodes linked to high-risk invariants"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            <span className="hidden sm:inline">Invariants</span>
          </button>

          {/* Neighborhood focus toggle (if a node is selected) */}
          {filter.selectedNodeId && (
            <button
              type="button"
              onClick={() => onFilterChange({ focusNeighborhood: !filter.focusNeighborhood })}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition-colors ${
                filter.focusNeighborhood
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750"
              }`}
              title="Filter canvas to selected node + immediate neighbors"
            >
              <Focus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Neighborhood</span>
            </button>
          )}

          {/* High-Risk Invariants Modal button */}
          <button
            type="button"
            onClick={onOpenInvariantsModal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750"
            title={`Browse all ${graph.invariants.length} high-risk invariants`}
          >
            <Shield className="h-3.5 w-3.5 text-amber-500" />
            <span className="hidden sm:inline">Catalog ({graph.invariants.length})</span>
          </button>

          {/* Reset Filters button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilter}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              title="Reset all filters and view"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
