import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public routes — allow without auth
  const publicRoutes = ["/", "/login", "/register", "/verify-otp", "/auth/callback"];
  const isPublicRoute =
    publicRoutes.some((route) => pathname === route || pathname.startsWith("/auth/")) ||
    pathname.startsWith("/api/");

  // Not logged in and trying to access protected route
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged in — enforce role-based routing on dashboard
  if (user && pathname.startsWith("/dashboard")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile?.role) {
      // No profile yet — redirect to registration
      const url = request.nextUrl.clone();
      url.pathname = "/register";
      return NextResponse.redirect(url);
    }

    const role = profile.role;
    const rolePaths = ["bwg", "collector", "farmer", "admin"];
    const dashboardSegment = pathname.split("/")[2]; // /dashboard/{role}/...

    // If accessing /dashboard directly, redirect to role dashboard
    if (!dashboardSegment || dashboardSegment === "") {
      const url = request.nextUrl.clone();
      url.pathname = `/dashboard/${role}`;
      return NextResponse.redirect(url);
    }

    // Allow shared routes (profile)
    if (dashboardSegment === "profile") {
      return supabaseResponse;
    }

    // Block access to other roles' dashboards
    if (rolePaths.includes(dashboardSegment) && dashboardSegment !== role) {
      const url = request.nextUrl.clone();
      url.pathname = `/dashboard/${role}`;
      return NextResponse.redirect(url);
    }
  }

  // Logged in user hitting auth pages — redirect to dashboard
  if (user && (pathname === "/login" || pathname === "/register")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const url = request.nextUrl.clone();
    url.pathname = `/dashboard/${profile?.role || "bwg"}`;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
