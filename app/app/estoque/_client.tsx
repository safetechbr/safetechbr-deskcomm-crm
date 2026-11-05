"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { precoParaCentavos } from "@/lib/schemas/produtos";
import { interpretarModeloFipe, marcasDoCatalogo, modelosDaMarca } from "@/lib/veiculos/catalogo";
import {
  formatarKm,
  formatarPreco,
  MAXIMO_DE_FOTOS_DO_VEICULO,
  MINIMO_RECOMENDADO_DE_FOTOS,
  ROTULO_DO_STATUS,
  STATUS_DO_VEICULO,
  tituloDoVeiculo,
  type Veiculo,
} from "@/lib/veiculos/regras";

interface Rascunho {
  codigo: string;
  marca: string;
  modelo: string;
  versao: string;
  ano_fabricacao: string;
  ano_modelo: string;
  km: string;
  motor: string;
  cambio: string;
  combustivel: string;
  cor: string;
  placa_final: string;
  preco: string;
  opcionais: string;
  descricao: string;
}

const VAZIO: Rascunho = {
  codigo: "", marca: "", modelo: "", versao: "", ano_fabricacao: "", ano_modelo: "", km: "",
  motor: "", cambio: "", combustivel: "", cor: "", placa_final: "", preco: "", opcionais: "", descricao: "",
};

function doVeiculo(v: Veiculo): Rascunho {
  return {
    codigo: v.codigo, marca: v.marca ?? "", modelo: v.modelo, versao: v.versao ?? "",
    ano_fabricacao: v.ano_fabricacao?.toString() ?? "", ano_modelo: v.ano_modelo?.toString() ?? "",
    km: v.km?.toString() ?? "", motor: v.motor ?? "", cambio: v.cambio ?? "",
    combustivel: v.combustivel ?? "", cor: v.cor ?? "", placa_final: v.placa_final ?? "",
    preco: v.preco_cents ? (v.preco_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "",
    opcionais: v.opcionais ?? "", descricao: v.descricao ?? "",
  };
}

function numeroOuNulo(s: string): number | null {
  const n = Number(s.replace(/\D/g, ""));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
}

function corpoDe(r: Rascunho): Record<string, unknown> | { erro: string } {
  const preco = r.preco.trim() === "" ? 0 : precoParaCentavos(r.preco);
  if (preco === null) return { erro: "Preço inválido. Escreva assim: 59.900,00" };
  if (!r.modelo.trim()) return { erro: "O modelo é obrigatório." };
  const txt = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    modelo: r.modelo.trim(), marca: txt(r.marca), versao: txt(r.versao),
    ano_fabricacao: numeroOuNulo(r.ano_fabricacao), ano_modelo: numeroOuNulo(r.ano_modelo),
    km: numeroOuNulo(r.km), motor: txt(r.motor), cambio: txt(r.cambio), combustivel: txt(r.combustivel),
    cor: txt(r.cor), placa_final: txt(r.placa_final), preco_cents: preco, opcionais: txt(r.opcionais),
    descricao: txt(r.descricao),
  };
}

async function enviarArquivo(url: string, arquivo: File): Promise<boolean> {
  const form = new FormData();
  form.append("file", arquivo);
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    toast.error(json?.error?.message ?? "Não consegui enviar o arquivo.");
    return false;
  }
  return true;
}

export function EstoqueClient({
  inicial, urlsDasFotos, podeEditar, titulo, subtitulo,
}: {
  inicial: Veiculo[];
  urlsDasFotos: Record<string, string>;
  podeEditar: boolean;
  titulo: string;
  subtitulo: string;
}) {
  const t = useT();
  const router = useRouter();
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<string>("disponivel");
  const [editando, setEditando] = React.useState<Veiculo | "novo" | null>(null);

  const visiveis = inicial.filter((v) => {
    if (status !== "todos" && v.status !== status) return false;
    const q = busca.trim().toLowerCase();
    return !q || `${v.codigo} ${tituloDoVeiculo(v)} ${v.cor ?? ""}`.toLowerCase().includes(q);
  });

  async function mudarStatus(v: Veiculo, novo: string) {
    try {
      await apiClient.patch(`/api/v1/veiculos/${v.id}`, { status: novo });
      router.refresh();
    } catch (e) {
      showApiError(e);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
        </div>
        {podeEditar ? (
          <Button onClick={() => setEditando("novo")} data-testid="novo-veiculo">
            {t("Novo veículo")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t("Buscar por modelo, marca ou código")}
          className="h-9 w-72 rounded-md border bg-background px-3 text-sm"
          data-testid="busca-estoque"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          data-testid="filtro-status"
        >
          <option value="todos">{t("Todos")}</option>
          {STATUS_DO_VEICULO.map((s) => (
            <option key={s} value={s}>{t(ROTULO_DO_STATUS[s])}</option>
          ))}
        </select>
        <span className="self-center text-sm text-muted-foreground">
          {visiveis.length} {t("veículo(s)")}
        </span>
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          {t("Nenhum veículo encontrado.")}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((v) => {
            const capa = v.fotos[0] ? urlsDasFotos[v.fotos[0]] : undefined;
            const poucas = v.fotos.length < MINIMO_RECOMENDADO_DE_FOTOS;
            return (
              <li key={v.id} className="overflow-hidden rounded-lg border bg-card" data-testid={`veiculo-${v.codigo}`}>
                <div className="aspect-[4/3] bg-muted">
                  {capa ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={capa} alt={tituloDoVeiculo(v)} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      {t("Sem foto")}
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3 text-sm">
                  <div className="font-medium">{tituloDoVeiculo(v)}</div>
                  <div className="text-muted-foreground">
                    {[v.km != null ? `${formatarKm(v.km)} km` : null, v.motor, v.cambio].filter(Boolean).join(" · ")}
                  </div>
                  <div className="text-base font-semibold">{formatarPreco(v.preco_cents, v.moeda)}</div>
                  <div className={poucas ? "text-xs text-warning-fg" : "text-xs text-muted-foreground"}>
                    {v.fotos.length} {t("foto(s)")}
                    {poucas ? ` — ${t("recomendado")}: ${MINIMO_RECOMENDADO_DE_FOTOS}+` : ""}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {podeEditar ? (
                      <select
                        value={v.status}
                        onChange={(e) => void mudarStatus(v, e.target.value)}
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                      >
                        {STATUS_DO_VEICULO.map((s) => (
                          <option key={s} value={s}>{t(ROTULO_DO_STATUS[s])}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs">{t(ROTULO_DO_STATUS[v.status as keyof typeof ROTULO_DO_STATUS] ?? v.status)}</span>
                    )}
                    {podeEditar ? (
                      <Button size="sm" variant="outline" onClick={() => setEditando(v)}>
                        {t("Editar")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editando ? (
        <FormularioDoVeiculo
          key={editando === "novo" ? "novo" : editando.id}
          veiculo={editando === "novo" ? null : editando}
          urlsDasFotos={urlsDasFotos}
          aoFechar={() => setEditando(null)}
        />
      ) : null}
    </div>
  );
}

function FormularioDoVeiculo({
  veiculo, urlsDasFotos, aoFechar,
}: {
  veiculo: Veiculo | null;
  urlsDasFotos: Record<string, string>;
  aoFechar: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [r, setR] = React.useState<Rascunho>(() => (veiculo ? doVeiculo(veiculo) : VAZIO));
  const [ocupado, setOcupado] = React.useState(false);
  const [fotos, setFotos] = React.useState<string[]>(veiculo?.fotos ?? []);
  const [temVideo, setTemVideo] = React.useState(Boolean(veiculo?.video));
  const fotoRef = React.useRef<HTMLInputElement>(null);
  const videoRef = React.useRef<HTMLInputElement>(null);

  const marcas = React.useMemo(() => marcasDoCatalogo(), []);
  const sugestoes = React.useMemo(
    () => (r.marca ? modelosDaMarca(r.marca, r.modelo, 40) : []),
    [r.marca, r.modelo],
  );
  const anos = React.useMemo(() => {
    const atual = new Date().getFullYear() + 1;
    return Array.from({ length: atual - 1979 }, (_, i) => String(atual - i));
  }, []);

  // Ao escolher um modelo da lista (nome completo da tabela FIPE), separa e
  // preenche modelo, versão, motor, câmbio e combustível de uma vez.
  function aoDigitarModelo(valor: string) {
    if (r.marca && sugestoes.includes(valor)) {
      const m = interpretarModeloFipe(valor);
      setR({
        ...r,
        modelo: m.modelo,
        versao: m.versao ?? r.versao,
        motor: m.motor ?? r.motor,
        cambio: m.cambio ?? r.cambio,
        combustivel: m.combustivel ?? r.combustivel,
      });
      return;
    }
    setR({ ...r, modelo: valor });
  }

  const campo = (k: keyof Rascunho, rotulo: string, extra?: string, lista?: string, aoMudar?: (v: string) => void) => (
    <label className={`text-sm ${extra ?? ""}`}>
      {t(rotulo)}
      <input
        value={r[k]}
        onChange={(e) => (aoMudar ? aoMudar(e.target.value) : setR({ ...r, [k]: e.target.value }))}
        list={lista}
        autoComplete="off"
        className="mt-1 h-9 w-full rounded-md border bg-background px-3"
        data-testid={`campo-${k}`}
      />
    </label>
  );

  async function salvar() {
    const corpo = corpoDe(r);
    if ("erro" in corpo) {
      toast.error(t(corpo.erro as string));
      return;
    }
    setOcupado(true);
    try {
      if (veiculo) await apiClient.patch(`/api/v1/veiculos/${veiculo.id}`, corpo);
      else await apiClient.post("/api/v1/veiculos", corpo);
      toast.success(t(veiculo ? "Veículo atualizado" : "Veículo cadastrado"));
      aoFechar();
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setOcupado(false);
    }
  }

  async function adicionarFotos(lista: FileList | null) {
    if (!veiculo || !lista) return;
    setOcupado(true);
    let enviadas = 0;
    for (const arq of Array.from(lista)) {
      if (!(await enviarArquivo(`/api/v1/veiculos/${veiculo.id}/fotos`, arq))) break;
      enviadas++;
    }
    if (fotoRef.current) fotoRef.current.value = "";
    setOcupado(false);
    if (enviadas > 0) {
      toast.success(`${enviadas} ${t("foto(s) adicionada(s)")}`);
      aoFechar();
      router.refresh();
    }
  }

  async function gravarFotos(novas: string[]) {
    if (!veiculo) return;
    setOcupado(true);
    try {
      await apiClient.put(`/api/v1/veiculos/${veiculo.id}/fotos`, { fotos: novas });
      setFotos(novas);
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setOcupado(false);
    }
  }

  function mover(i: number, d: -1 | 1) {
    const novas = [...fotos];
    const j = i + d;
    if (j < 0 || j >= novas.length) return;
    [novas[i], novas[j]] = [novas[j]!, novas[i]!];
    void gravarFotos(novas);
  }

  async function enviarVideo(arq: File | undefined) {
    if (!veiculo || !arq) return;
    setOcupado(true);
    if (await enviarArquivo(`/api/v1/veiculos/${veiculo.id}/video`, arq)) {
      setTemVideo(true);
      toast.success(t("Vídeo salvo"));
      router.refresh();
    }
    if (videoRef.current) videoRef.current.value = "";
    setOcupado(false);
  }

  async function removerVideo() {
    if (!veiculo) return;
    try {
      await apiClient.delete(`/api/v1/veiculos/${veiculo.id}/video`);
      setTemVideo(false);
      router.refresh();
    } catch (e) {
      showApiError(e);
    }
  }

  async function excluir() {
    if (!veiculo || !window.confirm(t("Excluir este veículo e suas fotos? Não dá para desfazer."))) return;
    try {
      await apiClient.delete(`/api/v1/veiculos/${veiculo.id}`);
      toast.success(t("Veículo excluído"));
      aoFechar();
      router.refresh();
    } catch (e) {
      showApiError(e);
    }
  }

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(veiculo ? "Editar veículo" : "Novo veículo")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {veiculo ? (
            <div className="text-sm">
              {t("Código (gerado automaticamente)")}
              <div className="mt-1 flex h-9 items-center rounded-md border bg-muted px-3 font-mono">
                {veiculo.codigo}
              </div>
            </div>
          ) : null}
          {campo("marca", "Marca", undefined, "lista-marcas")}
          {campo("modelo", r.marca ? "Modelo (digite para buscar)" : "Modelo (escolha a marca antes)", undefined, "lista-modelos", aoDigitarModelo)}
          <datalist id="lista-marcas">{marcas.map((m) => <option key={m} value={m} />)}</datalist>
          <datalist id="lista-modelos">{sugestoes.map((m) => <option key={m} value={m} />)}</datalist>
          <datalist id="lista-anos">{anos.map((a) => <option key={a} value={a} />)}</datalist>
          {campo("versao", "Versão")}
          {campo("ano_fabricacao", "Ano de fabricação", undefined, "lista-anos")}
          {campo("ano_modelo", "Ano do modelo", undefined, "lista-anos")}
          {campo("km", "Quilometragem")}
          {campo("preco", "Preço (R$)")}
          {campo("motor", "Motor (ex.: 1.0 turbo)")}
          {campo("cambio", "Câmbio (ex.: automático)")}
          {campo("combustivel", "Combustível")}
          {campo("cor", "Cor")}
          {campo("placa_final", "Final da placa")}
          <label className="text-sm sm:col-span-2">
            {t("Opcionais")}
            <textarea
              value={r.opcionais}
              onChange={(e) => setR({ ...r, opcionais: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            {t("Descrição")}
            <textarea
              value={r.descricao}
              onChange={(e) => setR({ ...r, descricao: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
        </div>

        {veiculo ? (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {t("Fotos")} ({fotos.length}/{MAXIMO_DE_FOTOS_DO_VEICULO})
              </span>
              <input
                ref={fotoRef}
                type="file"
                accept="image/jpeg,image/png"
                multiple
                className="hidden"
                onChange={(e) => void adicionarFotos(e.target.files)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={ocupado || fotos.length >= MAXIMO_DE_FOTOS_DO_VEICULO}
                onClick={() => fotoRef.current?.click()}
              >
                {t("Adicionar fotos")}
              </Button>
            </div>
            {fotos.length < MINIMO_RECOMENDADO_DE_FOTOS ? (
              <p className="text-xs text-warning-fg">
                {t("Recomendado: pelo menos")} {MINIMO_RECOMENDADO_DE_FOTOS} {t("fotos. A primeira é a capa.")}
              </p>
            ) : null}
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {fotos.map((c, i) => (
                <li key={c} className="space-y-1">
                  <div className="aspect-[4/3] overflow-hidden rounded bg-muted">
                    {urlsDasFotos[c] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urlsDasFotos[c]} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex justify-between text-xs">
                    <button disabled={ocupado || i === 0} onClick={() => mover(i, -1)} aria-label={t("Mover para trás")}>←</button>
                    <button disabled={ocupado} onClick={() => void gravarFotos(fotos.filter((x) => x !== c))}>
                      {t("Remover")}
                    </button>
                    <button disabled={ocupado || i === fotos.length - 1} onClick={() => mover(i, 1)} aria-label={t("Mover para frente")}>→</button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2 pt-2 text-sm">
              <span className="font-medium">{t("Vídeo (opcional, MP4 até 16 MB)")}</span>
              <input
                ref={videoRef}
                type="file"
                accept="video/mp4"
                className="hidden"
                onChange={(e) => void enviarVideo(e.target.files?.[0])}
              />
              <Button size="sm" variant="outline" disabled={ocupado} onClick={() => videoRef.current?.click()}>
                {t(temVideo ? "Trocar vídeo" : "Enviar vídeo")}
              </Button>
              {temVideo ? (
                <Button size="sm" variant="ghost" onClick={() => void removerVideo()}>
                  {t("Remover vídeo")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="border-t pt-3 text-xs text-muted-foreground">
            {t("Salve o veículo primeiro; depois você adiciona as fotos e o vídeo.")}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <div>
            {veiculo ? (
              <Button variant="ghost" onClick={() => void excluir()} disabled={ocupado}>
                {t("Excluir")}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={aoFechar}>{t("Cancelar")}</Button>
            <Button onClick={() => void salvar()} disabled={ocupado} data-testid="salvar-veiculo">
              {t(ocupado ? "Salvando…" : "Salvar")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
