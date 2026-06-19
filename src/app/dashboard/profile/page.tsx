"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { KycUploadForm } from "@/components/shared/kyc-upload-form";
import { ROLES, KYC_STATUS_COLORS } from "@/lib/constants";
import { User, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatDateDDMMYYYY } from "@/lib/utils";
import type { UserRole, KycStatus } from "@/types";

export default function ProfilePage() {
  const { user, profile, loading: userLoading } = useUser();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kycStatus, setKycStatus] = useState<KycStatus>("pending");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setCity(profile.city || "");
      setKycStatus(profile.kyc_status);
    }
  }, [profile]);

  if (userLoading) return <DashboardSkeleton />;
  if (!user || !profile) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        phone: phone || null,
        city: city || "Bengaluru",
      })
      .eq("id", user.id);

    if (error) {
      toast.error("Failed to update profile");
    } else {
      toast.success("Profile updated");
      setEditing(false);
    }
    setSaving(false);
  }

  if (!editing) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Profile"
          description="Your account details"
          action={
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          }
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {profile.full_name || "No name set"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{profile.email || user.email || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">{profile.phone || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Role</p>
              <Badge variant="outline">
                {ROLES[profile.role as UserRole]?.label || profile.role}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">KYC Status</p>
              <Badge
                variant="secondary"
                className={KYC_STATUS_COLORS[kycStatus]}
              >
                {kycStatus}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">City</p>
              <p className="font-medium">{profile.city}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Member Since</p>
              <p className="font-medium">
                {formatDateDDMMYYYY(profile.created_at)}
              </p>
            </div>
          </CardContent>
        </Card>

        {(profile.role === "collector" || profile.role === "farmer") && (
          <KycUploadForm
            userId={user.id}
            currentStatus={kycStatus}
            kycNotes={profile.kyc_notes}
            onStatusChange={setKycStatus}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Edit Profile" description="Update your account details" />
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={profile.email || user.email || ""}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed here.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Bengaluru"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
