---
name: ks-skill-keepsync-pdf
description: Construye el PDF de una cotización con la identidad visual oficial de KeepSync — paleta oscura, logo, láminas apaisadas— renderizando HTML con Chromium desde un módulo compartido, para que una cotización de un rubro nuevo salga con el mismo formato que las que ya existen. Usar cuando el usuario pida generar, diseñar o ajustar el PDF o la propuesta comercial de una cotización, o pregunte de dónde sale el estilo visual de las cotizaciones de KeepSync.
---

# Estilo KeepSync para el PDF de una cotización

**Repo** `keepsync-hub/ks-compra-agil` · **Código** `src/lib/estilo-keepsync.ts` · **Docs** la sección
"Estilo KeepSync único" de su `CLAUDE.md`

Cuatro cotizadores generan PDF (licencias, cursos, y dos rubros de servicios) y los cuatro usan la
misma identidad: paleta oscura, logo, láminas A4 apaisadas renderizadas con **Chromium/Playwright a
partir de HTML**. Nunca convirtiendo un `.pptx` con LibreOffice: `soffice` no funciona en estos
entornos —falla incluso con un `.txt` vacío, diagnosticado con `strace`—.

Hasta que se unificó, esos colores, el logo y el arranque de Chromium estaban **copiados en cuatro
archivos** y ya se habían desalineado: el verde de estado resuelto solo existía en una de las copias.

## Cuándo usar

- Generar el PDF de una cotización de un rubro que todavía no tiene cotizador propio.
- Cambiar cómo se ve cualquier cotización.
- Entender por qué el PDF es el artefacto final y no el `.pptx`.

## Qué exporta el módulo

- **`PALETA_KEEPSYNC`** — los colores de marca, incluidos el rojo de advertencia (sellos BORRADOR y
  PRELIMINAR, avisos de tope) y el verde de estado resuelto.
- **`logoKeepsyncBase64()`** — el logo como base64 para incrustar. Un PDF autocontenido no puede
  referenciar un archivo externo.
- **`formatoClp(n)`** — el único formato de moneda que debe aparecer en una cotización.
- **`escaparHtml(s)`** — **todo texto de fuente externa** (bases de un organismo, archivos de
  configuración) pasa por acá antes de interpolarse: el nombre de una compra puede traer `&` o `<` sin
  que nadie lo haya sanitizado.
- **`cssLaminasKeepsync()`** — el CSS del layout de cuatro láminas.
- **`conPaginaHtml()`** / **`renderizarPdfDesdeHtml()`** — el arranque de Chromium y la impresión.

## Los dos layouts ya probados

No hay un generador genérico de láminas: cada rubro arma su HTML con estas piezas, porque el contenido
de una cotización de licencias no es el de un curso. Para uno nuevo, partir del que más se parezca.

1. **Cuatro láminas** con el CSS compartido sin tocar: carátula → solución → marco normativo →
   cotización formal. Sirve cuando la oferta es un producto simple.
2. **Cinco láminas** con CSS propio más denso: carátula con ficha del oferente → programa →
   metodología → **cuadro de cumplimiento** → oferta económica. Sirve cuando hay que responder punto
   por punto una lista de exigencias, donde una tabla de cumplimiento es más honesta que un párrafo de
   marketing.

## El chequeo de desborde, que hay que copiar

En un layout de alto fijo cada lámina tiene `overflow: hidden` para garantizar el número exacto de
páginas — lo que significa que **un texto largo se recorta en silencio**. Por eso el cotizador de
cursos no usa el atajo de impresión: abre la página con `conPaginaHtml`, mide `scrollHeight` contra
`clientHeight` **en el mismo Chromium que imprime**, y devuelve qué láminas desbordaron.

Cualquier layout de alto fijo nuevo debería copiar ese chequeo en vez de confiar en la vista previa.

## Guardrails

- **Nunca inventar un precio.** El oferente y los costos salen de la configuración de la empresa; sin
  datos reales no hay cotización.
- **Nunca cotizar sobre el tope presupuestario** de la oportunidad: es causal de inadmisibilidad. Los
  layouts muestran el tope junto al total y lo marcan en rojo si se supera.
- **Marcar el documento cuando el precio o la identidad son provisorios.** Un PDF que se ve terminado
  pero cotiza con una heurística tiene que decirlo **en la propia lámina**, no solo en un mensaje de
  consola.
- **El PDF renderizado es el artefacto final**, no el `.pptx` o `.docx` que exista como fuente
  editable: es lo que se adjunta.
- **No duplicar la paleta, el logo ni el arranque de Chromium.** Importar del módulo. Esa duplicación
  ya produjo una desalineación real.

## Notas

- Esta skill es la capa de *cómo se ve*. Qué cotizar en cada rubro —pricing y reglas de negocio— lo
  saben los cotizadores de `ks-compra-agil`. Para la regla de precio, ver `ks-skill-cotizar-usd`.
