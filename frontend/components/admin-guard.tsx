"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    getProfile()
      .then((profile) => {
        if (profile.role !== "admin") {
          router.replace("/dashboard");
        } else {
          setAllowed(true);
        }
      })
      .catch(() => router.replace("/dashboard"))
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!allowed) return null;
  return <>{children}</>;
}
