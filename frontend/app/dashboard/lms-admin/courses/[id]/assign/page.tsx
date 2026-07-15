"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { LmsAdminGuard } from "@/components/lms-admin-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { assignLmsCourse, getAdminUsers, getLmsAdminCourse, type AdminUser } from "@/lib/api";

export default function AssignCoursePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [deadlineDays, setDeadlineDays] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getAdminUsers().then(setUsers).catch(() => toast.error("Ошибка загрузки пользователей"));
    getLmsAdminCourse(+id).then((c) => {
      setCourseTitle(c.title);
      setDeadlineDays(c.deadline_days);
    });
  }, [id]);

  const filtered = users.filter(
    (u) =>
      u.is_active &&
      (u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        u.username.toLowerCase().includes(search.toLowerCase())),
  );

  const toggle = (userId: number) => {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId],
    );
  };

  const handleAssign = async () => {
    if (!selected.length) {
      toast.error("Выберите сотрудников");
      return;
    }
    setSubmitting(true);
    try {
      await assignLmsCourse(+id, selected);
      toast.success(`Назначено: ${selected.length} сотрудникам`);
      router.push(`/dashboard/lms-admin/courses/${id}/results`);
    } catch {
      toast.error("Ошибка назначения");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LmsAdminGuard>
      <div className="mx-auto max-w-2xl space-y-6">
        <h2 className="text-2xl font-semibold">Назначить курс: {courseTitle}</h2>
        {deadlineDays && (
          <p className="text-sm text-slate-500">
            Дедлайн будет рассчитан автоматически: {deadlineDays} дней с момента назначения
          </p>
        )}
        <Card>
          <CardHeader><CardTitle className="text-base">Выбор сотрудников ({selected.length})</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {filtered.map((u) => (
                <label key={u.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-100 p-3 hover:bg-slate-50">
                  <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
                  <div>
                    <p className="text-sm font-medium">{u.full_name}</p>
                    <p className="text-xs text-slate-500">{u.username} · {u.department}</p>
                  </div>
                </label>
              ))}
            </div>
            <Button onClick={handleAssign} disabled={submitting}>
              {submitting ? "Назначение…" : "Назначить"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </LmsAdminGuard>
  );
}
