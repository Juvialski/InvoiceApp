import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Image, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import {
  entityMediaCompanyId,
  loadEntityMedia,
  loadEntityMediaBatch,
  removeEntityMedia,
  uploadEntityMedia,
} from "../../lib/entityMedia.ts";
import type { EntityMedia, EntityMediaEntityType } from "../../lib/entityMediaTypes.ts";

function imageFallback(label: string, content?: ReactNode) {
  return content || <span role="img" aria-label={`${label} image unavailable`} className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 text-center hqs-secondary-text"><Image className="h-5 w-5 opacity-70" aria-hidden="true" /><span className="text-[10px] font-semibold">{label}</span></span>;
}

export function EntityMediaThumbnail({
  media,
  label,
  fallback,
  className = "h-11 w-14",
  alt,
}: {
  media?: EntityMedia | null;
  label: string;
  fallback?: ReactNode;
  className?: string;
  alt?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageFailed = Boolean(media?.url && failedUrl === media.url);
  return (
    <span data-entity-media-thumbnail="true" data-entity-media-fallback={media?.url && !imageFailed ? "false" : "true"} className={`hqs-border hqs-surface-muted relative inline-flex shrink-0 overflow-hidden rounded-lg border ${className}`}>
      {media?.url && !imageFailed
        ? <img src={media.url} alt={alt || media.altText || `${label} image`} loading="lazy" decoding="async" onError={() => setFailedUrl(media.url)} className="h-full w-full object-cover" />
        : imageFallback(label, fallback)}
    </span>
  );
}

export function useEntityMediaThumbnails(
  entityType: EntityMediaEntityType,
  entityIds: readonly string[],
  enabled = true,
): { byEntityId: Readonly<Record<string, EntityMedia>>; loading: boolean } {
  const ids = useMemo(() => [...new Set(entityIds.map((id) => String(id || "").trim()).filter(Boolean))], [entityIds]);
  const idsKey = ids.join("|");
  const [byEntityId, setByEntityId] = useState<Readonly<Record<string, EntityMedia>>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !ids.length) {
      setByEntityId({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await loadEntityMediaBatch(entityMediaCompanyId(), entityType, ids);
      setByEntityId(result.byEntityId || {});
    } catch {
      setByEntityId({});
    } finally {
      setLoading(false);
    }
  }, [enabled, entityType, ids, idsKey]);

  useEffect(() => {
    void refresh();
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ entityType?: string; entityId?: string }>).detail;
      if (detail?.entityType === entityType && ids.includes(String(detail.entityId || ""))) void refresh();
    };
    window.addEventListener("hqs:entity-media-updated", onChanged);
    return () => window.removeEventListener("hqs:entity-media-updated", onChanged);
  }, [entityType, idsKey, refresh]);

  return { byEntityId, loading };
}

export function EntityMediaControl({
  entityType,
  entityId,
  label,
  canManage,
  className = "",
}: {
  entityType: EntityMediaEntityType;
  entityId: string;
  label: string;
  canManage: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<EntityMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [altText, setAltText] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const current = await loadEntityMedia(entityMediaCompanyId(), entityType, entityId);
      setMedia(current);
      setAltText(current?.altText || "");
      setImageFailed(false);
      setError(null);
    } catch {
      setMedia(null);
      setError("The current image is unavailable. The standard entity identity remains in place.");
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => { void refresh(); }, [refresh]);

  const chooseImage = () => inputRef.current?.click();

  const onFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await uploadEntityMedia(entityMediaCompanyId(), entityType, entityId, {
        file,
        expectedMediaId: media?.id || null,
        altText: altText.trim() || undefined,
      });
      setMedia(result.media);
      setImageFailed(false);
      setNotice(result.cleanupPending ? "Image updated. Previous image cleanup is queued for retry." : "Image updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The image could not be uploaded safely.");
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async () => {
    if (!media) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await removeEntityMedia(entityMediaCompanyId(), entityType, entityId, media.id);
      setMedia(null);
      setAltText("");
      setImageFailed(false);
      setNotice(result.cleanupPending ? "Image removed. Storage cleanup is queued for retry." : "Image removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The image could not be removed safely.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section data-entity-media-panel="true" className={`hqs-surface-raised hqs-border min-w-0 rounded-xl border p-3 ${className}`} aria-label={`${label} image`}>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.2fr)] sm:items-center">
        <div data-entity-media-preview="true" data-entity-media-fallback={loading || !media?.url || imageFailed ? "true" : "false"} className="hqs-border hqs-surface-muted relative aspect-[4/3] min-w-0 overflow-hidden rounded-lg border">
          {loading
            ? <span className="absolute inset-0 animate-pulse hqs-surface-muted" aria-label="Loading image" />
            : media?.url && !imageFailed
              ? <img src={media.url} alt={media.altText || `${label} image`} decoding="async" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
              : imageFallback(imageFailed ? `${label} image unavailable` : `No ${label.toLowerCase()} image`)}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="hqs-primary-text text-xs font-bold">{label} image</p>
          {canManage && <label className="block"><span className="hqs-secondary-text text-[10px] font-semibold">Image description <span className="font-normal">(optional)</span></span><input value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={240} className="hqs-control hqs-focus-ring mt-1 min-h-9 w-full rounded-lg px-2.5 py-1.5 text-xs" placeholder={`Describe this ${label.toLowerCase()} image`} /></label>}
          {canManage && <div className="flex flex-wrap gap-2">
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void onFileSelected(event)} className="sr-only" aria-label={`Choose ${label.toLowerCase()} image`} />
            <button type="button" onClick={chooseImage} disabled={saving || loading} className="hqs-control hqs-focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60">
              {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />}
              {media ? "Replace" : "Upload image"}
            </button>
            {media && <button type="button" onClick={() => void onRemove()} disabled={saving || loading} className="hqs-control hqs-focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Remove</button>}
          </div>}
          {loading && <p role="status" className="hqs-secondary-text text-[10px]">Loading image…</p>}
          {error && <p role="alert" className="hqs-attention-danger rounded-lg px-2.5 py-2 text-xs leading-5">{error}</p>}
          {notice && <p role="status" className="hqs-secondary-text text-[10px] leading-4">{notice}</p>}
          {canManage && <p className="hqs-secondary-text text-[10px] leading-4">JPEG, PNG, or WebP · up to 5 MiB</p>}
        </div>
      </div>
    </section>
  );
}
