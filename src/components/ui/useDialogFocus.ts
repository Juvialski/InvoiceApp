import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled]):not([aria-hidden='true'])",
  "a[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface UseDialogFocusOptions {
  open: boolean;
  onClose?: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  restoreFocusFallback?: () => HTMLElement | null;
}

interface DocumentScrollLockSnapshot {
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
  documentOverscrollBehavior: string;
}

let activeDocumentScrollLocks = 0;
let documentScrollLockSnapshot: DocumentScrollLockSnapshot | null = null;

function lockDocumentScroll() {
  if (typeof document === "undefined" || !document.body) return () => undefined;

  if (activeDocumentScrollLocks === 0) {
    documentScrollLockSnapshot = {
      bodyOverflow: document.body.style.overflow,
      bodyOverscrollBehavior: document.body.style.overscrollBehavior,
      documentOverscrollBehavior: document.documentElement.style.overscrollBehavior,
    };
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.setAttribute("data-dialog-scroll-locked", "true");
    document.documentElement.setAttribute("data-dialog-scroll-locked", "true");
  }
  activeDocumentScrollLocks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeDocumentScrollLocks = Math.max(0, activeDocumentScrollLocks - 1);
    if (activeDocumentScrollLocks > 0 || !documentScrollLockSnapshot || !document.body) return;

    document.body.style.overflow = documentScrollLockSnapshot.bodyOverflow;
    document.body.style.overscrollBehavior = documentScrollLockSnapshot.bodyOverscrollBehavior;
    document.documentElement.style.overscrollBehavior = documentScrollLockSnapshot.documentOverscrollBehavior;
    document.body.removeAttribute("data-dialog-scroll-locked");
    document.documentElement.removeAttribute("data-dialog-scroll-locked");
    documentScrollLockSnapshot = null;
  };
}

function focusElement(element: HTMLElement | null | undefined) {
  if (!element) return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== "none"
      && style.visibility !== "hidden"
      && element.getClientRects().length > 0;
  });
}

/**
 * Keeps keyboard focus inside an open dialog and restores it to the opener.
 * The host still owns the close callback, so this is presentation-only.
 */
export function useDialogFocus({ open, onClose, initialFocusRef, restoreFocusRef, restoreFocusFallback }: UseDialogFocusOptions) {
  const dialogNodeRef = useRef<HTMLElement | null>(null);
  const dialogRef = (node: HTMLElement | null) => {
    dialogNodeRef.current = node;
  };
  const onCloseRef = useRef(onClose);
  const restoreFocusFallbackRef = useRef(restoreFocusFallback);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    restoreFocusFallbackRef.current = restoreFocusFallback;
  }, [restoreFocusFallback]);

  useEffect(() => {
    if (!open) return undefined;
    return lockDocumentScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogNodeRef.current;
    if (!dialog) return undefined;

    const previousFocus = restoreFocusRef?.current?.isConnected
      ? restoreFocusRef.current
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const originalTabIndex = dialog.getAttribute("tabindex");
    const focusInitial = () => {
      const explicit = initialFocusRef?.current;
      const target = explicit && !explicit.hasAttribute("disabled") ? explicit : focusableElements(dialog)[0] || dialog;
      if (target === dialog && !dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
      focusElement(target);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
        focusElement(dialog);
        return;
      }

      const active = document.activeElement;
      if (!dialog.contains(active) || active === dialog) {
        event.preventDefault();
        focusElement(focusable[0]);
      } else if (event.shiftKey && active === focusable[0]) {
        event.preventDefault();
        focusElement(focusable[focusable.length - 1]);
      } else if (!event.shiftKey && active === focusable[focusable.length - 1]) {
        event.preventDefault();
        focusElement(focusable[0]);
      }
    };

    dialog.addEventListener("keydown", handleKeyDown);
    focusInitial();
    const frame = window.requestAnimationFrame(() => {
      if (!dialog.contains(document.activeElement)) focusInitial();
    });

    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(frame);
      if (originalTabIndex === null) dialog.removeAttribute("tabindex");
      else dialog.setAttribute("tabindex", originalTabIndex);
      const usefulPreviousFocus = previousFocus
        && previousFocus !== document.body
        && previousFocus !== document.documentElement
        && previousFocus.isConnected;
      const restoreFocus = () => {
        const restoreTarget = usefulPreviousFocus ? previousFocus : restoreFocusFallbackRef.current?.();
        if (restoreTarget?.isConnected) focusElement(restoreTarget);
      };
      if (usefulPreviousFocus) restoreFocus();
      else window.requestAnimationFrame(restoreFocus);
    };
  }, [open, initialFocusRef, restoreFocusRef]);

  return dialogRef;
}
