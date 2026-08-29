// datos-sinteticos: las cartolas, las facturas y los RUTs de este archivo son inventados; no
// corresponden a ninguna empresa, cuenta bancaria ni documento real.
//
// Contrato del cruce de facturas del RCV contra pagos del banco. El repo consumidor tiene su
// propio test, que corre este mismo motor contra sus cartolas transcritas reales; este prueba
// las reglas: la cuadratura obligatoria, las tres pasadas del criterio y las guardas.
//
//   node lib/test/cruce.test.mjs

import { validarCartola, consolidar, glosasCompatibles, tokensGlosa } from '../cruce/cartola.mjs'
import { cruzar, tokensQueCoinciden } from '../cruce/cruce.mjs'
import { leerHoja, serializarCSV, clave, fechaDocumentoISO, ordenarParaPublicar, COLUMNAS } from '../cruce/hoja.mjs'
import { calcularPatch, contarEstados, regresiones } from '../cruce/comparar.mjs'

let fallos = 0
const fail = (m) => { fallos++; console.error(`  FAIL ${m}`) }
const ok = (label, cond, detalle = '') => {
  if (cond) console.log(`  ok   ${label}`)
  else fail(`${label}${detalle ? ' -> ' + detalle : ''}`)
}
const eq = (label, got, want) => ok(label, got === want, `dio ${JSON.stringify(got)}, esperaba ${JSON.stringify(want)}`)
const lanza = (label, fn, patron) => {
  try { fn(); fail(`${label}: no lanzo`) } catch (e) {
    ok(`${label}`, patron.test(e.message), e.message)
  }
}

const cartola = (movimientos, control = null) => ({
  documento: {
    titulo: 'Cartola de prueba', driveFileId: 'archivo-de-prueba', tipo: 'cartola',
    periodo: { desde: '2026-07-01', hasta: '2026-07-31' },
  },
  control: control ?? { totalDeclarado: movimientos.reduce((t, m) => t + (m.montoFacturado ?? m.monto), 0) },
  movimientos,
})

console.log('\n== La transcripcion tiene que cuadrar contra el documento ==')
{
  const buena = cartola([{ fecha: '2026-07-10', glosa: 'PROVEEDOR UNO', monto: 100000 }])
  eq('una cartola que cuadra devuelve sus movimientos', validarCartola(buena).length, 1)

  const mala = cartola([{ fecha: '2026-07-10', glosa: 'PROVEEDOR UNO', monto: 100000 }], { totalDeclarado: 150000 })
  lanza('si no cuadra, revienta y dice cuanto falta', () => validarCartola(mala, 'mala.json'), /no cuadra|suman/)
}
{
  // El silencio no vale como cuadratura: un documento sin total impreso tiene que decirlo
  // explicito y con motivo, no simplemente omitir el campo.
  const sinControl = cartola([{ fecha: '2026-07-10', glosa: 'X', monto: 1000 }], {})
  lanza('sin totalDeclarado ni justificacion, revienta', () => validarCartola(sinControl, 'x.json'), /totalDeclarado/)
  const sinMotivo = cartola([{ fecha: '2026-07-10', glosa: 'X', monto: 1000 }], { sinTotalDeclarado: true })
  lanza('sinTotalDeclarado sin motivo, revienta', () => validarCartola(sinMotivo, 'x.json'), /motivo/)
  const bien = cartola([{ fecha: '2026-07-10', glosa: 'X', monto: 1000 }], { sinTotalDeclarado: true, motivo: 'el documento no imprime total' })
  eq('con motivo, pasa', validarCartola(bien).length, 1)
}
{
  const cero = cartola([{ fecha: '2026-07-10', glosa: 'X', monto: 0 }], { totalDeclarado: 0 })
  lanza('un monto 0 revienta', () => validarCartola(cero, 'x.json'), /monto debe ser un entero distinto de 0/)
  const fechaMala = cartola([{ fecha: '10/07/2026', glosa: 'X', monto: 1000 }])
  lanza('una fecha que no es ISO revienta', () => validarCartola(fechaMala, 'x.json'), /no es YYYY-MM-DD/)
}
{
  // Compra en cuotas: `monto` es la compra completa (lo que cruza contra la factura) y
  // `montoFacturado` la cuota del periodo (lo que cuadra contra el total del documento).
  const cuotas = cartola([{ fecha: '2026-07-10', glosa: 'TIENDA', monto: 300000, montoFacturado: 100000 }], { totalDeclarado: 100000 })
  const movs = validarCartola(cuotas)
  eq('cuadra por montoFacturado', movs[0].montoFacturado, 100000)
  eq('y cruza por monto', movs[0].monto, 300000)
}

console.log('\n== Consolidar: duplicados entre documentos y reversas ==')
{
  const a = { archivo: 'a.json', periodoHasta: '2026-07-31', movimientos: validarCartola(cartola([{ fecha: '2026-07-10', glosa: 'PROVEEDOR UNO', monto: 100000 }]), 'a.json') }
  const b = { archivo: 'b.json', periodoHasta: '2026-08-31', movimientos: validarCartola(cartola([{ fecha: '2026-07-10', glosa: 'PROVEEDOR UNO', monto: 100000 }]), 'b.json') }
  const r = consolidar([a, b])
  eq('el mismo cargo en dos documentos cuenta una vez', r.evidencia.length, 1)
  eq('y el repetido se reporta, no se descarta en silencio', r.duplicados.length, 1)
}
{
  const movs = validarCartola(cartola([
    { fecha: '2026-07-10', glosa: 'TIENDA X', monto: 50000 },
    { fecha: '2026-07-12', glosa: 'REVERSA TIENDA X', monto: -50000 },
  ], { totalDeclarado: 0 }), 'c.json')
  const r = consolidar([{ archivo: 'c.json', periodoHasta: '2026-07-31', movimientos: movs }])
  eq('un cargo revertido no es evidencia de pago', r.evidencia.length, 0)
  eq('y la reversa queda reportada', r.reversas.length, 1)
}
{
  const movs = validarCartola(cartola([{ fecha: '2026-07-12', glosa: 'ABONO ADMINISTRATIVO', monto: -30000 }], { totalDeclarado: -30000 }), 'd.json')
  const r = consolidar([{ archivo: 'd.json', periodoHasta: '2026-07-31', movimientos: movs }])
  eq('un negativo sin cargo se reporta aparte', r.negativosSinCargo.length, 1)
}

console.log('\n== Glosas ==')
ok('ignora acentos y mayusculas', glosasCompatibles('CAMARA DE COMERCIO', 'Cámara de Comercio'))
ok('tokens utiles, sin palabras vacias', tokensGlosa('PROVEEDOR UNO SPA').length > 0)
ok('reconoce el proveedor en la glosa del banco', tokensQueCoinciden('INGRAM MICRO CHILE SA', 'COMPRA INGRAM MICRO').length > 0)

console.log('\n== Las tres pasadas del criterio ==')
const factura = (o) => ({
  Periodo: '202607', 'Tipo Doc': '33', Folio: o.folio, 'RUT Proveedor': o.rut,
  'Razon Social': o.razon, 'Fecha Documento': '10/07/2026', Neto: '', IVA: '',
  Total: String(o.total), 'Estado SII': 'REGISTRO',
})
const mov = (glosa, monto, fecha = '2026-07-15') => ({ fecha, glosa, monto, montoFacturado: monto, documento: 'd', archivo: 'd.json' })
{
  const fs_ = [factura({ folio: '1', rut: '77111111-1', razon: 'PROVEEDOR UNO SPA', total: 100000 })]
  cruzar(fs_, [mov('COMPRA PROVEEDOR UNO', 100000)])
  eq('monto exacto + nombre -> PAGADA', fs_[0]['Estado Pago'], 'PAGADA')
}
{
  const fs_ = [factura({ folio: '2', rut: '77222222-2', razon: 'PROVEEDOR DOS SPA', total: 100000 })]
  cruzar(fs_, [mov('CARGO SIN NOMBRE RECONOCIBLE', 100000)])
  eq('solo monto exacto -> PAGO PROBABLE', fs_[0]['Estado Pago'], 'PAGO PROBABLE')
}
{
  const fs_ = [
    factura({ folio: '3', rut: '77333333-3', razon: 'PROVEEDOR TRES SPA', total: 60000 }),
    factura({ folio: '4', rut: '77333333-3', razon: 'PROVEEDOR TRES SPA', total: 40000 }),
  ]
  cruzar(fs_, [mov('COMPRA PROVEEDOR TRES', 100000)])
  eq('un cargo que suma dos facturas -> PAGO AGRUPADO', fs_[0]['Estado Pago'], 'PAGO AGRUPADO')
  eq('  las dos quedan marcadas', fs_[1]['Estado Pago'], 'PAGO AGRUPADO')
}
{
  const fs_ = [factura({ folio: '5', rut: '77555555-5', razon: 'PROVEEDOR CINCO SPA', total: 999999 })]
  const r = cruzar(fs_, [mov('OTRA COSA', 100000)])
  eq('sin ningun calce -> SIN EVIDENCIA', fs_[0]['Estado Pago'], 'SIN EVIDENCIA')
  eq('y el cargo sin factura se reporta', r.movimientosSinFactura.length, 1)
}
{
  // Un movimiento se asigna a una sola factura: si no, dos facturas del mismo monto
  // quedarian las dos pagadas por el mismo cargo y el total pagado saldria al doble.
  const fs_ = [
    factura({ folio: '6', rut: '77666666-6', razon: 'PROVEEDOR SEIS SPA', total: 100000 }),
    factura({ folio: '7', rut: '77666666-6', razon: 'PROVEEDOR SEIS SPA', total: 100000 }),
  ]
  cruzar(fs_, [mov('COMPRA PROVEEDOR SEIS', 100000)])
  const pagadas = fs_.filter((f) => f['Estado Pago'] !== 'SIN EVIDENCIA').length
  eq('un cargo paga una sola factura', pagadas, 1)
}

console.log('\n== La Hoja: se valida antes de tocarla ==')
{
  const filas = [COLUMNAS, ['202607', '33', '1', '77111111-1', 'PROVEEDOR UNO', '10/07/2026', '', '', '100000', 'REGISTRO', 'SIN EVIDENCIA', '', '', '', '', '', '']]
  const csv = serializarCSV(filas.slice(1).map((f) => Object.fromEntries(COLUMNAS.map((c, i) => [c, f[i]]))))
  const leida = leerHoja(csv)
  eq('ida y vuelta por CSV conserva la factura', leida.facturas.length, 1)
  eq('la clave es la del RCV', clave(leida.facturas[0]), '202607|33|1|77111111-1')
  lanza('un CSV que no es la Hoja del cruce no se sobrescribe', () => leerHoja('a,b,c\n1,2,3'), /no trae la columna|no es la Hoja/)
}
eq('fecha del RCV a ISO', fechaDocumentoISO('10/07/2026'), '2026-07-10')
{
  const fs_ = [
    { ...factura({ folio: '9', rut: '1-9', razon: 'Z', total: 1 }), 'Estado Pago': 'SIN EVIDENCIA' },
    { ...factura({ folio: '8', rut: '1-9', razon: 'Z', total: 1 }), 'Estado Pago': 'PAGADA' },
  ]
  eq('se publica primero lo que tiene evidencia', ordenarParaPublicar(fs_)[0]['Estado Pago'], 'PAGADA')
}

console.log('\n== Patch y regresiones ==')
{
  const antes = [{ ...factura({ folio: '1', rut: '77111111-1', razon: 'A', total: 1 }), 'Estado Pago': 'SIN EVIDENCIA', 'Glosa Banco': '' }]
  const despues = [{ ...antes[0], 'Estado Pago': 'PAGADA', 'Glosa Banco': 'COMPRA A' }]
  const patch = calcularPatch(antes, despues)
  eq('un cambio de estado produce un cambio en el patch', patch.length, 1)
  ok('  que lleva el valor esperado y el nuevo', patch[0].a['Estado Pago'] === 'SIN EVIDENCIA' && patch[0].d['Estado Pago'] === 'PAGADA')
  eq('sin cambios, patch vacio', calcularPatch(antes, antes).length, 0)
  eq('contarEstados cuenta facturas y monto por estado', contarEstados(despues)['PAGADA'].facturas, 1)
}
{
  // La guarda que evita perder pagos: si una factura que la Hoja daba por pagada queda
  // sin evidencia, casi siempre falta una cartola, no es que se haya despagado.
  const antes = [{ ...factura({ folio: '1', rut: '77111111-1', razon: 'A', total: 1 }), 'Estado Pago': 'PAGADA' }]
  const despues = [{ ...antes[0], 'Estado Pago': 'SIN EVIDENCIA' }]
  const r = regresiones(antes, despues)
  eq('una pagada que queda sin evidencia es una regresion', r.perdidas.length, 1)
  eq('y no hay regresiones cuando no se pierde nada', regresiones(antes, antes).perdidas.length, 0)
}

console.log(fallos ? `\n=== ${fallos} FALLO(S) ===` : '\n=== TODO OK ===')
process.exitCode = fallos ? 1 : 0
