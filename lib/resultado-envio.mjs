// Parser puro del RESULTADO_ENVIO que el SII (siidte@sii.cl) devuelve por correo
// como acuse de recepcion de cada envio de DTE emitidos. Es la misma logica de
// regex que corre embebida en el nodo Code "Parse RESULTADO_ENVIO" del workflow
// n8n/workflows/dte-envios-acuses.json — el test valida que ambas coincidan.
//
// El RESULTADO_ENVIO es un XML pequeno (ISO-8859-1) con la identificacion del
// envio (RUTs, TRACKID, timestamp de recepcion, estado) y una o mas SUBTOTAL
// con el conteo por tipo de documento. No trae los folios ni los montos: es un
// acuse de que el SII proceso el envio, no el DTE en si.

const TIPO_NOMBRES = {
  '33': 'Factura Electronica',
  '34': 'Factura No Afecta o Exenta Electronica',
  '39': 'Boleta Electronica',
  '41': 'Boleta Exenta Electronica',
  '43': 'Liquidacion Factura Electronica',
  '46': 'Factura de Compra Electronica',
  '52': 'Guia de Despacho Electronica',
  '56': 'Nota de Debito Electronica',
  '61': 'Nota de Credito Electronica',
  '110': 'Factura de Exportacion Electronica',
  '111': 'Nota de Debito de Exportacion Electronica',
  '112': 'Nota de Credito de Exportacion Electronica',
};

export function nombreTipoDoc(codigo) {
  return TIPO_NOMBRES[codigo] || ('Tipo ' + codigo);
}

function first(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>'));
  return m ? m[1].trim() : null;
}

// Suma el entero de todas las apariciones de cualquiera de los tags (para
// envios con varios SUBTOTAL). Devuelve 0 si ninguno aparece — en el SII la
// ausencia del tag equivale a cero (los envios aceptados no traen RECHAZA/REPARO).
function sumTag(xml, tags) {
  let total = 0;
  let found = false;
  for (const t of tags) {
    const re = new RegExp('<' + t + '>\\s*(\\d+)\\s*<\\/' + t + '>', 'g');
    let m;
    while ((m = re.exec(xml)) !== null) {
      total += parseInt(m[1], 10);
      found = true;
    }
  }
  return found ? total : 0;
}

export function parseResultadoEnvio(xml) {
  const trackId = first(xml, 'TRACKID');
  const rutEmisor = first(xml, 'RUTEMISOR');
  const rutEnvia = first(xml, 'RUTENVIA');
  const tms = first(xml, 'TMSTRECEPCION') || '';
  const estado = first(xml, 'ESTADO') || '';
  const informados = sumTag(xml, ['INFORMADO']);
  const aceptados = sumTag(xml, ['ACEPTA', 'ACEPTADO', 'ACEPTADOS']);
  const rechazos = sumTag(xml, ['RECHAZA', 'RECHAZADO', 'RECHAZADOS', 'RECHAZO']);
  const reparos = sumTag(xml, ['REPARO', 'REPAROS', 'REPARADO']);

  const tipos = [];
  const reT = /<TIPODOC>\s*(\d+)\s*<\/TIPODOC>/g;
  let mt;
  while ((mt = reT.exec(xml)) !== null) tipos.push(mt[1]);
  const tipoDoc = tipos.join(',');
  const tipoDocNombre = tipos.length === 1
    ? nombreTipoDoc(tipos[0])
    : tipos.map(nombreTipoDoc).join(', ');

  const dm = tms.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  let fechaRecepcion = null;
  let periodo = null;
  let ymd = null;
  if (dm) {
    fechaRecepcion = dm[3] + '-' + dm[2] + '-' + dm[1] + 'T' + dm[4] + ':' + dm[5] + ':' + dm[6];
    periodo = dm[3] + dm[2];
    ymd = dm[3] + dm[2] + dm[1];
  }

  const noAceptados = informados - aceptados;
  const requiereRevision = (noAceptados > 0) || (rechazos > 0) || (reparos > 0) || (estado.indexOf('EPR') !== 0);

  return {
    trackId, rutEmisor, rutEnvia, tms, fechaRecepcion, estado,
    tipoDoc, tipoDocNombre, informados, aceptados, rechazos, reparos,
    noAceptados, requiereRevision, periodo, ymd,
  };
}
