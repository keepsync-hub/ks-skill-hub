#!/usr/bin/env node
// Captura la linea base de un repo contador y la compara despues de un cambio.
//
//   node scripts/qa-contador.mjs <ruta-al-repo> --baseline   # antes de tocar nada
//   node scripts/qa-contador.mjs <ruta-al-repo> --comparar   # despues del cambio
//
// Existe porque la migracion al codigo compartido toca dos repos en produccion. "Compila" no
// alcanza como criterio: lo que se exige es que las suites y las salidas deterministas den
// EXACTAMENTE lo mismo que antes. Las diferencias que aparezcan son el hallazgo.
//
// Lo que corre, y por que solo esto:
//   - Todas las suites `*.test.mjs` del repo.
//   - `pyl/reporte.mjs --json`: el agregado del P&L, que es determinista.
//   - `cruce/actualizar-hoja.mjs` sobre las cartolas ya versionadas, en seco.
//
// Lo que NO corre, nunca: nada que escriba en Drive, en n8n, en el SII o en un banco. La QA
// de una migracion de codigo no necesita tocar ningun sistema externo, y si lo necesitara
// habria que cambiar la migracion, no la QA.
//
// La linea base que se VERSIONA son huellas SHA-256, no las salidas. La salida del P&L trae
// cifras, RUTs y nombres de clientes reales, y este repo no aloja datos de ninguna empresa
// (la regla esta en CONTRIBUTING.md y el linter la hace cumplir). La huella prueba lo unico
// que la QA necesita probar --que la salida no cambio-- sin copiar el registro. Las salidas
// completas quedan en `_local/`, gitignoreado, para poder diffear durante la sesion.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

const repo = process.argv[2]
const modo = process.argv.includes('--comparar') ? 'comparar'
  : process.argv.includes('--baseline') ? 'baseline' : null

if (!repo || !modo) {
  console.error('uso: node scripts/qa-contador.mjs <ruta-al-repo> --baseline|--comparar')
  process.exit(2)
}
if (!existsSync(repo)) { console.error(`no existe el repo ${repo}`); process.exit(2) }

const nombreRepo = basename(repo.replace(/\/$/, ''))
const dirBase = join(RAIZ, 'docs', 'qa', `${nombreRepo}-baseline`)

// --- Que se corre ---------------------------------------------------------
function suites (dir, base = '') {
  const salida = []
  for (const nombre of readdirSync(dir).sort()) {
    // `lib/_hub/` (solo en la raiz) es codigo vendorizado del hub: sus tests viven en el hub.
    if (nombre === '.git' || nombre === 'node_modules') continue
    if (base === '' && nombre === 'lib') continue
    const ruta = join(dir, nombre)
    const rel = base ? `${base}/${nombre}` : nombre
    if (statSync(ruta).isDirectory()) salida.push(...suites(ruta, rel))
    else if (nombre.endsWith('.test.mjs')) salida.push(rel)
  }
  return salida
}

function correr (rel, args = []) {
  try {
    const salida = execFileSync('node', [rel, ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { exit: 0, salida }
  } catch (e) {
    // Una suite que falla tambien es una observacion: se registra con su salida, no se oculta.
    return { exit: e.status ?? 1, salida: (e.stdout ?? '') + (e.stderr ?? '') }
  }
}

const artefactos = new Map()

for (const rel of suites(repo)) {
  const { exit, salida } = correr(rel)
  artefactos.set(rel, `exit=${exit}\n${salida}`)
}

// El agregado del P&L: determinista, y es la salida que mas depende del modulo compartido.
if (existsSync(join(repo, 'pyl/reporte.mjs'))) {
  const { exit, salida } = correr('pyl/reporte.mjs', ['--json'])
  artefactos.set('pyl/reporte.mjs --json', `exit=${exit}\n${salida}`)
}

// El cruce, en seco: corre sobre las cartolas versionadas y escribe solo en cruce/salida/,
// que esta gitignoreado. No llama al webhook que reescribe la Hoja.
const hojaFixture = join(repo, 'cruce', 'salida')
if (existsSync(join(repo, 'cruce/actualizar-hoja.mjs'))) {
  const csvs = existsSync(hojaFixture) ? readdirSync(hojaFixture).filter((f) => f.endsWith('.csv')) : []
  if (csvs.length) {
    const { exit, salida } = correr('cruce/actualizar-hoja.mjs', ['--hoja', join('cruce/salida', csvs[0])])
    artefactos.set('cruce/actualizar-hoja.mjs', `exit=${exit}\n${salida}`)
  } else {
    artefactos.set('cruce/actualizar-hoja.mjs', 'omitido: no hay CSV de la Hoja en cruce/salida/ para correrlo en seco')
  }
}

// --- Baseline o comparacion ----------------------------------------------
const nombreArchivo = (rel) => rel.replace(/[^A-Za-z0-9._-]+/g, '_') + '.txt'
const huella = (texto) => createHash('sha256').update(texto).digest('hex')
const archivoHuellas = join(dirBase, 'huellas.json')
const dirLocal = join(dirBase, '_local')

const resumen = (contenido) => ({
  exit: Number((contenido.match(/^exit=(\d+)/) ?? [, -1])[1]),
  lineas: contenido.split('\n').length,
  sha256: huella(contenido),
})

if (modo === 'baseline') {
  rmSync(dirBase, { recursive: true, force: true })
  mkdirSync(dirLocal, { recursive: true })
  const huellas = {}
  for (const [rel, contenido] of artefactos) {
    huellas[rel] = resumen(contenido)
    writeFileSync(join(dirLocal, nombreArchivo(rel)), contenido)
  }
  writeFileSync(archivoHuellas, JSON.stringify({
    repo: nombreRepo,
    capturada: new Date().toISOString(),
    nota: 'Huellas SHA-256 de la salida de cada artefacto. Las salidas completas quedan en _local/, que no se versiona: traen datos reales de la empresa.',
    artefactos: huellas,
  }, null, 2) + '\n')

  const fallando = [...artefactos].filter(([, c]) => !c.startsWith('exit=0') && !c.startsWith('omitido'))
  console.log(`linea base de ${nombreRepo}: ${artefactos.size} artefacto(s) -> docs/qa/${basename(dirBase)}/huellas.json`)
  for (const [rel, c] of artefactos) console.log(`  ${c.startsWith('exit=0') ? 'ok  ' : c.startsWith('omitido') ? '--  ' : 'FALLA'} ${rel}`)
  if (fallando.length) {
    console.error(`\nOJO: ${fallando.length} artefacto(s) ya fallaban ANTES de tocar nada. La linea base los`)
    console.error('registra igual, pero hay que entender por que antes de seguir.')
  }
  process.exit(0)
}

if (!existsSync(archivoHuellas)) {
  console.error(`no hay linea base en docs/qa/${basename(dirBase)}/. Correr primero con --baseline sobre el repo sin tocar.`)
  process.exit(2)
}

const base = JSON.parse(readFileSync(archivoHuellas, 'utf8')).artefactos
let distintos = 0

for (const [rel, contenido] of artefactos) {
  const previo = base[rel]
  const ahora = resumen(contenido)
  if (!previo) { console.log(`  NUEVO ${rel} (no estaba en la linea base)`); distintos++; continue }
  if (previo.sha256 === ahora.sha256) { console.log(`  ok    ${rel}`); continue }

  distintos++
  console.error(`  DIFIERE ${rel}  (exit ${previo.exit} -> ${ahora.exit}, ${previo.lineas} -> ${ahora.lineas} lineas)`)
  // Si la copia local de la linea base sigue en el disco, se muestra la primera linea que
  // cambio: es lo que hace accionable el hallazgo sin versionar la salida completa.
  const copia = join(dirLocal, nombreArchivo(rel))
  if (existsSync(copia)) {
    const a = readFileSync(copia, 'utf8').split('\n')
    const b = contenido.split('\n')
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        console.error(`      primera diferencia, linea ${i + 1}`)
        console.error(`        antes: ${a[i] ?? '(no existia)'}`)
        console.error(`        ahora: ${b[i] ?? '(no existe)'}`)
        break
      }
    }
  } else {
    console.error(`      (sin copia local en ${basename(dirLocal)}/ para diffear: volver a capturar la linea base en un checkout limpio)`)
  }
}

for (const rel of Object.keys(base)) {
  if (!artefactos.has(rel)) {
    console.error(`  FALTA ${rel} (estaba en la linea base y ahora no se corrio)`)
    distintos++
  }
}

if (distintos) {
  console.error(`\n${distintos} artefacto(s) cambiaron respecto de la linea base de ${nombreRepo}.`)
  console.error('El criterio de la migracion es que no cambie ninguno: revisar antes de commitear.')
  process.exit(1)
}
console.log(`\nok: los ${artefactos.size} artefactos de ${nombreRepo} son identicos a la linea base.`)
