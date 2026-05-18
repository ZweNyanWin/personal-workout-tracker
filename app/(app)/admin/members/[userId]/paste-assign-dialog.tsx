"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardPaste } from "lucide-react";
import { importAndAssignProgramTemplate } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export function PasteAssignDialog({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [addStrengthSingles, setAddStrengthSingles] = useState(false);
  const [exposurePercent, setExposurePercent] = useState("82.5");
  const [assigning, startAssign] = useTransition();

  const placeholder = `4-Week Strength Block - Kaung
Focus: Heavy exposure singles + backdowns.

WEEK 1 (Intro) Day 1 - Upper A
1. Bench: 1x1 @ 110 kg (RPE 7). Backdowns: 3x4 @ 100 kg.
2. Weighted Pull-ups: 4x5 @ +40 lb
Day 2 - Lower A
1. High-Bar Squat: 1x1 @ 135 kg (RPE 7). Backdowns: 3x4 @ 120 kg.

WEEK 2 (Build)
* Upper A: Bench: 1x1 @ 112.5 kg | Bench Backdown: 4x4 @ 102.5 kg | Accessories: 1 RIR`;

  function handleAssign() {
    if (!rawText.trim()) {
      toast.error("Paste the formatted workout first");
      return;
    }

    const percent = exposurePercent ? parseFloat(exposurePercent) : 82.5;
    startAssign(async () => {
      const result = await importAndAssignProgramTemplate(userId, {
        title: title.trim() || undefined,
        rawText,
        addStrengthExposureSingles: addStrengthSingles,
        strengthExposurePercent: Number.isFinite(percent) ? percent : 82.5,
      });

      if (result.success) {
        toast.success("Program imported and assigned");
        setOpen(false);
        setTitle("");
        setRawText("");
        setAddStrengthSingles(false);
        setExposurePercent("82.5");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <ClipboardPaste className="h-4 w-4" />
          Paste & Assign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Paste & Assign Program</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Program Title</Label>
            <Input
              placeholder="Optional - inferred from pasted text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Formatted Workout *</Label>
            <Textarea
              placeholder={placeholder}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              rows={16}
              className="font-mono text-xs"
            />
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Auto-add strength exposure singles</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Optional. Use this only if the pasted plan does not already include singles.
                </p>
              </div>
              <Switch checked={addStrengthSingles} onCheckedChange={setAddStrengthSingles} />
            </div>
            {addStrengthSingles && (
              <div className="space-y-1.5">
                <Label>Single percent</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="1"
                  max="100"
                  value={exposurePercent}
                  onChange={(event) => setExposurePercent(event.target.value)}
                />
              </div>
            )}
          </div>

          <Button className="w-full" variant="brand" loading={assigning} onClick={handleAssign}>
            Import & Assign
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
