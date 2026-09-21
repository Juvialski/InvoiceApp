export type DocumentPreviewState = "loading" | "ready" | "error";

export function documentPreviewState({
  loading,
  hasBytes,
  error,
}: {
  loading: boolean;
  hasBytes: boolean;
  error: string;
}): DocumentPreviewState {
  if (loading) return "loading";
  if (error || !hasBytes) return "error";
  return "ready";
}

export function documentPreviewFrameClass(state: DocumentPreviewState): string {
  if (state === "loading") return "flex min-h-40 items-center justify-center";
  if (state === "error") return "flex min-h-28 items-center justify-center";
  return "min-h-0";
}
