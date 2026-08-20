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
import {
  isBrowserRefreshChord,
  isSelectAllChord,
  shouldFireSingleKeyNav,
} from "./singleKeyNav";
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

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const online = useOnline();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isSelectAllChord(e)) return;
      if (isBrowserRefreshChord(e)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "?" && shouldFireSingleKeyNav(e) && !paletteOpen) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  return (
    // overflow-clip: the shell owns the viewport; the ONLY vertical scroller is
    // <main> below. Without it, any descendant taller than the viewport (the
    // icon rail on laptop-height windows, a wide board on an event tab) grows
    // the document itself, adding a second dead window scrollbar that reveals
    // the dark canvas "void" under the app instead of reaching the content.
    <div className="flex h-dvh overflow-clip bg-canvas">
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
