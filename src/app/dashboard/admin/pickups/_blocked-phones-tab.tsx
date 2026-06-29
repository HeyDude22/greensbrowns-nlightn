"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { Ban, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateDDMMYYYY } from "@/lib/utils";

interface BlockedPhone {
  phone: string;
  reason: string | null;
  created_at: string;
}

export function BlockedPhonesTab({ active }: { active: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<BlockedPhone[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState("");
  const [newReason, setNewReason] = useState("");
  const [blocking, setBlocking] = useState(false);

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("whatsapp_blocked_phones")
      .select("phone, reason, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load blocked phones");
      console.error(error);
    }
    setRows((data as unknown as BlockedPhone[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("whatsapp_blocked_phones")
        .select("phone, reason, created_at")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load blocked phones");
        console.error(error);
      }
      setRows((data as unknown as BlockedPhone[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, supabase]);

  async function handleBlock() {
    const phone = newPhone.replace(/\D/g, "");
    if (phone.length < 10) {
      toast.error("Enter a valid phone number");
      return;
    }
    setBlocking(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("whatsapp_blocked_phones").upsert(
      {
        phone,
        reason: newReason.trim() || null,
        blocked_by: user?.id ?? null,
      },
      { onConflict: "phone" },
    );

    if (error) {
      toast.error("Failed to block number");
      console.error(error);
      setBlocking(false);
      return;
    }

    toast.success(`Blocked ${phone}`);
    setNewPhone("");
    setNewReason("");
    setBlocking(false);
    fetchRows();
  }

  async function handleUnblock(phone: string) {
    setUnblocking(phone);
    const { error } = await supabase
      .from("whatsapp_blocked_phones")
      .delete()
      .eq("phone", phone);

    if (error) {
      toast.error("Failed to unblock number");
      console.error(error);
      setUnblocking(null);
      return;
    }

    setRows((prev) => prev.filter((r) => r.phone !== phone));
    toast.success(`Unblocked ${phone}`);
    setUnblocking(null);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Phone number</label>
              <Input
                placeholder="e.g. 919876543210"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Reason (optional)</label>
              <Input
                placeholder="e.g. spam / abuse"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
              />
            </div>
            <Button onClick={handleBlock} disabled={blocking}>
              {blocking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Block number
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Ban}
              title="No blocked phones"
              description="Numbers you block from WhatsApp will appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Blocked On</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.phone}>
                    <TableCell className="font-medium">{row.phone}</TableCell>
                    <TableCell>{row.reason || "—"}</TableCell>
                    <TableCell>{formatDateDDMMYYYY(row.created_at)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUnblock(row.phone)}
                        disabled={unblocking === row.phone}
                      >
                        {unblocking === row.phone ? "..." : "Unblock"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
