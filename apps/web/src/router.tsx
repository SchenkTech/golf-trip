/** Small hand-rolled router -- this app has four screens and a link needs
 *  to survive a reload and a share, nothing more. Reaching for a routing
 *  library would be the wrong size for a project whose own CLAUDE.md says
 *  "deliberately small." History-based (not hash-based) so a shared match
 *  link (`/matches/m-r-fri-2`) looks like a real URL. */

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

function currentPath(): string {
  return window.location.pathname;
}

const RouteContext = createContext<string>(currentPath());

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath());

  useEffect(() => {
    const onPop = () => setPath(currentPath());
    window.addEventListener("popstate", onPop);
    // pushState doesn't fire popstate on its own -- navigate() below
    // dispatches this same event after pushing, so this one listener
    // covers both back/forward and in-app navigation.
    window.addEventListener("gc:navigate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("gc:navigate", onPop);
    };
  }, []);

  return <RouteContext.Provider value={path}>{children}</RouteContext.Provider>;
}

export function usePath(): string {
  return useContext(RouteContext);
}

export function navigate(path: string): void {
  if (path === currentPath()) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new Event("gc:navigate"));
}

export function Link({ to, className, onClick, children }: { to: string; className?: string; onClick?: () => void; children: ReactNode }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        // Plain left-clicks with no modifier stay in-app; anything else
        // (cmd-click to open a tab, right-click, etc.) keeps native
        // behaviour so the link is still a real, shareable <a href>.
        if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          navigate(to);
          onClick?.();
        }
      }}
    >
      {children}
    </a>
  );
}
