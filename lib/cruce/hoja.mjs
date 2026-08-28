// La Hoja "Kompu - Facturas recibidas vs pagos" leida y escrita como CSV.
//
// La Hoja es el REGISTRO BASE: sus diez primeras columnas son las facturas que el RCV del
// SII le emitio a Kompu y este modulo no las toca nunca. Las siete ultimas son el estado
// de pago, y son las unicas que el cruce recalcula. Agregar facturas nuevas es trabajo del
// workflow que consulta el RCV (docs/cruce-facturas-pagos.md), no de este modulo.
//
// El CSV se parsea y se escribe a mano, sin dependencias, porque la Hoja trae comas y
// comillas dentro de los campos ("monto exacto + nombre (EASY, RETAIL)") y un split(',')
// las parte por la mitad.

export const COLUMNAS_BASE = [
  'Periodo', 'Tipo Doc', 'Folio', 'RUT Proveedor', 'Razon Social',
  'Fecha Documento', 'Neto', 'IVA', 'Total', 'Estado SII',
];

export const COLUMNAS_PAGO = [
  'Estado Pago', 'Fecha Movimiento', 'Dias Factura a Pago',
  'Glosa Banco', 'Monto Pagado', 'Diferencia', 'Criterio del Match',
];

export const COLUMNAS = [...COLUMNAS_BASE, ...COLUMNAS_PAGO];

// Orden en que se publica la Hoja: primero lo que tiene evidencia, y dentro de cada
// estado por fecha de documento. Es el orden que ya tiene la Hoja publicada.
export const ORDEN_ESTADO = ['PAGADA', 'PAGO AGRUPADO', 'PAGO PROBABLE', 'SIN EVIDENCIA'];

export function parsearCSV(texto) {
  const filas = [];
  let campo = '';
  let fila = [];
  let enComillas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; } else { enComillas = false; }
      } else { campo += c; }
      continue;
    }
    if (c === '"') { enComillas = true; continue; }
    if (c === ',') { fila.push(campo); campo = ''; continue; }
    if (c === '\r') { continue; }
    if (c === '\n') { fila.push(campo); filas.push(fila); campo = ''; fila = []; continue; }
    campo += c;
  }
  if (campo !== '' || fila.length > 0) { fila.push(campo); filas.push(fila); }
  return filas;
}

export function serializarCSV(filas, columnas = COLUMNAS) {
  const escapar = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lineas = [columnas.map(escapar).join(',')];
  for (const fila of filas) { lineas.push(columnas.map((c) => escapar(fila[c])).join(',')); }
  return lineas.join('\r\n') + '\r\n';
}

// Clave de una factura. Es la del RCV: periodo, tipo de documento, folio y RUT del
// proveedor. El folio solo es unico dentro de un emisor, asi que el RUT no sobra.
export function clave(fila) {
  return [fila['Periodo'], fila['Tipo Doc'], fila['Folio'], fila['RUT Proveedor']].join('|');
}

// Lee el CSV exportado de la Hoja y valida que sea la Hoja del cruce y no otra cosa.
// Falla antes de calcular nada: un CSV con otras columnas no se sobrescribe.
export function leerHoja(texto) {
  const filas = parsearCSV(texto).filter((f) => f.some((c) => String(c).trim() !== ''));
  if (filas.length < 2) { throw new Error('la Hoja no tiene filas de datos'); }
  const cabecera = filas[0].map((c) => c.trim());
  for (const col of COLUMNAS) {
    if (!cabecera.includes(col)) {
      throw new Error('la Hoja no trae la columna "' + col + '". No es la Hoja del cruce: no se sobrescribe');
    }
  }
  const facturas = filas.slice(1).map((f) => {
    const obj = {};
    cabecera.forEach((col, i) => { obj[col] = f[i] == null ? '' : f[i]; });
    return obj;
  });
  const vistas = new Set();
  for (const factura of facturas) {
    const k = clave(factura);
    if (vistas.has(k)) { throw new Error('clave repetida en la Hoja: ' + k); }
    vistas.add(k);
  }
  return { cabecera, facturas };
}

// dd/mm/yyyy -> yyyy-mm-dd. El RCV entrega las fechas en formato chileno y todo lo demas
// (cartolas, columnas de pago) trabaja en ISO.
export function fechaDocumentoISO(valor) {
  const m = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) { return m[3] + '-' + m[2] + '-' + m[1]; }
  return /^\d{4}-\d{2}-\d{2}/.test(String(valor || '')) ? String(valor).slice(0, 10) : '';
}

export function ordenarParaPublicar(facturas) {
  const rango = (e) => {
    const i = ORDEN_ESTADO.indexOf(e);
    return i < 0 ? ORDEN_ESTADO.length : i;
  };
  return [...facturas].sort((a, b) => {
    const d = rango(a['Estado Pago']) - rango(b['Estado Pago']);
    if (d !== 0) { return d; }
    const f = fechaDocumentoISO(a['Fecha Documento']).localeCompare(fechaDocumentoISO(b['Fecha Documento']));
    return f !== 0 ? f : clave(a).localeCompare(clave(b));
  });
}
