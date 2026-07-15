"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { AdminGuard } from "@/components/admin-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAdminUsers,
  getAuditLogs,
  type AdminUser,
  type AuditLogEntry,
} from "@/lib/api";

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Вход",
  "auth.login_failed": "Неудачный вход",
  "auth.logout": "Выход",
  "user.create": "Создание пользователя",
  "user.toggle_active": "Блокировка/разблокировка",
  "user.delete": "Удаление пользователя",
  "template.upload": "Загрузка шаблона",
  "template.delete": "Удаление шаблона",
  "knowledge.create": "Создание документа БЗ",
  "knowledge.update": "Изменение документа БЗ",
  "knowledge.delete": "Удаление документа БЗ",
  "course.create": "Создание курса",
  "course.update": "Изменение курса",
  "course.delete": "Удаление курса",
  "quiz.create": "Создание теста",
  "quiz.update": "Изменение теста",
  "quiz.delete": "Удаление теста",
  "course.assign": "Назначение курса",
  "course.assign_bulk": "Массовое назначение",
  "assignment.extend_deadline": "Продление дедлайна",
  "notification.send_deadline_warnings": "Предупреждения о дедлайне",
};

const OBJECT_TYPE_LABELS: Record<string, string> = {
  user: "Пользователь",
  template: "Шаблон",
  knowledge: "Документ БЗ",
  course: "Курс",
  quiz: "Тест",
  assignment: "Назначение",
  notification: "Уведомление",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toStartOfDayIso(dateStr: string) {
  if (!dateStr) return undefined;
  return new Date(`${dateStr}T00:00:00`).toISOString();
}

function toEndOfDayIso(dateStr: string) {
  if (!dateStr) return undefined;
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

export default function AuditLogPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [retentionMonths, setRetentionMonths] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    getAdminUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAuditLogs({
        user_id: userId !== "all" ? Number(userId) : undefined,
        action: action !== "all" ? action : undefined,
        date_from: toStartOfDayIso(dateFrom),
        date_to: toEndOfDayIso(dateTo),
        page,
        page_size: pageSize,
      });
      setItems(data.items);
      setTotal(data.total);
      setRetentionMonths(data.retention_months);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [userId, action, dateFrom, dateTo, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const applyFilters = () => {
    setPage(1);
    // load runs via effect when page resets; if already page 1, force reload
    if (page === 1) {
      void load();
    }
  };

  return (
    <AdminGuard>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <ClipboardList className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Журнал действий</h2>
              <p className="mt-1 text-sm text-slate-500">
                Операции администраторов и события входа
                {retentionMonths != null && retentionMonths > 0
                  ? ` · хранение ${retentionMonths} мес.`
                  : ""}
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href="/dashboard/admin">К панели администратора</Link>
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Фильтры</CardTitle>
            <CardDescription>Пользователь, тип действия и период</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Пользователь</Label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Все" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.full_name} ({u.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Тип действия</Label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger>
                    <SelectValue placeholder="Все" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    {Object.entries(ACTION_LABELS).map(([code, label]) => (
                      <SelectItem key={code} value={code}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date-from">С</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date-to">По</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={applyFilters}>Применить</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setUserId("all");
                  setAction("all");
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
              >
                Сбросить
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Записи
              <span className="ml-2 text-sm font-normal text-slate-500">({total})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Записей не найдено</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-2 pr-3 font-medium">Когда</th>
                      <th className="pb-2 pr-3 font-medium">Кто</th>
                      <th className="pb-2 pr-3 font-medium">Действие</th>
                      <th className="pb-2 pr-3 font-medium">Объект</th>
                      <th className="pb-2 pr-3 font-medium">Результат</th>
                      <th className="pb-2 font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="py-2.5 pr-3 whitespace-nowrap text-slate-600">
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="py-2.5 pr-3">
                          {row.username || "—"}
                        </td>
                        <td className="py-2.5 pr-3">
                          {ACTION_LABELS[row.action] || row.action}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600">
                          {row.object_type
                            ? `${OBJECT_TYPE_LABELS[row.object_type] || row.object_type}${
                                row.object_id ? ` #${row.object_id}` : ""
                              }`
                            : "—"}
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge variant={row.success ? "success" : "destructive"}>
                            {row.success ? "Успех" : "Ошибка"}
                          </Badge>
                        </td>
                        <td className="py-2.5 font-mono text-xs text-slate-500">
                          {row.ip_address || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Страница {page} из {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Назад
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Вперёд
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
