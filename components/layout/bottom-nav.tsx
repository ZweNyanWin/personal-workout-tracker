"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Dumbbell,
  BarChart2,
  History,
  User,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MEMBER_ITEMS = [
  { href: "/dashboard",  label: "Home",     icon: LayoutDashboard },
  { href: "/workout",    label: "Workout",  icon: Dumbbell },
  { href: "/history",    label: "History",  icon: History },
  { href: "/analytics",  label: "Stats",    icon: BarChart2 },
  { href: "/profile",    label: "Profile",  icon: User },
];

const ADMIN_ITEMS = [
  { href: "/dashboard",  label: "Home",     icon: LayoutDashboard },
  { href: "/workout",    label: "Workout",  icon: Dumbbell },
  { href: "/history",    label: "History",  icon: History },
  { href: "/admin",      label: "Admin",    icon: ShieldCheck },
  { href: "/profile",    label: "Profile",  icon: User },
];

interface BottomNavProps {
  isAdmin?: boolean;
}

export function BottomNav({ isAdmin }: BottomNavProps) {
  const pathname = usePathname();
  const NAV_ITEMS = isAdmin ? ADMIN_ITEMS : MEMBER_ITEMS;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm safe-bottom">
      <div className="flex h-16 items-center justify-around px-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 tap-none transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon
                className={cn("h-5 w-5 transition-transform", active && "scale-110")}
                strokeWidth={active ? 2.5 : 2}
              />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
