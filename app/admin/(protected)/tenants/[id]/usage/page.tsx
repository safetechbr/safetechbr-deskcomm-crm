import { UsageClient } from "../../../usage/_client";

interface TenantUsagePageProps {
  params: Promise<{ id: string }>;
}

export default async function TenantUsagePage({ params }: TenantUsagePageProps) {
  const { id } = await params;
  return <UsageClient tenantId={id} />;
}
