"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LmsAdminGuard } from "@/components/lms-admin-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  bulkAssignLmsCourses,
  getAdminUsers,
  getLmsAdminCourses,
  type AdminUser,
  type LmsCourseListItem,
} from "@/lib/api";

export default function BulkAssignPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [courses, setCourses] = useState<LmsCourseListItem[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<number[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getAdminUsers().then(setUsers).catch(() => toast.error("Ошибка загрузки пользователей"));
    getLmsAdminCourses({ is_active: true })
      .then(setCourses)
      .catch(() => toast.error("Ошибка загрузки курсов"));
  }, []);

  const filteredUsers = users.filter(
    (u) =>
      u.is_active &&
      (u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.username.toLowerCase().includes(userSearch.toLowerCase())),
  );

  const filteredCourses = courses.filter((c) =>
    c.title.toLowerCase().includes(courseSearch.toLowerCase()),
  );

  const toggleUser = (id: number) => {
    setSelectedUsers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleCourse = (id: number) => {
    setSelectedCourses((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleAssign = async () => {
    if (!selectedUsers.length || !selectedCourses.length) {
      toast.error("Выберите курсы и сотрудников");
      return;
    }
    setSubmitting(true);
    try {
      const result = await bulkAssignLmsCourses(selectedCourses, selectedUsers);
      toast.success(`Создано назначений: ${result.assigned_count}`);
      router.push("/dashboard/lms-admin/assignments");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка массового назначения");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LmsAdminGuard>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Массовое назначение</h2>
          <p className="mt-1 text-sm text-slate-500">
            Несколько курсов × несколько сотрудников
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Курсы ({selectedCourses.length})</CardTitle>
              <CardDescription>Поиск и мультивыбор</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Поиск курса…"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
              />
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {filteredCourses.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-100 p-3 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCourses.includes(c.id)}
                      onChange={() => toggleCourse(c.id)}
                    />
                    <span className="text-sm font-medium">{c.title}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Сотрудники ({selectedUsers.length})</CardTitle>
              <CardDescription>Поиск и мультивыбор</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Поиск сотрудника…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {filteredUsers.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-100 p-3 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(u.id)}
                      onChange={() => toggleUser(u.id)}
                    />
                    <div>
                      <p className="text-sm font-medium">{u.full_name}</p>
                      <p className="text-xs text-slate-500">{u.username}</p>
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Button
          onClick={handleAssign}
          disabled={submitting || !selectedUsers.length || !selectedCourses.length}
        >
          {submitting
            ? "Назначение…"
            : `Назначить выбранным (${selectedCourses.length}×${selectedUsers.length})`}
        </Button>
      </div>
    </LmsAdminGuard>
  );
}
