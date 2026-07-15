"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getProfile, getAvatarUrl, logout, type UserProfile } from "@/lib/api";

export function Topbar() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    getProfile()
      .then(setUser)
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const initials = user?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Добро пожаловать</h1>
        <p className="text-sm text-slate-500">Внутренний портал сотрудников МКК</p>
      </div>

      <div className="flex items-center gap-4">
        <NotificationBell />
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={getAvatarUrl(user?.avatar_url ?? null) ?? undefined} alt={user?.full_name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-slate-900">{user?.full_name || "Загрузка..."}</p>
            <p className="text-xs text-slate-500">{user?.department || user?.role}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          aria-label="Выйти"
          className="text-slate-500 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
