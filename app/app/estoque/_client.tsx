"use client";
import { EditorRegularizacao } from "@/components/pdv/dados-do-contrato";
import { reservaAtiva } from "@/lib/veiculos/reservas";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { DialogoDeMotivo } from "@/components/feedback/DialogoDeMotivo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { ImageIcon, MagnifyingGlass } from "@/lib/ui/icons";
import { apiClient } from "@/lib/api/client";
import { precoParaCentavos } from "@/lib/schemas/produtos";
import { centavosParaMascara, mascararMoeda } from "@/lib/money";
import { CATEGORIAS_PADRAO, listaDeCategorias, mesmaCategoria, sugerirCategoria } from "@/lib/veiculos/categorias";
import { normalizarPlaca, placaValida, type DadosDaPlaca } from "@/lib/veiculos/placa";
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
  categoria: string;
  versao: string;
  ano_fabricacao: string;
  ano_modelo: string;
  km: string;
  motor: string;
  cambio: string;
  combustivel: string;
  cor: string;
  placa: string;
  chassi: string;
  renavam: string;
  placa_final: string;
  preco: string;
  opcionais: string;
  descricao: string;
}

const VAZIO: Rascunho = {
  codigo: "",
  marca: "",
  modelo: "",
  categoria: "",
  versao: "",
  ano_fabricacao: "",
  ano_modelo: "",
  km: "",
  motor: "",
  cambio: "",
  combustivel: "",
  cor: "",
  placa: "",
  chassi: "",
  renavam: "",
  placa_final: "",
  preco: "",
  opcionais: "",
  descricao: "",
};

function doVeiculo(v: Veiculo): Rascunho {
  return {
    codigo: v.codigo,
    marca: v.marca ?? "",
    modelo: v.modelo,
    categoria: v.categoria ?? "",
    versao: v.versao ?? "",
    ano_fabricacao: v.ano_fabricacao?.toString() ?? "",
    ano_modelo: v.ano_modelo?.toString() ?? "",
    km: v.km?.toString() ?? "",
    motor: v.motor ?? "",
    cambio: v.cambio ?? "",
    combustivel: v.combustivel ?? "",
    cor: v.cor ?? "",
    placa: v.placa ?? "",
    chassi: v.chassi ?? "",
    renavam: v.renavam ?? "",
    placa_final: v.placa_final ?? "",
    preco: centavosParaMascara(v.preco_cents),
    opcionais: v.opcionais ?? "",
    descricao: v.descricao ?? "",
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
  if (!r.categoria.trim()) return { erro: "Escolha a categoria do veículo." };
  const txt = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    modelo: r.modelo.trim(),
    categoria: r.categoria.trim(),
    marca: txt(r.marca),
    versao: txt(r.versao),
    ano_fabricacao: numeroOuNulo(r.ano_fabricacao),
    ano_modelo: numeroOuNulo(r.ano_modelo),
    km: numeroOuNulo(r.km),
    motor: txt(r.motor),
    cambio: txt(r.cambio),
    combustivel: txt(r.combustivel),
    cor: txt(r.cor),
    placa: txt(r.placa),
    chassi: txt(r.chassi),
    renavam: txt(r.renavam),
    placa_final: txt(r.placa_final),
    preco_cents: preco,
    opcionais: txt(r.opcionais),
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
  inicial,
  urlsDasFotos,
  podeEditar,
  titulo,
  subtitulo,
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
    if (status !== "todos" && (reservaAtiva(v.reserva) ? "reservado" : v.status) !== status) return false;
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

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <span className="sr-only">{t("Buscar por modelo, marca ou código")}</span>
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("Buscar por modelo, marca ou código")}
            className="h-10 w-72 rounded-full border border-border/80 bg-surface pr-4 pl-9 text-sm shadow-xs transition-[border-color,box-shadow] duration-150 focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:outline-hidden"
            data-testid="busca-estoque"
          />
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-10 rounded-full border border-border/80 bg-surface px-3 text-sm shadow-xs transition-colors duration-150 hover:bg-foreground/[0.03] focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:outline-hidden"
          data-testid="filtro-status"
        >
          <option value="todos">{t("Todos")}</option>
          {STATUS_DO_VEICULO.map((s) => (
            <option key={s} value={s}>
              {t(ROTULO_DO_STATUS[s])}
            </option>
          ))}
        </select>
        <span className="self-center text-sm text-muted-foreground">
          {visiveis.length} {t("veículo(s)")}
        </span>
      </div>

      {visiveis.length === 0 ? (
        <div className="ds-entra flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/80 bg-surface p-10 text-center">
          <span
            className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent"
            aria-hidden
          >
            <MagnifyingGlass size={22} weight="duotone" />
          </span>
          <p className="text-sm text-muted-foreground">{t("Nenhum veículo encontrado.")}</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((v, i) => {
            const capa = v.fotos[0] ? urlsDasFotos[v.fotos[0]] : undefined;
            const poucas = v.fotos.length < MINIMO_RECOMENDADO_DE_FOTOS;
            return (
              <li
                key={v.id}
                className="ds-entra ds-elevavel group overflow-hidden rounded-[28px] border border-border bg-surface shadow-none"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                data-testid={`veiculo-${v.codigo}`}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-b from-muted to-surface">
                  {capa ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={capa}
                      alt={tituloDoVeiculo(v)}
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-sm text-text-muted">
                      <ImageIcon size={28} weight="duotone" aria-hidden />
                      {t("Sem foto")}
                    </div>
                  )}
                  <span className="absolute top-3 left-3 rounded-full bg-surface/90 px-2.5 py-0.5 text-xs font-medium text-text shadow-xs backdrop-blur-sm">
                    {reservaAtiva(v.reserva) ? t("Reservado para visita") : t(ROTULO_DO_STATUS[v.status as keyof typeof ROTULO_DO_STATUS] ?? v.status)}
                  </span>
                </div>
                <div className="space-y-2 p-5 text-sm">
                  <div className="leading-snug font-medium">{tituloDoVeiculo(v)}</div>
                  {reservaAtiva(v.reserva) ? <p className="text-xs text-amber-600">{t("Reservado por")} {v.reserva.vendedor_nome || t("vendedor responsável")} · {t("Até")} {new Date(v.reserva.expira_em).toLocaleString("pt-BR")}</p> : null}
                  <div className="text-muted-foreground">
                    {[v.km != null ? `${formatarKm(v.km)} km` : null, v.motor, v.cambio]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div className="pt-2 text-xl font-semibold tracking-tight text-text">
                    {formatarPreco(v.preco_cents, v.moeda)}
                  </div>
                  <div
                    className={poucas ? "text-xs text-warning-fg" : "text-xs text-muted-foreground"}
                  >
                    {v.fotos.length} {t("foto(s)")}
                    {poucas ? ` — ${t("recomendado")}: ${MINIMO_RECOMENDADO_DE_FOTOS}+` : ""}
                  </div>
                  {podeEditar ? (
                    <div className="mt-2 flex items-center gap-2 border-t border-border/50 pt-3">
                      <select
                        value={v.status}
                        onChange={(e) => void mudarStatus(v, e.target.value)}
                        aria-label={t("Status")}
                        className="h-8 rounded-full border border-border/80 bg-transparent px-2.5 text-xs transition-colors duration-150 hover:bg-foreground/[0.04]"
                      >
                        {STATUS_DO_VEICULO.map((s) => (
                          <option key={s} value={s}>
                            {t(ROTULO_DO_STATUS[s])}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto rounded-full"
                        onClick={() => setEditando(v)}
                      >
                        {t("Editar")}
                      </Button>
                    </div>
                  ) : null}
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
  veiculo,
  urlsDasFotos,
  aoFechar,
}: {
  veiculo: Veiculo | null;
  urlsDasFotos: Record<string, string>;
  aoFechar: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [r, setR] = React.useState<Rascunho>(() => (veiculo ? doVeiculo(veiculo) : VAZIO));
  const [condicao, setCondicao] = React.useState(veiculo?.condicao ?? "");
  const [regularizacao, setRegularizacao] = React.useState(veiculo?.regularizacao ?? []);
  const [ocupado, setOcupado] = React.useState(false);
  const [consultandoPlaca, setConsultandoPlaca] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState(false);
  const [fotos, setFotos] = React.useState<string[]>(veiculo?.fotos ?? []);
  const [temVideo, setTemVideo] = React.useState(Boolean(veiculo?.video));
  const fotoRef = React.useRef<HTMLInputElement>(null);
  const videoRef = React.useRef<HTMLInputElement>(null);

  const marcas = React.useMemo(() => marcasDoCatalogo(), []);
  const [listaModelosAberta, setListaModelosAberta] = React.useState(false);
  const [destaqueModelo, setDestaqueModelo] = React.useState(-1);
  const sugestoes = React.useMemo(
    () => (r.marca ? modelosDaMarca(r.marca, r.modelo, 40) : []),
    [r.marca, r.modelo],
  );
  // Categoria: sugerida pelo modelo enquanto a pessoa não escolher; sem sugestão, é obrigatório escolher.
  const [categorias, setCategorias] = React.useState<string[]>(() => listaDeCategorias([]));
  const [categoriaEscolhida, setCategoriaEscolhida] = React.useState(Boolean(veiculo?.categoria));
  const [novaCategoria, setNovaCategoria] = React.useState<string | null>(null);
  React.useEffect(() => {
    let vivo = true;
    apiClient
      .get<{ data: string[] }>("/api/v1/veiculos/categorias")
      .then((res) => {
        if (vivo && Array.isArray(res?.data)) setCategorias(listaDeCategorias(res.data));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  const sugerida = React.useMemo(() => sugerirCategoria(r.marca, r.modelo), [r.marca, r.modelo]);
  React.useEffect(() => {
    if (categoriaEscolhida) return;
    setR((atual) => (atual.categoria === (sugerida ?? "") ? atual : { ...atual, categoria: sugerida ?? "" }));
  }, [sugerida, categoriaEscolhida]);
  function escolherCategoria(valor: string) {
    if (valor === "__nova__") {
      setNovaCategoria("");
      return;
    }
    setNovaCategoria(null);
    setCategoriaEscolhida(true);
    setR((atual) => ({ ...atual, categoria: valor }));
  }
  function adicionarCategoria() {
    const nome = (novaCategoria ?? "").trim().slice(0, 40);
    if (!nome) return;
    const existente = categorias.find((c) => mesmaCategoria(c, nome));
    if (!existente) setCategorias((l) => listaDeCategorias([...l.filter((c) => !CATEGORIAS_PADRAO.some((p) => p === c)), nome]));
    setCategoriaEscolhida(true);
    setNovaCategoria(null);
    setR((atual) => ({ ...atual, categoria: existente ?? nome }));
  }

  const anos = React.useMemo(() => {
    const atual = new Date().getFullYear() + 1;
    return Array.from({ length: atual - 1979 }, (_, i) => String(atual - i));
  }, []);

  // Ao escolher um modelo da lista (nome completo da tabela FIPE), separa e
  // preenche modelo, versão, motor, câmbio e combustível de uma vez.
  async function aoDigitarPlaca(valor: string) {
    const placa = normalizarPlaca(valor);
    setR((atual) => ({ ...atual, placa }));
    if (!placaValida(placa) || consultandoPlaca) return;
    setConsultandoPlaca(true);
    try {
      const resp = await apiClient.get<{ data: DadosDaPlaca }>(`/api/v1/veiculos/consulta-placa?placa=${placa}`);
      const d = resp.data;
      // só preenche o que está vazio, nunca sobrescreve o que foi digitado
      setR((atual) => ({
        ...atual,
        marca: atual.marca || d.marca || "",
        modelo: atual.modelo || d.modelo || "",
        ano_fabricacao: atual.ano_fabricacao || (d.ano_fabricacao ? String(d.ano_fabricacao) : ""),
        ano_modelo: atual.ano_modelo || (d.ano_modelo ? String(d.ano_modelo) : ""),
        cor: atual.cor || d.cor || "",
      }));
      toast.success(t("Dados da placa preenchidos"));
    } catch (e) {
      showApiError(e);
    } finally {
      setConsultandoPlaca(false);
    }
  }

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

  const campo = (
    k: keyof Rascunho,
    rotulo: string,
    extra?: string,
    lista?: string,
    aoMudar?: (v: string) => void,
  ) => (
    <label className={`text-sm ${extra ?? ""}`}>
      {rotulo}
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
    if (!("erro" in corpo)) { corpo.condicao = condicao || null; corpo.regularizacao = regularizacao; }
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

  async function excluir(motivo: string) {
    if (!veiculo) return;
    try {
      await apiClient.delete(`/api/v1/veiculos/${veiculo.id}`, { motivo });
    } catch (e) {
      showApiError(e);
      throw e;
    }
    toast.success(t("Veículo excluído"));
    aoFechar();
    router.refresh();
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
          {campo("marca", t("Marca"), undefined, "lista-marcas")}
          {/* Lista própria: o <datalist> nativo não reabre quando as opções mudam a cada tecla. */}
          <div className="relative text-sm">
            <label htmlFor="campo-modelo">
              {r.marca ? t("Modelo (digite para buscar)") : t("Modelo (escolha a marca antes)")}
            </label>
            <input
              id="campo-modelo"
              role="combobox"
              aria-expanded={listaModelosAberta}
              aria-controls="lista-modelos"
              aria-autocomplete="list"
              value={r.modelo}
              onChange={(e) => {
                aoDigitarModelo(e.target.value);
                setListaModelosAberta(true);
                setDestaqueModelo(-1);
              }}
              onFocus={() => setListaModelosAberta(true)}
              onBlur={() => setListaModelosAberta(false)}
              onKeyDown={(e) => {
                if (!listaModelosAberta || sugestoes.length === 0) return;
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const passo = e.key === "ArrowDown" ? 1 : -1;
                  const n = sugestoes.length;
                  setDestaqueModelo((i) => (i < 0 ? (passo > 0 ? 0 : n - 1) : (i + passo + n) % n));
                } else if (e.key === "Enter" && sugestoes[destaqueModelo] !== undefined) {
                  e.preventDefault();
                  aoDigitarModelo(sugestoes[destaqueModelo]!);
                  setListaModelosAberta(false);
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setListaModelosAberta(false);
                }
              }}
              autoComplete="off"
              className="mt-1 h-9 w-full rounded-md border bg-background px-3"
              data-testid="campo-modelo"
            />
            {listaModelosAberta && r.modelo.trim() && sugestoes.length > 0 ? (
              <ul
                id="lista-modelos"
                role="listbox"
                className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
              >
                {sugestoes.map((m, i) => (
                  <li
                    key={m}
                    role="option"
                    aria-selected={i === destaqueModelo}
                    // mousedown, não click: o blur do input fecharia a lista antes do click.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      aoDigitarModelo(m);
                      setListaModelosAberta(false);
                    }}
                    className={`cursor-pointer rounded px-2 py-1.5 ${i === destaqueModelo ? "bg-accent" : "hover:bg-accent"}`}
                  >
                    {m}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <datalist id="lista-marcas">
            {marcas.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <datalist id="lista-anos">
            {anos.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <div className="text-sm sm:col-span-2" data-testid="campo-categoria">
            <label htmlFor="categoria-do-veiculo">{t("Categoria")}</label>
            <select
              id="categoria-do-veiculo"
              value={r.categoria}
              onChange={(e) => escolherCategoria(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border bg-background px-3"
            >
              <option value="" disabled>
                {t("Escolha a categoria")}
              </option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {r.categoria && !categorias.some((c) => mesmaCategoria(c, r.categoria)) ? (
                <option value={r.categoria}>{r.categoria}</option>
              ) : null}
              <option value="__nova__">{t("+ Adicionar outra categoria…")}</option>
            </select>
            {novaCategoria !== null ? (
              <div className="mt-2 flex gap-2">
                <input
                  value={novaCategoria}
                  onChange={(e) => setNovaCategoria(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      adicionarCategoria();
                    }
                  }}
                  maxLength={40}
                  placeholder={t("Nome da nova categoria")}
                  className="h-9 flex-1 rounded-md border bg-background px-3"
                  data-testid="campo-nova-categoria"
                />
                <Button type="button" variant="outline" onClick={adicionarCategoria}>
                  {t("Adicionar")}
                </Button>
              </div>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {sugerida && !categoriaEscolhida
                ? t("Sugerida pelo modelo. Você pode trocar.")
                : !r.categoria
                  ? t("Modelo fora da base: escolha a categoria (obrigatório).")
                  : ""}
            </p>
          </div>
          {campo("versao", t("Versão"))}
          {campo("ano_fabricacao", t("Ano de fabricação"), undefined, "lista-anos")}
          {campo("ano_modelo", t("Ano do modelo"), undefined, "lista-anos")}
          {campo("km", t("Quilometragem"))}
          {campo("preco", t("Preço (R$)"), undefined, undefined, (v) =>
            setR({ ...r, preco: mascararMoeda(v) }),
          )}
          {campo("motor", t("Motor (ex.: 1.0 turbo)"))}
          {campo("cambio", t("Câmbio (ex.: automático)"))}
          {campo("combustivel", t("Combustível"))}
          {campo("cor", t("Cor"))}
          {campo("placa", t("Placa completa"), undefined, undefined, aoDigitarPlaca)}
          {campo("chassi", t("Chassi"))}
          {campo("renavam", t("Renavam"))}
          {campo("placa_final", t("Final da placa"))}
          <label className="text-sm">Condição
            <select value={condicao} onChange={(e) => setCondicao(e.target.value as "novo" | "usado" | "")} className="mt-1 h-9 w-full rounded-md border bg-background px-3">
              <option value="">Selecione</option><option value="novo">Novo</option><option value="usado">Usado</option>
            </select>
          </label>
          <div className="sm:col-span-2"><EditorRegularizacao valor={regularizacao} onChange={setRegularizacao} /></div>
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
                {t("Recomendado: pelo menos")} {MINIMO_RECOMENDADO_DE_FOTOS}{" "}
                {t("fotos. A primeira é a capa.")}
              </p>
            ) : null}
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {fotos.map((c, i) => (
                <li key={c} className="space-y-1">
                  <div className="aspect-[4/3] overflow-hidden rounded-md bg-muted">
                    {urlsDasFotos[c] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urlsDasFotos[c]} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex justify-between text-xs">
                    <button
                      disabled={ocupado || i === 0}
                      onClick={() => mover(i, -1)}
                      aria-label={t("Mover para trás")}
                    >
                      ←
                    </button>
                    <button
                      disabled={ocupado}
                      onClick={() => void gravarFotos(fotos.filter((x) => x !== c))}
                    >
                      {t("Remover")}
                    </button>
                    <button
                      disabled={ocupado || i === fotos.length - 1}
                      onClick={() => mover(i, 1)}
                      aria-label={t("Mover para frente")}
                    >
                      →
                    </button>
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
              <Button
                size="sm"
                variant="outline"
                disabled={ocupado}
                onClick={() => videoRef.current?.click()}
              >
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
              <Button variant="ghost" onClick={() => setExcluindo(true)} disabled={ocupado}>
                {t("Excluir")}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={aoFechar}>
              {t("Cancelar")}
            </Button>
            <Button onClick={() => void salvar()} disabled={ocupado} data-testid="salvar-veiculo">
              {t(ocupado ? "Salvando…" : "Salvar")}
            </Button>
          </div>
        </div>
        <DialogoDeMotivo
          aberto={excluindo}
          aoMudar={setExcluindo}
          titulo={t("Excluir veículo")}
          descricao={t("O veículo e suas fotos saem do estoque. Não dá para desfazer.")}
          aoConfirmar={excluir}
        />
      </DialogContent>
    </Dialog>
  );
}
