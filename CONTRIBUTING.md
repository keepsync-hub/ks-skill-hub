# Cómo se trabaja en este repo

## La pregunta que decide dónde va una skill

**¿Corre en un repo que no sea el suyo?**

- **Sí** → va acá, en `plugins/<plugin>/skills/`. Es una skill de librería.
- **No** → va en `.claude/skills/` de su propio repo. Documentarla acá no la hace reutilizable, la
  saca del lugar donde se ejecuta.

Un ejemplo de cada lado: `three-way-match` valida tres documentos y no sabe de qué empresa son →
librería. `compra-agil-radar` corre `npm run radar`, que solo existe en `ks-compra-agil` y necesita
su `config/categorias.json` y su ticket → repo.

El mapa de qué está dónde es [`docs/indice-capacidades.md`](docs/indice-capacidades.md), y hay que
actualizarlo al agregar cualquiera de las dos.

## Convención de nombres

Toda skill de este repo se llama **`ks-skill-<nombre>`**, en kebab-case, con el `name` del
frontmatter idéntico al nombre del directorio. Con el namespacing del plugin la invocación queda
`/ks-sii:ks-skill-three-way-match`: más larga, y a cambio una skill de KeepSync se reconoce en
cualquier listado.

Las skills que viven en los repos conservan sus nombres actuales; las nuevas siguen esta misma
convención.

## Formato de un SKILL.md

```markdown
---
name: ks-skill-tres-palabras
description: Qué hace, con el alcance concreto y sin adornos. Usar cuando el usuario pida ... (y si hay una skill hermana, desambiguar contra ella).
---

# Título en español

**Código** `lib/archivo.mjs` (en este plugin) · **Repos que lo usan** `ks-contador-jf`, `ks-contador-kompu`

## Cuándo usar
## Requisitos
## Cómo correrlo
## Qué hace
## Guardrails
## Notas
```

- **Frontmatter: solo `name` y `description`.** `allowed-tools` y el resto los rechaza
  `claude plugin validate --strict`.
- **El encabezado de procedencia es obligatorio** y el linter lo exige: una skill del hub describe
  código que puede vivir en otro repo, y sin esa línea no hay forma de llegar a él. Cuando es solo
  documentación, se usa **Repo** + **Entrypoint** + **Docs** en vez de **Código**.
- La `description` es lo que hace que la skill dispare. El patrón que ya funciona en los repos:
  *«qué hace, con el detalle concreto» + «Usar cuando el usuario pida …»*.

## Reglas de contenido

Son las mismas que atraviesan los cuatro repos, y el linter hace cumplir las dos primeras:

1. **Nada de credenciales, tokens ni secretos.** Nunca, en ningún archivo.
2. **Ningún ID de Drive, workflow o Data Table, ni RUT, correo o cuenta bancaria.** El hub documenta
   el patrón; el dato vive en la fuente de verdad de su repo (`drive/estructura.json`,
   `docs/pendientes.md`). Además de ser más seguro, evita la copia que se desincroniza.
3. **Nada se afirma sin cita.** Toda cifra va con su fecha de medición, y lo medido se distingue de
   lo supuesto. "Se midió el 2026-08-24: 97 de 258 compras dejaron contacto" — no "el rendimiento
   es bajo".
4. **Los guardrails se enuncian como prohibiciones concretas**, no como principios. "Nunca cotizar
   sobre el tope: es causal de inadmisibilidad", no "hay que ser cuidadoso con el presupuesto".
5. **Las fallas deliberadas se documentan como tales**, con el motivo por el que no hay que
   rodearlas. Un programa que revienta a propósito y alguien que lo saltea con un flag es peor que
   no tener la guarda.

## Cambiar un módulo de `lib/`

`lib/` es la copia canónica de código que está vendorizado en otros repos. El ciclo:

```bash
node lib/test/<modulo>.test.mjs            # los tests corren desde acá
node scripts/sync-hub.mjs /ruta/al/repo    # bajar el cambio al repo
# correr las suites del repo antes de commitear nada allá
```

Nunca al revés: editar `lib/_hub/` dentro de un repo consumidor deja el `--verificar` en rojo, que
es exactamente lo que tiene que pasar.

**Un módulo de `lib/` no puede conocer a ninguna empresa.** Si necesita un RUT, un correo o un id de
carpeta, lo recibe por parámetro.

## Antes de commitear

```bash
node scripts/validar.mjs
claude plugin validate . --strict
claude plugin validate plugins/ks-comun --strict
claude plugin validate plugins/ks-sii --strict
```
