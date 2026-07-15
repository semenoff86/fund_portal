"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api";

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);

  const load = () => {
    getNotifications({ page: 1 }).then((r) => setItems(r.items)).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleRead = async (n: NotificationItem) => {
    if (!n.is_read) await markNotificationRead(n.id);
    if (n.link) router.push(n.link);
    load();
  };

  const handleReadAll = async () => {
    await markAllNotificationsRead();
    toast.success("Все уведомления прочитаны");
    load();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Уведомления</h2>
        <Button variant="outline" size="sm" onClick={handleReadAll}>Прочитать все</Button>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {items.length === 0 ? (
            <p className="p-8 text-center text-slate-500">Нет уведомлений</p>
          ) : items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleRead(n)}
              className={`w-full px-6 py-4 text-left hover:bg-slate-50 ${!n.is_read ? "bg-blue-50/40" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900">{n.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{n.message}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {new Date(n.created_at).toLocaleString("ru-RU")}
                </span>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
