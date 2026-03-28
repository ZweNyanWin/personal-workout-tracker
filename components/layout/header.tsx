"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/types";

interface HeaderProps {
  profile: Profile;
  title?: string;
}

export function Header({ profile, title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 backdrop-blur-sm px-4 md:px-6">
      {/* Title */}
      <div className="flex-1 min-w-0">
        {title && (
          <h1 className="text-base font-semibold truncate">{title}</h1>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {profile.role === "admin" && (
          <Link href="/admin">
            <Button variant="ghost" size="icon-sm">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </Button>
          </Link>
        )}

        <Avatar className="h-8 w-8 cursor-pointer">
          <AvatarFallback className="text-xs bg-primary/20 text-primary">
            {getInitials(profile.full_name)}
          </AvatarFallback>
        </Avatar>

        <form action={logout}>
          <Button variant="ghost" size="icon-sm" type="submit" title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
