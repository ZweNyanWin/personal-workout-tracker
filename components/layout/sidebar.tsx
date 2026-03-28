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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

const MEMBER_NAV = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/workout",    label: "Workout",    icon: Dumbbell },
  { href: "/history",    label: "History",    icon: History },
  { href: "/analytics",  label: "Analytics",  icon: BarChart2 },
  { href: "/exercises",  label: "Exercises",  icon: BookOpen },
  { href: "/profile",    label: "Profile",    icon: User },
];

const ADMIN_NAV = [
  { href: "/admin",          label: "Admin Dashboard", icon: ShieldCheck },
  { href: "/admin/members",  label: "Members",         icon: Users },
  { href: "/admin/programs", label: "Programs",        icon: BookOpen },
  { href: "/admin/exercises",label: "Exercise Library",icon: Settings },
];

interface SidebarProps {
  profile: Profile;
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const isAdmin = profile.role === "admin";

  function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors tap-none",
          active
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.5 : 2} />
        {label}
      </Link>
    );
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
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
          <NavItem key={item.href} {...item} />
        ))}

        {isAdmin && (
          <>
            <div className="my-3 border-t border-border" />
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Admin
            </p>
            {ADMIN_NAV.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
