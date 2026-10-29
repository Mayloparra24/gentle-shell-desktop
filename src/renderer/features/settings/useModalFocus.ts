import { useEffect, type RefObject, type KeyboardEvent } from "react";

export function useModalFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const first = ref.current?.querySelector<HTMLElement>("button:not(:disabled)");
    first?.focus();
    return () => {
      if (previous?.matches(":disabled")) {
        // Confirmation can disable its trigger while the write is pending.
        previous.closest('[role="dialog"]')?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
      } else previous?.focus();
    };
  }, [ref]);
}

export function trapTab(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex='0']"))
    .filter((element) => !element.closest("[inert]"));
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first?.focus();
  }
}
