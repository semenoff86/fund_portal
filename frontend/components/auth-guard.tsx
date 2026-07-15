"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const authed = isAuthenticated();
    if (!authed) {
      router.replace("/login");
    } else {
      setAuthenticated(true);
    }
    setChecking(false);
  }, [router]);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!authenticated) return null;

  return <>{children}</>;
}
