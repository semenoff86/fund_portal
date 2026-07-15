"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Award,
  Briefcase,
  FileStack,
  FileText,
  Gift,
  Headphones,
  Palmtree,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { DocumentTemplateForm } from "@/components/document-template-form";
import {
  createServiceRequest,
  getDocumentTemplates,
  getMyRequests,
  type DocumentTemplateListItem,
  type ServiceRequest,
} from "@/lib/api";

const REQUEST_TYPES = [
  { value: "2_NDFL", label: "Справка 2-НДФЛ", icon: Receipt },
  { value: "EMPLOYMENT_CERT", label: "Справка с места работы", icon: FileText },
  { value: "IT_SUPPORT", label: "ИТ-поддержка", icon: Headphones },
  { value: "LEAVE", label: "Отпуск / отгул", icon: Palmtree },
];

const REQUEST_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  REQUEST_TYPES.map((t) => [t.value, t.label]),
);

const TEMPLATE_ICONS: Record<string, typeof FileText> = {
  "leave-unpaid": Palmtree,
  "leave-paid": Palmtree,
  bonus: Award,
  "business-trip": Briefcase,
  "material-assistance": Gift,
};

export default function ServiceDeskPage() {
  const [step, setStep] = useState(1);
  const [requestType, setRequestType] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [templates, setTemplates] = useState<DocumentTemplateListItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<string | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const loadRequests = () => {
    setLoadingRequests(true);
    getMyRequests()
      .then(setRequests)
      .catch(() => toast.error("Не удалось загрузить заявки"))
      .finally(() => setLoadingRequests(false));
  };

  useEffect(() => {
    loadRequests();
    getDocumentTemplates()
      .then(setTemplates)
      .catch(() => toast.error("Не удалось загрузить шаблоны"))
      .finally(() => setLoadingTemplates(false));
  }, []);

  const handleSubmit = async () => {
    if (!requestType) return;
    setSubmitting(true);
    try {
      await createServiceRequest({ request_type: requestType, description });
      toast.success("Заявка создана");
      setStep(1);
      setRequestType("");
      setDescription("");
      loadRequests();
    } catch {
      toast.error("Ошибка при создании заявки");
    } finally {
      setSubmitting(false);
    }
  };

  const openTemplate = (slug: string) => {
    setSelectedTemplateSlug(slug);
    setTemplateDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Сервис-деск</h2>
        <p className="mt-1 text-sm text-slate-500">
          Заявки, справки и заполнение служебных записок по шаблонам
        </p>
      </div>

      {/* Шаблоны документов */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileStack className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle className="text-base">Шаблоны документов</CardTitle>
              <CardDescription>
                Заполните форму — данные из личного кабинета подставятся автоматически
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingTemplates ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((tpl) => {
                const Icon = TEMPLATE_ICONS[tpl.slug] ?? FileText;
                return (
                  <button
                    key={tpl.slug}
                    type="button"
                    onClick={() => openTemplate(tpl.slug)}
                    className="flex flex-col items-start rounded-lg border border-slate-200 p-4 text-left transition-all duration-150 hover-lift hover:border-slate-300"
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                        <Icon className="h-4 w-4 text-blue-600" />
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {tpl.category}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-900">{tpl.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{tpl.description}</p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Новая заявка</CardTitle>
            <CardDescription>Шаг {step} из 2</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 1 && (
              <>
                <p className="text-sm text-slate-600">Выберите тип заявки:</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {REQUEST_TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => {
                          setRequestType(type.value);
                          setStep(2);
                        }}
                        className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-all duration-150 hover-lift ${
                          requestType === type.value
                            ? "border-blue-600 bg-blue-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <Icon className="h-5 w-5 text-blue-600 shrink-0" />
                        <span className="text-sm font-medium text-slate-900">{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="rounded-md bg-slate-50 px-4 py-2 text-sm text-slate-600">
                  Тип:{" "}
                  <span className="font-medium text-slate-900">
                    {REQUEST_TYPE_LABELS[requestType]}
                  </span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Описание (необязательно)</Label>
                  <Textarea
                    id="description"
                    placeholder="Укажите детали заявки..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Назад
                  </Button>
                  <Button onClick={handleSubmit} disabled={submitting}>
                    {submitting ? "Отправка..." : "Отправить заявку"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Мои заявки</CardTitle>
            <CardDescription>История и статус ваших обращений</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRequests ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : requests.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Заявок пока нет</p>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-start justify-between rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {REQUEST_TYPE_LABELS[req.request_type] || req.request_type}
                      </p>
                      {req.description && (
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                          {req.description}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-400">
                        {new Date(req.created_at).toLocaleString("ru-RU")}
                      </p>
                    </div>
                    <StatusBadge status={req.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DocumentTemplateForm
        slug={selectedTemplateSlug}
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
      />
    </div>
  );
}
