// El criterio de cruce entre las facturas del RCV y los movimientos del banco.
//
// **El monto exacto manda.** La fecha no filtra: una factura se paga a 30, 60 o 90 dias,
// asi que exigir cercania perderia pagos reales. Se comprobo empiricamente contra
// produccion — con ventana de +-3 dias, +-180 dias o sin ventana alguna el resultado es
// identico (docs/cruce-facturas-pagos.md). La fecha solo desempata: cuando dos
// movimientos calzan con la misma factura, gana el mas cercano en el tiempo.
//
// El cruce es INDICIARIO, no contable. Por eso cada fila dice con que criterio se
// resolvio y lo que no tiene el nombre del proveedor va marcado REVISAR.
//
// `SIN EVIDENCIA` no significa impaga: significa que estas cartolas no lo saben. Marcar
// como pendiente una factura pagada por otro medio produce un pasivo ficticio.

import { normalizarGlosa, glosaParaHoja, sinAcentos, diasEntre } from './cartola.mjs';
import { fechaDocumentoISO, clave } from './hoja.mjs';

// La glosa del banco rara vez trae el RUT, asi que el nombre se compara por tokens. Estos
// alias son los casos donde el comercio y el proveedor se llaman distinto de verdad.
export const ALIAS = [
  ['MERCADOPAGO', 'MERCADOLIBRE'],
  ['MERCADOL', 'MERCADOLIBRE'],
  ['CCS', 'CAMARA DE COMERCIO DE SANTIAGO'],
];

// Terminos societarios y palabras cortas que aparecen en toda razon social.
const VACIAS_PROVEEDOR = new Set(['SA', 'SPA', 'LTDA', 'LIMITADA', 'EIRL', 'AG', 'CIA', 'COMPANIA',
  'SOCIEDAD', 'COMERCIAL', 'CHILE', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'EN',
  'AGENCIA', 'SERVICIOS', 'EMPRESA', 'INVERSIONES', 'DISTRIBUIDORA']);

export function tokensProveedor(razonSocial) {
  const limpio = sinAcentos(razonSocial).toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
  const tokens = limpio.split(' ').filter((t) => t.length >= 3 && !VACIAS_PROVEEDOR.has(t));
  return [...new Set(tokens)];
}

function expandirAlias(glosaNormalizada) {
  let s = ' ' + glosaNormalizada + ' ';
  for (const [comercio, proveedor] of ALIAS) {
    if (s.includes(' ' + comercio + ' ')) { s += ' ' + proveedor + ' '; }
  }
  return s.replace(/[^A-Z0-9]+/g, ' ');
}

// Devuelve los tokens del proveedor que aparecen en la glosa del banco, o [] si ninguno.
// Un solo token de 4 letras o mas basta: la glosa viene truncada por el banco
// ("MERCADOPAGO *TECNOOFE") y exigir la razon social completa no cruzaria nunca.
export function tokensQueCoinciden(razonSocial, glosa) {
  const enGlosa = ' ' + expandirAlias(normalizarGlosa(glosa)) + ' ';
  return tokensProveedor(razonSocial).filter((t) => t.length >= 4 && enGlosa.includes(' ' + t + ' '));
}

const monto = (factura) => Number(String(factura['Total'] || '').replace(/[^\d-]/g, ''));

function aplicar(factura, estado, mov, criterio, montoPagado) {
  const pagado = montoPagado == null ? mov.monto : montoPagado;
  factura['Estado Pago'] = estado;
  factura['Fecha Movimiento'] = mov.fecha;
  factura['Dias Factura a Pago'] = String(diasEntre(fechaDocumentoISO(factura['Fecha Documento']), mov.fecha));
  factura['Glosa Banco'] = glosaParaHoja(mov.glosa);
  factura['Monto Pagado'] = String(pagado);
  factura['Diferencia'] = String(pagado - monto(factura));
  factura['Criterio del Match'] = criterio;
}

export function sinEvidencia(factura) {
  factura['Estado Pago'] = 'SIN EVIDENCIA';
  for (const col of ['Fecha Movimiento', 'Dias Factura a Pago', 'Glosa Banco',
    'Monto Pagado', 'Diferencia', 'Criterio del Match']) { factura[col] = ''; }
}

// Empareja facturas y movimientos por monto exacto resolviendo primero los pares mas
// cercanos en el tiempo. La cercania no filtra —una factura se paga a 30, 60 o 90 dias—
// pero desempata: es lo que hace que, con dos facturas de Lenovo de $79.991 y dos cargos
// del mismo monto, cada factura se lleve el cargo de su propio dia en vez de cruzarse.
// Resolver los pares mas cercanos primero, en vez de ir factura por factura, evita ademas
// que el orden en que se recorren las facturas decida quien se queda con que movimiento.
function emparejar(pendientes, movs, exigirNombre) {
  const pares = [];
  for (const factura of pendientes) {
    const total = monto(factura);
    const fechaDoc = fechaDocumentoISO(factura['Fecha Documento']);
    for (const c of movs) {
      if (c.usado || c.mov.monto !== total) { continue; }
      const tokens = tokensQueCoinciden(factura['Razon Social'], c.mov.glosa);
      if (exigirNombre && tokens.length === 0) { continue; }
      pares.push({ factura, c, tokens, dias: Math.abs(diasEntre(fechaDoc, c.mov.fecha)) });
    }
  }
  pares.sort((a, b) => a.dias - b.dias ||
    a.c.mov.fecha.localeCompare(b.c.mov.fecha) ||
    clave(a.factura).localeCompare(clave(b.factura)) ||
    a.c.i - b.c.i);
  const tomadas = new Set();
  const asignaciones = [];
  for (const par of pares) {
    const k = clave(par.factura);
    if (tomadas.has(k) || par.c.usado) { continue; }
    tomadas.add(k);
    par.c.usado = true;
    asignaciones.push(par);
  }
  return asignaciones;
}

// Cruza las facturas de la Hoja contra la evidencia consolidada de las cartolas.
//
// Muta las columnas de pago de cada factura (las diez columnas base no se tocan) y
// devuelve `{ movimientosSinFactura }`: los cargos del banco que no calzaron con ninguna
// factura. Casi siempre son gasto que no pasa por el RCV —comida, parking, Google Ads,
// pagos al SII—, pero conviene mirarlos.
//
// Tres pasadas, de mas a menos evidencia:
//   1. `PAGADA`         monto exacto Y el nombre del comercio coincide con el proveedor.
//   2. `PAGO AGRUPADO`  un cargo que es la suma exacta de 2 o 3 facturas del mismo
//                       proveedor, con el nombre coincidiendo. Va marcado REVISAR.
//   3. `PAGO PROBABLE`  monto exacto solamente. Va marcado REVISAR.
//
// Un movimiento se asigna a una sola factura (o a un solo grupo).
export function cruzar(facturas, evidencia, opciones = {}) {
  const maxAgrupado = opciones.maxFacturasPorPago == null ? 3 : opciones.maxFacturasPorPago;
  const movs = evidencia.map((mov, i) => ({ mov, i, usado: false }));
  for (const factura of facturas) { sinEvidencia(factura); }

  const pendientes = () => facturas.filter((f) => f['Estado Pago'] === 'SIN EVIDENCIA');

  // 1. Monto exacto + nombre.
  for (const par of emparejar(pendientes(), movs, true)) {
    aplicar(par.factura, 'PAGADA', par.c.mov, 'monto exacto + nombre (' + par.tokens.join(', ') + ')');
  }

  // 2. Un cargo que paga varias facturas del mismo proveedor. Existe de verdad: el cargo
  //    INGRAM MICRO LINK de $1.516.246 del 28/07 es la suma exacta de dos facturas de
  //    Ingram Micro del mismo dia. Se exige mismo RUT y nombre coincidente porque una
  //    suma que calza por casualidad es mucho mas facil de encontrar que un monto suelto.
  if (maxAgrupado >= 2) {
    for (const candidato of movs.filter((c) => !c.usado && c.mov.monto > 0)) {
      const grupo = buscarGrupo(pendientes(), candidato.mov, maxAgrupado);
      if (!grupo) { continue; }
      candidato.usado = true;
      const folios = grupo.map((f) => f['Folio']);
      for (const factura of grupo) {
        const otros = folios.filter((x) => x !== factura['Folio']);
        aplicar(factura, 'PAGO AGRUPADO', candidato.mov,
          'un solo cargo de ' + candidato.mov.monto + ' cubre ' + grupo.length + ' facturas ' +
          '(folios ' + otros.join(', ') + '): REVISAR', monto(factura));
      }
    }
  }

  // 3. Monto exacto y nada mas.
  for (const par of emparejar(pendientes(), movs, false)) {
    aplicar(par.factura, 'PAGO PROBABLE', par.c.mov, 'solo monto exacto, el nombre no coincide: REVISAR');
  }

  return { movimientosSinFactura: movs.filter((c) => !c.usado).map((c) => c.mov) };
}

// Busca 2..max facturas del mismo proveedor que sumen exactamente el cargo. Devuelve el
// grupo mas pequeno y mas cercano en el tiempo, o null.
function buscarGrupo(pendientes, mov, max) {
  const porRut = new Map();
  for (const factura of pendientes) {
    if (tokensQueCoinciden(factura['Razon Social'], mov.glosa).length === 0) { continue; }
    if (monto(factura) <= 0 || monto(factura) >= mov.monto) { continue; }
    const lista = porRut.get(factura['RUT Proveedor']) || [];
    lista.push(factura);
    porRut.set(factura['RUT Proveedor'], lista);
  }
  for (const lista of porRut.values()) {
    // Acotado a las 40 facturas mas cercanas al cargo: sin tope, un proveedor con cientos
    // de facturas convierte la busqueda de combinaciones en un problema intratable.
    const cercanas = [...lista]
      .sort((a, b) => Math.abs(diasEntre(fechaDocumentoISO(a['Fecha Documento']), mov.fecha)) -
        Math.abs(diasEntre(fechaDocumentoISO(b['Fecha Documento']), mov.fecha)))
      .slice(0, 40);
    for (let tam = 2; tam <= max; tam++) {
      const grupo = combinar(cercanas, tam, mov.monto);
      if (grupo) { return grupo; }
    }
  }
  return null;
}

function combinar(facturas, tam, objetivo, desde = 0, acumulado = []) {
  if (acumulado.length === tam) {
    return acumulado.reduce((t, f) => t + monto(f), 0) === objetivo ? acumulado : null;
  }
  for (let i = desde; i < facturas.length; i++) {
    const parcial = acumulado.reduce((t, f) => t + monto(f), 0) + monto(facturas[i]);
    if (parcial > objetivo) { continue; }
    const encontrado = combinar(facturas, tam, objetivo, i + 1, [...acumulado, facturas[i]]);
    if (encontrado) { return encontrado; }
  }
  return null;
}
