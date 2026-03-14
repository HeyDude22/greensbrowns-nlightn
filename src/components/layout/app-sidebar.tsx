"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NAV_ITEMS, ADMIN_NAV_GROUPS, ROLES } from "@/lib/constants";
import type { NavItem } from "@/lib/constants";
import { Lock } from "lucide-react";
import type { UserRole } from "@/types/enums";

const BWG_GATED = [
  "/dashboard/bwg/pickups",
  "/dashboard/bwg/prepaid",
  "/dashboard/bwg/compliance",
];

interface AppSidebarProps {
  role: UserRole;
  userName: string;
  hasOrg?: boolean;
}

function NavMenuItems({
  items,
  pathname,
  role,
  hasOrg,
}: {
  items: NavItem[];
  pathname: string;
  role: UserRole;
  hasOrg: boolean;
}) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const isGated =
          role === "bwg" &&
          !hasOrg &&
          BWG_GATED.some((p) => item.href.startsWith(p));

        return (
          <SidebarMenuItem key={item.href}>
            {isGated ? (
              <SidebarMenuButton
                disabled
                tooltip={item.title}
                className="opacity-50 cursor-not-allowed"
              >
                <item.icon className="h-4 w-4" />
                <span>{item.title}</span>
                <Lock className="ml-auto h-3 w-3" />
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href}
                tooltip={item.title}
              >
                <Link href={item.href}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppSidebar({ role, userName, hasOrg = true }: AppSidebarProps) {
  const pathname = usePathname();
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold group-data-[collapsible=icon]:hidden">
            <span className="text-sidebar-primary">Greens</span>
            <span className="text-accent-yellow">Browns</span>
          </span>
          <span className="text-xl font-bold hidden group-data-[collapsible=icon]:block">
            <span className="text-sidebar-primary">G</span>
            <span className="text-accent-yellow">B</span>
          </span>
        </Link>
        <p className="text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
          {ROLES[role].label}
        </p>
      </SidebarHeader>
      <SidebarContent>
        {role === "admin" ? (
          ADMIN_NAV_GROUPS.map((navGroup) => (
            <SidebarGroup key={navGroup.group}>
              <SidebarGroupLabel>{navGroup.group}</SidebarGroupLabel>
              <SidebarGroupContent>
                <NavMenuItems
                  items={navGroup.items}
                  pathname={pathname}
                  role={role}
                  hasOrg={hasOrg}
                />
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        ) : NAV_ITEMS[role as keyof typeof NAV_ITEMS] ? (
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavMenuItems
                items={NAV_ITEMS[role as keyof typeof NAV_ITEMS]}
                pathname={pathname}
                role={role}
                hasOrg={hasOrg}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4">
        <Link href="/dashboard/profile" className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
              {initials || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-medium text-sidebar-foreground">
              {userName || "User"}
            </span>
            <span className="text-xs text-sidebar-foreground/70">
              View Profile
            </span>
          </div>
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
