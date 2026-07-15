"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { LmsAdminGuard } from "@/components/lms-admin-guard";
import { QuizBuilder, type QuizFormData } from "@/components/lms/quiz-builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  addLmsQuiz,
  deleteLmsQuiz,
  getLmsAdminCourse,
  updateLmsCourse,
  type LmsCourseDetail,
  type LmsQuiz,
} from "@/lib/api";

const emptyQuiz = (): QuizFormData => ({
  question: "",
  options: ["", "", "", ""],
  correct_answer_index: 0,
  explanation: "",
});

export default function EditCoursePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [course, setCourse] = useState<LmsCourseDetail | null>(null);
  const [quizForm, setQuizForm] = useState<QuizFormData>(emptyQuiz());
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState("info");

  const load = () => {
    getLmsAdminCourse(+id).then(setCourse).catch(() => toast.error("Курс не найден"));
  };

  useEffect(() => { load(); }, [id]);

  const handleSave = async () => {
    if (!course) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", course.title);
      if (course.description) fd.append("description", course.description);
      if (course.category) fd.append("category", course.category);
      fd.append("is_mandatory", String(course.is_mandatory));
      fd.append("passing_score", String(course.passing_score));
      fd.append("max_attempts", String(course.max_attempts));
      fd.append("estimated_duration_minutes", String(course.estimated_duration_minutes));
      if (course.content_html) fd.append("content_html", course.content_html);
      if (course.deadline_days) fd.append("deadline_days", String(course.deadline_days));
      await updateLmsCourse(course.id, fd);
      toast.success("Сохранено");
    } catch {
      toast.error("Ошибка сохранения");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddQuiz = async () => {
    try {
      await addLmsQuiz(+id, quizForm);
      toast.success("Вопрос добавлен");
      setQuizForm(emptyQuiz());
      load();
    } catch {
      toast.error("Ошибка");
    }
  };

  const handleDeleteQuiz = async (quiz: LmsQuiz) => {
    if (!confirm("Удалить вопрос?")) return;
    await deleteLmsQuiz(quiz.id);
    load();
  };

  if (!course) return <LmsAdminGuard><Skeleton className="h-64" /></LmsAdminGuard>;

  return (
    <LmsAdminGuard>
      <div className="mx-auto max-w-3xl space-y-6">
        <h2 className="text-2xl font-semibold">Редактирование: {course.title}</h2>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="info">Курс</TabsTrigger>
            <TabsTrigger value="quizzes">Тест ({course.quizzes.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="info">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2"><Label>Название</Label><Input value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} /></div>
                <div className="space-y-2"><Label>Описание</Label><Textarea value={course.description ?? ""} onChange={(e) => setCourse({ ...course, description: e.target.value })} /></div>
                <div className="space-y-2"><Label>Контент</Label><Textarea rows={6} value={course.content_html ?? ""} onChange={(e) => setCourse({ ...course, content_html: e.target.value })} /></div>
                <Button onClick={handleSave} disabled={submitting}>Сохранить</Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="quizzes">
            <div className="space-y-4">
              {course.quizzes.map((q) => (
                <Card key={q.id}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">{q.question}</CardTitle>
                    <Button variant="outline" size="sm" className="text-red-600" onClick={() => handleDeleteQuiz(q)}>Удалить</Button>
                  </CardHeader>
                </Card>
              ))}
              <QuizBuilder value={quizForm} onChange={setQuizForm} onSubmit={handleAddQuiz} />
            </div>
          </TabsContent>
        </Tabs>
        <Button variant="outline" onClick={() => router.push("/dashboard/lms-admin/courses")}>К списку</Button>
      </div>
    </LmsAdminGuard>
  );
}
