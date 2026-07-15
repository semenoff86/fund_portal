"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

export function LmsAdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getProfile()
      .then((p) => {
        if (p.role === "admin" || p.role === "hr") setOk(true);
        else router.replace("/dashboard");
      })
      .catch(() => router.replace("/dashboard"))
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) return <Skeleton className="h-64 w-full" />;
  if (!ok) return null;
  return <>{children}</>;
}
