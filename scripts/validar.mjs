#!/usr/bin/env node
// Linter de la libreria de skills de KeepSync. Node puro, sin dependencias:
// tiene que poder correr en cualquier runner sin `npm install`.
//
//   node scripts/validar.mjs            # valida y sale 1 si hay errores
//   node scripts/validar.mjs --lista    # ademas imprime el catalogo
//
// Lo que valida, y por que cada cosa:
//  1. Estructura: cada plugin declarado en marketplace.json existe y trae su plugin.json.
//  2. Cada directorio bajo plugins/*/skills/ tiene SKILL.md con frontmatter parseable.
//  3. `name` == nombre del directorio y respeta la convencion ks-skill-<nombre>.
//  4. `description` presente, de largo razonable, y con el disparador "Usar cuando".
//  5. Solo `name` y `description` en el frontmatter: `allowed-tools` y companía los
//     rechaza `claude plugin validate --strict`.
//  6. Nombres unicos entre plugins.
//  7. Encabezado con la procedencia (**Codigo** o **Repo**): una skill del hub describe
//     codigo que puede vivir en otro repo, y sin eso no se llega a el.
//  8. Fuga de datos: ningun RUT, correo, id de Drive ni secreto en el hub. Es la regla
//     que separa "documentar el patron" de "copiar el registro de un cliente".

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const errores = []
const avisos = []

const err = (donde, msg) => errores.push(`${donde}: ${msg}`)
const avisar = (donde, msg) => avisos.push(`${donde}: ${msg}`)

const DESCRIPCION_MIN = 80
const DESCRIPCION_MAX = 1024
const CAMPOS_PERMITIDOS = new Set(['name', 'description'])
const PREFIJO = 'ks-skill-'

// --- Fugas de datos -------------------------------------------------------
// Cada patron va con el caso real que lo motiva, igual que los excluyentes de los radares.
const FUGAS = [
  { nombre: 'RUT chileno', re: /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g, caso: 'RUT de una empresa o de un cliente' },
  { nombre: 'correo', re: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, caso: 'correo de una persona' },
  { nombre: 'id de Drive', re: /\b[A-Za-z0-9_-]{28,}\b/g, caso: 'id de carpeta o archivo de Google Drive' },
  { nombre: 'secreto', re: /\b(token|clave|password|secret|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-.]{12,}/gi, caso: 'un secreto con valor' },
]
// Lo que se parece a una fuga y no lo es.
const FUGAS_PERMITIDAS = [
  /keepsync-hub\/ks-[a-z-]+/,          // rutas de repo
  /\$\{CLAUDE_PLUGIN_ROOT\}/,
  /^[A-Za-z0-9_-]*[._/][A-Za-z0-9_-]*$/, // rutas de archivo y nombres con punto o barra
  /^(REEMPLAZAR|COMPLETAR)_/,
  /siidte@sii\.cl/,                     // remitente institucional del SII, no una persona
  /invoice\+statements@mail\.anthropic\.com/, // remitente institucional del proveedor
]

// Un archivo de fixtures necesita RUTs y correos con forma valida para probar el parser.
// La salida es explicita y con motivo, no una lista de excepciones escondida en el linter:
// el archivo declara `datos-sinteticos: <motivo>` en su cabecera. Los secretos y los ids de
// Drive NO se eximen nunca -- no hay motivo legitimo para tener uno en el hub.
const EXIMIBLES = new Set(['RUT chileno', 'correo'])

function revisarFugas (ruta, texto) {
  const rel = ruta.replace(RAIZ + '/', '')
  const sinteticos = /datos-sinteticos\s*:/.test(texto.split('\n').slice(0, 40).join('\n'))
  for (const { nombre, re, caso } of FUGAS) {
    if (sinteticos && EXIMIBLES.has(nombre)) continue
    for (const m of texto.matchAll(re)) {
      const hallado = m[0]
      if (FUGAS_PERMITIDAS.some((p) => p.test(hallado))) continue
      err(rel, `posible ${nombre} (${caso}): "${hallado}". El hub documenta el patron; el dato vive en su repo.`)
    }
  }
}

// --- Frontmatter ----------------------------------------------------------
// Parser minimo a proposito: el frontmatter de una skill son dos claves de una linea.
// Si algun dia hace falta YAML de verdad, es senal de que la skill se complico de mas.
function leerFrontmatter (texto) {
  if (!texto.startsWith('---\n')) return { error: 'no empieza con el delimitador --- del frontmatter' }
  const fin = texto.indexOf('\n---\n', 3)
  if (fin === -1) return { error: 'el frontmatter no cierra con ---' }
  const campos = {}
  const orden = []
  for (const linea of texto.slice(4, fin).split('\n')) {
    if (!linea.trim()) continue
    const sep = linea.indexOf(':')
    if (sep === -1) return { error: `linea de frontmatter sin ":" -> ${linea}` }
    const clave = linea.slice(0, sep).trim()
    campos[clave] = linea.slice(sep + 1).trim()
    orden.push(clave)
  }
  return { campos, orden, cuerpo: texto.slice(fin + 5) }
}

// --- Recorrido ------------------------------------------------------------
const marketplacePath = join(RAIZ, '.claude-plugin/marketplace.json')
if (!existsSync(marketplacePath)) {
  err('.claude-plugin/marketplace.json', 'no existe')
  console.error(errores.join('\n'))
  process.exit(1)
}
const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'))
for (const campo of ['name', 'owner', 'plugins']) {
  if (!marketplace[campo]) err('marketplace.json', `falta el campo obligatorio "${campo}"`)
}

const vistos = new Map()
const catalogo = []

for (const entrada of marketplace.plugins ?? []) {
  const dirPlugin = join(RAIZ, entrada.source.replace(/^\.\//, ''))
  const rel = entrada.source
  if (!existsSync(dirPlugin)) { err(rel, `declarado en marketplace.json pero el directorio no existe`); continue }

  const manifest = join(dirPlugin, '.claude-plugin/plugin.json')
  if (!existsSync(manifest)) err(rel, 'falta .claude-plugin/plugin.json')
  else {
    const p = JSON.parse(readFileSync(manifest, 'utf8'))
    if (p.name !== entrada.name) err(rel, `plugin.json dice name "${p.name}" y marketplace.json dice "${entrada.name}"`)
    if (!p.description) err(rel, 'plugin.json sin description')
  }

  const dirSkills = join(dirPlugin, 'skills')
  if (!existsSync(dirSkills)) { avisar(rel, 'todavia no tiene skills/'); continue }

  for (const nombre of readdirSync(dirSkills).sort()) {
    const dirSkill = join(dirSkills, nombre)
    if (!statSync(dirSkill).isDirectory()) continue
    const relSkill = `${rel}/skills/${nombre}`
    const archivo = join(dirSkill, 'SKILL.md')
    if (!existsSync(archivo)) { err(relSkill, 'no tiene SKILL.md'); continue }

    const texto = readFileSync(archivo, 'utf8')
    const fm = leerFrontmatter(texto)
    if (fm.error) { err(relSkill, fm.error); continue }
    const { campos, orden, cuerpo } = fm

    for (const clave of orden) {
      if (!CAMPOS_PERMITIDOS.has(clave)) {
        err(relSkill, `campo "${clave}" en el frontmatter: solo se permiten name y description (claude plugin validate --strict rechaza el resto)`)
      }
    }
    if (!campos.name) err(relSkill, 'frontmatter sin name')
    else {
      if (campos.name !== nombre) err(relSkill, `name "${campos.name}" != nombre del directorio "${nombre}"`)
      if (!campos.name.startsWith(PREFIJO)) err(relSkill, `name "${campos.name}" no respeta la convencion ${PREFIJO}<nombre>`)
      if (!/^[a-z0-9-]+$/.test(campos.name)) err(relSkill, `name "${campos.name}" no es kebab-case`)
      if (campos.name.length > 64) err(relSkill, `name de ${campos.name.length} caracteres (maximo 64)`)
      const previo = vistos.get(campos.name)
      if (previo) err(relSkill, `name "${campos.name}" ya existe en ${previo}`)
      vistos.set(campos.name, relSkill)
    }

    if (!campos.description) err(relSkill, 'frontmatter sin description')
    else {
      if (campos.description.length < DESCRIPCION_MIN) err(relSkill, `description de ${campos.description.length} caracteres: muy corta para disparar bien (minimo ${DESCRIPCION_MIN})`)
      if (campos.description.length > DESCRIPCION_MAX) err(relSkill, `description de ${campos.description.length} caracteres (maximo ${DESCRIPCION_MAX})`)
      if (!/usar cuando/i.test(campos.description)) avisar(relSkill, 'la description no dice "Usar cuando ...": es lo que hace que la skill dispare')
    }

    const primeras = cuerpo.split('\n').slice(0, 12).join('\n')
    if (!/\*\*(Codigo|Código|Repo)\*\*/.test(primeras)) {
      err(relSkill, 'falta el encabezado de procedencia (**Codigo** ... o **Repo** ...) en las primeras lineas del cuerpo')
    }

    revisarFugas(archivo, texto)
    catalogo.push({ plugin: entrada.name, name: campos.name ?? nombre, description: campos.description ?? '' })
  }
}

// Los modulos compartidos tampoco pueden traer identidad: son el codigo que se copia a
// cada repo, asi que un RUT ahi se propaga a todos.
const dirLib = join(RAIZ, 'lib')
if (existsSync(dirLib)) {
  const pila = [dirLib]
  while (pila.length) {
    const actual = pila.pop()
    for (const n of readdirSync(actual)) {
      const p = join(actual, n)
      if (statSync(p).isDirectory()) pila.push(p)
      else if (/\.(mjs|js|py|md)$/.test(n)) revisarFugas(p, readFileSync(p, 'utf8'))
    }
  }
}

if (process.argv.includes('--lista')) {
  for (const plugin of marketplace.plugins ?? []) {
    console.log(`\n${plugin.name}`)
    for (const s of catalogo.filter((c) => c.plugin === plugin.name)) console.log(`  ${s.name}`)
  }
  console.log('')
}

for (const a of avisos) console.log(`aviso  ${a}`)
if (errores.length) {
  for (const e of errores) console.error(`ERROR  ${e}`)
  console.error(`\n${errores.length} error(es) en ${catalogo.length} skill(s).`)
  process.exit(1)
}
console.log(`ok: ${catalogo.length} skill(s) en ${(marketplace.plugins ?? []).length} plugin(s), ${avisos.length} aviso(s).`)
