"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HistoryPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/reports");
  }, [router]);
  return <p className="text-sm text-muted-foreground">Opening reports…</p>;
}
