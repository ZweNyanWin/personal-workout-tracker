import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { OllamaLive } from "@/components/coach/ollama-live";

export const metadata: Metadata = { title: "Ollama Live", robots: { index: false, follow: false } };

export default function OllamaLivePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <OllamaLive />;
}
