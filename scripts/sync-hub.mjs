#!/usr/bin/env node
// Baja el codigo canonico de `lib/` a un repo consumidor, y verifica que no se hayan separado.
//
//   node scripts/sync-hub.mjs /ruta/al/repo              # copia lib/ -> <repo>/lib/_hub/
//   node scripts/sync-hub.mjs /ruta/al/repo --verificar  # no copia: falla si difieren
//
// Por que vendorizado y no npm ni submodulo. Los repos contadores no tienen `package.json` y
// eso es deliberado: todo corre con `node <archivo>`, sin `npm install`. Un paquete rompe esa
// propiedad; un submodulo la respeta pero deja un `git clone` sin `--recurse-submodules` roto
// **en silencio**, que es justo el modo de falla que estos repos combaten en todas partes.
// Vendorizar mantiene los imports como rutas locales y convierte la deriva en un test rojo.
//
// El `--verificar` es la razon de ser de todo esto: `ks-contador-kompu` nacio como copia de
// `ks-contador-jf` y los dos se separaron sin que nada avisara.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync, rmSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEN = join(RAIZ, 'lib')
const DESTINO_REL = join('lib', '_hub')

// `lib/test/` se queda en el hub: son los tests del contrato del modulo. El repo consumidor
// tiene los suyos, que prueban el mismo modulo contra sus datos reales. Son cosas distintas.
const EXCLUIR = new Set(['test'])

const CABECERA = (rel) => `// ARCHIVO GENERADO -- NO EDITAR ACA.
// Copia de \`lib/${rel}\` de keepsync-hub/ks-skill-hub, bajada con \`sync-hub.mjs\`.
// Para cambiarlo: editarlo en el hub, correr los tests de alla, y volver a sincronizar.
// \`sync-hub.mjs --verificar\` falla si este archivo y el del hub se separaron.

`

function archivosDe (dir, base = '') {
  const salida = []
  for (const nombre of readdirSync(dir).sort()) {
    if (EXCLUIR.has(nombre)) continue
    const ruta = join(dir, nombre)
    const rel = base ? `${base}/${nombre}` : nombre
    if (statSync(ruta).isDirectory()) salida.push(...archivosDe(ruta, rel))
    else if (/\.(mjs|py)$/.test(nombre)) salida.push(rel)
  }
  return salida
}

// La cabecera se agrega al copiar y se saca al comparar: es metadato del vendorizado, no
// contenido del modulo.
const sinCabecera = (texto) => texto.startsWith('// ARCHIVO GENERADO')
  ? texto.slice(texto.indexOf('\n\n') + 2)
  : texto

const repo = process.argv[2]
const verificar = process.argv.includes('--verificar')

if (!repo || repo.startsWith('--')) {
  console.error('uso: node scripts/sync-hub.mjs <ruta-al-repo> [--verificar]')
  process.exit(2)
}
if (!existsSync(repo)) {
  console.error(`no existe el repo ${repo}`)
  process.exit(2)
}

const destinoAbs = join(repo, DESTINO_REL)
const archivos = archivosDe(ORIGEN)
const diferencias = []
let copiados = 0

for (const rel of archivos) {
  const contenido = CABECERA(rel) + readFileSync(join(ORIGEN, rel), 'utf8')
  const destino = join(destinoAbs, rel)

  if (verificar) {
    if (!existsSync(destino)) { diferencias.push(`${DESTINO_REL}/${rel}: falta en el repo`); continue }
    const actual = readFileSync(destino, 'utf8')
    if (sinCabecera(actual) !== sinCabecera(contenido)) {
      diferencias.push(`${DESTINO_REL}/${rel}: difiere del canonico del hub`)
    }
    continue
  }

  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, contenido)
  copiados++
}

// Un archivo que sobra es tan deriva como uno que difiere: quiere decir que el hub lo borro
// o lo renombro y el repo se quedo con la version vieja, que nadie mantiene.
if (existsSync(destinoAbs)) {
  const esperados = new Set(archivos)
  for (const rel of archivosDe(destinoAbs)) {
    if (esperados.has(rel)) continue
    if (verificar) diferencias.push(`${DESTINO_REL}/${rel}: sobra (ya no existe en el hub)`)
    else { rmSync(join(destinoAbs, rel)); console.log(`  borrado ${DESTINO_REL}/${rel} (ya no existe en el hub)`) }
  }
}

if (verificar) {
  if (diferencias.length) {
    console.error(`\nDERIVA entre ${relative(process.cwd(), repo) || repo} y el hub:\n`)
    for (const d of diferencias) console.error(`  ${d}`)
    console.error('\nEl codigo compartido es uno solo: editar en el hub y correr `sync-hub.mjs` sin --verificar.')
    process.exit(1)
  }
  console.log(`ok: ${archivos.length} archivo(s) de lib/ coinciden con el hub.`)
} else {
  console.log(`ok: ${copiados} archivo(s) sincronizados en ${destinoAbs}`)
}
