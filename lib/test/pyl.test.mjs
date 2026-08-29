// Contrato del motor de agregacion del P&L. Los repos consumidores tienen su propio test que
// cuadra este mismo motor contra un F29 ya declarado; este prueba las reglas, no las cifras.
//
//   node lib/test/pyl.test.mjs

import { montoResultado, aCLP, agregarPorMes, etiquetaPeriodo, fmtCLP, fmtPct } from '../pyl.mjs'

let fallos = 0
const fail = (m) => { fallos++; console.error(`  FAIL ${m}`) }
const ok = (label, cond, detalle = '') => {
  if (cond) console.log(`  ok   ${label}`)
  else fail(`${label}${detalle ? ' -> ' + detalle : ''}`)
}
const eq = (label, got, want) => ok(label, got === want, `dio ${JSON.stringify(got)}, esperaba ${JSON.stringify(want)}`)

console.log('\n== El P&L corre sobre el neto ==')
eq('un ingreso aporta su neto, no su total',
  montoResultado({ id: 'i1', tipo: 'ingreso', periodo: '202607', neto: 1000000, iva: 190000 }), 1000000)
eq('un gasto con IVA recuperable aporta su neto',
  montoResultado({ id: 'g1', tipo: 'gasto', periodo: '202607', neto: 100000, iva: 19000 }), 100000)

console.log('\n== El IVA sin credito fiscal SI es costo ==')
eq('gasto con ivaRecuperable:false suma neto + IVA',
  montoResultado({ id: 'g2', tipo: 'gasto', periodo: '202607', neto: 100000, iva: 19000, ivaRecuperable: false }),
  119000)

console.log('\n== Lo que no es resultado no entra ==')
eq('un movimiento no-resultado aporta 0',
  montoResultado({ id: 'n1', tipo: 'no-resultado', periodo: '202607', neto: 5000000, iva: 0 }), 0)

console.log('\n== Moneda extranjera: falla en voz alta ==')
{
  let lanzo = false, mensaje = ''
  try { aCLP(100, { id: 'x1', moneda: 'USD' }) } catch (e) { lanzo = true; mensaje = e.message }
  ok('sin tipo de cambio, aCLP lanza', lanzo)
  ok('  y el mensaje nombra el movimiento y la moneda', /x1/.test(mensaje) && /USD/.test(mensaje), mensaje)
}
eq('con tipo de cambio convierte y redondea al peso',
  aCLP(23.8, { id: 'x2', moneda: 'USD', tipoCambio: { valor: 933 } }), 22205)
{
  // La regresion documentada: convertir ANTES de redondear. Redondear 23.8 a 24 y despues
  // multiplicar daria 22392, casi 200 pesos de mas en una sola linea.
  const mov = { id: 'x3', tipo: 'gasto', periodo: '202608', neto: 23.8, iva: 4.52, ivaRecuperable: false, moneda: 'USD', tipoCambio: { valor: 933 } }
  eq('convierte antes de redondear, no al reves', montoResultado(mov), Math.round((23.8 + 4.52) * 933))
}

console.log('\n== Agregacion por mes ==')
{
  const agg = agregarPorMes([
    { id: 'a', tipo: 'ingreso', periodo: '202607', neto: 1000000, iva: 190000 },
    { id: 'b', tipo: 'gasto', periodo: '202607', neto: 300000, iva: 57000 },
    { id: 'c', tipo: 'ingreso', periodo: '202608', neto: 500000, iva: 95000 },
    { id: 'd', tipo: 'no-resultado', periodo: '202608', neto: 9000000, iva: 0 },
  ])
  eq('dos meses', agg.meses.length, 2)
  eq('los meses salen ordenados', agg.meses.map((m) => m.periodo).join(','), '202607,202608')
  eq('resultado de julio = 1.000.000 - 300.000', agg.meses[0].resultado, 700000)
  eq('el no-resultado no toca agosto', agg.meses[1].resultado, 500000)
  eq('y queda apartado en el mes', agg.meses[1].fueraDeResultado.length, 1)
  eq('el total suma los dos meses', agg.total.resultado, 1200000)
}
{
  const agg = agregarPorMes([])
  ok('el libro vacio no revienta', Array.isArray(agg.meses) && agg.meses.length === 0)
}

console.log('\n== Formato ==')
eq('etiqueta de periodo', etiquetaPeriodo('202608'), 'agosto 2026')
ok('fmtCLP usa separador de miles chileno', /^\$?-?[\d.]+$/.test(fmtCLP(1234567).replace(/\s/g, '')), fmtCLP(1234567))
ok('fmtPct devuelve algo con %', String(fmtPct(0.19)).includes('%'), String(fmtPct(0.19)))

console.log(fallos ? `\n=== ${fallos} FALLO(S) ===` : '\n=== TODO OK ===')
process.exitCode = fallos ? 1 : 0
