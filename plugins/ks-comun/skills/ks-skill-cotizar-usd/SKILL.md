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

## Guardrails

- **El desglose no va en el PDF del cliente.** El tipo de cambio, el impuesto no recuperable y el
  markup se sacaron del documento de cotización el 2026-08-28: es un documento de cliente final. El
  desglose queda en el JSON que se escribe al lado. Ver `ks-skill-keepsync-pdf`.
- **Nunca cotizar por sobre el tope presupuestario** cuando esto alimenta una compra pública: es
  causal de inadmisibilidad.
- **No inventar el precio de lista.** Entra a mano junto con la fuente de la que salió.
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
