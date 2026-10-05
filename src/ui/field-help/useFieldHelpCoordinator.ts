import { useEffect, useRef, useState } from "react";

type Options = {
  rootRef: React.RefObject<HTMLElement | null>;
  triggerRef: React.RefObject<HTMLElement | null>;
  learnMoreRef: React.RefObject<HTMLElement | null>;
};

/** Coordinates the preview, its details sheet, and the two-step Escape path. */
export function useFieldHelpCoordinator({
  rootRef,
  triggerRef,
  learnMoreRef,
}: Options) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const suppressNextTriggerFocus = useRef(false);

  const closeTooltip = () => {
    setDetailsOpen(false);
    setOpen(false);
    setPinned(false);
    suppressNextTriggerFocus.current = true;
    triggerRef.current?.focus();
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    // Let the sheet unmount before putting focus back on the link it opened
    // from; its cleanup also restores focus, but this makes the contract
    // explicit for portal and non-portal hosts alike.
    window.setTimeout(() => learnMoreRef.current?.focus(), 0);
  };

  const openDetails = () => {
    setOpen(true);
    setPinned(true);
    setPortalContainer(
      rootRef.current?.closest<HTMLElement>("dialog[open]") ?? null,
    );
    setDetailsOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node) || detailsOpen)
        return;
      setOpen(false);
      setPinned(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [detailsOpen, open, rootRef]);

  return {
    open,
    detailsOpen,
    portalContainer,
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => {
      if (!pinned && !detailsOpen) setOpen(false);
    },
    onTriggerFocus: () => {
      if (suppressNextTriggerFocus.current) {
        suppressNextTriggerFocus.current = false;
        return;
      }
      setOpen(true);
    },
    toggle: () => {
      const next = !pinned;
      setPinned(next);
      setOpen(next);
    },
    openDetails,
    closeDetails,
    closeTooltip,
  };
}
