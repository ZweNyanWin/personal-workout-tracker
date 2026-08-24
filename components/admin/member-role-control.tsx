"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { updateMemberRole } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type MemberRole = "admin" | "member";

export function MemberRoleControl({
  memberId,
  currentRole,
  isCurrentUser,
}: {
  memberId: string;
  currentRole: MemberRole;
  isCurrentUser: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState<MemberRole>(currentRole);
  const [saving, startSaving] = useTransition();

  function handleSave() {
    startSaving(async () => {
      const result = await updateMemberRole(memberId, role);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Member role updated");
      router.refresh();
    });
  }

  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="member-role">Account role</Label>
        <select
          id="member-role"
          value={role}
          onChange={(event) => setRole(event.target.value as MemberRole)}
          disabled={isCurrentUser || saving}
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        loading={saving}
        disabled={isCurrentUser || role === currentRole}
        onClick={handleSave}
      >
        <ShieldCheck className="h-4 w-4" />
        Save role
      </Button>
    </div>
  );
}
