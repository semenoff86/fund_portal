"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileText, Plus, Shield, Trash2, Upload } from "lucide-react";
import { AdminGuard } from "@/components/admin-guard";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createAdminKnowledge,
  createAdminUser,
  deleteAdminKnowledge,
  deleteAdminTemplate,
  deleteAdminUser,
  getAdminKnowledge,
  getAdminTemplates,
  getAdminUsers,
  getUploadUrl,
  toggleAdminUserActive,
  updateAdminKnowledge,
  uploadAdminTemplate,
  type AdminKnowledgeDoc,
  type AdminTemplate,
  type AdminUser,
} from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  analyst: "Аналитик",
  hr: "HR",
  accountant: "Бухгалтер",
  legal: "Юрист",
};

const CATEGORY_LABELS: Record<string, string> = {
  HR: "HR",
  CREDIT: "Кредитование",
  GENERAL: "Общие",
  SAFETY: "Безопасность",
};

const TEMPLATE_CATEGORIES = [
  { value: "leave", label: "Отпуска" },
  { value: "hr", label: "Кадры" },
  { value: "business", label: "Командировки" },
  { value: "finance", label: "Финансы" },
  { value: "other", label: "Прочее" },
];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU");
}

export default function AdminPage() {
  const [tab, setTab] = useState("users");

  return (
    <AdminGuard>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <Shield className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Панель администратора</h2>
            <p className="mt-1 text-sm text-slate-500">
              Управление пользователями, шаблонами и базой знаний
            </p>
            <Link
              href="/dashboard/admin/audit"
              className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Открыть журнал действий →
            </Link>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="users">Пользователи</TabsTrigger>
            <TabsTrigger value="templates">Шаблоны документов</TabsTrigger>
            <TabsTrigger value="knowledge">База знаний (Приказы)</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
          <TabsContent value="templates">
            <TemplatesTab />
          </TabsContent>
          <TabsContent value="knowledge">
            <KnowledgeTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminGuard>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    full_name: "",
    role: "analyst",
    department: "",
  });

  const load = useCallback(() => {
    setLoading(true);
    getAdminUsers()
      .then(setUsers)
      .catch(() => toast.error("Не удалось загрузить пользователей"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createAdminUser({
        username: form.username,
        password: form.password,
        full_name: form.full_name,
        role: form.role,
        department: form.department || undefined,
      });
      toast.success("Пользователь создан");
      setDialogOpen(false);
      setForm({ username: "", password: "", full_name: "", role: "analyst", department: "" });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка создания");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (user: AdminUser) => {
    try {
      await toggleAdminUserActive(user.id);
      toast.success(user.is_active ? "Пользователь заблокирован" : "Пользователь разблокирован");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`Удалить пользователя «${user.full_name}»?`)) return;
    try {
      await deleteAdminUser(user.id);
      toast.success("Пользователь удалён");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка удаления");
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-base font-medium">Пользователи</CardTitle>
            <CardDescription>Учётные записи сотрудников портала</CardDescription>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Добавить пользователя
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">ФИО</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Логин</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Роль</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Отдел</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Статус</th>
                  <th className="px-6 py-3 text-right font-medium text-slate-600">Действия</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-6 py-4" colSpan={6}>
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))
                  : users.map((user) => (
                      <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{user.full_name}</td>
                        <td className="px-6 py-4 text-slate-600">{user.username}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {ROLE_LABELS[user.role] || user.role}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{user.department || "—"}</td>
                        <td className="px-6 py-4">
                          <Badge variant={user.is_active ? "success" : "destructive"}>
                            {user.is_active ? "Активен" : "Заблокирован"}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggle(user)}
                            >
                              {user.is_active ? "Заблокировать" : "Разблокировать"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDelete(user)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый пользователь</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">ФИО</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Логин</Label>
              <Input
                id="username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Роль</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Отдел</Label>
              <Input
                id="department"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Создание…" : "Создать"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", category: "leave", file: null as File | null });

  const load = useCallback(() => {
    setLoading(true);
    getAdminTemplates()
      .then(setTemplates)
      .catch(() => toast.error("Не удалось загрузить шаблоны"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.file) {
      toast.error("Выберите файл (.docx или .pdf)");
      return;
    }
    setSubmitting(true);
    try {
      await uploadAdminTemplate({
        name: form.name,
        category: form.category,
        file: form.file,
      });
      toast.success("Шаблон загружен");
      setForm({ name: "", category: "leave", file: null });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (template: AdminTemplate) => {
    if (!confirm(`Удалить шаблон «${template.name}»?`)) return;
    try {
      await deleteAdminTemplate(template.id);
      toast.success("Шаблон удалён");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка удаления");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Загрузить шаблон</CardTitle>
          <CardDescription>Форматы: .docx, .pdf</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Название</Label>
              <Input
                id="tpl-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-file">Файл</Label>
              <Input
                id="tpl-file"
                type="file"
                accept=".docx,.pdf"
                onChange={(e) =>
                  setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))
                }
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={submitting} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {submitting ? "Загрузка…" : "Загрузить"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Шаблоны документов</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Шаблоны не загружены</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((tpl) => (
                <Card key={tpl.id} className="border-slate-200 shadow-sm">
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{tpl.name}</p>
                      <p className="text-xs text-slate-500">
                        {TEMPLATE_CATEGORIES.find((c) => c.value === tpl.category)?.label ||
                          tpl.category}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDate(tpl.created_at)}
                      </p>
                      <div className="mt-3 flex gap-2">
                        {getUploadUrl(tpl.file_path) && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={getUploadUrl(tpl.file_path)!} target="_blank" rel="noreferrer">
                              Открыть
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600"
                          onClick={() => handleDelete(tpl)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KnowledgeTab() {
  const [docs, setDocs] = useState<AdminKnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editDoc, setEditDoc] = useState<AdminKnowledgeDoc | null>(null);
  const [uploadForm, setUploadForm] = useState({
    title: "",
    category: "GENERAL",
    status: "ACTIVE",
    issue_date: "",
    file: null as File | null,
  });
  const [editForm, setEditForm] = useState({
    title: "",
    category: "GENERAL",
    status: "ACTIVE",
    issue_date: "",
    file: null as File | null,
  });

  const load = useCallback(() => {
    setLoading(true);
    getAdminKnowledge()
      .then(setDocs)
      .catch(() => toast.error("Не удалось загрузить документы"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file) {
      toast.error("Выберите файл");
      return;
    }
    setSubmitting(true);
    try {
      await createAdminKnowledge({
        title: uploadForm.title,
        category: uploadForm.category,
        status: uploadForm.status,
        issue_date: uploadForm.issue_date || undefined,
        file: uploadForm.file,
      });
      toast.success("Документ добавлен");
      setUploadForm({ title: "", category: "GENERAL", status: "ACTIVE", issue_date: "", file: null });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (doc: AdminKnowledgeDoc) => {
    setEditDoc(doc);
    setEditForm({
      title: doc.title,
      category: doc.category,
      status: doc.status,
      issue_date: doc.issue_date ?? "",
      file: null,
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDoc) return;
    setSubmitting(true);
    try {
      await updateAdminKnowledge(editDoc.id, {
        title: editForm.title,
        category: editForm.category,
        status: editForm.status,
        issue_date: editForm.issue_date,
        file: editForm.file ?? undefined,
      });
      toast.success("Документ обновлён");
      setEditDoc(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (doc: AdminKnowledgeDoc) => {
    if (!confirm(`Удалить документ «${doc.title}»?`)) return;
    try {
      await deleteAdminKnowledge(doc.id);
      toast.success("Документ удалён");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка удаления");
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Добавить приказ</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="kb-title">Название</Label>
              <Input
                id="kb-title"
                value={uploadForm.title}
                onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select
                value={uploadForm.category}
                onValueChange={(v) => setUploadForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Статус</Label>
              <Select
                value={uploadForm.status}
                onValueChange={(v) => setUploadForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Активный</SelectItem>
                  <SelectItem value="ARCHIVED">Архив</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="kb-date">Дата</Label>
              <Input
                id="kb-date"
                type="date"
                value={uploadForm.issue_date}
                onChange={(e) => setUploadForm((f) => ({ ...f, issue_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kb-file">Файл</Label>
              <Input
                id="kb-file"
                type="file"
                accept=".docx,.pdf"
                onChange={(e) =>
                  setUploadForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))
                }
                required
              />
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={submitting}>
                <Upload className="mr-2 h-4 w-4" />
                {submitting ? "Загрузка…" : "Добавить документ"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Название</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Категория</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Статус</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Дата</th>
                  <th className="px-6 py-3 text-right font-medium text-slate-600">Действия</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-6 py-4" colSpan={5}>
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))
                  : docs.length === 0
                    ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                            Документы не найдены
                          </td>
                        </tr>
                      )
                    : docs.map((doc) => (
                        <tr key={doc.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-6 py-4 font-medium text-slate-900">{doc.title}</td>
                          <td className="px-6 py-4 text-slate-600">
                            {CATEGORY_LABELS[doc.category] || doc.category}
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={doc.status} />
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {formatDate(doc.issue_date)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEdit(doc)}>
                                Изменить
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600"
                                onClick={() => handleDelete(doc)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editDoc} onOpenChange={(open) => !open && setEditDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать документ</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Название</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select
                value={editForm.category}
                onValueChange={(v) => setEditForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Статус</Label>
              <Select
                value={editForm.status}
                onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Активный</SelectItem>
                  <SelectItem value="ARCHIVED">Архив</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-date">Дата</Label>
              <Input
                id="edit-date"
                type="date"
                value={editForm.issue_date}
                onChange={(e) => setEditForm((f) => ({ ...f, issue_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-file">Заменить файл (необязательно)</Label>
              <Input
                id="edit-file"
                type="file"
                accept=".docx,.pdf"
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDoc(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Сохранение…" : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
