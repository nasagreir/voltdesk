"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DrivesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/trips");
  }, [router]);
  return <p className="text-sm text-muted-foreground">Opening trips…</p>;
}
