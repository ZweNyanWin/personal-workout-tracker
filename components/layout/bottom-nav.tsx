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
  Calculator,
  BookOpen,
  MoreHorizontal,
  Moon,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BASE_ITEMS = [
  { href: "/dashboard",         label: "Home",    icon: LayoutDashboard },
  { href: "/workout",           label: "Workout", icon: Dumbbell },
  { href: "/history",           label: "History", icon: History },
];

const MORE_ROUTES = ["/exercises", "/plate-calculator", "/profile"];

interface BottomNavProps {
  isAdmin?: boolean;
}

export function BottomNav({ isAdmin }: BottomNavProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const primaryExtra = isAdmin
    ? { href: "/admin", label: "Admin", icon: ShieldCheck }
    : { href: "/analytics", label: "Stats", icon: BarChart2 };
  const navItems = [...BASE_ITEMS, primaryExtra];
  const moreRoutes = isAdmin ? ["/analytics", ...MORE_ROUTES] : MORE_ROUTES;
  const moreActive = moreRoutes.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`)
  );

  const moreItems = [
    ...(isAdmin
      ? [{ href: "/analytics", label: "Analytics", icon: BarChart2 }]
      : []),
    { href: "/exercises", label: "Exercise library", icon: BookOpen },
    { href: "/plate-calculator", label: "Plate calculator", icon: Calculator },
    { href: "/profile", label: "Profile", icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md safe-bottom shadow-xl shadow-black/10 dark:shadow-black/30">
      <div className="flex h-16 items-center justify-around px-1">
        {navItems.map(({ href, label, icon: Icon }) => {
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-2 tap-none transition-colors",
                moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Open more navigation"
            >
              <MoreHorizontal className={cn("h-5 w-5", moreActive && "scale-110")} />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="mb-2">
            <DropdownMenuLabel>More</DropdownMenuLabel>
            {moreItems.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={href}>
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={toggleTheme}>
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              Switch to {theme === "dark" ? "light" : "dark"} mode
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
