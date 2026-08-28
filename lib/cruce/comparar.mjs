// Comparar la Hoja como estaba contra la Hoja recalculada.
//
// Vive aparte de la CLI porque el mismo codigo se copia dentro del Code node de n8n que
// corre este cruce desde la pagina publica (lo arma cruce/n8n/generar-nodo.mjs).

import { clave, COLUMNAS_PAGO } from './hoja.mjs';

// Compara la Hoja como estaba con la Hoja recalculada y devuelve solo lo que cambia, en
// el formato que consume el nodo "Aplicar Cambios" de n8n: cada cambio lleva el valor que
// espera encontrar (`a`) ademas del que deja (`d`), asi que si alguien edito la Hoja a
// mano el workflow falla en vez de sobrescribir.
export function calcularPatch(antes, despues) {
  const previo = new Map(antes.map((f) => [clave(f), f]));
  const cambios = [];
  for (const factura of despues) {
    const k = clave(factura);
    const original = previo.get(k);
    const a = {};
    const d = {};
    for (const col of COLUMNAS_PAGO) {
      const viejo = String(original[col] == null ? '' : original[col]).trim();
      const nuevo = String(factura[col] == null ? '' : factura[col]).trim();
      if (viejo !== nuevo) { a[col] = viejo; d[col] = nuevo; }
    }
    if (Object.keys(d).length > 0) { cambios.push({ k, a, d }); }
  }
  return cambios;
}

export function contarEstados(facturas) {
  const cuenta = {};
  for (const f of facturas) {
    const e = f['Estado Pago'] || 'SIN EVIDENCIA';
    cuenta[e] = cuenta[e] || { facturas: 0, monto: 0 };
    cuenta[e].facturas++;
    cuenta[e].monto += Number(String(f['Total'] || '').replace(/[^\d-]/g, '')) || 0;
  }
  return cuenta;
}

// Facturas que la Hoja daba por pagadas y que el recalculo deja sin evidencia. Hay dos
// casos, y solo uno es un problema:
//
//   - `reasignadas`: el mismo movimiento del banco quedo pegado a otra factura. Es una
//     mejora, no una perdida — pasa cuando aparece una factura que le calza mejor, o
//     cuando un cargo resulta ser el pago agrupado de otras dos.
//   - `perdidas`: el movimiento ya no esta en ninguna parte. Casi siempre significa que
//     falta una cartola, y por eso es lo unico que corta la corrida.
export function regresiones(antes, despues) {
  const ahora = new Map(despues.map((f) => [clave(f), f]));
  const evidenciaUsada = new Set(despues
    .filter((f) => (f['Estado Pago'] || 'SIN EVIDENCIA') !== 'SIN EVIDENCIA')
    .map((f) => [f['Fecha Movimiento'], f['Glosa Banco']].join('|')));

  const perdidas = [];
  const reasignadas = [];
  for (const f of antes) {
    if ((f['Estado Pago'] || 'SIN EVIDENCIA') === 'SIN EVIDENCIA') { continue; }
    if ((ahora.get(clave(f)) || {})['Estado Pago'] !== 'SIN EVIDENCIA') { continue; }
    const caso = {
      clave: clave(f),
      razonSocial: f['Razon Social'],
      total: f['Total'],
      estadoPrevio: f['Estado Pago'],
      glosaPrevia: f['Glosa Banco'],
      fechaPrevia: f['Fecha Movimiento'],
    };
    const bolsa = evidenciaUsada.has([f['Fecha Movimiento'], f['Glosa Banco']].join('|'))
      ? reasignadas : perdidas;
    bolsa.push(caso);
  }
  return { perdidas, reasignadas };
}
