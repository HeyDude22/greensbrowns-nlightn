import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Redirect BWG users without an organization to the setup page. */
export async function requireBwgOrganization() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/dashboard/bwg/organization?setup=required");
  }
}
