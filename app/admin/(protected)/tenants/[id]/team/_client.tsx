"use client";
import { TenantMembers } from "@/components/admin/tenants/TenantMembers";
import { useTenantDetail } from "@/hooks/useTenantDetail";

export function TenantTeamClient({ id }: { id: string }) {
  const { data } = useTenantDetail(id);
  return (
    <TenantMembers
      organizationId={id}
      readOnly={data?.data.organization.status === "redacted"}
    />
  );
}
