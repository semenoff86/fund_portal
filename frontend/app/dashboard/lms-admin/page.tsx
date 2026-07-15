"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BarChart3, BookOpen, Plus, Send, Users } from "lucide-react";
import { LmsAdminGuard } from "@/components/lms-admin-guard";
import { AssignmentStatusBadge } from "@/components/lms/assignment-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getLmsOverview, sendLmsDeadlineWarnings, type LmsOverview } from "@/lib/api";

export default function LmsAdminDashboard() {
  const [stats, setStats] = useState<LmsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLmsOverview()
      .then(setStats)
      .catch(() => toast.error("Не удалось загрузить статистику"))
      .finally(() => setLoading(false));
  }, []);

  const handleWarnings = async () => {
    try {
      const r = await sendLmsDeadlineWarnings();
      toast.success(`Отправлено напоминаний: ${r.warnings_sent}`);
    } catch {
      toast.error("Ошибка отправки");
    }
  };

  return (
    <LmsAdminGuard>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">LMS — Администрирование</h2>
            <p className="mt-1 text-sm text-slate-500">Управление курсами, назначениями и аналитикой</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleWarnings}>
              <Send className="mr-2 h-4 w-4" />
              Напоминания о дедлайнах
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/lms-admin/assign-bulk">
                <Users className="mr-2 h-4 w-4" />
                Массовое назначение
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/lms-admin/courses/create">
                <Plus className="mr-2 h-4 w-4" />
                Создать курс
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
            : [
                { label: "Всего курсов", value: stats?.total_courses, icon: BookOpen },
                { label: "Завершение", value: `${stats?.completion_rate ?? 0}%`, icon: BarChart3 },
                { label: "Просрочено", value: stats?.overdue_courses_count, icon: Users },
                { label: "Средний балл", value: stats?.avg_score ?? "—", icon: BarChart3 },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                      <s.icon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-slate-900">{s.value}</p>
                      <p className="text-xs text-slate-500">{s.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Последние назначения</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Сотрудник</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Статус</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Дедлайн</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recent_assignments.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="px-6 py-3">{a.full_name}</td>
                    <td className="px-6 py-3"><AssignmentStatusBadge status={a.status} /></td>
                    <td className="px-6 py-3 text-slate-500">
                      {a.deadline_date ? new Date(a.deadline_date).toLocaleDateString("ru-RU") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" asChild><Link href="/dashboard/lms-admin/courses">Все курсы</Link></Button>
          <Button variant="outline" asChild><Link href="/dashboard/lms-admin/assignments">Назначения</Link></Button>
          <Button variant="outline" asChild><Link href="/dashboard/lms-admin/analytics">Аналитика</Link></Button>
        </div>
      </div>
    </LmsAdminGuard>
  );
}
