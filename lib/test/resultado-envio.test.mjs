// datos-sinteticos: los XML de este archivo son acuses inventados con la forma real del
// RESULTADO_ENVIO; ningun RUT de aca corresponde a una empresa real.
//
// Contrato del parser del acuse del SII. Los repos consumidores tienen su propio test que
// corre este mismo parser contra sus acuses reales y ademas verifica que el `jsCode` embebido
// en el workflow de n8n produzca lo mismo; este prueba la regla.
//
//   node lib/test/resultado-envio.test.mjs

import { parseResultadoEnvio, nombreTipoDoc } from '../resultado-envio.mjs'

let fallos = 0
const fail = (m) => { fallos++; console.error(`  FAIL ${m}`) }
const ok = (label, cond, detalle = '') => {
  if (cond) console.log(`  ok   ${label}`)
  else fail(`${label}${detalle ? ' -> ' + detalle : ''}`)
}
const eq = (label, got, want) => ok(label, got === want, `dio ${JSON.stringify(got)}, esperaba ${JSON.stringify(want)}`)

const acuse = ({ estado = 'EPR', informado = 2, acepta = 2, rechaza = null, reparo = null, tipos = ['33'] }) => `<?xml version="1.0" encoding="ISO-8859-1"?>
<RESULTADO_ENVIO>
  <RUTEMISOR>11111111-1</RUTEMISOR>
  <RUTENVIA>22222222-2</RUTENVIA>
  <TRACKID>1234567890</TRACKID>
  <TMSTRECEPCION>14/08/2026 10:32:07</TMSTRECEPCION>
  <ESTADO>${estado}</ESTADO>
${tipos.map((t) => `  <SUBTOTAL><TIPODOC>${t}</TIPODOC><INFORMADO>${informado}</INFORMADO><ACEPTA>${acepta}</ACEPTA>${rechaza === null ? '' : `<RECHAZA>${rechaza}</RECHAZA>`}${reparo === null ? '' : `<REPARO>${reparo}</REPARO>`}</SUBTOTAL>`).join('\n')}
</RESULTADO_ENVIO>`

console.log('\n== Envio aceptado completo ==')
{
  const r = parseResultadoEnvio(acuse({}))
  eq('trackId', r.trackId, '1234567890')
  eq('estado', r.estado, 'EPR')
  eq('informados', r.informados, 2)
  eq('aceptados', r.aceptados, 2)
  eq('no aceptados', r.noAceptados, 0)
  ok('no requiere revision', r.requiereRevision === false)
  eq('fecha de recepcion en ISO', r.fechaRecepcion, '2026-08-14T10:32:07')
  eq('periodo derivado del timestamp', r.periodo, '202608')
  eq('ymd derivado del timestamp', r.ymd, '20260814')
  eq('nombre del tipo de documento', r.tipoDocNombre, 'Factura Electronica')
}

console.log('\n== Las tres formas de que un envio necesite un humano ==')
ok('un documento no aceptado -> revision', parseResultadoEnvio(acuse({ informado: 3, acepta: 2 })).requiereRevision)
ok('un rechazo -> revision', parseResultadoEnvio(acuse({ rechaza: 1 })).requiereRevision)
ok('un reparo -> revision', parseResultadoEnvio(acuse({ reparo: 1 })).requiereRevision)
ok('un estado distinto de EPR -> revision', parseResultadoEnvio(acuse({ estado: 'RCT' })).requiereRevision)

console.log('\n== Ausencia de tag es cero, no es error ==')
{
  // Los envios aceptados no traen RECHAZA ni REPARO. Si la ausencia se leyera como NaN,
  // requiereRevision daria falso siempre y el acuse con rechazos pasaria en silencio.
  const r = parseResultadoEnvio(acuse({}))
  eq('rechazos ausentes cuentan 0', r.rechazos, 0)
  eq('reparos ausentes cuentan 0', r.reparos, 0)
}

console.log('\n== Envio con varios SUBTOTAL ==')
{
  const r = parseResultadoEnvio(acuse({ tipos: ['33', '61'] }))
  eq('suma los informados de todos los subtotales', r.informados, 4)
  eq('lista los tipos', r.tipoDoc, '33,61')
  ok('y nombra los dos', r.tipoDocNombre.includes('Factura Electronica') && r.tipoDocNombre.includes('Nota de Credito'), r.tipoDocNombre)
}

console.log('\n== Tabla de tipos de DTE ==')
eq('33', nombreTipoDoc('33'), 'Factura Electronica')
eq('61', nombreTipoDoc('61'), 'Nota de Credito Electronica')
ok('un codigo desconocido no revienta', nombreTipoDoc('999') === 'Tipo 999')

console.log(fallos ? `\n=== ${fallos} FALLO(S) ===` : '\n=== TODO OK ===')
process.exitCode = fallos ? 1 : 0
