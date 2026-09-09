---
name: ks-skill-cotizar-usd
description: Calcula el precio en pesos chilenos a partir de un costo en dólares con la regla de KeepSync — tipo de cambio observado más 5,5%, más 19% de impuesto no recuperable, más 15% de markup, más 19% de IVA final — e imprime el desglose paso a paso. Trae el cálculo listo, sin dependencias. Usar cuando el usuario pida cotizar, calcular o verificar el valor en pesos de algo cuyo costo está en USD, como una licencia o una suscripción.
---

# Regla de precio USD → CLP

**Código** `scripts/calcular.mjs` (en esta skill) · **Implementación de producción**
`src/lib/pricing-usd.ts` de `keepsync-hub/ks-compra-agil`, vía `npm run cotizar-usd`

Regla fijada por el usuario el **2026-08-28**. Desde esa fecha **es** la fórmula de producción también
para las licencias: `cotizarLinea` delega en ella en vez de duplicar la lógica.

```bash
node scripts/calcular.mjs <monto_usd> <tipo_de_cambio_observado> [--json]
```

El módulo también se puede importar: `import { calcularCotizacionUsd } from './scripts/calcular.mjs'`.

## Los cinco pasos, cada uno sobre el anterior

| | Paso | Por qué |
|---|---|---|
| 1 | Tipo de cambio observado **+ 5,5%** | Cubre el spread real de conversión, que no es el dólar observado |
| 2 | Costo CLP = USD × tipo de cambio ajustado | |
| 3 | **+ 19% de impuesto no recuperable** | Es un impuesto que KeepSync paga y **no recupera**, así que es mayor costo. **No es el IVA de venta** |
| 4 | **+ 15% de markup** | Sobre el costo con el impuesto ya adentro. **Este es el precio a cotizar** (neto) |
| 5 | **+ 19% de IVA de venta** | El total a presentar |

`valor_final = usd × tc × 1,055 × 1,19 × 1,15 × 1,19`

Los cuatro porcentajes **están fijos**. Dejaron de ser configurables el 2026-08-28: antes el markup se
leía de la configuración de la empresa y valía 10%.

## El tipo de cambio se pasa a mano, con su fuente

El script **no lo consulta ni lo adivina**. En el cotizador de producción hay un motivo concreto: la
función que lo trae en vivo **cae al valor de respaldo en silencio** cuando el fetch falla (en los
entornos de agentes en la nube el proxy tumba el `fetch` de Node aunque `curl` sí llegue), y entonces
dos cotizaciones del mismo día al mismo cliente salen con tipos de cambio distintos sin que nadie lo
note. Por eso siempre hay que **revisar la fuente del tipo de cambio antes de dar una cotización por
buena**.

## Una suscripción entera, no un monto suelto

Cuando lo que se cotiza es una suscripción SaaS con precio de lista en USD por usuario y por mes,
`ks-compra-agil` ya tiene el camino completo hasta el PDF y **no hay que rearmarlo**:

```bash
npm run cotizar-suscripcion -- \
  --id=Q-AAAAMMDD-CLIENTE --titulo="Claude Max 20x" --cliente="..." \
  --linea="Claude Max 20x|200|2|12|fuente del precio de lista" \
  --tc=926.94 --tc-fuente="dólar observado, mindicador.cl, 09-09-2026"
```

Aplica esta regla por línea, escribe el PDF con `ks-skill-keepsync-pdf` y deja el desglose de los
cinco pasos en un JSON al lado. El `--titulo` es solo el producto: el módulo le agrega
«— N usuarios, M meses», y repetirlo ahí sale duplicado en la carátula.

**Un periodo por cotización, no una tabla comparativa.** Cuando el cliente pide el mismo producto a
12 y a 24 meses, son dos corridas y dos PDF: cada documento cierra un precio, y una lámina con dos
plazos al lado obliga al cliente a elegir dentro de un documento que debería poder firmar entero.

## El precio de lista no es uno solo: hay tarifa mensual y tarifa anual

El proveedor suele publicar dos, y para un compromiso de 12 o 24 meses corresponde la **anual**,
que es el costo real más bajo. Verificado el 2026-09-09:

| Producto | Mensual | Anual | Cuál entra a la regla |
|---|---|---|---|
| Claude Max 20x | USD 200 | **no existe** | 200 — Anthropic no publica tarifa anual para Max |
| ChatGPT Business, asiento Premium | USD 125 | USD 100 | 100 |
| Claude Team, asiento premium | USD 125 | USD 100 | 100 |

Tomar la mensual donde sí hay anual infla la cotización un 25% contra un competidor que usó la
anual. Y al revés: asumir que Max tiene descuento anual **subcotiza** un 20% contra el costo real,
que es plata perdida en cada uno de los 24 meses. Las tarifas cambian: hay que revisarlas antes de
cotizar, no reusarlas de una cotización vieja.

## Guardrails

- **El desglose no va en el PDF del cliente.** El tipo de cambio, el impuesto no recuperable y el
  markup se sacaron del documento de cotización el 2026-08-28: es un documento de cliente final. El
  desglose queda en el JSON que se escribe al lado. Ver `ks-skill-keepsync-pdf`.
- **Nunca cotizar por sobre el tope presupuestario** cuando esto alimenta una compra pública: es
  causal de inadmisibilidad.
- **No inventar el precio de lista.** Entra a mano junto con la fuente de la que salió, y
  revisando si el proveedor publica tarifa anual además de la mensual (ver el cuadro de arriba).
- Aplicar la regla **por línea** y no sobre el total, para que el subtotal de cada fila sea el que sale
  de la regla y no un prorrateo. Como es una cadena de multiplicaciones, las dos vías solo pueden
  diferir en el redondeo al peso.
- En una suscripción, el monto que entra a la regla es el **anual de la línea** (lista mensual ×
  usuarios × meses): se multiplica primero y se convierte después, que además evita arrastrar el
  redondeo doce veces.

## Notas

- Esta implementación se contrastó contra la de producción en cuatro casos (montos con y sin
  decimales): los cinco valores intermedios coinciden exactamente.
- El redondeo: el tipo de cambio ajustado a dos decimales, todo lo demás al peso.
