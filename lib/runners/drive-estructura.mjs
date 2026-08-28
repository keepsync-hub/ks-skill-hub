// Verifica que un repo contador sea consistente con la estructura de Drive declarada en su
// propio `drive/estructura.json` (la fuente unica de verdad de los IDs de carpeta).
//
// Era identico byte a byte en `ks-contador-jf` y en `ks-contador-kompu`, porque no sabe de
// ninguna empresa: todo lo especifico entra por parametro o sale del manifiesto. El repo
// conserva su `drive/estructura.test.mjs`, que ahora solo llama a esta funcion.
//
// Lo que valida, en cuatro bloques:
//   1. El manifiesto es internamente consistente: IDs presentes, con formato de Drive y unicos.
//   2. Los workflows de n8n apuntan a las carpetas del manifiesto (por ID, no por nombre).
//   3. Ningun archivo del repo nombra una carpeta ya retirada. Es la guarda que impide que una
//      instancia clonada siga escribiendo en el Drive de la instancia anterior.
//   4. El nombre nuevo de la raiz aparece en la documentacion.
//
// No devuelve nada: escribe el informe por consola y deja `process.exitCode = 1` si algo falla,
// que es como se comportan todos los tests de estos repos.

import fs from 'node:fs';
import path from 'node:path';

export function verificarEstructuraDrive ({
  raiz,
  dirManifiesto,
  docsQueNombranLaRaiz = ['README.md', 'ventas/README.md', 'drive/README.md'],
}) {
  const manifiesto = JSON.parse(fs.readFileSync(path.join(dirManifiesto, 'estructura.json'), 'utf8'));

  const fail = (m) => { console.error('FALLO: ' + m); process.exitCode = 1; };
  const eq = (label, got, want) => {
    const iguales = got === want;
    console.log(`  ${iguales ? 'ok  ' : 'FAIL'} ${label}: ${got}${iguales ? '' : ' (esperado ' + want + ')'}`);
    if (!iguales) fail(label);
  };
  const ok = (label, cond, detalle) => {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond || !detalle ? '' : ' -> ' + detalle}`);
    if (!cond) fail(label);
  };
  const leer = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

  const f29 = manifiesto.modulos.f29;
  const comprobantes = f29.subcarpetas.comprobantes;
  const rcvCsv = f29.subcarpetas.rcvCsvRespaldo;
  const dteEmitidos = manifiesto.modulos.dteEmitidos;
  const inbox = manifiesto.modulos.inbox;
  const inboxDone = inbox.subcarpetas.done;

  // === 1. El manifiesto es internamente consistente ========================
  console.log('\n== Manifiesto: IDs presentes, con formato de Drive y unicos ==');
  const carpetas = [
    ['raiz', manifiesto.raiz],
    ['modulo ventas', manifiesto.modulos.ventas],
    ['modulo f29', f29],
    ['f29/RCV CSV (respaldo manual)', rcvCsv],
    ['f29/Comprobantes F29', comprobantes],
    ['modulo dte-emitidos (Acuses SII)', dteEmitidos],
    ['modulo inbox (INBOX)', inbox],
    ['inbox/DONE', inboxDone],
  ];
  const idsVistos = new Map();
  const formatoDriveId = /^[A-Za-z0-9_-]{10,}$/;
  for (const [etiqueta, carpeta] of carpetas) {
    ok(`${etiqueta}: tiene nombre`, typeof carpeta.nombre === 'string' && carpeta.nombre.length > 0);
    ok(`${etiqueta}: ID con formato de Drive`, formatoDriveId.test(carpeta.id || ''), carpeta.id);
    const previo = idsVistos.get(carpeta.id);
    ok(`${etiqueta}: ID no repetido`, !previo, previo ? 'choca con ' + previo : '');
    idsVistos.set(carpeta.id, etiqueta);
  }

  // === 2. Los workflows de n8n apuntan a las carpetas del manifiesto =======
  // f29-sii-directo.json centraliza los IDs en el nodo Configuracion.
  console.log('\n== f29-sii-directo.json: nodo Configuracion apunta al manifiesto ==');
  const wfDirecto = JSON.parse(leer('n8n/workflows/f29-sii-directo.json'));
  const configNode = wfDirecto.nodes.find((n) => n.name === 'Configuracion');
  ok('existe el nodo Configuracion', !!configNode);
  const jsCode = configNode ? configNode.parameters.jsCode : '';
  const constante = (nombre) => (jsCode.match(new RegExp(nombre + "\\s*=\\s*'([^']+)'")) || [])[1];
  eq('CARPETA_COMPROBANTES == Comprobantes F29', constante('CARPETA_COMPROBANTES'), comprobantes.id);
  eq('CARPETA_CSV_RESPALDO == RCV CSV (respaldo manual)', constante('CARPETA_CSV_RESPALDO'), rcvCsv.id);

  // f29-mensual.json (Camino A) tiene los IDs incrustados en los nodos de Drive.
  console.log('\n== f29-mensual.json: los IDs incrustados coinciden con el manifiesto ==');
  const wfMensualRaw = leer('n8n/workflows/f29-mensual.json');
  ok('referencia RCV CSV (respaldo manual)', wfMensualRaw.includes(rcvCsv.id), rcvCsv.id);
  ok('referencia Comprobantes F29', wfMensualRaw.includes(comprobantes.id), comprobantes.id);

  // dte-envios-acuses.json tiene el ID de la carpeta incrustado en los nodos de Drive,
  // y su meta apunta a la Data Table dte_envios_acuses.
  console.log('\n== dte-envios-acuses.json: IDs incrustados coinciden con el manifiesto ==');
  const wfAcusesRaw = leer('n8n/workflows/dte-envios-acuses.json');
  ok('referencia Acuses SII (DTE emitidos)', wfAcusesRaw.includes(dteEmitidos.id), dteEmitidos.id);
  const wfAcuses = JSON.parse(wfAcusesRaw);
  eq('meta.driveFolderId == manifiesto', wfAcuses.meta.driveFolderId, dteEmitidos.id);
  eq('meta.driveFolderName == manifiesto', wfAcuses.meta.driveFolderName, dteEmitidos.nombre);

  // El indice de acuses apunta a la misma carpeta y a la misma Data Table.
  console.log('\n== dte-emitidos/acuses/index.json apunta a la carpeta y tabla correctas ==');
  const idxAcuses = JSON.parse(leer('dte-emitidos/acuses/index.json'));
  eq('index.carpetaId == manifiesto', idxAcuses.respaldoDrive.carpetaId, dteEmitidos.id);
  eq('index.dataTableId == workflow', idxAcuses.repositorioN8n.dataTableId, wfAcuses.meta.dataTableId);

  // === 3. Ningun archivo del repo nombra las carpetas ya retiradas =========
  // El directorio drive/ es el unico que puede mencionarlas (manifiesto + historia).
  console.log('\n== Ningun nombre de carpeta retirado quedo suelto en el repo ==');
  const retirados = manifiesto.nombresRetirados;
  const exts = new Set(['.md', '.json', '.mjs', '.js']);
  const excluir = new Set(['.git', 'node_modules', 'drive']);
  const archivos = [];
  (function caminar(dir) {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entrada.isDirectory()) {
        if (!excluir.has(entrada.name)) caminar(path.join(dir, entrada.name));
      } else if (exts.has(path.extname(entrada.name))) {
        archivos.push(path.join(dir, entrada.name));
      }
    }
  })(raiz);

  let sueltos = 0;
  for (const abs of archivos) {
    const rel = path.relative(raiz, abs);
    const texto = fs.readFileSync(abs, 'utf8');
    for (const nombre of retirados) {
      if (texto.includes(nombre)) {
        sueltos++;
        fail(`${rel} todavia menciona la carpeta retirada "${nombre}"`);
      }
    }
  }
  ok(`revisados ${archivos.length} archivos, 0 nombres retirados sueltos`, sueltos === 0);

  // === 4. El nombre nuevo de la raiz aparece donde debe ====================
  console.log('\n== El nombre nuevo de la raiz esta en la documentacion ==');
  const raizNombre = manifiesto.raiz.nombre;
  for (const doc of docsQueNombranLaRaiz) {
    ok(`${doc} nombra la raiz nueva`, leer(doc).includes(raizNombre));
  }
}
