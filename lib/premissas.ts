import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Premissas de quantificação: regras que o usuário define para guiar a extração.
// Validadas com zod tanto no cliente (antes de enviar) quanto no servidor.
// ─────────────────────────────────────────────────────────────────────────────

/** Quais traços do PDF contam como "parede". Cor/espessura são proxies de layer. */
export const WallFilterSchema = z.object({
  /** cores (hex) consideradas parede. Vazio = qualquer cor. */
  colors: z.array(z.string()).default([]),
  /** espessura mínima do traço (unidades PDF) para contar como parede. */
  minWidth: z.number().nonnegative().default(0),
  /** espessura máxima do traço; null = sem limite superior. */
  maxWidth: z.number().positive().nullable().default(null),
});
export type WallFilter = z.infer<typeof WallFilterSchema>;

/**
 * Símbolo a contar, definido a partir de um símbolo de referência clicado pelo
 * usuário. `signature` é uma assinatura normalizada do sub-path (ver
 * lib/geometry.ts → symbolSignature / matchSymbol).
 */
export const SymbolDefSchema = z.object({
  name: z.string().min(1),
  signature: z.array(z.number()),
  /** tolerância de similaridade (0..1); maior = mais permissivo. */
  tolerance: z.number().min(0).max(1).default(0.15),
});
export type SymbolDef = z.infer<typeof SymbolDefSchema>;

/** Contagem por ocorrência de texto (regex) — ex.: "P\\d+" para portas. */
export const TextCountSchema = z.object({
  name: z.string().min(1),
  pattern: z.string().min(1),
});
export type TextCount = z.infer<typeof TextCountSchema>;

/** Piso/revestimento com coeficiente de perda. */
export const FinishSchema = z.object({
  name: z.string().min(1),
  /** percentual de perda (0.1 = 10%). */
  lossPct: z.number().min(0).default(0),
  /**
   * Quais ambientes compõem a área-base deste revestimento.
   * Vazio = todos os ambientes da página.
   */
  roomLabels: z.array(z.string()).default([]),
});
export type Finish = z.infer<typeof FinishSchema>;

export const PremissasSchema = z.object({
  /**
   * Regex que captura a área anotada no desenho. O grupo 1 deve capturar o
   * número (com vírgula ou ponto decimal). Ex.: "(\\d+[.,]\\d+)\\s*m".
   */
  areaLabelRegex: z.string().default("(\\d+[.,]\\d+)\\s*m"),
  wallFilter: WallFilterSchema.default({}),
  symbols: z.array(SymbolDefSchema).default([]),
  textCounts: z.array(TextCountSchema).default([]),
  finishes: z.array(FinishSchema).default([]),
  /** custos unitários opcionais por chave de quantitativo (ex.: "parede_m"). */
  unitCosts: z.record(z.string(), z.number()).optional(),
});
export type Premissas = z.infer<typeof PremissasSchema>;

/** Premissas padrão usadas como estado inicial no frontend. */
export const defaultPremissas: Premissas = PremissasSchema.parse({});
