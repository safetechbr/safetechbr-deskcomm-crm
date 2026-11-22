"use client";

import * as React from "react";
import { EditorDoContrato, EditorRegularizacao } from "@/components/pdv/dados-do-contrato";
import { novoContrato, type DadosDoContrato } from "@/lib/pdv/modelo-contrato";
import {
  faltandoParaConcluir,
  retratoDaOperacao,
  type FaltaParaConcluir,
  type SetorDoPdv,
} from "@/lib/pdv/retrato-da-operacao";
import { toast } from "sonner";
import { salvarPadraoDaLoja } from "@/app/actions/pdv/salvarPadraoDaLoja";
import {
  guardarRascunho,
  lerRascunho,
  limparRascunho,
  temConteudo,
  type RascunhoGuardado,
} from "@/lib/pdv/rascunho-local";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { codigoIbgePorCep } from "@/lib/fiscal/ibge";
import { Button } from "@/components/ui/button";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { calcularCartao, lerTaxasDeCartao, perfilDoCartao, type TaxasDeCartao } from "@/lib/pdv/taxas-de-cartao";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import {
  documentoValido,
  FORMAS_COM_BANCO,
  FORMAS_PARCELADAS,
  FORMAS_POR_TIPO,
  type ClienteDaNegociacao,
  type FormaDePagamento,
  type Negociacao,
  type NegociacaoInput,
  type PagamentoDaNegociacao,
  pendenciasParaConcluir,
  resumoDaNegociacao,
  ROTULO_DA_FORMA,
  ROTULO_DO_STATUS_DA_NEGOCIACAO,
  soDigitos,
  type TipoDeNegociacao,
  tituloDoVeiculoDaNegociacao,
  type TrocaDaNegociacao,
  type VeiculoDaNegociacao,
} from "@/lib/pdv/regras";
import { precoParaCentavos } from "@/lib/schemas/produtos";
import { centavosParaMascara, mascararMoeda } from "@/lib/money";
import { interpretarModeloFipe, marcasDoCatalogo, modelosDaMarca } from "@/lib/veiculos/catalogo";
import { type DadosDaPlaca, normalizarPlaca, placaValida } from "@/lib/veiculos/placa";
import { formatarKm, formatarPreco, tituloDoVeiculo, type Veiculo } from "@/lib/veiculos/regras";
import { clienteDoContato, type ContatoDoCadastro } from "@/lib/pdv/cadastro-cliente";
import { CadastroClienteModal } from "./cadastro-cliente-modal";
import { acharCampo, destacarCampo } from "@/components/pdv/destacar-campo";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import {
  CaretLeft,
  CheckCircle,
  CurrencyDollar,
  FileText,
  MagnifyingGlass,
  Plus,
  Receipt,
  Storefront,
  Trash,
  UserCircle,
} from "@/lib/ui/icons";

/** Campo do PDV: o mesmo desenho dos inputs do app, um pouco mais compacto (a tela é densa). */
const CAMPO =
  "h-9 w-full rounded-full border border-border/80 bg-surface px-3.5 text-sm shadow-xs transition-colors focus-visible:border-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/20 disabled:opacity-70";

export interface VeiculoDoPdv extends Veiculo {
  placa: string | null;
  chassi: string | null;
  renavam: string | null;
}

type Aba = "venda" | "compra" | "historico";

interface Rascunho extends Omit<NegociacaoInput, "pagamentos" | "troca"> {
  pagamentos: PagamentoDaNegociacao[];
  troca: TrocaDaNegociacao | null;
}

interface ContatoEncontrado {
  id: string;
  name: string | null;
  display_name: string | null;
  email: string | null;
  phone_number: string | null;
}

const CLIENTE_VAZIO: ClienteDaNegociacao = { nome: "" };
const VEICULO_VAZIO: VeiculoDaNegociacao = { modelo: "" };
const TROCA_VAZIA: TrocaDaNegociacao = {
  modelo: "",
  valor_cents: 0,
  quitacao_cents: 0,
  entra_no_estoque: true,
};

function rascunhoNovo(tipo: TipoDeNegociacao, contrato: DadosDoContrato): Rascunho {
  return {
    tipo,
    modalidade: "normal",
    contrato: structuredClone(contrato),
    contact_id: null,
    cliente: { ...CLIENTE_VAZIO },
    veiculo_id: null,
    veiculo: { ...VEICULO_VAZIO },
    valor_cents: 0,
    desconto_cents: 0,
    troca: null,
    pagamentos: [],
    vendedor_user_id: null,
    comissao_cents: null,
    observacoes: null,
  };
}

function rascunhoDe(n: Negociacao, padrao: DadosDoContrato): Rascunho {
  return {
    tipo: n.tipo,
    modalidade: n.modalidade ?? "normal",
    contrato: n.contrato ?? (n.status === "rascunho" ? structuredClone(padrao) : null),
    contact_id: n.contact_id,
    cliente: { ...CLIENTE_VAZIO, ...n.cliente },
    veiculo_id: n.veiculo_id,
    veiculo: { ...VEICULO_VAZIO, ...n.veiculo },
    valor_cents: n.valor_cents,
    desconto_cents: n.desconto_cents,
    troca: n.troca ? { ...TROCA_VAZIA, ...n.troca } : null,
    pagamentos: n.pagamentos ?? [],
    vendedor_user_id: n.vendedor_user_id ?? null,
    comissao_cents: n.comissao_cents,
    observacoes: n.observacoes,
    reserva_expira_em: n.reserva_expira_em ?? null,
  };
}

/** Prazo da reserva: fim do dia escolhido, no fuso de quem vende. */
function prazoDaReserva(dia: string): string | null {
  return dia ? new Date(`${dia}T23:59:59`).toISOString() : null;
}

/** ISO para o valor do input de data (dia local). */
function diaDoPrazo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prazoPadraoDaReserva(): string | null {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return prazoDaReserva(diaDoPrazo(d.toISOString()));
}

/** Vazio vira null — o schema aceita null e o contrato mostra a linha em branco. */
function limpo<T extends Record<string, unknown>>(o: T): T {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o))
    saida[k] = typeof v === "string" && v.trim() === "" ? null : v;
  return saida as T;
}

function corpoDoRascunho(r: Rascunho) {
  return {
    ...r,
    cliente: { ...limpo(r.cliente), nome: r.cliente.nome.trim() },
    veiculo: { ...limpo(r.veiculo), modelo: r.veiculo.modelo.trim() },
    troca: r.troca ? { ...limpo(r.troca), modelo: r.troca.modelo.trim() } : null,
    pagamentos: r.pagamentos.map((p) => limpo(p)),
    observacoes: r.observacoes?.trim() || null,
    // Só a reserva manda prazo: o trigger ignora o campo nas outras modalidades.
    reserva_expira_em: r.modalidade === "reserva" ? (r.reserva_expira_em ?? null) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Campos

function Campo({
  rotulo,
  valor,
  onChange,
  tipo = "text",
  extra,
  placeholder,
  testid,
  campo,
  inputMode,
  invalido,
  lista,
}: {
  rotulo: string;
  valor: string | number | null | undefined;
  onChange: (v: string) => void;
  tipo?: string;
  extra?: string;
  placeholder?: string;
  testid?: string;
  /** Chave `onde.campo` da pendência, para o painel do que falta achar este campo. */
  campo?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  invalido?: boolean;
  lista?: string;
}) {
  return (
    <label className={`block text-xs ${extra ?? ""}`}>
      <span className="text-muted-foreground">{rotulo}</span>
      <input
        type={tipo}
        inputMode={inputMode}
        aria-invalid={invalido || undefined}
        value={valor ?? ""}
        placeholder={placeholder}
        list={lista}
        autoComplete={lista ? "off" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 ${CAMPO} aria-invalid:border-error`}
        data-testid={testid}
        data-campo={campo}
      />
    </label>
  );
}

/** Campo de dinheiro: guarda o texto enquanto digita e devolve centavos. */
function CampoDinheiro({
  rotulo,
  cents,
  onChange,
  extra,
  testid,
  campo,
}: {
  rotulo: string;
  cents: number | null | undefined;
  onChange: (cents: number) => void;
  extra?: string;
  testid?: string;
  campo?: string;
}) {
  const [texto, setTexto] = React.useState(centavosParaMascara(cents));
  const ultimo = React.useRef(cents);
  React.useEffect(() => {
    if (cents !== ultimo.current) {
      ultimo.current = cents;
      setTexto(centavosParaMascara(cents));
    }
  }, [cents]);
  return (
    <label className={`block text-xs ${extra ?? ""}`}>
      <span className="text-muted-foreground">{rotulo}</span>
      <div
        data-campo={campo}
        className="mt-1 flex h-9 items-center rounded-full border border-border/80 bg-surface px-3.5 text-sm shadow-xs transition-colors focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20"
      >
        <span className="mr-1 text-muted-foreground">R$</span>
        <input
          inputMode="decimal"
          value={texto}
          placeholder="0,00"
          onChange={(e) => {
            const mascarado = mascararMoeda(e.target.value);
            setTexto(mascarado);
            const c = mascarado === "" ? 0 : (precoParaCentavos(mascarado) ?? 0);
            ultimo.current = c;
            onChange(c);
          }}
          className="h-full w-full bg-transparent tabular-nums outline-hidden"
          data-testid={testid}
        />
      </div>
    </label>
  );
}

function numeroOuNull(v: string): number | null {
  const d = v.replace(/\D/g, "");
  return d ? Number(d) : null;
}

/** Abaixo de `lg` as colunas empilham e rolam juntas: o rodapé sai da coluna e ancora embaixo da tela. */
function useTelaLarga(largura = 1024): boolean {
  const consulta = `(min-width: ${largura}px)`;
  return React.useSyncExternalStore(
    (aviso) => {
      const mq = window.matchMedia(consulta);
      mq.addEventListener("change", aviso);
      return () => mq.removeEventListener("change", aviso);
    },
    () => window.matchMedia(consulta).matches,
    () => true,
  );
}

function Coluna({
  titulo,
  atalho,
  rodape,
  icone: Icone,
  indice = 0,
  className = "",
  ancora,
  children,
}: {
  className?: string;
  /** Id do setor, para o painel do que falta rolar até ele. */
  ancora?: string;
  titulo: string;
  atalho?: string;
  rodape?: React.ReactNode;
  icone: React.ComponentType<{ className?: string; weight?: "duotone"; "aria-hidden"?: boolean }>;
  indice?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      id={ancora}
      className={`ds-entra flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-surface shadow-xs ${className}`}
      style={{ animationDelay: `${indice * 60}ms` }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icone className="size-4" weight="duotone" aria-hidden />
          </span>
          <h2 className="truncate text-sm font-semibold tracking-tight">
            {titulo}
          </h2>
        </div>
        {atalho ? (
          <kbd className="rounded-full border border-border/80 bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {atalho}
          </kbd>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{children}</div>
      {rodape}
    </section>
  );
}

/** Ficha de veículo (marca, modelo, ano, placa, chassi…), usada na compra e na troca. */
function FichaDoVeiculo<V extends VeiculoDaNegociacao | TrocaDaNegociacao>({
  v,
  onChange,
  prefixo,
  onde,
  falta,
}: {
  v: V;
  onChange: (v: V) => void;
  prefixo: string;
  /** Lugar das pendências desta ficha: o veículo vendido ou o da troca. */
  onde: "veiculo" | "troca";
  falta?: (campo: string) => boolean;
}) {
  const t = useT();
  const set = (campo: keyof VeiculoDaNegociacao, valor: unknown) =>
    onChange({ ...v, [campo]: valor });
  const c = (campo: keyof VeiculoDaNegociacao) => `${onde}.${campo}`;
  const usaCatalogo = onde === "troca";
  const rotuloFiscal = (rotulo: string) => usaCatalogo ? `${rotulo} *` : rotulo;
  const listaMarcas = usaCatalogo ? `${prefixo}-marcas` : undefined;
  const listaModelos = usaCatalogo ? `${prefixo}-modelos` : undefined;
  const sugestoes = React.useMemo(
    () => usaCatalogo && v.marca ? modelosDaMarca(v.marca.trim(), v.modelo, 40) : [],
    [usaCatalogo, v.marca, v.modelo],
  );

  function mudarModelo(valor: string) {
    if (!sugestoes.includes(valor)) {
      set("modelo", valor);
      return;
    }
    const modelo = interpretarModeloFipe(valor);
    onChange({
      ...v,
      modelo: modelo.modelo,
      versao: modelo.versao ?? v.versao,
      motor: modelo.motor ?? v.motor,
      cambio: modelo.cambio ?? v.cambio,
      combustivel: modelo.combustivel ?? v.combustivel,
    });
  }

  const [consultando, setConsultando] = React.useState(false);

  async function aoDigitarPlaca(x: string) {
    const placa = normalizarPlaca(x);
    if (!placaValida(placa)) {
      set("placa", placa);
      return;
    }
    setConsultando(true);
    try {
      const r = await apiClient.get<{ data: DadosDaPlaca }>(`/api/v1/veiculos/consulta-placa?placa=${placa}`);
      const d = r.data;
      onChange({
        ...v,
        placa,
        marca: v.marca || d.marca || v.marca,
        modelo: v.modelo || d.modelo || v.modelo,
        ano_fabricacao: v.ano_fabricacao ?? d.ano_fabricacao,
        ano_modelo: v.ano_modelo ?? d.ano_modelo,
        cor: v.cor || d.cor || v.cor,
      });
      toast.success(t("Dados da placa preenchidos"));
    } catch (e) {
      set("placa", placa);
      showApiError(e);
    } finally {
      setConsultando(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Campo
        rotulo={rotuloFiscal(t("Placa"))}
        valor={v.placa}
        onChange={aoDigitarPlaca}
        campo={c("placa")}
        invalido={falta?.(c("placa"))}
        testid={`${prefixo}-placa`}
        extra={consultando ? "opacity-60" : undefined}
      />
      <Campo
        rotulo={rotuloFiscal(t("Marca"))}
        valor={v.marca}
        onChange={(x) => set("marca", x)}
        campo={c("marca")}
        invalido={falta?.(c("marca"))}
        lista={listaMarcas}
      />
      <Campo
        rotulo={rotuloFiscal(t("Modelo"))}
        valor={v.modelo}
        onChange={mudarModelo}
        campo={c("modelo")}
        invalido={falta?.(c("modelo"))}
        testid={`${prefixo}-modelo`}
        lista={listaModelos}
      />
      {usaCatalogo && (
        <>
          <datalist id={listaMarcas}>
            {marcasDoCatalogo().map((marca) => <option key={marca} value={marca} />)}
          </datalist>
          <datalist id={listaModelos}>
            {sugestoes.map((modelo) => <option key={modelo} value={modelo} />)}
          </datalist>
        </>
      )}
      <Campo
        rotulo={t("Versão")}
        valor={v.versao}
        onChange={(x) => set("versao", x)}
        campo={c("versao")}
        extra="col-span-2"
      />
      <Campo
        rotulo={rotuloFiscal(t("Ano fab."))}
        valor={v.ano_fabricacao}
        onChange={(x) => set("ano_fabricacao", numeroOuNull(x))}
        campo={c("ano_fabricacao")}
        invalido={falta?.(c("ano_fabricacao"))}
      />
      <Campo
        rotulo={rotuloFiscal(t("Ano modelo"))}
        valor={v.ano_modelo}
        onChange={(x) => set("ano_modelo", numeroOuNull(x))}
        campo={c("ano_modelo")}
        invalido={falta?.(c("ano_modelo"))}
      />
      <Campo
        rotulo={rotuloFiscal(t("Km"))}
        valor={v.km}
        onChange={(x) => set("km", numeroOuNull(x))}
        campo={c("km")}
        invalido={falta?.(c("km")) || (onde === "troca" && falta?.("contrato.recebimento_troca_km"))}
      />
      <Campo
        rotulo={rotuloFiscal(t("Cor"))}
        valor={v.cor}
        onChange={(x) => set("cor", x)}
        campo={c("cor")}
        invalido={falta?.(c("cor"))}
      />
      <Campo
        rotulo={t("Combustível")}
        valor={v.combustivel}
        onChange={(x) => set("combustivel", x)}
        campo={c("combustivel")}
      />
      {usaCatalogo && (
        <Campo
          rotulo={t("Motor")}
          valor={v.motor}
          onChange={(x) => set("motor", x)}
          campo={c("motor")}
        />
      )}
      <label className="text-xs">
        Condição
        <select
          data-campo={c("condicao")}
          className={CAMPO}
          value={v.condicao ?? ""}
          onChange={(e) => set("condicao", e.target.value || null)}
        >
          <option value="">Selecione</option>
          <option value="novo">Novo</option>
          <option value="usado">Usado</option>
        </select>
      </label>
      <div className="col-span-2" data-campo={c("regularizacao")}>
        <EditorRegularizacao
          valor={v.regularizacao ?? []}
          onChange={(valor) => set("regularizacao", valor)}
        />
      </div>
      <Campo
        rotulo={t("Câmbio")}
        valor={v.cambio}
        onChange={(x) => set("cambio", x)}
        campo={c("cambio")}
      />
      <Campo
        rotulo={rotuloFiscal(t("Renavam"))}
        valor={v.renavam}
        onChange={(x) => set("renavam", x)}
        campo={c("renavam")}
        invalido={falta?.(c("renavam"))}
      />
      <Campo
        rotulo={rotuloFiscal(t("Chassi"))}
        valor={v.chassi}
        onChange={(x) => set("chassi", x.toUpperCase())}
        campo={c("chassi")}
        invalido={falta?.(c("chassi"))}
        extra="col-span-2"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coluna 1 — cliente

function ColunaCliente({
  r,
  setR,
  travado,
  faltando,
  pendenciasCom,
}: {
  r: Rascunho;
  setR: (f: (r: Rascunho) => Rascunho) => void;
  travado: boolean;
  faltando: readonly FaltaParaConcluir[];
  /** Recalcula o que falta com outro cliente: o cadastro mostra a lista ao vivo. */
  pendenciasCom: (cliente: ClienteDaNegociacao) => readonly FaltaParaConcluir[];
}) {
  const t = useT();
  const [busca, setBusca] = React.useState("");
  const [achados, setAchados] = React.useState<ContatoEncontrado[]>([]);
  const [cadastroAberto, setCadastroAberto] = React.useState(false);
  const [editandoCadastro, setEditandoCadastro] = React.useState(false);
  /** Campo a destacar quando o cadastro abre a partir de uma pendência. */
  const [campoDoCadastro, setCampoDoCadastro] = React.useState<string | undefined>();
  const [carregandoCliente, setCarregandoCliente] = React.useState(false);
  const escolhaAtual = React.useRef(0);
  const botaoEditar = React.useRef<HTMLButtonElement>(null);
  const campoDeBusca = React.useRef<HTMLInputElement>(null);
  const botaoMais = React.useRef<HTMLButtonElement>(null);
  const c = r.cliente;
  const identificado = Boolean(r.contact_id) || c.nome.trim().length > 0;
  const docPreenchido = (c.documento ?? "").replace(/\D/g, "").length > 0;

  React.useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) return;
    const h = setTimeout(async () => {
      try {
        const res = await apiClient.get<{ data: ContatoEncontrado[] }>(
          `/api/v1/contacts?search=${encodeURIComponent(termo)}&limit=8`,
        );
        setAchados(res.data ?? []);
      } catch {
        setAchados([]);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [busca]);

  // F2 leva ao campo de busca de cliente (o atalho que a coluna já anunciava).
  React.useEffect(() => {
    if (travado || cadastroAberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "F2") return;
      e.preventDefault();
      campoDeBusca.current?.focus();
      campoDeBusca.current?.select();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [travado, cadastroAberto]);

  async function escolher(ct: ContatoEncontrado) {
    const escolha = ++escolhaAtual.current;
    setCarregandoCliente(true);
    try {
      const res = await apiClient.get<{ data: ContatoDoCadastro }>(`/api/v1/contacts/${ct.id}`, {
        headers: {
          "X-Decrypt-Purpose": "Preencher o cadastro do cliente na negociação de veículo",
        },
      });
      if (escolha !== escolhaAtual.current) return;
      setR((x) => ({ ...x, contact_id: ct.id, cliente: clienteDoContato(res.data) }));
      setBusca("");
      setAchados([]);
    } catch (erro) {
      showApiError(erro);
    } finally {
      if (escolha === escolhaAtual.current) setCarregandoCliente(false);
    }
  }

  return (
    <Coluna
      atalho="F2"
      ancora="pdv-setor-comprador"
      icone={UserCircle}
      indice={0}
      titulo={r.tipo === "venda" ? t("Cliente (comprador)") : t("Cliente (vendedor)")}
    >
      <fieldset disabled={travado || carregandoCliente} className="min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlass
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              ref={campoDeBusca}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t("Buscar cliente (F2)")}
              aria-label={t("Buscar contato por nome ou telefone…")}
              className={`${CAMPO} pl-9`}
              data-testid="pdv-busca-contato"
            />
            {busca.trim().length >= 2 && achados.length > 0 ? (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border/60 bg-surface p-1 shadow-md">
                {achados.map((ct) => (
                  <li key={ct.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                      onClick={() => escolher(ct)}
                    >
                      <div className="font-medium">{rotuloDoContato(ct, t)}</div>
                      <div className="text-xs text-muted-foreground">
                        {ct.phone_number ?? ct.email ?? ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            ref={botaoMais}
            type="button"
            onClick={() => {
              setEditandoCadastro(false);
              setCadastroAberto(true);
            }}
            aria-label={t("Cadastrar cliente")}
            title={t("Cadastrar cliente")}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xs transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-hidden disabled:opacity-60"
            data-testid="pdv-cliente-novo"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>

        {identificado ? (
          <div
            className="space-y-2 rounded-xl border border-border/60 bg-accent-soft/40 p-3 text-sm"
            data-testid="pdv-cliente-resumo"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
              <div className="max-w-full min-w-0 flex-1 basis-40">
                <div className="flex items-center gap-1.5 font-medium">
                  <CheckCircle
                    className="size-4 shrink-0 text-accent"
                    weight="duotone"
                    aria-hidden
                  />
                  <span className="truncate" data-testid="pdv-cliente-nome">
                    {c.nome || t("Cliente")}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[c.documento, c.telefone, c.email].filter(Boolean).join(" · ") ||
                    t("Sem documento ou contato informado.")}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
                <button
                  type="button"
                  ref={botaoEditar}
                  className="text-accent underline-offset-2 hover:underline"
                  onClick={() => {
                    setEditandoCadastro(true);
                    setCadastroAberto(true);
                  }}
                  data-testid="pdv-editar-cliente"
                >
                  {t("Editar cadastro")}
                </button>
                <button
                  type="button"
                  className="text-accent underline-offset-2 hover:underline"
                  onClick={() => {
                    campoDeBusca.current?.focus();
                  }}
                >
                  {t("Trocar")}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setR((x) => ({ ...x, contact_id: null, cliente: { nome: "" } }))}
                >
                  {t("Remover")}
                </button>
              </div>
            </div>
            {!docPreenchido || !documentoValido(c.documento) ? (
              <p className="text-xs text-muted-foreground">
                {t("Complete o CPF ou CNPJ em Editar cadastro para concluir a negociação.")}
              </p>
            ) : null}
          </div>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted px-3 py-1 text-xs text-muted-foreground"
            data-testid="pdv-sem-identificacao"
          >
            <UserCircle className="size-3.5" aria-hidden />
            {t("Sem identificação")}
          </span>
        )}
      </fieldset>

      <OQueFalta
        faltando={faltando}
        onCliente={(campo) => {
          setCampoDoCadastro(campo);
          setEditandoCadastro(identificado);
          setCadastroAberto(true);
        }}
      />

      <CadastroClienteModal
        open={cadastroAberto}
        onOpenChange={(aberto) => {
          setCadastroAberto(aberto);
          if (!aberto) setCampoDoCadastro(undefined);
        }}
        campoInicial={campoDoCadastro}
        onIrParaFora={(f) => {
          setCadastroAberto(false);
          setCampoDoCadastro(undefined);
          // Depois de o modal devolver o foco, para a rolagem não brigar com ele.
          window.setTimeout(() => irAoCampo(f), 250);
        }}
        retornoDoFoco={editandoCadastro ? botaoEditar : botaoMais}
        inicial={editandoCadastro ? c : undefined}
        contactId={editandoCadastro ? r.contact_id : undefined}
        onSalvo={(cliente, contactId) => setR((x) => ({ ...x, contact_id: contactId, cliente }))}
        pendencias={pendenciasCom}
      />
    </Coluna>
  );
}

// ---------------------------------------------------------------------------
// Coluna 2 — veículo

function ColunaVeiculo({
  r,
  setR,
  estoque,
  urlsDasCapas,
  travado,
}: {
  r: Rascunho;
  setR: (f: (r: Rascunho) => Rascunho) => void;
  estoque: VeiculoDoPdv[];
  urlsDasCapas: Record<string, string>;
  travado: boolean;
}) {
  const t = useT();
  const [busca, setBusca] = React.useState("");
  const escolhido = estoque.find((v) => v.id === r.veiculo_id) ?? null;

  function escolher(v: VeiculoDoPdv) {
    setR((x) => ({
      ...x,
      veiculo_id: v.id,
      veiculo: {
        codigo: v.codigo,
        marca: v.marca,
        modelo: v.modelo,
        versao: v.versao,
        ano_fabricacao: v.ano_fabricacao,
        ano_modelo: v.ano_modelo,
        km: v.km,
        cor: v.cor,
        combustivel: v.combustivel,
        cambio: v.cambio,
        motor: v.motor,
        placa: v.placa,
        chassi: v.chassi,
        renavam: v.renavam,
        condicao: v.condicao,
        regularizacao: v.regularizacao ?? [],
      },
      valor_cents: v.preco_cents,
    }));
    setBusca("");
  }

  if (r.tipo === "compra") {
    return (
      <Coluna
        ancora="pdv-setor-veiculo"
        icone={Storefront}
        indice={1}
        titulo={t("Veículo comprado")}
      >
        <fieldset disabled={travado} className="space-y-3">
          <FichaDoVeiculo
            v={r.veiculo}
            onChange={(v) => setR((x) => ({ ...x, veiculo: v }))}
            prefixo="pdv-compra"
            onde="veiculo"
          />
          <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
            <CampoDinheiro
              rotulo={t("Valor pago ao cliente")}
              cents={r.valor_cents}
              onChange={(c) => setR((x) => ({ ...x, valor_cents: c }))}
              testid="pdv-valor"
            />
            <CampoDinheiro
              rotulo={t("Preço de anúncio (opcional)")}
              cents={r.veiculo.preco_venda_cents}
              onChange={(c) =>
                setR((x) => ({ ...x, veiculo: { ...x.veiculo, preco_venda_cents: c || null } }))
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Ao concluir, o veículo entra no estoque. Sem preço de anúncio ele fica como reservado.",
            )}
          </p>
        </fieldset>
      </Coluna>
    );
  }

  const termo = busca.trim().toLowerCase();
  const lista = estoque
    .filter((v) => v.status === "disponivel" || v.id === r.veiculo_id)
    .filter((v) =>
      !termo
        ? true
        : [tituloDoVeiculo(v), v.codigo, v.placa ?? "", v.placa_final ?? "", v.cor ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(termo),
    );
  const capa = (v: VeiculoDoPdv) => {
    const c = (v.fotos ?? []).find((f) => urlsDasCapas[f]);
    return c ? urlsDasCapas[c] : null;
  };

  return (
    <Coluna
      ancora="pdv-setor-veiculo"
      atalho="F3"
      icone={Storefront}
      indice={1}
      titulo={t("Veículos")}
    >
      <fieldset disabled={travado} className="space-y-3">
        {escolhido ? (
          <div
            className="ds-entra overflow-hidden rounded-xl border border-border/60 bg-surface shadow-xs"
            data-testid="pdv-veiculo-escolhido"
          >
            <div className="aspect-[16/9] bg-muted">
              {capa(escolhido) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={capa(escolhido)!}
                  alt={tituloDoVeiculo(escolhido)}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="space-y-1 p-3 text-sm">
              <div className="font-medium">{tituloDoVeiculo(escolhido)}</div>
              <div className="text-xs text-muted-foreground">
                {[
                  escolhido.codigo,
                  escolhido.km != null ? formatarKm(escolhido.km) : null,
                  escolhido.cor,
                  escolhido.placa,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("Preço de tabela")}:{" "}
                <span className="font-semibold text-accent tabular-nums">
                  {formatarPreco(escolhido.preco_cents, escolhido.moeda)}
                </span>
              </div>
              {!travado ? (
                <button
                  type="button"
                  className="mt-1 rounded-full px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
                  onClick={() =>
                    setR((x) => ({ ...x, veiculo_id: null, veiculo: { ...VEICULO_VAZIO } }))
                  }
                >
                  {t("Trocar de veículo")}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <MagnifyingGlass
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={t("Buscar no estoque por modelo, código ou placa…")}
                className={`${CAMPO} pl-9`}
                data-testid="pdv-busca-veiculo"
                data-campo="veiculo.veiculo_id"
              />
            </div>
            {lista.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/80 p-6 text-center text-sm text-muted-foreground">
                <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Storefront className="size-6" weight="duotone" aria-hidden />
                </span>
                {t("Nenhum veículo disponível no estoque.")}
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {lista.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => escolher(v)}
                      className="ds-elevavel flex h-full w-full flex-col overflow-hidden rounded-xl border border-border/60 bg-surface text-left shadow-xs transition-colors hover:border-accent/50"
                      data-testid={`pdv-estoque-${v.codigo}`}
                    >
                      <div className="aspect-[16/9] w-full bg-muted">
                        {capa(v) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={capa(v)!} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5 p-2 text-sm">
                        <div className="truncate font-medium">{tituloDoVeiculo(v)}</div>
                        <div className="text-xs text-muted-foreground">
                          {[v.codigo, v.km != null ? formatarKm(v.km) : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        <div className="font-semibold text-accent tabular-nums">
                          {formatarPreco(v.preco_cents, v.moeda)}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {r.veiculo_id ? (
          <details className="space-y-3 rounded-xl border p-3">
            <summary className="cursor-pointer text-sm">Revisar veículo no contrato</summary>
            <p className="text-xs text-muted-foreground">
              Estas alterações valem para esta negociação.
            </p>
            <FichaDoVeiculo
              v={r.veiculo}
              onChange={(v) => setR((x) => ({ ...x, veiculo: v }))}
              prefixo="pdv-venda"
              onde="veiculo"
            />
          </details>
        ) : null}
        <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
          <CampoDinheiro
            rotulo={t("Preço de venda")}
            cents={r.valor_cents}
            onChange={(c) => setR((x) => ({ ...x, valor_cents: c }))}
            testid="pdv-valor"
            campo="veiculo.valor_cents"
          />
          <CampoDinheiro
            rotulo={t("Desconto")}
            cents={r.desconto_cents}
            onChange={(c) => setR((x) => ({ ...x, desconto_cents: c }))}
          />
        </div>

      </fieldset>
    </Coluna>
  );
}

// ---------------------------------------------------------------------------
// Coluna 3 — pagamento

interface VendedorDaOrg {
  user_id: string;
  role: string;
  full_name: string | null;
}

/** Seção do painel: rótulo pequeno em cima, conteúdo embaixo. */
function Secao({
  titulo,
  testid,
  children,
}: {
  titulo: string;
  testid?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2" data-testid={testid}>
      {titulo && <h3 className="text-sm font-normal text-muted-foreground">{titulo}</h3>}
      {children}
    </section>
  );
}

/** Tela final: o contrato da negociação, dentro do PDV. */
function TelaDoContrato({
  negociacaoId,
  concluida,
  onVoltar,
  onNova,
}: {
  negociacaoId: string;
  concluida: boolean;
  onVoltar: () => void;
  onNova: () => void;
}) {
  const t = useT();
  const url = `/api/v1/pdv/negociacoes/${negociacaoId}/contrato`;
  const botao =
    "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" data-testid="pdv-tela-contrato">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onVoltar}
          className={`${botao} text-muted-foreground hover:bg-accent-soft hover:text-accent`}
          data-testid="pdv-contrato-voltar"
        >
          <CaretLeft className="size-3.5" aria-hidden />
          {t("Voltar à negociação")}
        </button>
        <h2 className="text-sm font-semibold">
          {concluida ? t("Contrato de compra e venda") : t("Prévia do contrato")}
        </h2>
        <div className="ml-auto flex flex-wrap gap-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={`${botao} text-accent hover:bg-accent-soft`}
          >
            <FileText className="size-3.5" aria-hidden />
            {t("Abrir para imprimir")}
          </a>
          <a href={url} download className={`${botao} text-accent hover:bg-accent-soft`}>
            {t("Baixar PDF")}
          </a>
          {concluida ? (
            <button
              type="button"
              onClick={onNova}
              className={`${botao} bg-accent text-accent-foreground hover:bg-accent/90`}
              data-testid="pdv-contrato-nova"
            >
              <Plus className="size-3.5" aria-hidden />
              {t("Nova negociação")}
            </button>
          ) : null}
        </div>
      </div>
      <iframe
        src={url}
        title={t("Contrato")}
        className="min-h-[60vh] w-full flex-1 rounded-xl border border-border/60 bg-white"
        data-testid="pdv-contrato-iframe"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// O que falta para concluir

/** O rascunho visto como negociação, para as mesmas regras do contrato que o servidor aplica. */
function comoNegociacao(r: Rascunho, aberta: Negociacao | null): Negociacao {
  return {
    ...r,
    contrato: r.contrato ?? null,
    id: aberta?.id ?? "",
    numero: aberta?.numero ?? 0,
    status: "rascunho",
    contact_id: r.contact_id ?? null,
    veiculo_id: r.veiculo_id ?? null,
    desconto_cents: r.desconto_cents ?? 0,
    troca_veiculo_id: aberta?.troca_veiculo_id ?? null,
    vendedor_user_id: r.vendedor_user_id ?? null,
    comissao_cents: r.comissao_cents ?? null,
    observacoes: r.observacoes ?? null,
    moeda: aberta?.moeda ?? "BRL",
    concluida_em: null,
    cancelada_em: null,
    created_by: aberta?.created_by ?? null,
    created_at: aberta?.created_at ?? "",
    updated_at: aberta?.updated_at ?? "",
  };
}

/** Chaves "lugar.campo" que o editor do contrato marca como pendentes. */
function chavesDoQueFalta(faltando: readonly FaltaParaConcluir[]): ReadonlySet<string> {
  return new Set(faltando.filter((f) => f.campo).map((f) => `${f.onde}.${f.campo}`));
}

const ORDEM_DOS_SETORES: SetorDoPdv[] = [
  "Comprador",
  "Veículo",
  "Troca",
  "Pagamento",
  "Loja",
  "Entrega e transferência",
  "Contrato",
];

const ANCORA_DO_SETOR: Record<SetorDoPdv, string> = {
  Comprador: "pdv-setor-comprador",
  Veículo: "pdv-setor-veiculo",
  Troca: "pdv-setor-troca",
  Pagamento: "pdv-setor-pagamento",
  Loja: "pdv-setor-loja",
  "Entrega e transferência": "pdv-setor-entrega",
  Contrato: "pdv-setor-contrato",
};

/** Etapa do celular em que cada setor aparece. */
const COLUNA_DO_SETOR: Record<SetorDoPdv, number> = {
  Comprador: 0,
  Veículo: 1,
  Troca: 3,
  Pagamento: 3,
  Loja: 2,
  "Entrega e transferência": 2,
  Contrato: 2,
};
const EVENTO_ABRIR_COLUNA = "pdv:abrir-coluna";

function irParaOSetor(setor: SetorDoPdv) {
  // No celular a coluna do setor pode estar recolhida: abre antes de rolar.
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_COLUNA, { detail: COLUNA_DO_SETOR[setor] }));
  // Timeout (não rAF): o React precisa renderizar a coluna recém-aberta antes de medir a âncora,
  // e rAF não roda com a aba em segundo plano.
  window.setTimeout(() => {
    const el = document.getElementById(ANCORA_DO_SETOR[setor]);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    // Instantâneo: o scroll suave é cancelado pelo reflow da coluna/details recém-abertos.
    el.scrollIntoView({ block: "start" });
    const campo = el.querySelector<HTMLElement>('[aria-invalid="true"]');
    campo?.focus({ preventScroll: true });
  }, 50);
}

/** Leva ao campo da pendência e o deixa vermelho; sem campo achado, fica no setor. */
function irAoCampo(f: FaltaParaConcluir) {
  irParaOSetor(f.setor);
  // Depois de abrir o setor: o campo pode estar dentro de um <details> fechado.
  window.setTimeout(() => {
    const ancora = document.getElementById(ANCORA_DO_SETOR[f.setor]);
    const chave = f.campo ? `${f.onde}.${f.campo}` : undefined;
    // A chave é procurada na página inteira (os dados da loja moram fora do setor); sem
    // campo dela na tela, o destaque fica no setor da pendência, nunca em outro.
    const naPagina = chave ? document.querySelector(`[data-campo="${CSS.escape(chave)}"]`) : null;
    const alvo = naPagina ? acharCampo(document, chave) : ancora ? acharCampo(ancora) : null;
    if (alvo) destacarCampo(alvo);
  }, 60);
}

/** Lista o que impede concluir, agrupada pelo setor onde se preenche. */
function OQueFalta({
  faltando,
  onCliente,
}: {
  faltando: readonly FaltaParaConcluir[];
  /** Pendência do comprador: abre o cadastro já no campo. */
  onCliente?: (campo?: string) => void;
}) {
  const t = useT();
  if (faltando.length === 0) return null;
  const grupos = ORDEM_DOS_SETORES.map((setor) => ({
    setor,
    itens: faltando.filter((f) => f.setor === setor),
  })).filter((g) => g.itens.length > 0);
  const ir = (f: FaltaParaConcluir) =>
    f.onde === "cliente" && onCliente ? onCliente(f.campo) : irAoCampo(f);
  return (
    <div
      className="min-w-0 space-y-2 rounded-xl border border-warning-fg/30 bg-warning-bg/40 p-3 text-xs break-words"
      data-testid="pdv-o-que-falta"
    >
      <p className="font-semibold text-warning-fg">
        {t("O que falta para concluir")} ({faltando.length})
      </p>
      <ul className="space-y-2">
        {grupos.map((g) => (
          <li
            key={g.setor}
            data-testid={`pdv-falta-${ANCORA_DO_SETOR[g.setor].replace("pdv-setor-", "")}`}
          >
            <button
              type="button"
              onClick={() => ir(g.itens[0]!)}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              {t(g.setor)}
            </button>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {g.itens.map((f) => (
                <li key={f.mensagem}>
                  <button
                    type="button"
                    onClick={() => ir(f)}
                    className="inline text-left underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {t(f.mensagem)}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

const CAMPOS_DO_REMETENTE = [
  ["nome", "Nome completo", "text"],
  ["documento", "CPF", "text"],
  ["cep", "CEP", "text"],
  ["endereco", "Rua", "text"],
  ["numero", "Número (ou S/N)", "text"],
  ["complemento", "Complemento", "text"],
  ["bairro", "Bairro", "text"],
  ["cidade", "Município", "text"],
  ["uf", "UF", "text"],
  ["codigo_municipio", "Código IBGE do município", "text"],
  ["email", "E-mail", "email"],
] as const;

function diaDoRecebimento(valor?: string | null): string {
  const data = (valor ?? "").trim();
  const antiga = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(data);
  return antiga ? `${antiga[3]}-${antiga[2]}-${antiga[1]}` : data.slice(0, 10);
}

function FormularioDaTroca({
  troca,
  cliente,
  contrato,
  setR,
  faltando,
  travado,
}: {
  troca: TrocaDaNegociacao;
  cliente: ClienteDaNegociacao;
  contrato?: DadosDoContrato | null;
  setR: (f: (r: Rascunho) => Rascunho) => void;
  faltando: readonly FaltaParaConcluir[];
  travado: boolean;
}) {
  const t = useT();
  const remetente = troca.remetente ?? cliente;
  const cep = soDigitos(remetente.cep);
  const codigo = remetente.codigo_municipio;
  const usaComprador = troca.remetente == null;

  React.useEffect(() => {
    if (travado || cep.length !== 8 || codigo) return;
    let ativo = true;
    void codigoIbgePorCep(cep).then((codigo_municipio) => {
      if (!ativo || !codigo_municipio) return;
      setR((x) => {
        if (!x.troca || (x.troca.remetente == null) !== usaComprador) return x;
        const pessoa = x.troca.remetente ?? x.cliente;
        if (soDigitos(pessoa.cep) !== cep || pessoa.codigo_municipio) return x;
        return x.troca.remetente
          ? { ...x, troca: { ...x.troca, remetente: { ...x.troca.remetente, codigo_municipio } } }
          : { ...x, cliente: { ...x.cliente, codigo_municipio } };
      });
    });
    return () => { ativo = false; };
  }, [cep, codigo, setR, travado, usaComprador]);

  function mudarTroca(alteracao: Partial<TrocaDaNegociacao>) {
    setR((x) => x.troca ? { ...x, troca: { ...x.troca, ...alteracao } } : x);
  }

  function mudarRemetente(campo: (typeof CAMPOS_DO_REMETENTE)[number][0], valor: string) {
    const normalizado =
      campo === "codigo_municipio" ? soDigitos(valor).slice(0, 7) :
      campo === "uf" ? valor.toUpperCase().slice(0, 2) : valor;
    setR((x) => {
      if (!x.troca) return x;
      const pessoa = x.troca.remetente ?? x.cliente;
      const mudouLocal =
        (campo === "cep" && soDigitos(pessoa.cep) !== soDigitos(normalizado)) ||
        ((campo === "cidade" || campo === "uf") && pessoa[campo] !== normalizado);
      const atualizada = {
        ...pessoa,
        [campo]: normalizado,
        ...(mudouLocal ? { codigo_municipio: null } : {}),
      };
      return x.troca.remetente
        ? { ...x, troca: { ...x.troca, remetente: atualizada } }
        : { ...x, cliente: atualizada };
    });
  }

  function mudarRecebimento(alteracao: Partial<DadosDoContrato>) {
    setR((x) => x.contrato ? { ...x, contrato: { ...x.contrato, ...alteracao } } : x);
  }

  const falta = (campo: string) => faltando.some((f) => `${f.onde}.${f.campo}` === campo);

  return (
    <div id="pdv-setor-troca" className="space-y-4 rounded-xl border border-border/60 bg-muted/50 p-3">
      <h4 className="text-sm font-medium">{t("Dados para a NF-e de entrada")}</h4>
      <FichaDoVeiculo
        v={troca}
        onChange={mudarTroca}
        prefixo="pdv-troca"
        onde="troca"
        falta={falta}
      />
      <Campo
        rotulo={`${t("NCM do veículo")} *`}
        valor={troca.ncm}
        onChange={(valor) => mudarTroca({ ncm: soDigitos(valor).slice(0, 8) })}
        inputMode="numeric"
        campo="troca.ncm"
        invalido={falta("troca.ncm")}
      />
      <div className="grid grid-cols-2 gap-2">
        <CampoDinheiro
          rotulo={`${t("Valor avaliado")} *`}
          cents={troca.valor_cents}
          onChange={(valor_cents) => mudarTroca({ valor_cents })}
          testid="pdv-troca-valor"
          campo="troca.valor_cents"
        />
        <CampoDinheiro
          rotulo={t("Saldo a quitar (financiamento)")}
          cents={troca.quitacao_cents}
          onChange={(quitacao_cents) => mudarTroca({ quitacao_cents })}
        />
        {troca.quitacao_cents > 0 ? (
          <Campo
            rotulo={t("Credor do financiamento da troca *")}
            valor={troca.gravame_credor}
            onChange={(gravame_credor) => mudarTroca({ gravame_credor })}
            extra="col-span-2"
            testid="pdv-troca-gravame"
            campo="troca.gravame_credor"
          />
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={troca.entra_no_estoque}
          onChange={(e) => mudarTroca({ entra_no_estoque: e.target.checked })}
          className="size-4 accent-accent"
        />
        {t("Colocar a troca no estoque ao concluir (como reservado)")}
      </label>
      {contrato && (
        <div className="grid grid-cols-2 gap-2">
          <Campo
            rotulo={`${t("Data prevista de recebimento")} *`}
            tipo="date"
            valor={diaDoRecebimento(contrato.recebimento_troca_em)}
            onChange={(recebimento_troca_em) => mudarRecebimento({ recebimento_troca_em })}
            campo="contrato.recebimento_troca_em"
            invalido={falta("contrato.recebimento_troca_em")}
          />
          <Campo
            rotulo={t("Hora do recebimento da troca")}
            tipo="time"
            valor={contrato.recebimento_troca_hora}
            onChange={(recebimento_troca_hora) => mudarRecebimento({ recebimento_troca_hora })}
            campo="contrato.recebimento_troca_hora"
          />
        </div>
      )}
      <div className="space-y-2 border-t border-border/60 pt-3">
        <h5 className="text-xs font-medium">{t("Remetente do veículo")}</h5>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={usaComprador}
            onChange={(e) => mudarTroca({ remetente: e.target.checked ? null : { nome: "" } })}
            className="size-4 accent-accent"
          />
          {t("Usar dados do comprador")}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {CAMPOS_DO_REMETENTE.map(([campo, rotulo, tipo]) => (
            <Campo
              key={campo}
              rotulo={campo === "email" || campo === "complemento" ? t(rotulo) : `${t(rotulo)} *`}
              tipo={tipo}
              valor={remetente[campo]}
              onChange={(valor) => mudarRemetente(campo, valor)}
              extra={campo === "nome" || campo === "endereco" || campo === "email" ? "col-span-2" : undefined}
              campo={`troca.remetente.${campo}`}
              invalido={falta(`troca.remetente.${campo}`) || (usaComprador && falta(`cliente.${campo}`))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ColunaPagamento({
  r,
  setR,
  travado,
  faltando,
  rodape,
  usuarioId,
  taxasDeCartao,
  dadosDoContrato,
  indice,
}: {
  dadosDoContrato?: React.ReactNode;
  indice: number;
  r: Rascunho;
  setR: (f: (r: Rascunho) => Rascunho) => void;
  travado: boolean;
  /** Tudo que impede concluir, por setor (caixa + contrato). */
  faltando: FaltaParaConcluir[];
  /** Nulo em tela pequena: lá o rodapé fica fora da coluna, preso embaixo da tela. */
  rodape: React.ReactNode;
  usuarioId: string;
  taxasDeCartao: TaxasDeCartao;
  podeTrocarTipo: boolean;
  onTrocarTipo: (tipo: TipoDeNegociacao) => void;
}) {
  const t = useT();
  const resumo = resumoDaNegociacao(r);
  const formas = FORMAS_POR_TIPO[r.tipo];
  const venda = r.tipo === "venda";
  const [contas, setContas] = React.useState<{ id: string; name: string }[]>([]);
  const [erroContas, setErroContas] = React.useState(false);
  React.useEffect(() => {
    let ativo = true;
    apiClient
      .get<{ data: { id: string; name: string }[] }>("/api/v1/financeiro/catalogo/contas")
      .then((r) => {
        if (ativo) setContas(r.data);
      })
      .catch(() => {
        if (ativo) setErroContas(true);
      });
    return () => {
      ativo = false;
    };
  }, []);
  const [vendedores, setVendedores] = React.useState<VendedorDaOrg[] | null>(null);

  React.useEffect(() => {
    let vivo = true;
    apiClient
      .get<{ data: VendedorDaOrg[] }>("/api/v1/team/assignable")
      .then((res) => vivo && setVendedores(res?.data ?? []))
      .catch(() => vivo && setVendedores([]));
    return () => {
      vivo = false;
    };
  }, []);

  const perfilPadrao = taxasDeCartao.perfis[taxasDeCartao.padrao ?? 0];

  function aplicarPerfil(p: PagamentoDaNegociacao, perfil: ReturnType<typeof perfilDoCartao>): PagamentoDaNegociacao {
    const debito = p.forma === "cartao_debito";
    const parcelas = debito || (perfil && p.parcelas > perfil.credito.length) ? 1 : p.parcelas;
    const taxa = debito ? perfil?.debito : perfil?.credito[parcelas - 1];
    return {
      ...p,
      parcelas,
      bandeira: perfil?.bandeira || undefined,
      taxa_cartao_bps: taxa,
      repasse_cartao: p.repasse_cartao ?? (taxa === undefined ? undefined : "repassar"),
    };
  }

  function adicionar(forma: FormaDePagamento) {
    const valor = Math.max(0, resumo.saldo_cents);
    const pagamento: PagamentoDaNegociacao = { forma, valor_cents: valor, parcelas: 1 };
    const novo = forma === "cartao_credito" || forma === "cartao_debito"
      ? aplicarPerfil({ ...pagamento, perfil_cartao_id: perfilPadrao?.id }, perfilPadrao)
      : pagamento;
    setR((x) => ({ ...x, pagamentos: [...x.pagamentos, novo] }));
  }
  function mudar(i: number, p: Partial<PagamentoDaNegociacao>) {
    setR((x) => ({
      ...x,
      pagamentos: x.pagamentos.map((atual, j) => {
        if (j !== i) return atual;
        const novo = { ...atual, ...p };
        if (novo.forma === "cartao_credito" || novo.forma === "cartao_debito") {
          if (atual.forma !== "cartao_credito" && atual.forma !== "cartao_debito") {
            novo.perfil_cartao_id = perfilPadrao?.id;
            novo.primeiro_vencimento = null;
          }
          const perfil = perfilDoCartao(taxasDeCartao, novo.perfil_cartao_id);
          if (
            novo.forma !== atual.forma ||
            novo.perfil_cartao_id !== atual.perfil_cartao_id ||
            (perfil && novo.parcelas !== atual.parcelas)
          ) {
            return aplicarPerfil(novo, perfil);
          }
          return novo;
        }
        novo.perfil_cartao_id = undefined;
        if (atual.repasse_cartao || atual.taxa_cartao_bps !== undefined) {
          novo.repasse_cartao = undefined;
          novo.taxa_cartao_bps = undefined;
        }
        // Valor da parcela acompanha valor/parcelas, até o vendedor digitar outro (juros).
        if (
          ("valor_cents" in p || "parcelas" in p) &&
          FORMAS_PARCELADAS.includes(novo.forma) &&
          novo.parcelas > 1
        ) {
          novo.valor_parcela_cents = Math.round(novo.valor_cents / novo.parcelas);
        }
        return novo;
      }),
    }));
  }

  function cartaoDoPagamento(p: PagamentoDaNegociacao, i: number) {
    const parcelada = FORMAS_PARCELADAS.includes(p.forma);
    const comBanco = FORMAS_COM_BANCO.includes(p.forma);
    const cartao = p.forma === "cartao_credito" || p.forma === "cartao_debito";
    const formasDisponiveis: readonly FormaDePagamento[] = cartao
      ? ["cartao_debito", "cartao_credito"]
      : formas;
    const perfil = perfilDoCartao(taxasDeCartao, p.perfil_cartao_id);
    const modo = p.repasse_cartao ?? "repassar";
    const valores = p.taxa_cartao_bps !== undefined && cartao
      ? calcularCartao(p.valor_cents, p.taxa_cartao_bps, modo, p.parcelas)
      : null;
    const rotuloDaConta = t("Conta do pagamento");
    const conta = seletorConta(
      p.conta_id ?? "",
      (v) => mudar(i, { conta_id: v }),
      rotuloDaConta,
      cartao ? `mt-1 ${CAMPO}` : undefined,
    );
    return (
      <li
        key={i}
        className="ds-entra space-y-2 rounded-xl border border-border/60 bg-surface p-3 shadow-xs"
        data-testid={`pdv-pagamento-${i}`}
      >
        <div className="flex items-center justify-between gap-2">
          <select
            value={p.forma}
            onChange={(e) => mudar(i, { forma: e.target.value as FormaDePagamento })}
            aria-label={t("Forma de pagamento")}
            className="h-8 min-w-0 flex-1 rounded-full border border-border/80 bg-surface px-3 text-sm font-medium shadow-xs focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:outline-hidden"
          >
            {formasDisponiveis.map((f) => (
              <option key={f} value={f}>
                {t(ROTULO_DA_FORMA[f])}
              </option>
            ))}
          </select>
          {!travado ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-error-fg transition-colors hover:bg-error-bg"
              onClick={() =>
                setR((x) => ({ ...x, pagamentos: x.pagamentos.filter((_, j) => j !== i) }))
              }
              data-testid={`pdv-pagamento-${i}-remover`}
            >
              <Trash className="size-3.5" aria-hidden />
              {t("Remover")}
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CampoDinheiro
            rotulo={p.forma === "financiamento" ? t("Valor financiado") : t("Valor")}
            cents={p.valor_cents}
            onChange={(c) => mudar(i, { valor_cents: c })}
            extra={parcelada && !(cartao && perfil) ? "" : "col-span-2"}
            testid={`pdv-pagamento-${i}-valor`}
          />
          {p.forma === "cartao_credito" && perfil ? (
            <label className="col-span-2 block text-xs">
              <span className="text-muted-foreground">{t("Parcelas")}</span>
              <select className={`mt-1 ${CAMPO}`} value={p.parcelas}
                onChange={(e) => mudar(i, { parcelas: Number(e.target.value) })}>
                {p.parcelas > perfil.credito.length && <option value={p.parcelas}>{p.parcelas}x</option>}
                {perfil.credito.map((taxaDoPerfil, j) => {
                  const parcelas = j + 1;
                  const taxa = parcelas === p.parcelas ? p.taxa_cartao_bps ?? taxaDoPerfil : taxaDoPerfil;
                  const percentual = (taxa / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
                  const valor = p.valor_cents > 0
                    ? ` ${formatarPreco(calcularCartao(p.valor_cents, taxa, modo, parcelas).parcela)}`
                    : "";
                  return <option key={parcelas} value={parcelas}>{`${parcelas}x${valor} (${percentual}%)`}</option>;
                })}
              </select>
            </label>
          ) : parcelada ? (
            <Campo
              rotulo={t("Parcelas")}
              tipo="number"
              valor={p.parcelas}
              onChange={(x) => mudar(i, { parcelas: Math.min(120, Math.max(1, Number(x) || 1)) })}
            />
          ) : null}
          {parcelada && (!cartao || !p.repasse_cartao) && p.parcelas > 1 ? (
            <CampoDinheiro
              rotulo={t("Valor da parcela")}
              cents={p.valor_parcela_cents}
              onChange={(c) => mudar(i, { valor_parcela_cents: c })}
            />
          ) : null}
          {parcelada && !cartao ? (
            <Campo
              rotulo={t("1º vencimento")}
              tipo="date"
              valor={p.primeiro_vencimento}
              onChange={(x) => mudar(i, { primeiro_vencimento: x || null })}
              campo="pagamentos.primeiro_vencimento"
            />
          ) : null}
          {comBanco ? (
            <Campo
              rotulo={p.forma === "consorcio" ? t("Administradora") : t("Banco / financeira")}
              valor={p.banco}
              onChange={(x) => mudar(i, { banco: x })}
              extra="col-span-2"
              campo="pagamentos.banco"
            />
          ) : null}
          {cartao ? (
            <>
              <div className="col-span-2 grid grid-cols-2 items-end gap-2">
                <label className="block min-w-0 text-xs">
                  <span className="text-muted-foreground">{rotuloDaConta}</span>
                  {conta}
                </label>
                <label className="block min-w-0 text-xs">
                  <span className="text-muted-foreground">{t("Perfil do cartão")}</span>
                  <select
                    className={`mt-1 ${CAMPO}`}
                    value={p.perfil_cartao_id ?? ""}
                    onChange={(e) => mudar(i, { perfil_cartao_id: e.target.value || undefined })}
                    data-campo="pagamentos.bandeira"
                  >
                    <option value="">{t("Sem perfil")}</option>
                    {p.perfil_cartao_id && !perfil && (
                      <option value={p.perfil_cartao_id}>{t("Perfil indisponível")}</option>
                    )}
                    {taxasDeCartao.perfis.map((item) => (
                      <option key={item.id} value={item.id}>{item.nome}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="col-span-2 grid gap-2 rounded-xl border border-border/80 bg-muted/20 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <span className="font-medium">
                    {p.taxa_cartao_bps === undefined ? "Taxa da máquina a definir" : `Taxa da máquina: ${p.taxa_cartao_bps / 100}%`}
                  </span>
                  <div className="inline-flex rounded-full border border-border/80 bg-surface p-0.5" role="group" aria-label="Tratamento da taxa">
                    {(["repassar", "absorver"] as const).map((opcao) => (
                      <button
                        key={opcao}
                        type="button"
                        aria-pressed={modo === opcao}
                        className={`rounded-full px-2.5 py-1 focus-visible:outline-2 focus-visible:outline-accent ${modo === opcao ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
                        onClick={() => mudar(i, { repasse_cartao: opcao })}
                      >
                        {opcao === "repassar" ? "Repassar" : "Absorver"}
                      </button>
                    ))}
                  </div>
                </div>
                {!travado && (
                  <details>
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Ajustar taxa
                    </summary>
                    <label className="mt-2 block">
                      Taxa deste cartão (%)
                      <input
                        type="number"
                        min="0"
                        max="99.99"
                        step="0.01"
                        className={`mt-1 ${CAMPO}`}
                        value={p.taxa_cartao_bps === undefined ? "" : p.taxa_cartao_bps / 100}
                        onChange={(e) => {
                          const taxa = e.target.valueAsNumber;
                          if (Number.isFinite(taxa) && taxa >= 0 && taxa <= 99.99) {
                            mudar(i, { taxa_cartao_bps: Math.round(taxa * 100), repasse_cartao: modo });
                          }
                        }}
                      />
                    </label>
                  </details>
                )}
                {valores && (
                  <dl className="grid grid-cols-2 gap-x-2 gap-y-3 border-t border-border/70 pt-2 [&_dd]:mt-0.5 [&_dd]:text-sm [&_dd]:font-semibold [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
                    <div>
                      <dt>Valor na maquininha</dt>
                      <dd>{formatarPreco(valores.cobrado)}</dd>
                    </div>
                    <div>
                      <dt>Líquido previsto</dt>
                      <dd>{formatarPreco(valores.liquido)}</dd>
                    </div>
                    {p.parcelas > 1 && (
                      <div>
                        <dt>Parcela média ({p.parcelas}x)</dt>
                        <dd>{formatarPreco(valores.parcela)}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            </>
          ) : conta}
          <Campo
            rotulo={t("Observação")}
            valor={p.observacao}
            onChange={(x) => mudar(i, { observacao: x })}
            extra="col-span-2"
          />
        </div>
      </li>
    );
  }

  const taxasAbsorvidas = r.pagamentos.reduce((total, p) => {
    if (!venda || p.taxa_cartao_bps === undefined ||
        (p.forma !== "cartao_credito" && p.forma !== "cartao_debito")) {
      return total;
    }
    const { liquido } = calcularCartao(p.valor_cents, p.taxa_cartao_bps, p.repasse_cartao ?? "repassar", p.parcelas);
    return total + (p.valor_cents - liquido);
  }, 0);
  const saldoPrevisto = resumo.saldo_cents + taxasAbsorvidas;

  // Mensagem do estado REAL da negociação: itens, pendências do cadastro e saldo.
  const situacao =
    resumo.total_cents <= 0 && faltando.length > 0
      ? {
          texto: venda ? t("Aguardando itens") : t("Informe o veículo para começar."),
          cor: "bg-muted text-muted-foreground",
        }
      : faltando.length > 0
        ? { texto: t(faltando[0]!.mensagem), cor: "bg-warning-bg text-warning-fg" }
        : resumo.saldo_cents > 0
          ? {
              texto: `${t("Pagamento pendente")} · ${t("falta")} ${formatarPreco(resumo.saldo_cents)}`,
              cor: "bg-warning-bg text-warning-fg",
            }
          : resumo.saldo_cents < 0
            ? {
                texto: `${t("Passou do total")} · ${t("Troco")} ${formatarPreco(-resumo.saldo_cents)}`,
                cor: "bg-success-bg text-success-fg",
              }
            : { texto: t("Pronto para finalizar"), cor: "bg-success-bg text-success-fg" };

  const vendedorAtual = r.vendedor_user_id ?? usuarioId;
  const opcoesDeVendedor = [...(vendedores ?? [])];
  if (!opcoesDeVendedor.some((v) => v.user_id === vendedorAtual)) {
    opcoesDeVendedor.unshift({
      user_id: vendedorAtual,
      role: "",
      full_name: vendedorAtual === usuarioId ? t("Você") : t("Vendedor"),
    });
  }

  function seletorConta(
    valor: string,
    mudarConta: (v: string) => void,
    label: string,
    className = "h-10 min-w-0 rounded-full border bg-muted px-3 text-xs",
  ) {
    return (
      <select
        aria-label={label}
        value={valor}
        onChange={(e) => mudarConta(e.target.value)}
        className={className}
      >
        <option value="">Selecione a conta</option>
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    );
  }
  function linhaDireta(forma: "pix" | "dinheiro") {
    const indice = r.pagamentos.findIndex((p) => p.forma === forma);
    const atual = r.pagamentos[indice];
    function atualizar(valor: Partial<PagamentoDaNegociacao>) {
      setR((x) => ({
        ...x,
        pagamentos:
          indice < 0
            ? [...x.pagamentos, { forma, valor_cents: 0, parcelas: 1, ...valor }]
            : x.pagamentos.map((p, i) => (i === indice ? { ...p, ...valor } : p)),
      }));
    }
    return (
      <Secao key={forma} titulo={ROTULO_DA_FORMA[forma]} testid={`pdv-grupo-${forma}`}>
        <div className="flex h-12 items-center overflow-hidden rounded-full border bg-muted/20">
          <span className="border-r px-3 text-sm text-muted-foreground">R$</span>
          <input
            aria-label={ROTULO_DA_FORMA[forma]}
            inputMode="decimal"
            value={centavosParaMascara(atual?.valor_cents)}
            placeholder="0,00"
            onChange={(e) =>
              atualizar({ valor_cents: precoParaCentavos(mascararMoeda(e.target.value)) ?? 0 })
            }
            className="h-full w-0 min-w-0 flex-1 bg-transparent px-3 text-sm outline-hidden"
          />
          {seletorConta(
            atual?.conta_id ?? "",
            (v) => atualizar({ conta_id: v }),
            `Conta ${ROTULO_DA_FORMA[forma]}`,
          )}
        </div>
        {erroContas ? (
          <p role="alert" className="text-xs text-destructive">
            Não foi possível carregar as contas.
          </p>
        ) : !contas.length ? (
          <a
            className="text-xs underline"
            href="/app/settings/tenant/financeiro"
            target="_blank"
            rel="noopener"
          >
            Cadastre uma conta financeira para receber.
          </a>
        ) : null}
      </Secao>
    );
  }
  const clienteIdentificado = r.cliente.nome.trim().length > 0;

  return (
    <Coluna
      ancora="pdv-setor-pagamento"
      icone={Receipt}
      indice={indice}
      className="min-h-[32rem] lg:min-h-0"
      titulo={venda ? t("Pagamento") : t("Como a loja paga")}
      rodape={rodape}
    >
      <fieldset disabled={travado} className="space-y-3">
        <Secao titulo={t("Vendedor")} testid="pdv-vendedor">
          <select
            value={vendedorAtual}
            onChange={(e) => setR((x) => ({ ...x, vendedor_user_id: e.target.value }))}
            aria-label={t("Vendedor")}
            className={CAMPO}
            data-testid="pdv-vendedor-select"
          >
            {opcoesDeVendedor.map((v) => (
              <option key={v.user_id} value={v.user_id}>
                {v.full_name?.trim() || t("Sem nome")}
              </option>
            ))}
          </select>
        </Secao>

        {venda && (
          <Secao titulo={t("Tipo de Venda")} testid="pdv-tipo">
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tipo de Venda">
              {(
                [
                  ["normal", "Normal"],
                  ["crediario", "Crediário"],
                  ["reserva", "Reserva"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={(r.modalidade ?? "normal") === id}
                  onClick={() =>
                    setR((x) => ({
                      ...x,
                      modalidade: id,
                      reserva_expira_em:
                        id === "reserva" ? (x.reserva_expira_em ?? prazoPadraoDaReserva()) : null,
                      pagamentos:
                        id === "crediario"
                          ? x.pagamentos
                          : [...x.pagamentos.filter((p) => p.forma !== "crediario")],
                    }))
                  }
                  className={`rounded-full border px-2 py-2 text-sm shadow-xs ${(r.modalidade ?? "normal") === id ? "border-accent bg-accent text-accent-foreground" : "bg-surface text-muted-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {r.modalidade === "reserva" && (
              <>
                <Campo
                  rotulo={t("Reservado até")}
                  tipo="date"
                  valor={diaDoPrazo(r.reserva_expira_em)}
                  onChange={(v) => setR((x) => ({ ...x, reserva_expira_em: prazoDaReserva(v) }))}
                  testid="pdv-reserva-prazo"
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    "O carro fica reservado até o fim desse dia e sai da venda para outros clientes. Os pagamentos lançados abaixo ficam como sinal. Vencido o prazo, o carro volta a ficar disponível.",
                  )}
                </p>
              </>
            )}
          </Secao>
        )}
        {(["pix", "dinheiro"] as const).slice(0, 1).map((forma) => linhaDireta(forma))}
        <Secao titulo="Cartões" testid="pdv-grupo-cartoes">
          <ul className="space-y-2">
            {r.pagamentos.map((p, i) =>
              p.forma === "cartao_credito" || p.forma === "cartao_debito"
                ? cartaoDoPagamento(p, i)
                : null,
            )}
          </ul>
          <button
            type="button"
            onClick={() => adicionar("cartao_credito")}
            className="flex w-full items-center justify-center gap-2 rounded-full border py-1.5 text-sm"
            data-testid="pdv-forma-cartao_credito"
          >
            <Plus className="size-3" />
            Adicionar Cartão
          </button>
        </Secao>
        {linhaDireta("dinheiro")}
        {r.modalidade === "crediario" && (
          <Secao titulo="Crediário" testid="pdv-crediario">
            {r.pagamentos.map((p, i) =>
              p.forma === "crediario" ? (
                <div key={i} className="space-y-3 rounded-2xl border p-3">
                  <p className="text-sm">
                    Saldo a parcelar: <strong>{formatarPreco(p.valor_cents)}</strong>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo
                      rotulo="Número de Parcelas"
                      tipo="number"
                      valor={p.parcelas}
                      onChange={(v) =>
                        mudar(i, { parcelas: Math.max(1, Math.min(120, Number(v) || 1)) })
                      }
                    />
                    <Campo
                      rotulo="Primeiro Vencimento"
                      tipo="date"
                      valor={p.primeiro_vencimento}
                      onChange={(v) => mudar(i, { primeiro_vencimento: v })}
                      campo="pagamentos.primeiro_vencimento"
                    />
                    <Campo
                      rotulo="Juros sobre o saldo (%)"
                      tipo="number"
                      valor={(p.juros_bps ?? 0) / 100}
                      onChange={(v) =>
                        mudar(i, {
                          juros_bps: Math.max(0, Math.min(10000, Math.round(Number(v) * 100))),
                        })
                      }
                    />
                  </div>
                  {seletorConta(
                    p.conta_id ?? "",
                    (v) => mudar(i, { conta_id: v }),
                    "Conta do crediário",
                  )}
                  <p className="rounded-xl bg-accent-soft p-3 text-sm">
                    {p.parcelas}x · Total com juros:{" "}
                    {formatarPreco(Math.round(p.valor_cents * (1 + (p.juros_bps ?? 0) / 10000)))}
                  </p>
                </div>
              ) : null,
            )}
          </Secao>
        )}
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Outras formas de pagamento
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {formas
              .filter(
                (f) =>
                  !["pix", "dinheiro", "cartao_credito", "cartao_debito", "crediario"].includes(f),
              )
              .map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => adicionar(f)}
                  className="rounded-full border px-3 py-1 text-xs"
                >
                  + {ROTULO_DA_FORMA[f]}
                </button>
              ))}
          </div>
          <ul className="mt-2 space-y-2">
            {r.pagamentos.map((p, i) =>
              !["pix", "dinheiro", "cartao_credito", "cartao_debito", "crediario"].includes(p.forma)
                ? cartaoDoPagamento(p, i)
                : null,
            )}
          </ul>
        </details>
        {venda ? (
          <Secao titulo={t("Troca")} testid="pdv-troca">
            {r.troca ? (
              <>
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs shadow-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {r.troca.modelo.trim() || t("Veículo da troca")}
                    </div>
                    <div className="text-muted-foreground tabular-nums">
                      {t("Abate")} {formatarPreco(resumo.troca_liquida_cents)}
                    </div>
                  </div>
                  {!travado ? (
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-error-fg transition-colors hover:bg-error-bg"
                      onClick={() => setR((x) => ({ ...x, troca: null }))}
                      data-testid="pdv-troca-remover"
                    >
                      <Trash className="size-3.5" aria-hidden />
                      {t("Remover")}
                    </button>
                  ) : null}
                </div>
                <FormularioDaTroca
                  troca={r.troca}
                  cliente={r.cliente}
                  contrato={r.contrato}
                  setR={setR}
                  faltando={faltando}
                  travado={travado}
                />
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!clienteIdentificado}
                  onClick={() => setR((x) => ({ ...x, troca: { ...TROCA_VAZIA } }))}
                  className="flex w-full items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="pdv-adicionar-troca"
                >
                  <Plus className="size-3" aria-hidden />
                  {clienteIdentificado ? t("Adicionar troca") : t("Selecione cliente")}
                </button>
                {!clienteIdentificado ? (
                  <p className="text-xs text-muted-foreground">
                    {t("Identifique o cliente para adicionar uma troca.")}
                  </p>
                ) : null}
              </>
            )}
          </Secao>
        ) : null}

        <Secao titulo="" testid="pdv-resumo">
          <div className="grid grid-cols-2 divide-x divide-border/60 rounded-full border border-border/60 text-center">
            <div className="p-2">
              <div className="text-[10px] tracking-wider text-muted-foreground uppercase">
                {t("Pago")}
              </div>
              <div className="text-sm font-semibold tabular-nums" data-testid="pdv-pago">
                {formatarPreco(
                  r.pagamentos
                    .filter((p) => p.forma !== "crediario")
                    .reduce((a, p) => a + p.valor_cents, 0) - taxasAbsorvidas,
                )}
              </div>
            </div>
            <div className="p-2" aria-live="polite" aria-atomic="true">
              <div className="text-[10px] tracking-wider text-muted-foreground uppercase">
                {saldoPrevisto < 0 ? t("Troco") : t("Falta")}
              </div>
              <div className="text-sm font-semibold tabular-nums" data-testid="pdv-troco">
                {formatarPreco(Math.abs(saldoPrevisto))}
              </div>
            </div>
          </div>
          <div
            role="status"
            data-testid="pdv-situacao"
            className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-center text-xs font-medium transition-colors ${situacao.cor}`}
          >
            {faltando.length === 0 && resumo.saldo_cents <= 0 ? (
              <CheckCircle className="size-4 shrink-0" weight="duotone" aria-hidden />
            ) : null}
            {situacao.texto}
          </div>
        </Secao>

        {dadosDoContrato}
      </fieldset>
    </Coluna>
  );
}

// ---------------------------------------------------------------------------
// Histórico

function Historico({
  negociacoes,
  abrir,
}: {
  negociacoes: Negociacao[];
  abrir: (n: Negociacao) => void;
}) {
  const t = useT();
  const tagDeIdioma = useTagDeIdioma();
  const [filtro, setFiltro] = React.useState<"all" | TipoDeNegociacao>("all");
  const lista = negociacoes.filter((n) => filtro === "all" || n.tipo === filtro);
  return (
    <div className="space-y-3">
      <div className="flex gap-1 self-start rounded-full border border-border/80 bg-muted p-1">
        {(["all", "venda", "compra"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filtro === f ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
          >
            {f === "all" ? t("Todas") : f === "venda" ? t("Vendas") : t("Compras")}
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <div className="ds-entra flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/80 bg-surface p-10 text-center text-sm text-muted-foreground">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Receipt className="size-6" weight="duotone" aria-hidden />
          </span>
          {t("Nenhuma negociação ainda.")}
        </div>
      ) : (
        <div className="ds-entra overflow-x-auto rounded-xl border border-border/60 bg-surface shadow-xs">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">{t("Tipo")}</th>
                <th className="px-3 py-2">{t("Cliente")}</th>
                <th className="px-3 py-2">{t("Veículo")}</th>
                <th className="px-3 py-2 text-right">{t("Valor")}</th>
                <th className="px-3 py-2">{t("Situação")}</th>
                <th className="px-3 py-2">{t("Data")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((n) => (
                <tr
                  key={n.id}
                  className="border-t border-border/60 transition-colors hover:bg-muted/50"
                  data-testid={`pdv-historico-${n.numero}`}
                >
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {String(n.numero).padStart(4, "0")}
                  </td>
                  <td className="px-3 py-2">{n.tipo === "venda" ? t("Venda") : t("Compra")}</td>
                  <td className="px-3 py-2 font-medium">{n.cliente?.nome || "—"}</td>
                  <td className="px-3 py-2">{tituloDoVeiculoDaNegociacao(n.veiculo) || "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatarPreco(resumoDaNegociacao(n).total_cents, n.moeda)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        n.status === "concluida"
                          ? "bg-success-bg text-success-fg"
                          : n.status === "cancelada"
                            ? "bg-error-bg text-error-fg"
                            : "bg-warning-bg text-warning-fg"
                      }`}
                    >
                      {t(ROTULO_DO_STATUS_DA_NEGOCIACAO[n.status])}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(n.concluida_em ?? n.created_at).toLocaleDateString(tagDeIdioma)}
                  </td>
                  <td className="space-x-2 px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="rounded-full px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
                      onClick={() => abrir(n)}
                    >
                      {n.status === "rascunho" ? t("Continuar") : t("Ver")}
                    </button>
                    {n.status !== "cancelada" ? (
                      <a
                        href={`/api/v1/pdv/negociacoes/${n.id}/contrato`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
                      >
                        {t("Contrato")}
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tela

export function PdvClient({
  estoque: estoqueInicial,
  urlsDasCapas,
  negociacoesIniciais,
  podeNegociar,
  podeSalvarPadrao = false,
  titulo,
  usuarioId,
  contratoPadrao = novoContrato({}),
  taxasDeCartao = lerTaxasDeCartao(undefined),
}: {
  estoque: VeiculoDoPdv[];
  urlsDasCapas: Record<string, string>;
  negociacoesIniciais: Negociacao[];
  podeNegociar: boolean;
  podeSalvarPadrao?: boolean;
  titulo: string;
  usuarioId: string;
  contratoPadrao?: DadosDoContrato;
  taxasDeCartao?: TaxasDeCartao;
}) {
  const t = useT();
  const tagDeIdioma = useTagDeIdioma();
  const [aba, setAba] = React.useState<Aba>("venda");
  const [r, setRascunho] = React.useState<Rascunho>(() => rascunhoNovo("venda", contratoPadrao));
  const [aberta, setAberta] = React.useState<Negociacao | null>(null);
  const [negociacoes, setNegociacoes] = React.useState(negociacoesIniciais);
  const [estoque, setEstoque] = React.useState(estoqueInicial);
  const [salvando, setSalvando] = React.useState(false);

  const travado = !podeNegociar || (aberta !== null && aberta.status !== "rascunho");
  // Cópia local da venda em andamento (sobrevive a recarregar ou expirar a sessão).
  const [sujo, setSujo] = React.useState(false);
  const [recuperavel, setRecuperavel] = React.useState<RascunhoGuardado<Rascunho> | null>(null);
  React.useEffect(() => {
    // localStorage só existe no navegador; ler depois da hidratação evita divergência com o servidor.
    let ativo = true;
    queueMicrotask(() => {
      if (ativo) setRecuperavel(lerRascunho<Rascunho>(usuarioId));
    });
    return () => {
      ativo = false;
    };
  }, [usuarioId]);
  const setR = React.useCallback((f: (r: Rascunho) => Rascunho) => {
    setSujo(true);
    setRascunho((x) => {
      const novo = f(x);
      if (novo.modalidade === "crediario") {
        const anteriores = novo.pagamentos.filter((p) => p.forma !== "crediario");
        const saldo = Math.max(
          0,
          resumoDaNegociacao({ ...novo, pagamentos: anteriores }).saldo_cents,
        );
        const credito = novo.pagamentos.find((p) => p.forma === "crediario");
        novo.pagamentos = [
          ...anteriores,
          { forma: "crediario", parcelas: 1, ...credito, valor_cents: saldo },
        ];
      }
      return novo;
    });
  }, []);
  const resumo = resumoDaNegociacao(r);
  const faltas = pendenciasParaConcluir(r);
  const atual = comoNegociacao(r, aberta);
  const faltando = faltandoParaConcluir(atual, faltas);
  const blocos = retratoDaOperacao(atual).blocos;
  // A lista do servidor vale só para o rascunho que ele avaliou: editou, volta a regra local.
  const [faltandoDoServidor, setFaltandoDoServidor] = React.useState<{
    de: Rascunho;
    lista: FaltaParaConcluir[];
  } | null>(null);
  const [contratoAberto, setContratoAberto] = React.useState<string | null>(null);
  const oQueFalta = faltandoDoServidor?.de === r ? faltandoDoServidor.lista : faltando;

  // Enquanto o aviso de recuperação está aberto, não sobrescreve a cópia guardada.
  React.useEffect(() => {
    if (!sujo || recuperavel || travado || aba === "historico") return;
    if (!temConteudo(r)) return;
    const id = setTimeout(
      () => guardarRascunho(usuarioId, { aba, abertaId: aberta?.id ?? null, r }),
      500,
    );
    return () => clearTimeout(id);
  }, [r, sujo, recuperavel, travado, aba, aberta, usuarioId]);

  React.useEffect(() => {
    if (!sujo || travado || !temConteudo(r)) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sujo, travado, r]);

  async function nova(tipo: TipoDeNegociacao) {
    await descarregar();
    setSujo(false);
    setRecuperavel(null);
    limparRascunho(usuarioId);
    setAba(tipo);
    setAberta(null);
    setRascunho(rascunhoNovo(tipo, { ...contratoPadrao, assinatura_em: new Date().toISOString() }));
  }

  async function abrir(n: Negociacao) {
    await descarregar();
    setSujo(false);
    setAba(n.tipo);
    setAberta(n);
    setRascunho(rascunhoDe(n, contratoPadrao));
  }

  function recuperar() {
    if (!recuperavel) return;
    const salvaNoServidor = recuperavel.abertaId
      ? negociacoes.find((n) => n.id === recuperavel.abertaId)
      : null;
    if (recuperavel.abertaId && salvaNoServidor?.status !== "rascunho") {
      // A negociação mudou no servidor desde então; a cópia local não vale mais.
      limparRascunho(usuarioId);
      setRecuperavel(null);
      toast.error(t("Essa venda já foi alterada em outro lugar e não pôde ser recuperada."));
      return;
    }
    setAba(recuperavel.aba);
    setAberta(salvaNoServidor ?? null);
    setRascunho(recuperavel.r);
    setSujo(true);
    setRecuperavel(null);
    toast.success(t("Venda em andamento recuperada."));
  }

  function descartarRecuperavel() {
    limparRascunho(usuarioId);
    setRecuperavel(null);
  }

  function guardar(n: Negociacao) {
    setAberta(n);
    setNegociacoes((lista) => [n, ...lista.filter((x) => x.id !== n.id)]);
  }

  async function salvar(silencioso = false): Promise<Negociacao | null> {
    const enviado = r;
    const corpo = corpoDoRascunho(r);
    try {
      const res = aberta
        ? await apiClient.patch<{ data: Negociacao }>(`/api/v1/pdv/negociacoes/${aberta.id}`, {
            ...corpo,
            tipo: undefined,
          })
        : await apiClient.post<{ data: Negociacao }>("/api/v1/pdv/negociacoes", corpo);
      guardar(res.data);
      // Se o vendedor editou enquanto salvava, o que ele digitou depois ainda não está no servidor.
      if (rAtual.current === enviado) {
        setSujo(false);
        limparRascunho(usuarioId);
      }
      return res.data;
    } catch (e) {
      if (!silencioso) showApiError(e);
      return null;
    }
  }

  // Salvamento automático no servidor: a venda aparece no histórico como rascunho.
  const rAtual = React.useRef(r);
  const salvarRef = React.useRef(salvar);
  React.useEffect(() => {
    rAtual.current = r;
    salvarRef.current = salvar;
  });
  const emVoo = React.useRef<Promise<unknown> | null>(null);
  const [repetir, setRepetir] = React.useState(0);
  const podeSalvarAuto = sujo && !recuperavel && !travado && aba !== "historico" && temConteudo(r);
  const salvarAuto = React.useCallback(async () => {
    if (emVoo.current) {
      await emVoo.current;
    }
    const enviado = rAtual.current;
    const p = salvarRef.current(true).finally(() => {
      emVoo.current = null;
      if (rAtual.current !== enviado) setRepetir((n) => n + 1);
    });
    emVoo.current = p;
    await p;
  }, []);
  React.useEffect(() => {
    if (!podeSalvarAuto || emVoo.current) return;
    const id = setTimeout(() => void salvarAuto(), 1500);
    return () => clearTimeout(id);
  }, [r, podeSalvarAuto, repetir, salvarAuto]);
  /** Grava agora o que ainda não foi para o servidor (sair, trocar de aba, nova negociação). */
  async function descarregar() {
    if (podeSalvarAuto) await salvarAuto();
  }

  async function salvarRascunho() {
    setSalvando(true);
    const n = await salvar();
    setSalvando(false);
    if (n) toast.success(t("Negociação salva."));
  }

  async function finalizar() {
    if (r.modalidade === "reserva") {
      await salvarRascunho();
      return;
    }
    if (faltando.length > 0) {
      avisarOQueFalta(faltando);
      return;
    }
    setSalvando(true);
    const n = await salvar();
    if (!n) {
      setSalvando(false);
      return;
    }
    try {
      const res = await apiClient.post<{ data: Negociacao }>(
        `/api/v1/pdv/negociacoes/${n.id}/concluir`,
        {},
      );
      guardar(res.data);
      if (res.data.tipo === "venda" && res.data.veiculo_id) {
        setEstoque((lista) => lista.filter((v) => v.id !== res.data.veiculo_id));
      }
      toast.success(
        res.data.tipo === "venda"
          ? t("Venda concluída!")
          : t("Compra concluída! O veículo entrou no estoque."),
      );
      setContratoAberto(n.id);
    } catch (e) {
      const doServidor =
        e instanceof ApiError && e.status === 422
          ? (e.details?.faltando as FaltaParaConcluir[] | undefined)
          : undefined;
      if (doServidor && doServidor.length > 0) {
        setFaltandoDoServidor({ de: r, lista: doServidor });
        avisarOQueFalta(doServidor);
      } else {
        showApiError(e);
      }
    } finally {
      setSalvando(false);
    }
  }

  function avisarOQueFalta(lista: readonly FaltaParaConcluir[]) {
    toast.error(
      lista.length === 1
        ? t("Falta 1 item para concluir.")
        : t("Faltam {n} itens para concluir.").replace("{n}", String(lista.length)),
      {
        description: lista
          .slice(0, 4)
          .map((f) => `${t(f.setor)}: ${t(f.mensagem)}`)
          .join("\n"),
      },
    );
    const primeiro = ORDEM_DOS_SETORES.find((s) => lista.some((f) => f.setor === s));
    if (primeiro) irParaOSetor(primeiro);
  }

  async function cancelar() {
    if (!aberta) return;
    if (!window.confirm(t("Cancelar esta negociação? Ela continua no histórico como cancelada.")))
      return;
    try {
      const res = await apiClient.patch<{ data: Negociacao }>(
        `/api/v1/pdv/negociacoes/${aberta.id}`,
        { acao: "cancelar" },
      );
      guardar(res.data);
      toast.success(t("Negociação cancelada."));
      nova(r.tipo);
    } catch (e) {
      showApiError(e);
    }
  }

  const abas: { id: Aba; rotulo: string }[] = [
    { id: "venda", rotulo: t("Venda") },
    { id: "compra", rotulo: t("Compra") },
    { id: "historico", rotulo: t("Histórico") },
  ];

  const telaLarga = useTelaLarga();
  const telaAmpla = useTelaLarga(1280);
  const [quatroColunas, setQuatroColunas] = React.useState(false);
  const quatroColunasNoDesktop = telaAmpla && quatroColunas;
  const contratoEmColuna = !telaLarga || quatroColunasNoDesktop;
  // Celular: uma coluna aberta por vez; as outras viram bolinhas na barra do topo.
  const [colunaAberta, setColunaAberta] = React.useState(0);
  React.useEffect(() => {
    const abrir = (e: Event) => setColunaAberta((e as CustomEvent<number>).detail);
    window.addEventListener(EVENTO_ABRIR_COLUNA, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_COLUNA, abrir);
  }, []);
  const colunasDoCelular = [
    { icone: UserCircle, rotulo: t("Cliente") },
    { icone: Storefront, rotulo: t("Veículos") },
    { icone: FileText, rotulo: t("Dados do contrato") },
    { icone: CurrencyDollar, rotulo: t("Pagamento") },
  ];
  const classeDaColuna = (i: number) => (telaLarga || colunaAberta === i ? "contents" : "hidden");
  const dadosDoContrato = (
    <>
      <EditorDoContrato
        contrato={r.contrato}
        pagamentos={r.pagamentos}
        onChange={(contrato, pagamentos) => setR((x) => ({ ...x, contrato, pagamentos }))}
        requisitos={{ venda: r.tipo === "venda", blocos }}
        faltando={chavesDoQueFalta(oQueFalta)}
        mostrarTitulo={!contratoEmColuna}
        recebimentoNaTroca
        onSalvarPadrao={
          podeSalvarPadrao && !travado
            ? async (c) => {
                const e = c.empresa;
                if (!e) return { ok: false, error: "Preencha os dados da loja." };
                const res = await salvarPadraoDaLoja({
                  empresa: e,
                  representante_nome: c.representante_nome,
                  representante_cpf: c.representante_cpf,
                  representante_cargo: c.representante_cargo,
                });
                return res.ok
                  ? { ok: true }
                  : {
                      ok: false,
                      error:
                        res.error === "validation_failed"
                          ? "Informe ao menos a razão social."
                          : res.error === "forbidden_role"
                            ? "Só administradores salvam o padrão da loja."
                            : res.error,
                    };
              }
            : undefined
        }
      />
      <label className="block">
        <span className="text-sm font-normal text-muted-foreground">
          {r.tipo === "venda" ? t("Observações da Venda") : t("Observações da Compra")}
        </span>
        <textarea
          value={r.observacoes ?? ""}
          onChange={(e) => setR((x) => ({ ...x, observacoes: e.target.value }))}
          placeholder="Observações adicionais sobre a venda..."
          rows={3}
          className="mt-2 w-full rounded-3xl border border-border/80 bg-surface px-3.5 py-2 text-sm shadow-xs transition-colors focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:outline-hidden"
          data-testid="pdv-observacoes"
        />
      </label>
    </>
  );
  const rodapeDoPagamento =
    aba !== "historico" ? (
      <footer
        className="border-t border-border/60 bg-surface text-foreground"
        data-testid="pdv-rodape"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div data-testid="pdv-saldo" className="min-w-0">
            <div className="text-[10px] tracking-wider text-muted-foreground uppercase">
              {r.tipo === "venda" ? t("Total") : t("Valor da compra")}
            </div>
            <div className="text-xl leading-tight font-bold tabular-nums">
              {formatarPreco(resumo.total_cents)}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {aberta?.status === "rascunho" && podeNegociar ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelar}
                disabled={salvando}
                className="rounded-full text-foreground hover:bg-muted hover:text-foreground"
              >
                {t("Cancelar")}
              </Button>
            ) : null}
            {!travado ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={salvarRascunho}
                  disabled={salvando}
                  className="rounded-full text-foreground hover:bg-muted hover:text-foreground"
                  data-testid="pdv-salvar"
                >
                  <span className="sr-only">{t("Salvar rascunho")}</span>
                  <FileText className="size-4" aria-hidden />
                </Button>
                <Button
                  onClick={finalizar}
                  disabled={salvando}
                  title={
                    oQueFalta.length > 0
                      ? oQueFalta.map((f) => `${t(f.setor)}: ${t(f.mensagem)}`).join("\n")
                      : undefined
                  }
                  className="rounded-full bg-primary px-5 font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
                  data-testid="pdv-finalizar"
                >
                  {r.modalidade === "reserva"
                    ? t("Salvar reserva")
                    : r.tipo === "venda"
                      ? t("Finalizar")
                      : t("Finalizar compra")}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </footer>
    ) : null;

  return (
    <div className="flex h-full flex-col">
      <header className="ds-entra flex flex-wrap items-center gap-3 border-b border-border/60 bg-surface px-4 py-2.5">
        <a
          href="/app"
          onClick={(e) => {
            if (!podeSalvarAuto) return;
            e.preventDefault();
            void descarregar().finally(() => {
              window.location.href = "/app";
            });
          }}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent-soft hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-hidden"
        >
          <CaretLeft className="size-4" aria-hidden />
          {t("Voltar")}
        </a>
        <h1 className="text-sm font-bold tracking-wider uppercase">{titulo}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${
            aberta?.status === "cancelada"
              ? "bg-error-bg text-error-fg"
              : aberta?.status === "rascunho"
                ? "bg-warning-bg text-warning-fg"
                : "bg-success-bg text-success-fg"
          }`}
        >
          {aberta ? t(ROTULO_DO_STATUS_DA_NEGOCIACAO[aberta.status]) : t("Aberto")}
        </span>
        {aberta ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {r.tipo === "venda" ? t("Venda") : t("Compra")} #
            {String(aberta.numero).padStart(4, "0")}
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {aba !== "historico" && !contratoAberto ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="hidden rounded-full aria-pressed:bg-accent aria-pressed:text-accent-foreground xl:inline-flex"
              aria-controls="pdv-colunas"
              aria-pressed={quatroColunasNoDesktop}
              onClick={() => setQuatroColunas((ativa) => !ativa)}
            >
              {t("4 colunas")}
            </Button>
          ) : null}
          {aberta ? (
            <>
              <button
                type="button"
                onClick={() => setContratoAberto(aberta.id)}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
                data-testid="pdv-ver-contrato"
              >
                <FileText className="size-3.5" aria-hidden />
                {aberta.status === "concluida" ? t("Ver contrato") : t("Prévia do contrato")}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
                onClick={() => nova(r.tipo)}
              >
                <Plus className="size-3.5" aria-hidden />
                {t("Nova negociação")}
              </button>
            </>
          ) : null}
          <div
            className="flex gap-0.5 rounded-full border border-border/80 bg-muted p-1"
            role="tablist"
          >
            {abas.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                onClick={() =>
                  a.id === "historico"
                    ? void descarregar().then(() => setAba("historico"))
                    : a.id !== r.tipo || aberta
                      ? nova(a.id)
                      : setAba(a.id)
                }
                className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${aba === a.id ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:bg-surface hover:text-foreground"}`}
                data-testid={`pdv-aba-${a.id}`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
        </div>
      </header>

      {recuperavel && !contratoAberto ? (
        <div
          role="alert"
          data-testid="pdv-recuperar-rascunho"
          className="flex flex-wrap items-center gap-3 border-b border-warning-fg/20 bg-warning-bg px-4 py-2 text-sm text-warning-fg"
        >
          <span>
            {t("Encontramos uma venda em andamento salva neste navegador")}
            {" ("}
            {new Date(recuperavel.salvoEm).toLocaleString(tagDeIdioma)}
            {")."}
          </span>
          <div className="ml-auto flex gap-2">
            <Button type="button" size="sm" onClick={recuperar}>
              {t("Recuperar")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={descartarRecuperavel}>
              {t("Descartar")}
            </Button>
          </div>
        </div>
      ) : null}

      {contratoAberto ? (
        <TelaDoContrato
          negociacaoId={contratoAberto}
          concluida={aberta?.id === contratoAberto && aberta.status === "concluida"}
          onVoltar={() => setContratoAberto(null)}
          onNova={() => {
            setContratoAberto(null);
            nova(r.tipo);
          }}
        />
      ) : aba === "historico" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <Historico negociacoes={negociacoes} abrir={abrir} />
        </div>
      ) : (
        <>
          <nav
            aria-label={t("Seções da venda")}
            data-testid="pdv-bolinhas"
            className="flex shrink-0 items-center justify-center gap-3 border-b border-border/60 bg-surface px-4 py-2 lg:hidden"
          >
            {colunasDoCelular.map(({ icone: Icone, rotulo }, i) => (
              <button
                key={i}
                type="button"
                aria-label={rotulo}
                aria-current={colunaAberta === i ? "true" : undefined}
                onClick={() => setColunaAberta(i)}
                className={`flex size-11 items-center justify-center rounded-full border transition-all duration-200 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-hidden ${
                  colunaAberta === i
                    ? "scale-110 border-accent bg-accent text-accent-foreground shadow-sm"
                    : "border-border/80 bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icone className="size-5" weight="duotone" aria-hidden />
              </button>
            ))}
          </nav>
          <div
            id="pdv-colunas"
            className={`grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:overflow-hidden ${
              quatroColunasNoDesktop
                ? "xl:grid-cols-[minmax(0,0.85fr)_repeat(3,minmax(0,1.15fr))]"
                : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]"
            }`}
          >
            <div className={classeDaColuna(0)}>
              <ColunaCliente
                r={r}
                setR={setR}
                travado={travado}
                faltando={oQueFalta}
                pendenciasCom={(cliente) => {
                  const comOCliente = { ...r, cliente };
                  return faltandoParaConcluir(
                    comoNegociacao(comOCliente, aberta),
                    pendenciasParaConcluir(comOCliente),
                  );
                }}
              />
            </div>
            <div className={classeDaColuna(1)}>
              <ColunaVeiculo
                r={r}
                setR={setR}
                estoque={estoque}
                urlsDasCapas={urlsDasCapas}
                travado={travado}
              />
            </div>
            {contratoEmColuna ? (
              <div className={classeDaColuna(2)}>
                <Coluna titulo={t("Dados do contrato")} icone={FileText} indice={2}>
                  <fieldset disabled={travado} className="min-w-0 space-y-3">
                    {dadosDoContrato}
                  </fieldset>
                </Coluna>
              </div>
            ) : null}
            <div className={classeDaColuna(3)}>
              <ColunaPagamento
                indice={contratoEmColuna ? 3 : 2}
                r={r}
                setR={setR}
                travado={travado}
                faltando={oQueFalta}
                rodape={telaLarga ? rodapeDoPagamento : null}
                usuarioId={usuarioId}
                taxasDeCartao={taxasDeCartao}
                dadosDoContrato={contratoEmColuna ? undefined : dadosDoContrato}
                podeTrocarTipo={aberta === null}
                onTrocarTipo={nova}
              />
            </div>
          </div>
        </>
      )}
      {!telaLarga && !contratoAberto ? <div className="shrink-0">{rodapeDoPagamento}</div> : null}
    </div>
  );
}
