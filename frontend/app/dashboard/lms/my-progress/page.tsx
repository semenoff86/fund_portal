"use client";

import { useEffect, useState } from "react";
import { AssignmentStatusBadge } from "@/components/lms/assignment-status-badge";
import { DeadlineIndicator } from "@/components/lms/deadline-indicator";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyLmsProgress, type UserCourseItem } from "@/lib/api";

export default function MyProgressPage() {
  const [courses, setCourses] = useState<UserCourseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyLmsProgress()
      .then((p) => setCourses(p.courses))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Мой прогресс</h2>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-slate-600">Курс</th>
                <th className="px-6 py-3 text-left font-medium text-slate-600">Статус</th>
                <th className="px-6 py-3 text-left font-medium text-slate-600">Попытки</th>
                <th className="px-6 py-3 text-left font-medium text-slate-600">Лучший балл</th>
                <th className="px-6 py-3 text-left font-medium text-slate-600">Дедлайн</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="p-6"><Skeleton className="h-8" /></td></tr> :
                courses.map((c) => (
                  <tr key={c.course_id} className="border-b hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium">{c.title}</td>
                    <td className="px-6 py-4"><AssignmentStatusBadge status={c.status} /></td>
                    <td className="px-6 py-4">{c.attempts_count}</td>
                    <td className="px-6 py-4">{c.best_score ?? "—"}%</td>
                    <td className="px-6 py-4"><DeadlineIndicator deadline={c.deadline_date} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
