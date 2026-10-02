"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Dumbbell,
  BarChart2,
  History,
  User,
  BookOpen,
  Users,
  Settings,
  ShieldCheck,
  Calculator,
  Sparkles,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { Profile } from "@/types";

const MEMBER_NAV = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/workout",    label: "Workout",    icon: Dumbbell },
  { href: "/coach",      label: "AI Coach",   icon: Sparkles },
  { href: "/history",    label: "History",    icon: History },
  { href: "/analytics",  label: "Analytics",  icon: BarChart2 },
  { href: "/1rm",        label: "1RM",        icon: Calculator },
  { href: "/exercises",         label: "Exercises",        icon: BookOpen },
  { href: "/plate-calculator",  label: "Plate Calculator",  icon: Calculator },
  { href: "/profile",           label: "Profile",           icon: User },
];

const ADMIN_NAV = [
  { href: "/admin",          label: "Coach Workspace", icon: ShieldCheck },
  { href: "/admin/members",  label: "Clients & Team",  icon: Users },
  { href: "/admin/programs", label: "Programs",        icon: BookOpen },
  { href: "/admin/exercises",label: "Exercise Library",icon: Settings },
  { href: "/admin/business", label: "My Business",    icon: Building2 },
];

interface SidebarProps {
  profile: Profile;
  previewMode?: boolean;
  isCoach?: boolean;
  isPlatformOwner?: boolean;
}

function SidebarNavItem({ href, label, icon: Icon, pathname, previewMode }: { href: string; label: string; icon: React.ElementType; pathname: string; previewMode: boolean }) {
    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
    return (
      <Link
        href={previewMode && href === "/coach" ? "/preview/coach" : href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors tap-none",
          active
            ? "bg-primary/18 text-primary shadow-[inset_3px_0_0_var(--color-primary)]"
            : "text-muted-foreground hover:bg-accent/80 hover:text-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.5 : 2} />
        {label}
      </Link>
    );
}

export function Sidebar({ profile, previewMode = false, isCoach, isPlatformOwner = false }: SidebarProps) {
  const currentPath = usePathname();
  const pathname = previewMode ? "/coach" : currentPath;
  const isAdmin = isCoach ?? profile.role === "admin";

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-card/95 shadow-xl shadow-black/5 dark:shadow-black/20">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/25">
          <Dumbbell className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-bold">PowerBuild</p>
          <p className="text-[10px] text-muted-foreground">{profile.full_name ?? profile.email}</p>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {MEMBER_NAV.map((item) => (
          <SidebarNavItem key={item.href} {...item} pathname={pathname} previewMode={previewMode} />
        ))}

        {isAdmin && (
          <>
            <div className="my-3 border-t border-border" />
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Coaching
            </p>
            {ADMIN_NAV.map((item) => (
              <SidebarNavItem key={item.href} {...item} pathname={pathname} previewMode={previewMode} />
            ))}
          </>
        )}
        {isPlatformOwner && (
          <>
            <div className="my-3 border-t border-border" />
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">PowerBuild owner</p>
            <SidebarNavItem href="/platform" label="Coach Businesses" icon={Building2} pathname={pathname} previewMode={previewMode} />
          </>
        )}
      </nav>

      <div className="flex items-center justify-between border-t border-border p-3">
        <Link
          href="/profile"
          className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span className="block truncate">Account settings</span>
        </Link>
        <ThemeToggle />
      </div>
    </aside>
  );
}
