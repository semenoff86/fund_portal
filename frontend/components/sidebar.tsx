"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  Shield,
  User,
  Wrench,
} from "lucide-react";
import { getProfile } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard/knowledge", label: "База знаний", icon: BookOpen },
  { href: "/dashboard/lms", label: "Учебный портал", icon: GraduationCap },
  { href: "/dashboard/servicedesk", label: "Сервис-деск", icon: Wrench },
  { href: "/dashboard/ai-chat", label: "AI-ассистент", icon: Bot },
  { href: "/dashboard/profile", label: "Личный кабинет", icon: User },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLmsAdmin, setIsLmsAdmin] = useState(false);

  useEffect(() => {
    getProfile()
      .then((profile) => {
        setIsAdmin(profile.role === "admin");
        setIsLmsAdmin(profile.role === "admin" || profile.role === "hr");
      })
      .catch(() => {
        setIsAdmin(false);
        setIsLmsAdmin(false);
      });
  }, []);

  const items = [
    ...navItems,
    ...(isAdmin
      ? [
          { href: "/dashboard/admin", label: "Администрирование", icon: Shield },
          { href: "/dashboard/admin/audit", label: "Журнал действий", icon: ClipboardList },
        ]
      : []),
    ...(isLmsAdmin ? [{ href: "/dashboard/lms-admin", label: "LMS Admin", icon: GraduationCap }] : []),
  ];

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-slate-200 bg-white transition-all duration-200",
        collapsed ? "w-16" : "w-64",
      )}
      aria-label="Основная навигация"
    >
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
        {!collapsed && (
          <div className="animate-fade-in">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">МКК</p>
            <p className="text-sm font-semibold text-slate-900">Корпоративный портал</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          className="shrink-0"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const isActive =
            item.href === "/dashboard/admin"
              ? pathname === "/dashboard/admin"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-blue-50 text-blue-600"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                collapsed && "justify-center px-2",
              )}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
