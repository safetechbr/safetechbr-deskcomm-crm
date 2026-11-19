import { TenantTeamClient } from "./_client";

interface TenantTeamPageProps {
  params: Promise<{ id: string }>;
}

export default async function TenantTeamPage({ params }: TenantTeamPageProps) {
  const { id } = await params;
  return <TenantTeamClient id={id} />;
}
