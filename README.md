# Orçamento Preliminar IFC

Aplicativo web que gera um **orçamento preliminar de obra a partir de um arquivo
IFC (BIM)**. Importe um `.ifc`, visualize o modelo em 3D, e o app lê os elementos
construtivos e suas quantidades (áreas, comprimentos, volumes), **traduz para
itens de orçamento** (serviço, unidade, quantidade) e **precifica** usando uma
referência de custos **SINAPI**. Exporte a planilha `.xlsx`.

> O IFC é estruturado e já traz as quantidades calculadas, gerando um takeoff
> muito mais confiável do que extrair de uma planta em PDF.

## Recursos

- Upload de `.ifc` (testado com IFC2X3 exportado do Revit) e **visualizador 3D**.
- Parser leve de STEP/ISO-10303-21 (sem WASM): lê elementos e `BaseQuantities`.
- Normalização de unidades (mm→m, mm²→m², mm³→m³) e dedup de quantidades
  duplicadas pelo exportador.
- Tradução para itens de orçamento agrupados por etapa: serviços preliminares,
  fundações, superestrutura, alvenaria, cobertura, esquadrias, revestimentos,
  pisos e pintura.
- **Fonte de Custos** selecionável:
  - **SINAPI** (padrão) — preços de referência (SP, não desonerado) alimentam a
    coluna de preço unitário, com a unidade compatível ao serviço. Mostra o
    código/descrição da composição SINAPI usada.
  - **Inserido pelo Usuário** — preços digitados manualmente.
  - No modo SINAPI o usuário pode editar o preço de um item específico; o botão
    **↺ SINAPI** devolve aquele item à referência.
- Destaque no modelo 3D dos objetos paramétricos de cada item do orçamento.
- Exportação `.xlsx` com abas **Orçamento** e **Detalhe**.

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS · exceljs · web-ifc (viewer 3D).

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
```

Requer Node.js 18+ (testado com Node 24).

## Estrutura

```
app/page.tsx                 # UI: upload IFC, viewer 3D, tabela e download
app/layout.tsx               # metadados, fontes (Inter + assinatura)
app/api/ifc/route.ts         # parse do IFC -> orçamento (JSON)
app/api/ifc/export/route.ts  # gera a planilha .xlsx
lib/ifc.ts                   # parser STEP + extração de quantidades + unidades
lib/budget.ts                # tradução para itens de orçamento (PT-BR)
lib/sinapi.ts                # tabela de referência de custos SINAPI
lib/ifcXlsx.ts               # montagem da planilha (exceljs)
```

## Sobre os preços SINAPI

Os valores em `lib/sinapi.ts` são **referências aproximadas** (SP, não
desonerado) mapeando cada item do orçamento à composição SINAPI mais próxima,
com **unidade compatível**. O SINAPI oficial é publicado mensalmente pela Caixa
por UF — ajuste os valores conforme o mês/estado do orçamento:
https://www.caixa.gov.br/site/Paginas/downloads.aspx

## Limitações / próximos passos

- Quantificação por elemento (não por ambiente), pois o IFC de teste não traz
  `IfcSpace`. Suporte a área de piso por cômodo pode ser adicionado quando o IFC
  trouxer espaços.
- Classificação externa/interna de paredes por palavra-chave do nome.
- Cobertura usa a face inferior das lajes de telhado (forro), não a superfície
  total da laje.
- A referência SINAPI é estática e regional (SP); evoluir para múltiplas UFs e
  atualização por mês de referência.
