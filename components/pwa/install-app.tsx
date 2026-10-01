"use client";

import { useState } from "react";
import Image from "next/image";
import { Download, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { usePwa } from "./pwa-provider";

export function InstallApp() {
  const { ready, installed, platform, canPrompt, installing, install } = usePwa();
  const [showGuide, setShowGuide] = useState(false);

  if (!ready || installed) return null;

  async function addToHomeScreen() {
    if (canPrompt) {
      try {
        await install();
      } catch {
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Install PowerBuild">
      <div className="flex items-center gap-3">
        <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="shrink-0 rounded-xl" />
        <div>
          <h2 className="text-sm font-semibold">PowerBuild on your Home Screen</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Open your training app with one tap.</p>
        </div>
      </div>
      <Button type="button" variant="outline" className="w-full" loading={installing} onClick={addToHomeScreen}>
        {platform === "ios" ? <PlusSquare className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        Add to Home Screen
      </Button>

      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Install PowerBuild</DialogTitle>
            <DialogDescription>Keep your training app on your Home Screen.</DialogDescription>
          </DialogHeader>
          {platform === "ios" ? (
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed">
              <li>Open this website in <strong>Safari</strong> on your iPhone or iPad.</li>
              <li>Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> <strong>Share</strong>. You may need to open the page menu first.</li>
              <li>Choose <strong>Add to Home Screen</strong>. If shown, turn on <strong>Open as Web App</strong>, then tap <strong>Add</strong>.</li>
            </ol>
          ) : platform === "android" ? (
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed">
              <li>Open this website in <strong>Chrome</strong>.</li>
              <li>Open the browser menu (⋮).</li>
              <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>, then confirm.</li>
            </ol>
          ) : (
            <p className="text-sm leading-relaxed">In Chrome or Edge, use the install icon in the address bar or the browser menu. In Safari on a Mac, choose <strong>File → Add to Dock</strong>. On iPhone, open this website in Safari and choose <strong>Share → Add to Home Screen</strong>.</p>
          )}
          <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
            Launch PowerBuild from the new icon. Sign in there if asked. An internet connection is needed to load and save workouts.
          </p>
          <Button type="button" onClick={() => setShowGuide(false)}>Got it</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
