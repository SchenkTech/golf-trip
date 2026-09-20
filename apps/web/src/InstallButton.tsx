import { useEffect, useState } from "react";
import { isIOS, isStandalone } from "./lib/install.ts";
import type { BeforeInstallPromptEvent } from "./lib/install.ts";
import "./InstallButton.css";

/** "Add to Home Screen," made discoverable -- see docs/DECISIONS.md #2:
 *  the whole point of the PWA call over native was a real home-screen icon
 *  without an App Store. Chrome/Edge/Android get the real native prompt;
 *  iOS Safari never fires it (no such API), so it gets short instructions
 *  instead. Renders nothing once the app is already installed. */
export default function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!deferred && !isIOS()) return null; // nothing to offer yet, and never will on most desktop browsers

  return (
    <div className="install-wrap">
      <button
        className="install-btn"
        onClick={async () => {
          if (deferred) {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
          } else {
            setShowIOSHelp((v) => !v);
          }
        }}
      >
        Install app
      </button>
      {showIOSHelp && (
        <div className="install-ios-help">
          Tap <strong>Share</strong> (the square with an arrow), then{" "}
          <strong>Add to Home Screen</strong>.
        </div>
      )}
    </div>
  );
}
