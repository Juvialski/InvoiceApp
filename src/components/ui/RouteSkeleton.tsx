import React from "react";

export function RouteLoadingSkeleton(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading workspace page"
      className="space-y-5 animate-pulse"
    >
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="h-3 w-28 rounded-md bg-slate-200" />
          <div className="h-7 w-56 rounded-lg bg-slate-300" />
          <div className="h-4 w-80 max-w-full rounded bg-slate-200" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded-lg bg-slate-200" />
          <div className="h-9 w-32 rounded-lg bg-slate-200" />
        </div>
      </div>

      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-7 w-7 rounded-lg bg-slate-100" />
              <div className="h-3 w-10 rounded bg-slate-100" />
            </div>
            <div className="h-6 w-28 rounded bg-slate-200" />
            <div className="h-3 w-36 rounded bg-slate-100" />
          </div>
        ))}
      </div>

      {/* Filter Bar Skeleton */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col gap-2 sm:flex-row">
        <div className="h-10 flex-1 rounded-lg bg-slate-100" />
        <div className="h-10 w-44 rounded-lg bg-slate-100" />
      </div>

      {/* Content Table / Main Card Skeleton */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="h-4 w-40 rounded bg-slate-200" />
          <div className="h-4 w-20 rounded bg-slate-100" />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4 py-2 border-b border-slate-50 last:border-0">
              <div className="h-4 w-1/4 rounded bg-slate-100" />
              <div className="h-4 w-1/6 rounded bg-slate-100" />
              <div className="h-4 w-1/6 rounded bg-slate-100" />
              <div className="h-4 w-20 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RouteLoadingSkeleton;
