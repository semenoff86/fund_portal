"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  generateDocument,
  getDocumentTemplate,
  type DocumentTemplateDetail,
  type DocumentTemplateField,
} from "@/lib/api";

interface DocumentTemplateFormProps {
  slug: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: DocumentTemplateField;
  value: string;
  onChange: (value: string) => void;
}) {
  const isReadonly = field.readonly;

  if (field.type === "textarea") {
    return (
      <Textarea
        id={field.key}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? undefined}
        readOnly={isReadonly}
        rows={3}
        className={isReadonly ? "bg-slate-50" : ""}
      />
    );
  }

  const inputType = isReadonly
    ? "text"
    : field.type === "number"
      ? "number"
      : field.type === "date"
        ? "date"
        : "text";

  return (
    <Input
      id={field.key}
      type={inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder ?? undefined}
      readOnly={isReadonly}
      className={isReadonly ? "bg-slate-50" : ""}
    />
  );
}

export function DocumentTemplateForm({ slug, open, onOpenChange }: DocumentTemplateFormProps) {
  const [template, setTemplate] = useState<DocumentTemplateDetail | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open || !slug) {
      setTemplate(null);
      setValues({});
      return;
    }

    setLoading(true);
    getDocumentTemplate(slug)
      .then((data) => {
        setTemplate(data);
        const initial: Record<string, string> = { ...data.prefill };
        data.fields.forEach((field) => {
          if (!(field.key in initial) && field.value) {
            initial[field.key] = field.value;
          }
          if (!(field.key in initial)) {
            initial[field.key] = "";
          }
        });
        setValues(initial);
      })
      .catch(() => toast.error("Не удалось загрузить шаблон"))
      .finally(() => setLoading(false));
  }, [open, slug]);

  const handleGenerate = async () => {
    if (!slug || !template) return;
    setGenerating(true);
    try {
      const { blob, filename } = await generateDocument(slug, values);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Документ сформирован и скачан");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка генерации документа");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : template ? (
          <>
            <DialogHeader>
              <DialogTitle>{template.title}</DialogTitle>
              <DialogDescription>{template.description}</DialogDescription>
            </DialogHeader>

            <p className="text-xs text-slate-500">
              Поля с пометкой «из профиля» заполняются автоматически из личного кабинета.
            </p>

            <div className="space-y-4">
              {template.fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={field.key}>
                      {field.label}
                      {field.required && <span className="text-red-500"> *</span>}
                    </Label>
                    {field.readonly && (
                      <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
                        <User className="h-3 w-3" />
                        из профиля
                      </Badge>
                    )}
                  </div>
                  <FieldInput
                    field={field}
                    value={values[field.key] ?? ""}
                    onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button onClick={handleGenerate} disabled={generating || !template.has_source_file}>
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Формирование...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Скачать документ
                  </>
                )}
              </Button>
            </div>

            {!template.has_source_file && (
              <p className="text-xs text-amber-600">
                Файл шаблона не найден. Загрузите .docx в templates/documents/source/
              </p>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
