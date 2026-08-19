import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { PageGuide } from "../guide/PageGuide";
import { WifiOffIcon } from "../../ui/icons";
import { AnnouncementBanner } from "../../features/announcements/AnnouncementBanner";
import { CommandPalette } from "./CommandPalette";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { ShellOnlineMonitor } from "./ShellOnlineMonitor";
import { ShortcutReferenceOverlay } from "./ShortcutReferenceOverlay";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const onlineMonitor = new ShellOnlineMonitor();

function useOnline() {
  const [online, setOnline] = useState(() => onlineMonitor.isOnline());
  useEffect(() => {
    const stop = onlineMonitor.start();
    const unsub = onlineMonitor.subscribe(setOnline);
    return () => {
      stop();
      unsub();
    };
  }, []);
  return online;
}

/** True when the key event originated inside a text field or editable region,
 * where single-key shortcuts (like `?`) must not fire. */
function isEditableTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const online = useOnline();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (
        e.key === "?" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isEditableTarget(e) &&
        !paletteOpen
      ) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenPalette={() => setPaletteOpen(true)} />
        {!online && (
          <div className="flex items-center gap-2 border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-sm font-medium text-warn">
            <WifiOffIcon width={13} height={13} />
            Offline — showing the last synced data. Changes will fail until the
            connection returns.
          </div>
        )}
        <AnnouncementBanner />
        <main className="app-canvas min-h-0 flex-1 overflow-y-auto">
          <div className="workspace-sheet mx-auto max-w-[1440px] px-12 py-11 max-xl:px-8 max-md:px-5 max-md:py-7">
            <PageGuide />
            <RouteErrorBoundary>
              <Outlet />
            </RouteErrorBoundary>
          </div>
        </main>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutReferenceOverlay
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
