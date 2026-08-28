// datos-sinteticos: las respuestas del SII de este archivo son inventadas con la forma
// confirmada en la Etapa 0; ningun RUT de aca corresponde a una empresa real.
//
// Ejecuta el `jsCode` real de los Code nodes de `estado-dte-sii-directo.json` contra respuestas
// sinteticas con la forma confirmada contra produccion (ver `docs/nodos-firma-sii.md` en el repo
// consumidor): getDetalleVenta/getDetalleCompra, codRespuesta 0/99/2, y los campos
// detFecAcuse / detFecReclamado / dcvEstadoContab.
//
// Mismo patron que el runner del F29: el codigo que corre en n8n se LEE del JSON del workflow
// versionado en vez de transcribirse, para que el test no pueda quedar probando otra version.
//
// Lo unico especifico de la empresa es el RUT emisor de la configuracion simulada, y entra por
// parametro. Fuera de eso, los dos repos contadores tenian este archivo identico.

import fs from 'node:fs';
import path from 'node:path';

export async function correrPruebasEstadoDteNodes ({ dirWorkflows, rutEmisor, dvEmisor }) {
  const wfPath = path.join(dirWorkflows, 'estado-dte-sii-directo.json');
  const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  const code = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;

  const fail = (m) => { console.error('FALLO: ' + m); process.exitCode = 1; };
  const eq = (label, got, want) => {
    const iguales = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${iguales ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}${iguales ? '' : ' (esperado ' + JSON.stringify(want) + ')'}`);
    if (!iguales) fail(label);
  };

  // --- Normalizar y Detectar Cambios --------------------------------------
  // El nodo no usa $input; lee cada fuente por nombre via $(nodo) y el
  // snapshot anterior via $('Leer Estado Anterior').all(). Se simula ese
  // contexto a mano, igual que el resto de los tests de este repo.
  function filaSii(overrides) {
    return {
      detTipoDoc: 33,
      detRutDoc: 76000000,
      detDvDoc: '5',
      detRznSoc: 'CLIENTE DE PRUEBA SPA',
      detNroDoc: 100,
      detFchDoc: '01/08/2026',
      detFecAcuse: null,
      detFecReclamado: null,
      detMntNeto: 100000,
      detMntIVA: 19000,
      detMntTotal: 119000,
      dcvEstadoContab: null,
      ...overrides
    };
  }

  function respRespuesta(filas) {
    return { data: filas, respEstado: { codRespuesta: 0, msgeRespuesta: null, codError: null } };
  }
  const respSinDocumentos = { data: null, respEstado: { codRespuesta: 99, msgeRespuesta: 'No es posible realizar esta consulta, no hay documentos o debe ser de forma diferida', codError: null } };
  const respErrorValidacion = { data: null, metaData: { errors: [{ id: '0', descripcion: 'Data.TipoDoc no puede ser nulo' }] }, respEstado: { codRespuesta: 2, msgeRespuesta: null, codError: 'cdvc17.05.04' } };

  function makeCtx({ ventaActual, ventaAnterior, compraRegistro, compraPendiente, compraReclamado, compraNoIncluir, previas, hoyISO, hoyMillis }) {
    const respuestas = {
      'Consultar Venta Actual': ventaActual,
      'Consultar Venta Anterior': ventaAnterior,
      'Consultar Compra Registro': compraRegistro,
      'Consultar Compra Pendiente': compraPendiente,
      'Consultar Compra Reclamado': compraReclamado,
      'Consultar Compra No Incluir': compraNoIncluir,
      'Configuracion Estado DTE': { rutEmisor, dvEmisor, correoResponsable: 'x@x.cl', umbralDias: 8, tiposDoc: ['33'] },
      'Leer Token (Estado DTE)': { periodoActual: '202608', periodoAnterior: '202607' },
      'Leer Estado Anterior': previas || []
    };
    const dollar = (nombre) => {
      if (!(nombre in respuestas) || respuestas[nombre] === undefined) throw new Error("Node '" + nombre + "' hasn't been executed");
      const v = respuestas[nombre];
      return {
        first: () => ({ json: v }),
        all: () => (Array.isArray(v) ? v.map((json) => ({ json })) : []),
        item: { json: v }
      };
    };
    return { $: dollar, $now: { toMillis: () => hoyMillis, toISO: () => hoyISO } };
  }

  async function run(jsCode, ctx) {
    const fn = new Function('$', '$now', `return (async () => { ${jsCode} })();`);
    return await fn.call(ctx, ctx.$, ctx.$now);
  }

  const HOY = new Date('2026-08-21T12:00:00.000Z').getTime();
  const HOY_ISO = '2026-08-21T12:00:00.000Z';

  console.log('\n== Normalizar y Detectar Cambios: documento nuevo, PENDIENTE, sin alerta ==');
  let ctx = makeCtx({
    ventaActual: respRespuesta([filaSii({ detNroDoc: 1, detFchDoc: '20/08/2026' })]),
    ventaAnterior: respSinDocumentos,
    compraRegistro: respSinDocumentos,
    compraPendiente: respSinDocumentos,
    compraReclamado: respSinDocumentos,
    compraNoIncluir: respSinDocumentos,
    previas: [],
    hoyMillis: HOY,
    hoyISO: HOY_ISO
  });
  let out = await run(code('Normalizar y Detectar Cambios'), ctx);
  eq('cantidad de documentos', out.length, 1);
  eq('estado', out[0].json.estado, 'PENDIENTE');
  eq('diasDesdeDocumento (1 dia)', out[0].json.diasDesdeDocumento, 1);
  eq('alertaAceptacionTacita', out[0].json.alertaAceptacionTacita, false);
  eq('debeNotificar', out[0].json.debeNotificar, false);

  console.log('\n== Normalizar y Detectar Cambios: 39 dias sin respuesta -> alerta tacita ==');
  ctx = makeCtx({
    ventaActual: respSinDocumentos,
    ventaAnterior: respRespuesta([filaSii({ detNroDoc: 1, detFchDoc: '13/07/2026' })]),
    compraRegistro: respSinDocumentos,
    compraPendiente: respSinDocumentos,
    compraReclamado: respSinDocumentos,
    compraNoIncluir: respSinDocumentos,
    previas: [],
    hoyMillis: HOY,
    hoyISO: HOY_ISO
  });
  out = await run(code('Normalizar y Detectar Cambios'), ctx);
  eq('diasDesdeDocumento (39 dias)', out[0].json.diasDesdeDocumento, 39);
  eq('alertaAceptacionTacita', out[0].json.alertaAceptacionTacita, true);
  eq('debeNotificar (primera vez)', out[0].json.debeNotificar, true);

  console.log('\n== Normalizar y Detectar Cambios: alerta ya notificada -> no repetir ==');
  ctx = makeCtx({
    ventaActual: respSinDocumentos,
    ventaAnterior: respRespuesta([filaSii({ detNroDoc: 1, detFchDoc: '13/07/2026' })]),
    compraRegistro: respSinDocumentos,
    compraPendiente: respSinDocumentos,
    compraReclamado: respSinDocumentos,
    compraNoIncluir: respSinDocumentos,
    previas: [{ operacion: 'VENTA', tipoDoc: '33', folio: '1', estado: 'PENDIENTE', notificado: true }],
    hoyMillis: HOY,
    hoyISO: HOY_ISO
  });
  out = await run(code('Normalizar y Detectar Cambios'), ctx);
  eq('debeNotificar (ya notificada)', out[0].json.debeNotificar, false);
  eq('notificado se mantiene', out[0].json.notificado, true);

  console.log('\n== Normalizar y Detectar Cambios: cambio de estado PENDIENTE -> ACEPTADA ==');
  ctx = makeCtx({
    ventaActual: respRespuesta([filaSii({ detNroDoc: 1, detFchDoc: '18/08/2026', detFecAcuse: '21/08/2026 10:00:00' })]),
    ventaAnterior: respSinDocumentos,
    compraRegistro: respSinDocumentos,
    compraPendiente: respSinDocumentos,
    compraReclamado: respSinDocumentos,
    compraNoIncluir: respSinDocumentos,
    previas: [{ operacion: 'VENTA', tipoDoc: '33', folio: '1', estado: 'PENDIENTE', notificado: false }],
    hoyMillis: HOY,
    hoyISO: HOY_ISO
  });
  out = await run(code('Normalizar y Detectar Cambios'), ctx);
  eq('estado', out[0].json.estado, 'ACEPTADA');
  eq('estadoAnterior', out[0].json.estadoAnterior, 'PENDIENTE');
  eq('cambioDetectado', out[0].json.cambioDetectado, true);
  eq('debeNotificar (cambio de estado)', out[0].json.debeNotificar, true);

  console.log('\n== Normalizar y Detectar Cambios: reclamo -> RECLAMADA ==');
  ctx = makeCtx({
    ventaActual: respSinDocumentos,
    ventaAnterior: respSinDocumentos,
    compraRegistro: respSinDocumentos,
    compraPendiente: respSinDocumentos,
    compraReclamado: respRespuesta([filaSii({ detNroDoc: 500, detFchDoc: '05/08/2026', detFecReclamado: '12/08/2026 09:00:00' })]),
    compraNoIncluir: respSinDocumentos,
    previas: [],
    hoyMillis: HOY,
    hoyISO: HOY_ISO
  });
  out = await run(code('Normalizar y Detectar Cambios'), ctx);
  eq('estado', out[0].json.estado, 'RECLAMADA');
  eq('operacion', out[0].json.operacion, 'COMPRA');
  eq('debeNotificar (primera vez ya resuelto)', out[0].json.debeNotificar, true);

  console.log('\n== Normalizar y Detectar Cambios: primera vez y PENDIENTE reciente -> no avisar ==');
  ctx = makeCtx({
    ventaActual: respRespuesta([filaSii({ detNroDoc: 900, detFchDoc: '20/08/2026' })]),
    ventaAnterior: respSinDocumentos,
    compraRegistro: respSinDocumentos,
    compraPendiente: respSinDocumentos,
    compraReclamado: respSinDocumentos,
    compraNoIncluir: respSinDocumentos,
    previas: [],
    hoyMillis: HOY,
    hoyISO: HOY_ISO
  });
  out = await run(code('Normalizar y Detectar Cambios'), ctx);
  eq('debeNotificar (PENDIENTE recien visto)', out[0].json.debeNotificar, false);

  console.log('\n== Normalizar y Detectar Cambios: codRespuesta 99 en todas -> 0 documentos, sin error ==');
  ctx = makeCtx({
    ventaActual: respSinDocumentos,
    ventaAnterior: respSinDocumentos,
    compraRegistro: respSinDocumentos,
    compraPendiente: respSinDocumentos,
    compraReclamado: respSinDocumentos,
    compraNoIncluir: respSinDocumentos,
    previas: [],
    hoyMillis: HOY,
    hoyISO: HOY_ISO
  });
  out = await run(code('Normalizar y Detectar Cambios'), ctx);
  eq('sin documentos, sin lanzar error', out.length, 0);

  console.log('\n== Normalizar y Detectar Cambios: las 6 fuentes fallan de verdad -> lanza error ==');
  ctx = makeCtx({
    ventaActual: respErrorValidacion,
    ventaAnterior: respErrorValidacion,
    compraRegistro: respErrorValidacion,
    compraPendiente: respErrorValidacion,
    compraReclamado: respErrorValidacion,
    compraNoIncluir: respErrorValidacion,
    previas: [],
    hoyMillis: HOY,
    hoyISO: HOY_ISO
  });
  try {
    await run(code('Normalizar y Detectar Cambios'), ctx);
    fail('deberia haber lanzado: las 6 fuentes fallaron de verdad');
  } catch (e) {
    const ok = /Ninguna consulta de detalle DTE devolvio datos utilizables/.test(e.message);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} lanza error -> ${e.message.slice(0, 80)}...`);
    if (!ok) fail('mensaje de error poco claro');
  }

  // --- Armar Correo Cambios DTE -------------------------------------------
  console.log('\n== Armar Correo Cambios DTE: 0 items -> no manda correo ==');
  const correoCtx = (items, avisos) => ({
    $input: { all: () => items },
    $: (nombre) => {
      if (nombre !== 'Configuracion Estado DTE') throw new Error('nodo inesperado: ' + nombre);
      return { first: () => ({ json: { correoResponsable: 'x@x.cl' } }) };
    }
  });
  async function runCorreo(items) {
    const fn = new Function('$input', '$', `return (async () => { ${code('Armar Correo Cambios DTE')} })();`);
    const ctx = correoCtx(items);
    return await fn.call(ctx, ctx.$input, ctx.$);
  }
  let correoOut = await runCorreo([]);
  eq('0 items -> [] (Gmail no corre)', correoOut, []);

  console.log('\n== Armar Correo Cambios DTE: agrupa por VENTA/COMPRA y marca OJO en compra reclamada ==');
  correoOut = await runCorreo([
    { json: { operacion: 'VENTA', folio: '1', tipoDoc: '33', razonSocialContraparte: 'Cliente Uno', cambioDetectado: false, alertaAceptacionTacita: true, diasDesdeDocumento: 10, estado: 'PENDIENTE', estadoAnterior: 'PENDIENTE', total: 119000, avisosOrigen: [] } },
    { json: { operacion: 'COMPRA', folio: '500', tipoDoc: '33', razonSocialContraparte: 'Proveedor Uno', cambioDetectado: true, alertaAceptacionTacita: false, diasDesdeDocumento: 7, estado: 'RECLAMADA', estadoAnterior: 'PENDIENTE', total: 59500, avisosOrigen: [] } }
  ]);
  const cuerpo = correoOut[0].json.cuerpo;
  eq('asunto cuenta 2 documentos', correoOut[0].json.asunto, 'Cambios de estado DTE (2 documentos)');
  console.log(`  ${cuerpo.includes('FACTURAS EMITIDAS (VENTA):') ? 'ok  ' : 'FAIL'} seccion VENTA presente`);
  if (!cuerpo.includes('FACTURAS EMITIDAS (VENTA):')) fail('falta seccion VENTA');
  console.log(`  ${cuerpo.includes('OJO: no debe entrar al credito fiscal del F29') ? 'ok  ' : 'FAIL'} aviso de credito fiscal en compra reclamada`);
  if (!cuerpo.includes('OJO: no debe entrar al credito fiscal del F29')) fail('falta el aviso de credito fiscal');
}
