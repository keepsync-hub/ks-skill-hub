#!/usr/bin/env node
// Regla de precio USD -> CLP de KeepSync, fijada por el usuario el 2026-08-28.
//
//   node calcular.mjs <monto_usd> <tipo_de_cambio_observado> [--json]
//
// Es una reimplementacion sin dependencias de `src/lib/pricing-usd.ts` de `ks-compra-agil`, para
// poder aplicar y auditar la regla desde cualquier repo sin arrastrar ese proyecto entero. Los
// cinco porcentajes son los mismos y estan fijos a proposito: dejaron de ser configurables el
// 2026-08-28, cuando esta regla paso a ser la formula de produccion tambien para las licencias.
//
// Los cinco pasos, cada uno sobre el resultado del anterior:
//   1. tipo de cambio ajustado = observado x (1 + 5,5%)
//   2. costo CLP              = USD x tipo de cambio ajustado
//   3. costo con impuesto     = costo x (1 + 19%)   impuesto NO recuperable: es mayor costo,
//                                                    no el IVA de venta
//   4. precio de cotizacion   = costo con impuesto x (1 + 15%)   <- el neto que va en la oferta
//   5. valor final            = precio x (1 + 19%)   IVA de venta, el total a presentar
//
// valor_final = usd x tc x 1,055 x 1,19 x 1,15 x 1,19

export const RECARGO_TIPO_CAMBIO_PCT = 5.5
export const IMPUESTO_NO_RECUPERABLE_PCT = 19
export const MARKUP_PCT = 15
export const IVA_VENTA_PCT = 19

const r0 = (n) => Math.round(n)
const r2 = (n) => Math.round(n * 100) / 100

export function calcularCotizacionUsd (montoUsd, tipoCambioObservado) {
  if (!(montoUsd > 0)) throw new Error(`monto_usd debe ser mayor que 0 (recibido: ${montoUsd})`)
  if (!(tipoCambioObservado > 0)) throw new Error(`tipo_cambio_observado debe ser mayor que 0 (recibido: ${tipoCambioObservado})`)

  const tipoCambioAjustado = tipoCambioObservado * (1 + RECARGO_TIPO_CAMBIO_PCT / 100)
  const costoClp = montoUsd * tipoCambioAjustado
  const costoConImpuestoClp = costoClp * (1 + IMPUESTO_NO_RECUPERABLE_PCT / 100)
  const precioCotizacionClp = costoConImpuestoClp * (1 + MARKUP_PCT / 100)
  const valorFinalClp = precioCotizacionClp * (1 + IVA_VENTA_PCT / 100)

  return {
    monto_usd: montoUsd,
    tipo_cambio_observado: tipoCambioObservado,
    tipo_cambio_ajustado: r2(tipoCambioAjustado),
    costo_clp: r0(costoClp),
    costo_con_impuesto_clp: r0(costoConImpuestoClp),
    precio_cotizacion_clp: r0(precioCotizacionClp),
    valor_final_clp: r0(valorFinalClp),
    porcentajes: {
      recargo_tipo_cambio_pct: RECARGO_TIPO_CAMBIO_PCT,
      impuesto_no_recuperable_pct: IMPUESTO_NO_RECUPERABLE_PCT,
      markup_pct: MARKUP_PCT,
      iva_venta_pct: IVA_VENTA_PCT,
    },
    pasos: [
      { paso: '1. Tipo de cambio ajustado', detalle: `observado ${tipoCambioObservado} + ${RECARGO_TIPO_CAMBIO_PCT}%`, valor: r2(tipoCambioAjustado) },
      { paso: '2. Costo', detalle: `USD ${montoUsd} x tipo de cambio ajustado`, valor: r0(costoClp) },
      { paso: '3. Costo con impuesto no recuperable', detalle: `+ ${IMPUESTO_NO_RECUPERABLE_PCT}% (KeepSync no lo recupera: es mayor costo)`, valor: r0(costoConImpuestoClp) },
      { paso: '4. Precio de cotizacion (neto)', detalle: `+ ${MARKUP_PCT}% de markup -- este es el precio a cotizar`, valor: r0(precioCotizacionClp) },
      { paso: '5. Valor final (con IVA de venta)', detalle: `+ ${IVA_VENTA_PCT}% de IVA -- el total a presentar`, valor: r0(valorFinalClp) },
    ],
  }
}

const clp = (n) => '$' + n.toLocaleString('es-CL')

// Solo actua como CLI cuando se ejecuta directo, para poder importarlo desde otro script.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  if (args.length < 2) {
    console.error('uso: node calcular.mjs <monto_usd> <tipo_de_cambio_observado> [--json]')
    console.error('\nEl tipo de cambio se pasa a mano y con su fuente: este script no lo consulta')
    console.error('ni lo adivina. Dos cotizaciones del mismo dia deben usar el mismo valor.')
    process.exit(2)
  }
  const r = calcularCotizacionUsd(Number(args[0]), Number(args[1]))
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2))
  } else {
    console.log(`\nUSD ${r.monto_usd} al tipo de cambio observado ${r.tipo_cambio_observado}\n`)
    for (const p of r.pasos) {
      const v = p.paso.startsWith('1.') ? String(p.valor) : clp(p.valor)
      console.log(`  ${p.paso.padEnd(42)} ${v.padStart(14)}   ${p.detalle}`)
    }
    console.log(`\n  Precio a cotizar (neto): ${clp(r.precio_cotizacion_clp)}`)
    console.log(`  Valor final con IVA:     ${clp(r.valor_final_clp)}\n`)
  }
}
