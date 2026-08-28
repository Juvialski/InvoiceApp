import React, { memo } from "react";
import {
  BaseEdge,
  type EdgeProps,
  EdgeLabelRenderer,
  getBezierPath,
} from "@xyflow/react";
import type { WorkflowCustomEdgeData } from "./workflowCanvasTypes.ts";

export const WorkflowEdgeComponent = memo(function WorkflowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps & { data?: WorkflowCustomEdgeData }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeData = data;
  const isSelected = edgeData?.isSelected;
  const isDimmed = edgeData?.isDimmed;
  const kindMeta = edgeData?.kindMeta;
  const label = edgeData?.edge.label;
  const condition = edgeData?.edge.condition;

  const color = kindMeta?.color || "#64748b";
  const strokeDasharray = kindMeta?.strokeDasharray;

  const strokeWidth = isSelected ? 2.5 : 1.5;
  const strokeColor = isSelected ? "#4f46e5" : color;
  const opacity = isDimmed ? 0.2 : 1;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
          opacity,
          transition: "stroke 0.2s, stroke-width 0.2s, opacity 0.2s",
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              opacity,
              transition: "opacity 0.2s",
            }}
            className={`nodrag nopan flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-medium shadow-2xs backdrop-blur-xs transition-colors ${
              isSelected
                ? "border-indigo-400 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-400 dark:border-indigo-600 dark:bg-indigo-950 dark:text-indigo-200"
                : "border-slate-200 bg-white/90 text-slate-600 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300"
            }`}
            title={condition ? `Condition: ${condition}` : label}
          >
            <span>{label}</span>
            {condition && (
              <span className="font-mono text-[8px] text-amber-600 dark:text-amber-400" title={`Condition: ${condition}`}>
                [cond]
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
