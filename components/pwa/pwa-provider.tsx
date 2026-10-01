"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop";

interface PwaContextValue {
  ready: boolean;
  installed: boolean;
  platform: Platform;
  canPrompt: boolean;
  installing: boolean;
  install: () => Promise<void>;
}

const PwaContext = createContext<PwaContextValue | null>(null);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const iosNavigator = navigator as Navigator & { standalone?: boolean };
    const updateDisplayMode = () => {
      setInstalled(standalone.matches || iosNavigator.standalone === true);
    };
    const frame = window.requestAnimationFrame(() => {
      updateDisplayMode();
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setPlatform(isIOS ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "desktop");
      setReady(true);
    });

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    standalone.addEventListener("change", updateDisplayMode);

    if ("serviceWorker" in navigator && window.isSecureContext) {
      // Production workers must not cache development bundles during local work.
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        }).catch((error) => console.warn("PowerBuild service worker registration failed", error));
      }
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      standalone.removeEventListener("change", updateDisplayMode);
    };
  }, []);

  async function install() {
    if (!installPrompt || installing) return;
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } finally {
      // A native install event can only be used once, even after dismissal.
      setInstallPrompt(null);
      setInstalling(false);
    }
  }

  return (
    <PwaContext.Provider value={{ ready, installed, platform, canPrompt: !!installPrompt, installing, install }}>
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  const value = useContext(PwaContext);
  if (!value) throw new Error("usePwa must be used within PwaProvider");
  return value;
}
