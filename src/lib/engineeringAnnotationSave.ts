export type EngineeringAnnotationSaveStatus = "saved" | "saving" | "unsaved" | "error";

export interface AnnotationSaveToken {
  generation: number;
  requestId: number;
}

/**
 * Save results are applied only when they belong to both the latest request
 * and the latest local edit generation.  This keeps a late response from an
 * older save from overwriting the visible state of a newer edit.
 */
export function shouldApplyAnnotationSaveResult(current: AnnotationSaveToken, result: AnnotationSaveToken): boolean {
  return current.generation === result.generation && current.requestId === result.requestId;
}

export function annotationSaveResultStatus(
  current: AnnotationSaveToken,
  result: AnnotationSaveToken,
  succeeded: boolean,
): EngineeringAnnotationSaveStatus | null {
  if (shouldApplyAnnotationSaveResult(current, result)) return succeeded ? "saved" : "error";
  if (current.requestId === result.requestId) return "unsaved";
  return null;
}

export function createAnnotationSaveCoordinator() {
  let generation = 0;
  let requestId = 0;

  return {
    markDirty() {
      generation += 1;
      return generation;
    },
    beginSave(): AnnotationSaveToken {
      requestId += 1;
      return { generation, requestId };
    },
    current(): AnnotationSaveToken {
      return { generation, requestId };
    },
    invalidate() {
      generation += 1;
      requestId += 1;
    },
  };
}
