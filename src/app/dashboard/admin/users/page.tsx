"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { ROLES } from "@/lib/constants";
import { Users, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Profile, UserRole } from "@/types";
import { normalizeIndianPhone } from "@/lib/validators";
import { formatDateDDMMYYYY } from "@/lib/utils";
import { updateBwgUser } from "./actions";

type BwgUserRow = Profile & {
  organization_members: { organizations: { name: string } | null }[];
};

function orgNames(profile: BwgUserRow): string {
  const names = profile.organization_members
    .map((m) => m.organizations?.name)
    .filter((n): n is string => !!n);
  return names.length > 0 ? names.join(", ") : "—";
}

export default function AdminUsersPage() {
  const supabase = createClient();
  const [profiles, setProfiles] = useState<BwgUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editProfile, setEditProfile] = useState<BwgUserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    async function fetchUsers() {
      const { data } = await supabase
        .from("profiles")
        .select("*, organization_members(organizations(name))")
        .not("role", "in", '("farmer","collector")')
        .order("created_at", { ascending: false });

      if (data) setProfiles(data as BwgUserRow[]);
      setLoading(false);
    }
    fetchUsers();
  }, [supabase]);

  function openEditDialog(profile: BwgUserRow) {
    setEditProfile(profile);
    setFullName(profile.full_name || "");
    setPhone(profile.phone || "");
    setCity(profile.city || "Bengaluru");
  }

  function closeEditDialog() {
    setEditProfile(null);
    setFullName("");
    setPhone("");
    setCity("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editProfile) return;
    setSaving(true);

    const normalizedPhone = normalizeIndianPhone(phone);
    if (!normalizedPhone) {
      toast.error("Enter a valid WhatsApp number in +919731296263 format");
      setSaving(false);
      return;
    }

    const result = await updateBwgUser(editProfile.id, {
      full_name: fullName,
      phone: normalizedPhone,
      city,
    });

    if ("error" in result && result.error) {
      toast.error(result.error);
      setSaving(false);
      return;
    }

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === editProfile.id
          ? {
              ...p,
              full_name: fullName.trim(),
              phone: normalizedPhone,
              city: city.trim() || "Bengaluru",
            }
          : p,
      ),
    );
    toast.success("BWG user updated");
    closeEditDialog();
    setSaving(false);
  }

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="View and manage BWG and admin accounts"
      />

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Users}
              title="No users"
              description="No users have registered yet."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">
                      {profile.full_name || "—"}
                    </TableCell>
                    <TableCell>{orgNames(profile)}</TableCell>
                    <TableCell>{profile.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ROLES[profile.role as UserRole]?.label || profile.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDateDDMMYYYY(profile.created_at)}
                    </TableCell>
                    <TableCell>
                      {profile.role === "bwg" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(profile)}
                        >
                          <Pencil className="mr-1 h-3 w-3" /> Edit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={!!editProfile}
        onOpenChange={(open) => {
          if (!open) closeEditDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit BWG User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editFullName">Full Name</Label>
              <Input
                id="editFullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEmail">Email</Label>
              <Input
                id="editEmail"
                value={editProfile?.email || ""}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email is tied to login and cannot be changed here.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editPhone">WhatsApp Number</Label>
              <Input
                id="editPhone"
                type="tel"
                placeholder="+919731296263"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editCity">City</Label>
              <Input
                id="editCity"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Bengaluru"
              />
            </div>
            {editProfile && (
              <div className="space-y-2">
                <Label>Organization</Label>
                <p className="text-sm text-muted-foreground">{orgNames(editProfile)}</p>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeEditDialog}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
