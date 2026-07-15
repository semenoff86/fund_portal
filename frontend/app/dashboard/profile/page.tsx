"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  getAvatarUrl,
  type UserProfile,
} from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  analyst: "Аналитик",
  hr: "HR",
  accountant: "Бухгалтер",
  legal: "Юрист",
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    department: "",
    phone: "",
    bio: "",
  });
  const [originalForm, setOriginalForm] = useState(form);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDirty = JSON.stringify(form) !== JSON.stringify(originalForm);

  useEffect(() => {
    getProfile()
      .then((data) => {
        setProfile(data);
        const initial = {
          full_name: data.full_name,
          email: data.email,
          department: data.department || "",
          phone: data.phone || "",
          bio: data.bio || "",
        };
        setForm(initial);
        setOriginalForm(initial);
      })
      .catch(() => toast.error("Не удалось загрузить профиль"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile({
        full_name: form.full_name,
        email: form.email,
        department: form.department || undefined,
        phone: form.phone || undefined,
        bio: form.bio || undefined,
      });
      setProfile(updated);
      const saved = {
        full_name: updated.full_name,
        email: updated.email,
        department: updated.department || "",
        phone: updated.phone || "",
        bio: updated.bio || "",
      };
      setForm(saved);
      setOriginalForm(saved);
      toast.success("Профиль сохранён");
    } catch {
      toast.error("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(originalForm);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { avatar_url } = await uploadAvatar(file);
      setProfile((prev) => (prev ? { ...prev, avatar_url } : prev));
      toast.success("Аватар обновлён");
    } catch {
      toast.error("Ошибка загрузки аватара");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  const avatarSrc = getAvatarUrl(profile?.avatar_url ?? null);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Личный кабинет</h2>
        <p className="mt-1 text-sm text-slate-500">Управление профилем и настройками</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Аватар</CardTitle>
          <CardDescription>Нажмите на фото для загрузки нового изображения</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative"
              aria-label="Загрузить аватар"
              disabled={uploading}
            >
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarSrc ?? undefined} alt={profile?.full_name} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <div>
              <p className="font-medium text-slate-900">{profile?.full_name}</p>
              <p className="text-sm text-slate-500">@{profile?.username}</p>
              <p className="text-xs text-slate-400 mt-1">
                {ROLE_LABELS[profile?.role ?? ""] || profile?.role}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Личные данные</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full_name">ФИО</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Отдел</Label>
              <Input
                id="department"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">О себе</Label>
            <Textarea
              id="bio"
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={3}
            />
          </div>

          {isDirty && (
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  "Сохранить"
                )}
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={saving}>
                Отмена
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
