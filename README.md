# Quantitativos — Levantamento por PDF

Aplicativo web para **importar uma planta em PDF**, **definir premissas de quantificação** e **baixar uma planilha de quantitativos** (levantamento de quantidades de obra).

> Extração automática assistida: o app detecta candidatos (áreas, paredes, contagens) e o usuário revisa/ajusta antes de exportar. PDFs **vetoriais** (exportados de CAD) têm a melhor precisão.

## Recursos

- Upload de PDF e visualização página a página (canvas, via pdf.js).
- Detecção de página **vetorial × raster**.
- **Calibração de escala** por 2 cliques (distância conhecida) ou escala 1:N.
- **Premissas**: regex de rótulo de área, filtros de parede (cor/espessura), contagens por texto, revestimentos com coeficiente de perda.
- Extração de **áreas de ambientes**, **comprimento de paredes**, **contagens** e **revestimentos**.
- Revisão editável dos resultados.
- Exportação **.xlsx** (abas Resumo, Áreas, Paredes, Contagens, Revestimentos, Premissas).

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS · pdfjs-dist · exceljs · zod.

## Desenvolvimento

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build de produção
npm run typecheck
```

Requer Node.js 18+ (testado com Node 24).

## Estrutura

```
app/            # UI (page.tsx) + API routes (upload, extract, export)
components/     # PdfViewer, CalibrationTool, PremissasPanel, ReviewLayer
lib/            # pdf (extração), geometry, quantify, xlsx, premissas, types, store
```

## Roadmap

- Reconstrução automática de polígonos de ambiente (ciclos de geometria).
- Contagem por símbolo (assinatura de blocos) no cliente.
- OCR para PDFs escaneados (tesseract.js + detecção de linhas).
- Custos unitários por quantitativo.
