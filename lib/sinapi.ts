// ─── Referência de custos SINAPI ────────────────────────────────────────────
//
// Preços unitários de referência baseados no SINAPI — estado de SÃO PAULO,
// regime NÃO DESONERADO. Cada item do orçamento (código interno) é associado à
// composição SINAPI mais próxima, garantindo que a UNIDADE bata com a unidade
// usada no nosso orçamento. Serviços sem composição SINAPI direta usam a
// composição equivalente mais próxima (estimativa).
//
// IMPORTANTE: são valores de REFERÊNCIA (aproximados, editáveis no app). O
// SINAPI é publicado mensalmente pela Caixa por UF; ajuste conforme o mês/UF do
// seu orçamento: https://www.caixa.gov.br/site/Paginas/downloads.aspx
//
// A unidade aqui DEVE ser idêntica à unidade do item correspondente em
// lib/budget.ts (validado em runtime por assertSinapiUnits).

export interface SinapiRef {
  /** Código/composição SINAPI de referência. */
  sinapi: string;
  /** Unidade SINAPI — deve coincidir com a unidade do item do orçamento. */
  unidade: string;
  /** Preço unitário de referência (R$) — SP, não desonerado. */
  preco: number;
  /** Descrição resumida da composição SINAPI. */
  descricao: string;
}

// Chave = código do item em lib/budget.ts
export const SINAPI_SP: Record<string, SinapiRef> = {
  "1.1": { sinapi: "100992", unidade: "m²", preco: 3.2, descricao: "Limpeza mecanizada de terreno" },
  "1.2": { sinapi: "96522", unidade: "m", preco: 14.5, descricao: "Locação de obra / gabarito" },

  "2.1": { sinapi: "94965", unidade: "m³", preco: 640.0, descricao: "Concreto fck=25 MPa, lançado em fundação" },
  "2.2": { sinapi: "92449", unidade: "m²", preco: 185.0, descricao: "Fabricação/montagem de fôrma para fundação" },
  "2.3": { sinapi: "92776", unidade: "kg", preco: 14.2, descricao: "Armação de aço CA-50" },

  "3.1": { sinapi: "94970", unidade: "m³", preco: 720.0, descricao: "Concreto fck=25 MPa em pilares" },
  "3.2": { sinapi: "94971", unidade: "m³", preco: 720.0, descricao: "Concreto fck=25 MPa em vigas" },
  "3.3": { sinapi: "94972", unidade: "m³", preco: 680.0, descricao: "Concreto fck=25 MPa em lajes" },
  "3.4": { sinapi: "92455", unidade: "m²", preco: 230.0, descricao: "Fôrma para pilares/vigas/lajes" },
  "3.5": { sinapi: "92776", unidade: "kg", preco: 14.2, descricao: "Armação de aço CA-50" },

  "4.1": { sinapi: "103328", unidade: "m²", preco: 92.0, descricao: "Alvenaria de vedação, bloco cerâmico (externa)" },
  "4.2": { sinapi: "103327", unidade: "m²", preco: 78.0, descricao: "Alvenaria de vedação, bloco cerâmico (interna)" },

  "5.1": { sinapi: "94216", unidade: "m²", preco: 135.0, descricao: "Telhamento cerâmico com estrutura de madeira" },

  "6.1": { sinapi: "90830", unidade: "un", preco: 760.0, descricao: "Porta de madeira completa (fornec. e instalação)" },
  "6.2": { sinapi: "94559", unidade: "un", preco: 620.0, descricao: "Janela de alumínio completa (fornec. e instalação)" },
  "6.3": { sinapi: "90830", unidade: "m²", preco: 610.0, descricao: "Vão de porta (referência porta de madeira)" },
  "6.4": { sinapi: "94559", unidade: "m²", preco: 560.0, descricao: "Vão de janela (referência janela de alumínio)" },

  "7.1": { sinapi: "87878", unidade: "m²", preco: 6.4, descricao: "Chapisco em parede" },
  "7.2": { sinapi: "87529", unidade: "m²", preco: 36.0, descricao: "Emboço/massa única em parede" },
  "7.3": { sinapi: "87775", unidade: "m²", preco: 31.0, descricao: "Reboco/acabamento em parede" },

  "8.1": { sinapi: "87703", unidade: "m²", preco: 46.0, descricao: "Contrapiso/regularização sobre laje" },
  "8.2": { sinapi: "87263", unidade: "m²", preco: 78.0, descricao: "Revestimento cerâmico de piso" },

  "9.1": { sinapi: "88489", unidade: "m²", preco: 22.5, descricao: "Pintura látex em parede, 2 demãos" },
  "9.2": { sinapi: "88485", unidade: "m²", preco: 24.0, descricao: "Pintura látex em teto/forro, 2 demãos" },
};

export type CostSource = "SINAPI" | "USUARIO";

/** Preço de referência SINAPI para um código de item (0 se não houver). */
export function sinapiPrice(codigo: string): number {
  return SINAPI_SP[codigo]?.preco ?? 0;
}

/** Composição SINAPI de referência para um código de item (ou undefined). */
export function sinapiRef(codigo: string): SinapiRef | undefined {
  return SINAPI_SP[codigo];
}
