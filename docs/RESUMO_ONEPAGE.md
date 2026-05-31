# Resumo One Page — Orçamento Preliminar IFC

**Autor:** Kevin Quintian · **Stack:** Next.js (TypeScript) · Tailwind · exceljs · web-ifc

## Objetivo
Gerar um **orçamento preliminar de obra** automaticamente a partir de um modelo
**BIM (arquivo IFC)**, reduzindo o trabalho manual de levantamento de
quantitativos e precificação.

## Processo de trabalho

**1. Abordagem inicial — PDF (descartada).** O projeto começou extraindo
quantitativos de **plantas em PDF**: seleção de páginas, calibração de escala por
linha, medição de áreas por recinto (flood-fill) e detecção de paredes por estilo.
Funcional, porém **frágil e trabalhoso** — dependia de calibração manual e da
qualidade do desenho.

**2. Pivot para IFC.** Migração para ler o **IFC (ISO-10303-21/STEP)**, que já é
estruturado e traz as quantidades calculadas (`BaseQuantities`). Foi escrito um
**parser próprio, leve, sem WASM**, com normalização de unidades (mm→m, etc.) e
deduplicação de quantidades repetidas pelo exportador. Resultado: takeoff muito
mais confiável.

**3. Tradução para orçamento.** Camada "orçamentista" (`lib/budget.ts`) que
converte elementos IFC em **itens de serviço agrupados por etapa** (fundações,
superestrutura, alvenaria, cobertura, esquadrias, revestimentos, pisos, pintura),
com unidade e quantidade. Inclui um **visualizador 3D** que destaca os objetos
paramétricos de cada item.

**4. Refinamentos de engenharia (validados com modelo de teste BasicHouse).**
- Correção de dupla normalização de comprimento (locação 62,04 m).
- Cobertura: usa as lajes de telhado e, depois, a **face inferior** (forro) — não
  a superfície total da laje (corrigiu valor dobrado).
- Pintura de teto condicionada à existência de laje de teto.

**5. Precificação SINAPI.** Adição da **Fonte de Custos**: por padrão preços de
referência **SINAPI (SP, não desonerado)** alimentam a coluna de preço unitário,
com **unidade compatível** ao serviço e exibição do código/descrição da
composição. O usuário pode sobrescrever um preço e voltar à referência com um
clique, ou escolher inserir todos os preços manualmente.

**6. Acabamento.** Revisão de design (tipografia Inter, tabela com bordas,
identidade visual), exportação `.xlsx` (abas Orçamento e Detalhe) e versionamento
no GitHub.

## Decisões-chave
- **IFC > PDF:** dado estruturado elimina calibração manual e erro de medição.
- **Parser próprio sem WASM:** simples, rápido e sem dependências pesadas.
- **SINAPI como referência editável:** equilibra automação com a flexibilidade
  que o orçamentista precisa.

## Validação
Testado com o modelo **BasicHouse.ifc** (IFC2X3 do Revit); quantidades e preços
conferidos item a item, com compatibilidade de unidades entre app e SINAPI.

## Limitações / próximos passos
Quantificação por elemento (sem `IfcSpace`); classificação de paredes por nome;
referência SINAPI estática para SP — evoluir para múltiplas UFs e mês de
referência.
