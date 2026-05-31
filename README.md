# Quantitativos IFC

Extrator de **quantitativos a partir de arquivos IFC (BIM)**. Importe um `.ifc`,
o app lê os elementos construtivos e suas quantidades calculadas (áreas,
comprimentos, volumes) e **traduz para linguagem de orçamento** (serviço,
unidade, quantidade). Baixe a planilha `.xlsx`.

> Substitui a abordagem anterior por PDF: o IFC é estruturado e já traz as
> quantidades, gerando um takeoff muito mais confiável.

## Recursos

- Upload de `.ifc` (testado com IFC2X3 exportado do Revit).
- Parser leve de STEP/ISO-10303-21 (sem WASM): lê elementos e `BaseQuantities`.
- Normalização de unidades (mm→m, mm²→m², mm³→m³) e dedup de quantidades
  duplicadas pelo exportador (mantém o líquido).
- Tradução para itens de orçamento: alvenaria de parede (externa/interna),
  laje/piso, volume de concreto, cobertura, portas, janelas, etc.
- Exportação `.xlsx` com abas **Orçamento**, **Resumo por tipo** e **Detalhe**.

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS · exceljs.

## Desenvolvimento

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run typecheck
```

Requer Node.js 18+ (testado com Node 24).

## Estrutura

```
app/page.tsx              # UI: upload IFC + tabelas + download
app/api/ifc/route.ts      # parse do IFC -> orçamento (JSON)
app/api/ifc/export/route.ts  # gera a planilha .xlsx
lib/ifc.ts                # parser STEP + extração de quantidades + unidades
lib/budget.ts             # tradução para itens de orçamento (PT-BR)
lib/ifcXlsx.ts            # montagem da planilha (exceljs)
```

## Limitações / próximos passos

- Sem `IfcSpace` no arquivo de teste, a quantificação é por elemento (não por
  ambiente). Suporte a ambientes (área de piso por cômodo) pode ser adicionado
  quando o IFC trouxer espaços.
- Classificação externa/interna de paredes por palavra-chave do nome.
- Possível adicionar custos unitários e composição de preços.
