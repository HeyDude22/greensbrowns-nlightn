"use client";

import { ROLES } from "@/lib/constants";
import type { UserRole } from "@/types/enums";
import { Building2, Truck, Leaf, ShieldCheck, Crown } from "lucide-react";

const ROLE_ICONS: Record<UserRole, React.ElementType> = {
  bwg: Building2,
  collector: Truck,
  farmer: Leaf,
  admin: ShieldCheck,
  owner: Crown,
};

interface RoleSelectorProps {
  value: UserRole;
  onChange: (role: UserRole) => void;
}

export function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {(Object.entries(ROLES) as [UserRole, typeof ROLES[UserRole]][]).filter(
        ([key]) => key !== "admin"
      ).map(
        ([key, role]) => {
          const Icon = ROLE_ICONS[key];
          const isSelected = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <Icon className={`h-6 w-6 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
              <span className="text-sm font-medium">{role.label}</span>
              <span className="text-xs text-muted-foreground">{role.description}</span>
            </button>
          );
        }
      )}
    </div>
  );
}
