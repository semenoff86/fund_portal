"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { LmsAdminGuard } from "@/components/lms-admin-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteLmsCourse, getLmsAdminCourses, type LmsCourseListItem } from "@/lib/api";

const CATEGORIES: Record<string, string> = {
  all: "Все",
  SAFETY: "Безопасность",
  CREDIT: "Кредитование",
  HR: "HR",
  GENERAL: "Общие",
  COMPLIANCE: "Комплаенс",
};

export default function LmsCoursesPage() {
  const [courses, setCourses] = useState<LmsCourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");

  const load = useCallback(() => {
    setLoading(true);
    getLmsAdminCourses({
      search: search || undefined,
      category: category !== "all" ? category : undefined,
      is_active: status === "all" ? undefined : status === "active",
    })
      .then(setCourses)
      .catch(() => toast.error("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [search, category, status]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Архивировать курс «${title}»?`)) return;
    try {
      await deleteLmsCourse(id);
      toast.success("Курс архивирован");
      load();
    } catch {
      toast.error("Ошибка");
    }
  };

  return (
    <LmsAdminGuard>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold text-slate-900">Курсы</h2>
          <Button asChild><Link href="/dashboard/lms-admin/courses/create"><Plus className="mr-2 h-4 w-4" />Создать курс</Link></Button>
        </div>

        <Card>
          <CardContent className="flex flex-wrap gap-3 p-4">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="active">Активные</SelectItem>
                <SelectItem value="archived">Архив</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Название</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Категория</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Обязательный</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Дедлайн</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Проходной</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Статус</th>
                  <th className="px-6 py-3 text-right font-medium text-slate-600">Действия</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="p-6"><Skeleton className="h-8" /></td></tr>
                ) : courses.length === 0 ? (
                  <tr><td colSpan={7} className="p-12 text-center text-slate-500">Курсы не найдены</td></tr>
                ) : courses.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium">{c.title}</td>
                    <td className="px-6 py-4">{c.category ? CATEGORIES[c.category] : "—"}</td>
                    <td className="px-6 py-4">{c.is_mandatory ? <Badge>Да</Badge> : "—"}</td>
                    <td className="px-6 py-4">{c.deadline_days ? `${c.deadline_days} дн.` : "—"}</td>
                    <td className="px-6 py-4">{c.passing_score}%</td>
                    <td className="px-6 py-4"><Badge variant={c.is_active ? "success" : "secondary"}>{c.is_active ? "Активен" : "Архив"}</Badge></td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" asChild><Link href={`/dashboard/lms-admin/courses/${c.id}/edit`}>Изменить</Link></Button>
                        <Button variant="outline" size="sm" asChild><Link href={`/dashboard/lms-admin/courses/${c.id}/assign`}>Назначить</Link></Button>
                        <Button variant="outline" size="sm" asChild><Link href={`/dashboard/lms-admin/courses/${c.id}/results`}>Результаты</Link></Button>
                        <Button variant="outline" size="sm" className="text-red-600" onClick={() => handleDelete(c.id, c.title)}>Архив</Button>
                      </div>
                    </td>
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
