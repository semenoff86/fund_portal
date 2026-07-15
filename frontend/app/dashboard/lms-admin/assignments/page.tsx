"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { History, Unlock } from "lucide-react";
import { LmsAdminGuard } from "@/components/lms-admin-guard";
import { AssignmentStatusBadge } from "@/components/lms/assignment-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  approveLmsUnblock,
  extendLmsAssignmentDeadline,
  getLmsAdminCourses,
  getLmsCourseAssignments,
  getLmsDeadlineLogs,
  type DeadlineExtensionLog,
  type LmsAssignment,
} from "@/lib/api";

function AssignmentsPageInner() {
  const searchParams = useSearchParams();
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [assignments, setAssignments] = useState<LmsAssignment[]>([]);
  const [loading, setLoading] = useState(false);

  const [extendTarget, setExtendTarget] = useState<LmsAssignment | null>(null);
  const [newDeadline, setNewDeadline] = useState("");
  const [extending, setExtending] = useState(false);

  const [historyTarget, setHistoryTarget] = useState<LmsAssignment | null>(null);
  const [logs, setLogs] = useState<DeadlineExtensionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    getLmsAdminCourses({ is_active: true }).then((c) => {
      setCourses(c);
      const fromQuery = searchParams.get("course");
      if (fromQuery && c.some((x) => String(x.id) === fromQuery)) {
        setCourseId(fromQuery);
      } else if (c.length) {
        setCourseId(String(c[0].id));
      }
    });
  }, [searchParams]);

  const loadAssignments = () => {
    if (!courseId) return;
    setLoading(true);
    getLmsCourseAssignments(+courseId)
      .then(setAssignments)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const highlightId = useMemo(() => {
    const raw = searchParams.get("assignment");
    return raw ? Number(raw) : null;
  }, [searchParams]);

  const openExtend = (a: LmsAssignment) => {
    setExtendTarget(a);
    if (a.deadline_date) {
      const d = new Date(a.deadline_date);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setNewDeadline(local);
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setNewDeadline(local);
    }
  };

  const handleExtend = async () => {
    if (!extendTarget || !newDeadline) return;
    setExtending(true);
    try {
      await extendLmsAssignmentDeadline(extendTarget.id, new Date(newDeadline).toISOString());
      toast.success("Дедлайн продлён, тест разблокирован при необходимости");
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

  const handleUnblock = async (a: LmsAssignment) => {
    try {
      await approveLmsUnblock(a.id);
      toast.success(`Разблокировано: ${a.full_name}`);
      loadAssignments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка разблокировки");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">Назначения</h2>
        <Select value={courseId} onValueChange={setCourseId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Курс" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-slate-600">Сотрудник</th>
                <th className="px-6 py-3 text-left font-medium text-slate-600">Статус</th>
                <th className="px-6 py-3 text-left font-medium text-slate-600">Дедлайн</th>
                <th className="px-6 py-3 text-left font-medium text-slate-600">Попытки</th>
                <th className="px-6 py-3 text-left font-medium text-slate-600">Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-6">
                    <Skeleton className="h-8" />
                  </td>
                </tr>
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Нет назначений
                  </td>
                </tr>
              ) : (
                assignments.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-b ${highlightId === a.id ? "bg-blue-50/60" : ""}`}
                  >
                    <td className="px-6 py-4">{a.full_name}</td>
                    <td className="px-6 py-4">
                      <AssignmentStatusBadge status={a.status} />
                    </td>
                    <td className="px-6 py-4">
                      {a.deadline_date
                        ? new Date(a.deadline_date).toLocaleString("ru-RU")
                        : "—"}
                    </td>
                    <td className="px-6 py-4">{a.attempts_count}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => openExtend(a)}>
                          Продлить
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openHistory(a)}>
                          <History className="mr-1 h-3.5 w-3.5" />
                          История
                        </Button>
                        {a.status === "EXPIRED" && (
                          <Button size="sm" onClick={() => handleUnblock(a)}>
                            <Unlock className="mr-1 h-3.5 w-3.5" />
                            Разблокировать
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!extendTarget} onOpenChange={(o) => !o && setExtendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Продлить дедлайн</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            {extendTarget?.full_name}
            {extendTarget?.status === "EXPIRED"
              ? " — после продления тест будет разблокирован"
              : ""}
          </p>
          <div className="space-y-2">
            <Label htmlFor="new-deadline">Новый дедлайн</Label>
            <Input
              id="new-deadline"
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>История дедлайнов — {historyTarget?.full_name}</DialogTitle>
          </DialogHeader>
          {logsLoading ? (
            <Skeleton className="h-24" />
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500">Изменений дедлайна пока нет</p>
          ) : (
            <ul className="max-h-72 space-y-3 overflow-y-auto text-sm">
              {logs.map((log) => (
                <li key={log.id} className="rounded-md border border-slate-100 p-3">
                  <p className="font-medium text-slate-900">
                    {log.old_deadline
                      ? new Date(log.old_deadline).toLocaleString("ru-RU")
                      : "—"}{" "}
                    → {new Date(log.new_deadline).toLocaleString("ru-RU")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {log.changed_by_name || "—"} ·{" "}
                    {new Date(log.changed_at).toLocaleString("ru-RU")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AssignmentsPage() {
  return (
    <LmsAdminGuard>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <AssignmentsPageInner />
      </Suspense>
    </LmsAdminGuard>
  );
}
