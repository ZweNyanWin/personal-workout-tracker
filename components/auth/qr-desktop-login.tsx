"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { safeRedirectPath } from "@/lib/utils";

type RequestData = {
  id: string;
  desktopSecret: string;
  approvalUrl: string;
  verificationCode: string;
  expiresAt: string;
};

export function QrDesktopLogin() {
  const [attempt, setAttempt] = useState(0);
  const [requestData, setRequestData] = useState<RequestData | null>(null);
  const [qrImage, setQrImage] = useState("");
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setRequestData(null);
      setQrImage("");
      setError("");
      try {
        const response = await fetch("/api/qr-login/start", { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not start phone sign-in.");
        const image = await QRCode.toDataURL(data.approvalUrl, {
          width: 240, margin: 2, errorCorrectionLevel: "M",
        });
        if (!cancelled) {
          setRequestData(data);
          setQrImage(image);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not start phone sign-in.");
      }
    }
    void start();
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    if (!requestData) return;
    const update = () => setSecondsLeft(Math.max(0,
      Math.ceil((new Date(requestData.expiresAt).getTime() - Date.now()) / 1000)
    ));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [requestData]);

  useEffect(() => {
    if (!requestData) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const response = await fetch("/api/qr-login/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: requestData!.id, desktopSecret: requestData!.desktopSecret }),
        });
        const data = await response.json();
        if (cancelled) return;
        if (data.status === "complete") {
          const next = safeRedirectPath(new URLSearchParams(window.location.search).get("next"));
          window.location.assign(next);
          return;
        }
        if (!response.ok || data.status === "expired") {
          setError(data.error || "This QR code expired. Generate a new one.");
          return;
        }
        timer = setTimeout(poll, 2500);
      } catch {
        if (!cancelled) setError("Connection lost. Generate a new QR code and try again.");
      }
    }
    timer = setTimeout(poll, 2500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [requestData]);

  return (
    <div className="mt-4 rounded-lg border border-border p-4 text-center space-y-3">
      <p className="text-sm font-semibold">Sign in with your phone</p>
      {qrImage && requestData && !error && secondsLeft > 0 ? (
        <>
          <Image src={qrImage} alt="Scan to approve this desktop sign-in" width={240} height={240}
            unoptimized className="mx-auto rounded-lg bg-white p-1" />
          <p className="text-sm text-muted-foreground">
            Scan with a phone already signed in to PowerBuild, then approve on the phone.
          </p>
          <p className="text-sm">Matching code: <strong className="font-mono tracking-widest">{requestData.verificationCode}</strong></p>
          <p className="text-xs text-muted-foreground">Expires in {secondsLeft}s</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {error || (requestData ? "This QR code expired." : "Preparing a secure QR code…")}
        </p>
      )}
      {(error || secondsLeft === 0 && requestData) && (
        <Button type="button" variant="outline" className="w-full" onClick={() => setAttempt((value) => value + 1)}>
          Generate new QR code
        </Button>
      )}
    </div>
  );
}
