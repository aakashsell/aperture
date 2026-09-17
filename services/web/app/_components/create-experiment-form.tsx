"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateExperimentForm() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ key: "", name: "" });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.key || !form.name) return;
    setLoading(true);
    const res = await fetch("/api/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        variants: [
          { key: "control", name: "Control", allocation: 50, is_control: true },
          { key: "treatment", name: "Treatment", allocation: 50 },
        ],
        allocated_percentage: 100,
      }),
    });
    setLoading(false);
    if (res.ok) {
      setShowForm(false);
      setForm({ key: "", name: "" });
      router.refresh();
    }
  }

  if (!showForm) {
    return (
      <Button onClick={() => setShowForm(true)}>
        <Plus className="w-4 h-4 mr-1.5" />
        New experiment
      </Button>
    );
  }

  return (
    <Card className="mb-8">
      <CardContent className="pt-6">
        <h3 className="font-semibold text-slate-800 mb-4">Create experiment</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                Key
              </label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-100"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="checkout_v2"
                required
              />
              <p className="text-xs text-slate-400 mt-1">Used in your code</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                Name
              </label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-100"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Checkout Redesign"
                required
              />
              <p className="text-xs text-slate-400 mt-1">Shown in dashboard</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowForm(false)}
              type="button"
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
