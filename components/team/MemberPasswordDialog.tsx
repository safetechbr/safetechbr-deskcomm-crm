"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import type { TeamMember } from "@/hooks/team/useTeamMembers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function MemberPasswordDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const t = useT();
  const [senha, setSenha] = useState("");
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setPendente(true); setErro(null);
    try {
      await apiClient.patch(`/api/v1/team/${member.user_id}/password`, { password: senha });
      toast.success(t("Senha definida. Entregue a nova senha ao vendedor."));
      setSenha(""); onClose();
    } catch (err) { setErro(err instanceof ApiError ? err.message : "Não foi possível definir a senha."); }
    finally { setPendente(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !pendente) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{t("Definir senha do vendedor")}</DialogTitle><DialogDescription>{member.full_name} · {t("Login")}: {member.username}. {t("Entregue a nova senha diretamente ao vendedor. Ela não será exibida depois.")}</DialogDescription></DialogHeader><form onSubmit={salvar} className="space-y-4"><Label htmlFor="new-seller-password">{t("Nova senha")}</Label><Input id="new-seller-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={senha} onChange={(e) => setSenha(e.target.value)} disabled={pendente} />{erro && <p role="alert" className="text-sm text-destructive">{t(erro)}</p>}<DialogFooter><Button type="button" variant="ghost" disabled={pendente} onClick={onClose}>{t("Cancelar")}</Button><Button type="submit" disabled={pendente}>{t(pendente ? "Salvando…" : "Definir senha")}</Button></DialogFooter></form></DialogContent></Dialog>;
}
