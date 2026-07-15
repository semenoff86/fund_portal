"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  approveLmsUnblock,
  getNotifications,
  getProfile,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api";

function parseAssignmentId(link: string | null): number | null {
  if (!link) return null;
  const match = link.match(/assignment=(\d+)/);
  return match ? Number(match[1]) : null;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [canUnblock, setCanUnblock] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    getNotifications({ page: 1 })
      .then((r) => setItems(r.items))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    getProfile()
      .then((p) => setCanUnblock(p.role === "admin" || p.role === "hr"))
      .catch(() => setCanUnblock(false));
  }, []);

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

  const handleApproveUnblock = async (n: NotificationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const assignmentId = parseAssignmentId(n.link);
    if (!assignmentId) {
      toast.error("Не удалось определить назначение");
      return;
    }
    setBusyId(n.id);
    try {
      await approveLmsUnblock(assignmentId);
      toast.success("Тест разблокирован");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка разблокировки");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Уведомления</h2>
        <Button variant="outline" size="sm" onClick={handleReadAll}>
          Прочитать все
        </Button>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {items.length === 0 ? (
            <p className="p-8 text-center text-slate-500">Нет уведомлений</p>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={`flex w-full items-start gap-3 px-6 py-4 text-left hover:bg-slate-50 ${
                  !n.is_read ? "bg-blue-50/40" : ""
                }`}
              >
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => handleRead(n)}>
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
                {canUnblock && n.type === "UNBLOCK_REQUEST" && !n.is_read && (
                  <Button
                    size="sm"
                    className="shrink-0"
                    disabled={busyId === n.id}
                    onClick={(e) => handleApproveUnblock(n, e)}
                  >
                    <Unlock className="mr-1 h-3.5 w-3.5" />
                    {busyId === n.id ? "…" : "Разблокировать"}
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
