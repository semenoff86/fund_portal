"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { History } from "lucide-react";
import { LmsAdminGuard } from "@/components/lms-admin-guard";
import { AssignmentStatusBadge } from "@/components/lms/assignment-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  assignLmsCourse,
  extendLmsAssignmentDeadline,
  getAdminUsers,
  getLmsAdminCourse,
  getLmsCourseAssignments,
  getLmsDeadlineLogs,
  type AdminUser,
  type DeadlineExtensionLog,
  type LmsAssignment,
} from "@/lib/api";

export default function AssignCoursePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [deadlineDays, setDeadlineDays] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [assignments, setAssignments] = useState<LmsAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);

  const [extendTarget, setExtendTarget] = useState<LmsAssignment | null>(null);
  const [newDeadline, setNewDeadline] = useState("");
  const [extending, setExtending] = useState(false);

  const [historyTarget, setHistoryTarget] = useState<LmsAssignment | null>(null);
  const [logs, setLogs] = useState<DeadlineExtensionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadAssignments = useCallback(() => {
    setAssignmentsLoading(true);
    getLmsCourseAssignments(+id)
      .then(setAssignments)
      .catch(() => setAssignments([]))
      .finally(() => setAssignmentsLoading(false));
  }, [id]);

  useEffect(() => {
    getAdminUsers().then(setUsers).catch(() => toast.error("Ошибка загрузки пользователей"));
    getLmsAdminCourse(+id).then((c) => {
      setCourseTitle(c.title);
      setDeadlineDays(c.deadline_days);
    });
    loadAssignments();
  }, [id, loadAssignments]);

  const filtered = users.filter(
    (u) =>
      u.is_active &&
      (u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        (u.department || "").toLowerCase().includes(search.toLowerCase())),
  );

  const toggle = (userId: number) => {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId],
    );
  };

  const selectAllFiltered = () => {
    const ids = filtered.map((u) => u.id);
    setSelected((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearSelection = () => setSelected([]);

  const handleAssign = async () => {
    if (!selected.length) {
      toast.error("Выберите сотрудников");
      return;
    }
    setSubmitting(true);
    try {
      await assignLmsCourse(+id, selected);
      toast.success(`Назначено: ${selected.length} сотрудникам`);
      setSelected([]);
      loadAssignments();
      router.push(`/dashboard/lms-admin/courses/${id}/results`);
    } catch {
      toast.error("Ошибка назначения");
    } finally {
      setSubmitting(false);
    }
  };

  const openExtend = (a: LmsAssignment) => {
    setExtendTarget(a);
    const base = a.deadline_date ? new Date(a.deadline_date) : new Date();
    if (!a.deadline_date) base.setDate(base.getDate() + 7);
    const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setNewDeadline(local);
  };

  const handleExtend = async () => {
    if (!extendTarget || !newDeadline) return;
    setExtending(true);
    try {
      await extendLmsAssignmentDeadline(extendTarget.id, new Date(newDeadline).toISOString());
      toast.success("Дедлайн продлён");
      setExtendTarget(null);
      loadAssignments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка продления");
    } finally {
      setExtending(false);
    }
  };

  const openHistory = async (a: LmsAssignment) => {
    setHistoryTarget(a);
    setLogsLoading(true);
    try {
      setLogs(await getLmsDeadlineLogs(a.id));
    } catch {
      setLogs([]);
      toast.error("Не удалось загрузить историю");
    } finally {
      setLogsLoading(false);
    }
  };

  return (
    <LmsAdminGuard>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Назначить курс: {courseTitle}</h2>
            {deadlineDays && (
              <p className="mt-1 text-sm text-slate-500">
                Дедлайн: {deadlineDays} дней с момента назначения
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/dashboard/lms-admin/assignments?course=${id}`}>Все назначения</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/lms-admin/assign-bulk">Массовое назначение</Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Выбор сотрудников ({selected.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Поиск по ФИО, логину, отделу…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered}>
                Выбрать найденных
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                Сбросить
              </Button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {filtered.map((u) => (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-100 p-3 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(u.id)}
                    onChange={() => toggle(u.id)}
                  />
                  <div>
                    <p className="text-sm font-medium">{u.full_name}</p>
                    <p className="text-xs text-slate-500">
                      {u.username} · {u.department || "—"}
                    </p>
                  </div>
                </label>
              ))}
              {filtered.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-500">Никого не найдено</p>
              )}
            </div>
            <Button onClick={handleAssign} disabled={submitting || selected.length === 0}>
              {submitting ? "Назначение…" : `Назначить выбранным (${selected.length})`}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Текущие назначения</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {assignmentsLoading ? (
              <div className="space-y-2 p-6">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : assignments.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">Пока нет назначений</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Сотрудник</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Статус</th>
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Дедлайн</th>
                      <th className="px-4 py-2 text-right font-medium text-slate-600">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id} className="border-b border-slate-100">
                        <td className="px-4 py-3 font-medium text-slate-900">{a.full_name}</td>
                        <td className="px-4 py-3">
                          <AssignmentStatusBadge status={a.status} />
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {a.deadline_date
                            ? new Date(a.deadline_date).toLocaleString("ru-RU")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openExtend(a)}>
                              Продлить
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openHistory(a)}>
                              <History className="mr-1 h-3.5 w-3.5" />
                              История
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!extendTarget} onOpenChange={(o) => !o && setExtendTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Продлить дедлайн</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-500">
              {extendTarget?.full_name} — статус станет «В процессе», тест разблокируется.
            </p>
            <div className="space-y-2">
              <Label htmlFor="deadline">Новый дедлайн</Label>
              <Input
                id="deadline"
                type="datetime-local"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExtendTarget(null)}>
                Отмена
              </Button>
              <Button onClick={handleExtend} disabled={extending || !newDeadline}>
                {extending ? "Сохранение…" : "Сохранить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!historyTarget} onOpenChange={(o) => !o && setHistoryTarget(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>История продлений</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-500">{historyTarget?.full_name}</p>
            {logsLoading ? (
              <Skeleton className="h-24" />
            ) : logs.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Записей пока нет</p>
            ) : (
              <ul className="max-h-80 space-y-3 overflow-y-auto">
                {logs.map((log) => (
                  <li key={log.id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <p className="font-medium text-slate-800">
                      → {new Date(log.new_deadline).toLocaleString("ru-RU")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Было:{" "}
                      {log.old_deadline
                        ? new Date(log.old_deadline).toLocaleString("ru-RU")
                        : "—"}
                      {" · "}
                      {log.changed_by_name || "—"}
                      {" · "}
                      {new Date(log.changed_at).toLocaleString("ru-RU")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </LmsAdminGuard>
  );
}
