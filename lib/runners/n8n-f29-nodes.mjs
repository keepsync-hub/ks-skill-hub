// datos-sinteticos: los CSV de este archivo son fixtures inventadas con el formato de
// cabeceras del SII; ningun RUT ni razon social de aca corresponde a una empresa real.
//
// Ejecuta el `jsCode` real de los Code nodes del workflow del F29 (Camino A, el de los CSV del
// RCV bajados a mano) contra CSV con el formato exacto del SII.
//
// El patron que sostiene esto: el codigo que corre en n8n no se transcribe al test, se LEE del
// JSON del workflow versionado. Asi el test no puede quedar probando una version distinta de la
// que esta desplegada -- que es el modo de falla clasico de los Code node.
//
// Era identico byte a byte en los dos repos contadores: lo unico que cambiaba era donde estaba
// el JSON del workflow, y eso entra por parametro.

import fs from 'node:fs';
import path from 'node:path';

export async function correrPruebasF29Nodes ({ dirWorkflows }) {
  const wfPath = path.join(dirWorkflows, 'f29-mensual.json');
  const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  const code = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;

  // --- CSV de ventas con cabeceras reales del SII (delimitador ';') ---------
  const ventasCsv = [
    'Nro;Tipo Doc;Tipo Venta;Rut cliente;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA;Monto total;IVA Retenido Total;IVA fuera de plazo',
    '1;33;1;76111111-1;CLIENTE UNO SPA;100;01/07/2026;0;1000000;190000;1190000;0;0',
    '2;33;1;76222222-2;CLIENTE DÓS LTDA;101;05/07/2026;0;500000;95000;595000;0;0',
    '3;39;1;;BOLETAS;102;10/07/2026;0;200000;38000;238000;0;0',
    '4;34;1;76333333-3;EXENTO SA;103;12/07/2026;300000;0;0;300000;0;0',
    '5;61;1;76111111-1;CLIENTE UNO SPA;104;20/07/2026;0;100000;19000;119000;0;0', // nota de credito: resta
    '',
  ].join('\r\n');

  // --- CSV de compras (estado REGISTRO) ------------------------------------
  const comprasCsv = [
    'Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Iva No Recuperable;Codigo IVA No Rec.;Monto Total',
    '1;33;Del Giro;77111111-1;PROVEEDOR UNO;500;03/07/2026;0;400000;76000;0;;476000',
    '2;33;Del Giro;77222222-2;PROVEEDOR DÓS;501;08/07/2026;0;250000;47500;0;;297500',
    '3;33;Supermercado;77333333-3;SUPERMERCADO X;502;09/07/2026;0;50000;0;9500;3;59500', // IVA no recuperable
    '4;61;Del Giro;77111111-1;PROVEEDOR UNO;503;25/07/2026;0;50000;9500;0;;59500', // NC: resta
    '',
  ].join('\r\n');

  function makeCtx(csv, encoding, nodoBusqueda, nombreArchivo) {
    const buf = Buffer.from(csv, encoding);
    return {
      helpers: { getBinaryDataBuffer: async () => buf },
      $: (n) => {
        if (n !== nodoBusqueda) throw new Error('nodo inesperado: ' + n);
        return { first: () => ({ json: { name: nombreArchivo } }) };
      },
    };
  }

  async function run(jsCode, ctx) {
    const fn = new Function('$', 'require', `return (async () => { ${jsCode} })();`);
    return await fn.call(ctx, ctx.$, () => { throw new Error('require bloqueado'); });
  }

  const fail = (m) => { console.error('FALLO: ' + m); process.exitCode = 1; };
  const eq = (label, got, want) => {
    const ok = got === want;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${got}${ok ? '' : ' (esperado ' + want + ')'}`);
    if (!ok) fail(label);
  };

  // === VENTAS (UTF-8) ======================================================
  console.log('\n== Resumir Ventas RCV (UTF-8) ==');
  let ctx = makeCtx(ventasCsv, 'utf8', 'Buscar CSV Ventas', 'rcv-ventas-202607.csv');
  let out = (await run(code('Resumir Ventas RCV'), ctx))[0].json;
  // neto: 1000000 + 500000 + 200000 + 0 - 100000 = 1600000
  eq('netoVentas', out.netoVentas, 1600000);
  // iva: 190000 + 95000 + 38000 + 0 - 19000 = 304000
  eq('ivaVentas', out.ivaVentas, 304000);
  eq('exentoVentas', out.exentoVentas, 300000);
  eq('docsVentas', out.docsVentas, 5);
  eq('tiposQueRequierenRevision', JSON.stringify(out.tiposQueRequierenRevision), '[]');
  eq('archivoVentas', out.archivoVentas, 'rcv-ventas-202607.csv');

  // === VENTAS (ISO-8859-1, para probar el fallback de encoding) ============
  console.log('\n== Resumir Ventas RCV (ISO-8859-1) ==');
  ctx = makeCtx(ventasCsv, 'latin1', 'Buscar CSV Ventas', 'rcv-ventas-202607.csv');
  out = (await run(code('Resumir Ventas RCV'), ctx))[0].json;
  eq('ivaVentas con latin1', out.ivaVentas, 304000);
  const razonOk = JSON.stringify(out.detalleVentasPorTipo).length > 0;
  console.log(`  ${razonOk ? 'ok  ' : 'FAIL'} decodifico sin romper`);

  // === COMPRAS =============================================================
  console.log('\n== Resumir Compras RCV ==');
  ctx = makeCtx(comprasCsv, 'utf8', 'Buscar CSV Compras', 'rcv-compras-202607.csv');
  out = (await run(code('Resumir Compras RCV'), ctx))[0].json;
  // neto: 400000 + 250000 + 50000 - 50000 = 650000
  eq('netoCompras', out.netoCompras, 650000);
  // iva recuperable: 76000 + 47500 + 0 - 9500 = 114000
  eq('ivaCompras', out.ivaCompras, 114000);
  eq('ivaNoRecuperable', out.ivaNoRecuperable, 9500);
  eq('docsCompras', out.docsCompras, 4);

  // === CALCULAR F29 ========================================================
  console.log('\n== Calcular F29 ==');
  const merged = {
    ivaVentas: 304000, netoVentas: 1600000, exentoVentas: 300000, docsVentas: 5, archivoVentas: 'rcv-ventas-202607.csv',
    ivaCompras: 114000, netoCompras: 650000, docsCompras: 4, archivoCompras: 'rcv-compras-202607.csv',
    tiposQueRequierenRevision: [],
    remanenteNuevo: 20000, // remanente arrastrado del periodo anterior
  };
  const calcCtx = {
    $input: { first: () => ({ json: merged }) },
    $now: { minus: () => ({ toFormat: () => '202607' }) },
  };
  const calcFn = new Function('$input', '$now', `return (async () => { ${code('Calcular F29')} })();`);
  const f29 = (await calcFn.call(calcCtx, calcCtx.$input, calcCtx.$now))[0].json;
  eq('periodo', f29.periodo, '202607');
  eq('ivaDebito', f29.ivaDebito, 304000);
  eq('ivaCreditoPeriodo', f29.ivaCreditoPeriodo, 114000);
  eq('remanenteAnterior', f29.remanenteAnterior, 20000);
  eq('ivaCredito (disponible)', f29.ivaCredito, 134000);
  // IVA a pagar: 304000 - 134000 = 170000
  // PPM: base neto + exento = 1600000 + 300000 = 1900000, al 0,25% (14 D N3
  // Pro Pyme General, tramo hasta 50.000 UF) = 4750
  eq('ppm (0,25% sobre neto + exento)', f29.ppm, 4750);
  eq('totalAPagar (IVA + PPM)', f29.totalAPagar, 174750);
  eq('remanenteNuevo', f29.remanenteNuevo, 0);
  eq('trazabilidad compras', f29.origen.archivoCompras, 'rcv-compras-202607.csv');

  // caso remanente: credito > debito
  console.log('\n== Calcular F29 (credito mayor que debito) ==');
  const merged2 = { ...merged, ivaVentas: 50000, netoVentas: 260000 };
  const calcCtx2 = { $input: { first: () => ({ json: merged2 }) }, $now: calcCtx.$now };
  const f29b = (await calcFn.call(calcCtx2, calcCtx2.$input, calcCtx2.$now))[0].json;
  eq('remanenteNuevo arrastrado', f29b.remanenteNuevo, 84000); // 134000 - 50000
  // base 260000 + 300000 = 560000 al 0,25% = 1400
  eq('ppm (0,25% sobre neto + exento)', f29b.ppm, 1400);
  // Con credito mayor que debito no hay IVA que pagar, pero el PPM igual se paga.
  eq('totalAPagar (solo PPM)', f29b.totalAPagar, 1400);

  // === ERRORES =============================================================
  console.log('\n== Manejo de errores ==');
  try {
    await run(code('Resumir Ventas RCV'), makeCtx('Otra;Cosa\n1;2\n', 'utf8', 'Buscar CSV Ventas', 'x.csv'));
    fail('deberia haber lanzado por columna faltante');
  } catch (e) {
    const ok = /Falta la columna/.test(e.message);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} columna faltante -> ${e.message.slice(0, 70)}...`);
    if (!ok) fail('mensaje de error poco claro');
  }
  try {
    await run(code('Resumir Ventas RCV'), makeCtx('', 'utf8', 'Buscar CSV Ventas', 'vacio.csv'));
    fail('deberia haber lanzado por CSV vacio');
  } catch (e) {
    const ok = /esta vacio/.test(e.message);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} csv vacio -> ${e.message}`);
    if (!ok) fail('mensaje de error poco claro');
  }
}
