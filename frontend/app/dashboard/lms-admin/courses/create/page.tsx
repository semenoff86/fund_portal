"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LmsAdminGuard } from "@/components/lms-admin-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createLmsCourse } from "@/lib/api";

export default function CreateCoursePage() {
  const router = useRouter();
  const [step, setStep] = useState("basic");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "GENERAL",
    is_mandatory: false,
    estimated_duration_minutes: 30,
    content_html: "",
    deadline_days: "",
    passing_score: 80,
    max_attempts: -1,
    file: null as File | null,
  });

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error("Укажите название курса");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      if (form.description) fd.append("description", form.description);
      fd.append("category", form.category);
      fd.append("is_mandatory", String(form.is_mandatory));
      fd.append("estimated_duration_minutes", String(form.estimated_duration_minutes));
      fd.append("passing_score", String(form.passing_score));
      fd.append("max_attempts", String(form.max_attempts));
      if (form.content_html) fd.append("content_html", form.content_html);
      if (form.deadline_days) fd.append("deadline_days", form.deadline_days);
      if (form.file) fd.append("file", form.file);
      await createLmsCourse(fd);
      toast.success("Курс создан");
      router.push("/dashboard/lms-admin/courses");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LmsAdminGuard>
      <div className="mx-auto max-w-3xl space-y-6">
        <h2 className="text-2xl font-semibold text-slate-900">Создание курса</h2>
        <Tabs value={step} onValueChange={setStep}>
          <TabsList>
            <TabsTrigger value="basic">Основное</TabsTrigger>
            <TabsTrigger value="content">Контент</TabsTrigger>
            <TabsTrigger value="settings">Настройки</TabsTrigger>
          </TabsList>
          <TabsContent value="basic">
            <Card>
              <CardHeader><CardTitle className="text-base">Шаг 1: Основная информация</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Название *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-2"><Label>Описание</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Категория</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["SAFETY", "CREDIT", "HR", "GENERAL", "COMPLIANCE"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_mandatory} onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })} />
                  Обязательный курс
                </label>
                <div className="space-y-2"><Label>Длительность (мин)</Label><Input type="number" value={form.estimated_duration_minutes} onChange={(e) => setForm({ ...form, estimated_duration_minutes: +e.target.value })} /></div>
                <Button onClick={() => setStep("content")}>Далее</Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="content">
            <Card>
              <CardHeader><CardTitle className="text-base">Шаг 2: Контент</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>HTML-содержание</Label><Textarea rows={8} value={form.content_html} onChange={(e) => setForm({ ...form, content_html: e.target.value })} /></div>
                <div className="space-y-2"><Label>PDF / PPTX</Label><Input type="file" accept=".pdf,.pptx,.ppt" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} /></div>
                <div className="flex gap-2"><Button variant="outline" onClick={() => setStep("basic")}>Назад</Button><Button onClick={() => setStep("settings")}>Далее</Button></div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="settings">
            <Card>
              <CardHeader><CardTitle className="text-base">Шаг 3: Настройки</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Дней на прохождение</Label><Input type="number" placeholder="Пусто = без дедлайна" value={form.deadline_days} onChange={(e) => setForm({ ...form, deadline_days: e.target.value })} /></div>
                <div className="space-y-2"><Label>Проходной балл (%)</Label><Input type="number" min={0} max={100} value={form.passing_score} onChange={(e) => setForm({ ...form, passing_score: +e.target.value })} /></div>
                <div className="space-y-2"><Label>Макс. попыток (-1 = безлимит)</Label><Input type="number" value={form.max_attempts} onChange={(e) => setForm({ ...form, max_attempts: +e.target.value })} /></div>
                <div className="flex gap-2"><Button variant="outline" onClick={() => setStep("content")}>Назад</Button><Button onClick={handleSubmit} disabled={submitting}>{submitting ? "Сохранение…" : "Создать курс"}</Button></div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </LmsAdminGuard>
  );
}
