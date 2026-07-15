"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api";

export function NotificationBell() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);

  const load = () => {
    getUnreadNotificationCount().then((r) => setCount(r.count)).catch(() => {});
    getNotifications({ page: 1 }).then((r) => setItems(r.items.slice(0, 5))).catch(() => {});
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const handleClick = async (n: NotificationItem) => {
    if (!n.is_read) {
      await markNotificationRead(n.id).catch(() => {});
      setCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Уведомления"
        onClick={() => {
          setOpen((o) => !o);
          load();
        }}
        className="relative text-slate-500"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-medium text-slate-900">Уведомления</p>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Нет уведомлений</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${!n.is_read ? "bg-blue-50/50" : ""}`}
                  >
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.message}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 p-2">
            <Link
              href="/dashboard/notifications"
              className="block rounded-md px-3 py-2 text-center text-sm text-blue-600 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Все уведомления
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
