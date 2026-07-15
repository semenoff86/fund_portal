"use client";

import { useEffect, useState } from "react";
import { LmsAdminGuard } from "@/components/lms-admin-guard";
import { AssignmentStatusBadge } from "@/components/lms/assignment-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getLmsAdminCourses, getLmsCourseAssignments, type LmsAssignment } from "@/lib/api";

export default function AssignmentsPage() {
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [assignments, setAssignments] = useState<LmsAssignment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLmsAdminCourses({ is_active: true }).then((c) => {
      setCourses(c);
      if (c.length) setCourseId(String(c[0].id));
    });
  }, []);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    getLmsCourseAssignments(+courseId)
      .then(setAssignments)
      .finally(() => setLoading(false));
  }, [courseId]);

  return (
    <LmsAdminGuard>
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Назначения</h2>
        <Select value={courseId} onValueChange={setCourseId}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Курс" /></SelectTrigger>
          <SelectContent>
            {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Сотрудник</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Статус</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Дедлайн</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Попытки</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={4} className="p-6"><Skeleton className="h-8" /></td></tr> :
                  assignments.map((a) => (
                    <tr key={a.id} className="border-b">
                      <td className="px-6 py-4">{a.full_name}</td>
                      <td className="px-6 py-4"><AssignmentStatusBadge status={a.status} /></td>
                      <td className="px-6 py-4">{a.deadline_date ? new Date(a.deadline_date).toLocaleDateString("ru-RU") : "—"}</td>
                      <td className="px-6 py-4">{a.attempts_count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        {/* TODO: Phase 3 — extend deadline, reassign actions */}
      </div>
    </LmsAdminGuard>
  );
}
