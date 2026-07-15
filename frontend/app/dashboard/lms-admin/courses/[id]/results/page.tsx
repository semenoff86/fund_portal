"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { LmsAdminGuard } from "@/components/lms-admin-guard";
import { AssignmentStatusBadge } from "@/components/lms/assignment-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { exportLmsReport, getLmsCourseResults } from "@/lib/api";

export default function CourseResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getLmsCourseResults>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLmsCourseResults(+id)
      .then(setRows)
      .catch(() => toast.error("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleExport = async () => {
    try {
      const blob = await exportLmsReport({ course_id: +id });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lms_report.csv";
      a.click();
    } catch {
      toast.error("Ошибка экспорта");
    }
  };

  const completed = rows.filter((r) => r.status === "COMPLETED").length;
  const overdue = rows.filter((r) => r.status === "EXPIRED").length;

  return (
    <LmsAdminGuard>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Результаты курса</h2>
          <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" />CSV</Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-semibold">{rows.length}</p><p className="text-xs text-slate-500">Назначено</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-semibold text-emerald-600">{completed}</p><p className="text-xs text-slate-500">Завершено</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-semibold text-amber-600">{rows.filter((r) => r.status === "IN_PROGRESS").length}</p><p className="text-xs text-slate-500">В процессе</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-semibold text-red-600">{overdue}</p><p className="text-xs text-slate-500">Просрочено</p></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">ФИО</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Статус</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Попытки</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Лучший балл</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Дедлайн</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={5} className="p-6"><Skeleton className="h-8" /></td></tr> :
                  rows.map((r) => (
                    <tr key={r.user_id} className="border-b hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium">{r.full_name}</td>
                      <td className="px-6 py-4"><AssignmentStatusBadge status={r.status} /></td>
                      <td className="px-6 py-4">{r.attempts_count}</td>
                      <td className="px-6 py-4">{r.best_score ?? "—"}%</td>
                      <td className="px-6 py-4">{r.deadline_date ? new Date(r.deadline_date).toLocaleDateString("ru-RU") : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </LmsAdminGuard>
  );
}
