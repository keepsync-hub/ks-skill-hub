// datos-sinteticos: los correos y las cuentas de este archivo son inventados con la forma real
// del recibo del proveedor; ninguna direccion de aca corresponde a una persona real.
//
// Contrato del parser del correo de recibo. Los repos consumidores tienen su propio test contra
// los tres formatos de correo reales que reciben; este prueba las reglas del parser, sobre todo
// las dos que existen por bugs que ya ocurrieron.
//
//   node lib/test/parser-recibo.test.mjs

import { parsearRecibo } from '../parser-recibo.mjs'

let fallos = 0
const fail = (m) => { fallos++; console.error(`  FAIL ${m}`) }
const ok = (label, cond, detalle = '') => {
  if (cond) console.log(`  ok   ${label}`)
  else fail(`${label}${detalle ? ' -> ' + detalle : ''}`)
}
const eq = (label, got, want) => ok(label, got === want, `dio ${JSON.stringify(got)}, esperaba ${JSON.stringify(want)}`)

const CUENTAS = [
  { cuenta: 'compras@ejemplo.test', tipo: 'costo-de-venta', operacion: 'OP-1', cliente: 'ACME' },
]

const cuerpo = [
  'Receipt from Anthropic, PBC',
  'Receipt number 2916-4021-8843',
  'Invoice number D4E2F1A0-0007',
  'Paid August 14, 2026',
  'Max plan - 20x',
  'Receipt #2916-4021-8843 Aug 14 - Sep 14, 2026',
  'Total excluding tax $200.00',
  'VAT $38.00',
  'Amount paid $238.00',
  'Payment method Visa - 4242 Receipt #2916-4021-8843',
].join('\n')

console.log('\n== Recibo directo, cuenta conocida ==')
{
  const r = parsearRecibo({ text: cuerpo, to: 'compras@ejemplo.test' }, CUENTAS)
  eq('numero de recibo', r.recibo, '2916-4021-8843')
  eq('numero de factura', r.invoice, 'D4E2F1A0-0007')
  eq('fecha de pago en ISO', r.fechaPago, '2026-08-14')
  eq('periodo derivado de la fecha', r.periodo, '202608')
  eq('plan reconocido', r.concepto, 'Max plan - 20x')
  eq('neto', r.neto, 200)
  eq('iva', r.iva, 38)
  eq('total', r.total, 238)
  eq('ultimos 4 de la tarjeta', r.tarjeta, '4242')
  eq('imputacion', r.imputacionTipo, 'costo-de-venta')
  eq('operacion', r.operacion, 'OP-1')
  ok('no requiere revision', r.requiereRevision === false)
}

console.log('\n== La cuenta viaja dentro de angulares (correo reenviado) ==')
{
  // El bug que motiva las dos vistas del texto: `plano()` quita el HTML para leer los montos,
  // pero la cuenta viene como `Para: alguien <cuenta>` y el limpiador se la comeria. Si el
  // parser buscara la cuenta sobre el texto limpio, esta imputacion saldria "por-revisar".
  const r = parsearRecibo({ text: cuerpo, html: 'Para: Compras <compras@ejemplo.test>' }, CUENTAS)
  eq('la encuentra igual', r.cuentaClaude, 'compras@ejemplo.test')
  eq('e imputa bien', r.imputacionTipo, 'costo-de-venta')
}

console.log('\n== Una cuenta desconocida NO se adivina ==')
{
  const r = parsearRecibo({ text: cuerpo, to: 'otra@ejemplo.test' }, CUENTAS)
  eq('queda por-revisar', r.imputacionTipo, 'por-revisar')
  ok('y marcada para que la mire un humano', r.requiereRevision === true)
}
{
  const r = parsearRecibo({ text: cuerpo, to: 'compras@ejemplo.test' })
  eq('sin mapa, todo queda por-revisar', r.imputacionTipo, 'por-revisar')
}

console.log('\n== Lo que no es un recibo se descarta ==')
ok('un correo cualquiera devuelve null', parsearRecibo({ text: 'Hola, adjunto el informe.' }, CUENTAS) === null)

console.log('\n== Un recibo incompleto se marca, no se completa ==')
{
  const sinPlan = cuerpo.replace('Max plan - 20x', 'Plan que no esta en la lista')
  const r = parsearRecibo({ text: sinPlan, to: 'compras@ejemplo.test' }, CUENTAS)
  eq('sin plan reconocido el concepto queda vacio', r.concepto, '')
  ok('y requiere revision', r.requiereRevision === true)
}

console.log(fallos ? `\n=== ${fallos} FALLO(S) ===` : '\n=== TODO OK ===')
process.exitCode = fallos ? 1 : 0
