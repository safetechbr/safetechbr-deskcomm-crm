import { UserDetailClient } from "./_client";

export const metadata = { title: "Detalhe de Usuário — Administração da plataforma" };

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UserDetailClient id={id} />;
}
