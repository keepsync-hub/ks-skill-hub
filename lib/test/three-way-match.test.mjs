// datos-sinteticos: la operacion de prueba y sus RUTs son inventados; no corresponden a
// ninguna empresa ni a ninguna operacion real.
//
// Contrato de `validar3Way`. Los repos consumidores tienen su propio test que corre esta
// misma funcion contra sus operaciones reales; este prueba la regla, no los datos.
//
//   node lib/test/three-way-match.test.mjs

import { validar3Way, normalizaRut, normalizaNumeroOC } from '../three-way-match.mjs'

let fallos = 0
const fail = (m) => { fallos++; console.error(`  FAIL ${m}`) }
const ok = (label, cond, detalle = '') => {
  if (cond) console.log(`  ok   ${label}`)
  else fail(`${label}${detalle ? ' -> ' + detalle : ''}`)
}
const check = (r, nombre) => r.checks.find((c) => c.nombre === nombre)

const base = () => ({
  cliente: { rut: '11.111.111-1' },
  proveedor: { rut: '22.222.222-2' },
  cotizacion: { ref: 'COT-1', neto: 1000000, iva: 190000, total: 1190000 },
  ordenCompra: {
    numero: 'OC-9', estado: 'Aceptada', neto: 1000000, iva: 190000, total: 1190000,
    rutCliente: '11111111-1', rutProveedor: '22222222-2',
  },
  factura: {
    folio: '00042', neto: 1000000, iva: 190000, total: 1190000,
    refOC: 'Orden Compra N° OC-9 del 2026-03-10',
    rutCliente: '111111111', rutProveedor: '222222222',
  },
})

console.log('\n== Normalizadores ==')
ok('el mismo RUT con puntos, con guion o pegado normaliza igual',
  normalizaRut('11.111.111-1') === normalizaRut('11111111-1') &&
  normalizaRut('11111111-1') === normalizaRut('111111111'))
ok('la K de verificador se compara en mayuscula', normalizaRut('7654321-k') === normalizaRut('7654321-K'))
ok('el numero de OC ignora espacios y mayusculas', normalizaNumeroOC(' oc-9 ') === normalizaNumeroOC('OC-9'))

console.log('\n== Operacion sin discrepancias ==')
const r = validar3Way(base())
ok('resultado OK', r.resultado === 'OK', r.resultado)
ok('sin diferencias', r.diferencias.length === 0, JSON.stringify(r.diferencias))
ok('los seis checks pasan', r.checks.every((c) => c.ok), JSON.stringify(r.checks.filter((c) => !c.ok)))

console.log('\n== Cada regla, rota de a una ==')
{
  const op = base(); delete op.factura
  const x = validar3Way(op)
  ok('falta un documento -> DISCREPANCIA', x.resultado === 'DISCREPANCIA')
  ok('  y lo dice el check de presencia', check(x, 'documentos_presentes')?.ok === false)
}
{
  const op = base(); op.factura.total = 1190001
  ok('un peso de diferencia rompe con tolerancia 0', validar3Way(op).resultado === 'DISCREPANCIA')
  ok('  y pasa con tolerancia 1', validar3Way(op, { tolerancia: 1 }).resultado === 'OK')
}
{
  // Sobre-facturacion: la factura no puede superar a la OC. Es el check que evita pagar de mas.
  const op = base()
  op.factura.neto = 2000000; op.factura.iva = 380000; op.factura.total = 2380000
  op.ordenCompra.neto = 2000000; op.ordenCompra.iva = 380000; op.ordenCompra.total = 2380000
  const x = validar3Way(op)
  ok('factura > cotizacion -> DISCREPANCIA', x.resultado === 'DISCREPANCIA')
}
{
  const op = base(); op.factura.refOC = 'sin referencia a ninguna orden'
  ok('la factura que no cita la OC rompe', validar3Way(op).resultado === 'DISCREPANCIA')
}
{
  const op = base(); op.ordenCompra.estado = 'Enviada a proveedor'
  ok('la OC no aceptada rompe', validar3Way(op).resultado === 'DISCREPANCIA')
}
{
  const op = base(); op.factura.rutCliente = '99999999-9'
  ok('RUT de cliente inconsistente rompe', validar3Way(op).resultado === 'DISCREPANCIA')
}

console.log(fallos ? `\n=== ${fallos} FALLO(S) ===` : '\n=== TODO OK ===')
process.exitCode = fallos ? 1 : 0
