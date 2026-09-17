"use client";

import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";

export default function StartButton({ expKey }: { expKey: string }) {
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="default"
      className="bg-green-600 hover:bg-green-700 text-white"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await fetch(`/api/experiments/${expKey}/start`, { method: "POST" });
        router.refresh();
      }}
    >
      <Play className="w-3 h-3 mr-1" />
      Start
    </Button>
  );
}
