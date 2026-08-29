// Validación 3-way match del ciclo comercial: Cotización vs Orden de Compra vs Factura.
//
// Función pura, sin dependencias externas. Sirve tanto para el validador de tests
// (ventas/test/three-way-match.test.mjs) como para reutilizarse tal cual dentro de un
// Code node de n8n si más adelante se automatiza el flujo.
//
// La idea del 3-way match: antes de pagar una factura, los tres documentos que la respaldan
// tienen que "cuadrar". Si el monto cotizado, el de la orden de compra y el de la factura no
// coinciden —o la factura factura más de lo que autoriza la OC— hay una discrepancia que un
// humano debe revisar antes de que salga plata.

const TIPOS_MONTO = ['neto', 'iva', 'total'];

// Normaliza un RUT chileno a comparación robusta: sin puntos, guiones ni espacios, en mayúscula.
// Un mismo RUT escrito con puntos, con guion o pegado se considera el mismo.
export function normalizaRut(rut) {
  return String(rut ?? '').replace(/[.\-\s]/g, '').toUpperCase();
}

// Normaliza un número de OC para comparar la referencia citada en la factura contra la OC real,
// tolerando espacios y diferencias de mayúsculas. "OC-2026-014" == "oc-2026-014".
export function normalizaNumeroOC(x) {
  return String(x ?? '').replace(/\s+/g, '').toUpperCase();
}

// ¿La referencia de la factura (texto libre) menciona el número de la OC?
// La factura del SII trae algo como "... Orden Compra N° OC-2026-014 del 2026-03-10",
// así que buscamos el número normalizado como subcadena del texto normalizado.
function facturaCitaLaOC(refOC, numeroOC) {
  const ref = normalizaNumeroOC(refOC);
  const oc = normalizaNumeroOC(numeroOC);
  return oc.length > 0 && ref.includes(oc);
}

// Compara los montos de un mismo tipo (neto/iva/total) entre los tres documentos.
// Devuelve la diferencia máxima observada (max - min); 0 significa que cuadran exacto.
function difMaxima(valores) {
  const nums = valores.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length < valores.length) return Infinity; // falta algún monto -> no se puede cuadrar
  return Math.max(...nums) - Math.min(...nums);
}

/**
 * Valida una operación comercial con la regla 3-way match.
 *
 * @param {object} op - Operación con { cliente, proveedor, cotizacion, ordenCompra, factura }.
 *   - cliente:   { rut }
 *   - proveedor: { rut }
 *   - cotizacion:  { ref, neto, iva, total }
 *   - ordenCompra: { numero, estado, neto, iva, total, rutCliente?, rutProveedor? }
 *   - factura:     { folio, neto, iva, total, refOC, rutCliente?, rutProveedor? }
 * @param {object} [opciones]
 *   - tolerancia: diferencia máxima en CLP admitida entre montos (default 0 = exacto).
 * @returns {{ resultado: 'OK'|'DISCREPANCIA', checks: Array, diferencias: Array }}
 */
export function validar3Way(op, opciones = {}) {
  const tolerancia = Number.isFinite(opciones.tolerancia) ? opciones.tolerancia : 0;
  const checks = [];
  const diferencias = [];
  const add = (nombre, ok, detalle) => checks.push({ nombre, ok, detalle });

  const cot = op?.cotizacion;
  const oc = op?.ordenCompra;
  const fac = op?.factura;

  // 1. Los tres documentos tienen que existir.
  const presentes = Boolean(cot) && Boolean(oc) && Boolean(fac);
  add(
    'documentos_presentes',
    presentes,
    presentes
      ? 'Cotización, OC y factura presentes'
      : `Faltan documentos: ${[!cot && 'cotización', !oc && 'OC', !fac && 'factura'].filter(Boolean).join(', ')}`,
  );
  if (!presentes) {
    return { resultado: 'DISCREPANCIA', checks, diferencias };
  }

  // 2. Los montos (neto, IVA, total) cuadran entre los tres documentos, dentro de la tolerancia.
  for (const tipo of TIPOS_MONTO) {
    const valores = [cot[tipo], oc[tipo], fac[tipo]];
    const dif = difMaxima(valores);
    const ok = dif <= tolerancia;
    add(
      `montos_cuadran_${tipo}`,
      ok,
      ok
        ? `${tipo}: ${valores.join(' = ')}`
        : `${tipo} no cuadra — cotización ${cot[tipo]} / OC ${oc[tipo]} / factura ${fac[tipo]} (dif ${dif})`,
    );
    if (!ok) diferencias.push({ tipo, cotizacion: cot[tipo], ordenCompra: oc[tipo], factura: fac[tipo], dif });
  }

  // 3. No sobre-facturación: la factura no puede cobrar más que la OC, ni la OC más que lo cotizado.
  const noSobreFacturaOC = fac.total <= oc.total + tolerancia;
  add(
    'factura_no_excede_oc',
    noSobreFacturaOC,
    noSobreFacturaOC
      ? `factura ${fac.total} <= OC ${oc.total}`
      : `factura ${fac.total} EXCEDE OC ${oc.total}`,
  );
  const ocNoExcedeCotizacion = oc.total <= cot.total + tolerancia;
  add(
    'oc_no_excede_cotizacion',
    ocNoExcedeCotizacion,
    ocNoExcedeCotizacion
      ? `OC ${oc.total} <= cotización ${cot.total}`
      : `OC ${oc.total} EXCEDE cotización ${cot.total}`,
  );

  // 4. Trazabilidad cruzada: la factura debe citar el número de la OC en sus referencias.
  const cita = facturaCitaLaOC(fac.refOC, oc.numero);
  add(
    'factura_referencia_oc',
    cita,
    cita
      ? `factura referencia OC ${oc.numero}`
      : `la factura no referencia la OC ${oc.numero} (refOC: "${fac.refOC ?? ''}")`,
  );

  // 5. La OC tiene que estar aceptada por el comprador.
  const aceptada = String(oc.estado ?? '').trim().toLowerCase() === 'aceptada';
  add('oc_aceptada', aceptada, aceptada ? 'OC en estado Aceptada' : `OC en estado "${oc.estado ?? ''}"`);

  // 6. RUTs consistentes donde estén declarados (cliente y proveedor esperados vs. los de cada doc).
  const rutClienteEsperado = normalizaRut(op?.cliente?.rut);
  const rutProveedorEsperado = normalizaRut(op?.proveedor?.rut);
  const rutsDeclarados = [
    ['OC.cliente', oc.rutCliente, rutClienteEsperado],
    ['OC.proveedor', oc.rutProveedor, rutProveedorEsperado],
    ['factura.cliente', fac.rutCliente, rutClienteEsperado],
    ['factura.proveedor', fac.rutProveedor, rutProveedorEsperado],
  ].filter(([, valor]) => valor != null && String(valor).length > 0);

  const rutsInconsistentes = rutsDeclarados.filter(
    ([, valor, esperado]) => esperado.length > 0 && normalizaRut(valor) !== esperado,
  );
  const rutsOk = rutsInconsistentes.length === 0;
  add(
    'ruts_consistentes',
    rutsOk,
    rutsOk
      ? 'RUT cliente y proveedor consistentes en los documentos declarados'
      : `RUT inconsistente en: ${rutsInconsistentes.map(([campo]) => campo).join(', ')}`,
  );

  const resultado = checks.every((c) => c.ok) ? 'OK' : 'DISCREPANCIA';
  return { resultado, checks, diferencias };
}
