"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";

export function AppToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      theme={theme}
      position="top-center"
      toastOptions={{
        classNames: {
          toast: "bg-card border-border text-foreground shadow-lg",
          error: "bg-destructive/10 border-destructive/30 text-foreground",
          success: "bg-success/10 border-success/30 text-foreground",
        },
      }}
    />
  );
}
