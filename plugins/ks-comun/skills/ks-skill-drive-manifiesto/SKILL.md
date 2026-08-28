---
name: ks-skill-drive-manifiesto
description: Mantiene un manifiesto versionado como fuente única de los identificadores de carpetas de Google Drive de un proyecto, con un test que falla si un workflow o un documento del repo se desincroniza, y con una lista de nombres retirados que impide que una instancia clonada siga escribiendo en el Drive de la anterior. Trae el verificador listo. Usar cuando el usuario pida crear, mover o renombrar carpetas de Drive de un proyecto, o cuando algo esté escribiendo en la carpeta equivocada.
---

# El manifiesto de Drive como fuente única

**Código** `lib/runners/drive-estructura.mjs` (en este plugin) · **Repos que lo usan**
`keepsync-hub/ks-contador-jf`, `keepsync-hub/ks-contador-kompu`, en `drive/`

```js
// drive/estructura.test.mjs del repo consumidor queda en tres lineas:
import { verificarEstructuraDrive } from '../lib/_hub/runners/drive-estructura.mjs'
verificarEstructuraDrive({ raiz, dirManifiesto })
console.log(process.exitCode ? '\n=== HAY FALLOS ===' : '\n=== TODO OK ===')
```

Un id de carpeta de Drive es una cadena opaca. Cuando el mismo id está escrito en tres workflows, dos
archivos de configuración y cuatro documentos, cambiar una carpeta se vuelve una búsqueda a ciegas y
lo que queda mal **no da ningún error**: escribe en la carpeta vieja y nadie se entera.

`drive/estructura.json` es la fuente única, y el test es lo que la hace cumplir.

## Cuándo usar

- Crear, mover o renombrar carpetas de un proyecto.
- Montar la estructura de Drive de una instancia nueva.
- Diagnosticar por qué algo apareció en la carpeta equivocada.

## Qué valida el verificador

1. **El manifiesto es internamente consistente**: cada carpeta tiene nombre, un id con formato de
   Drive, y ningún id se repite.
2. **Los workflows apuntan a las carpetas del manifiesto**, comparando por **id** —no por nombre—,
   tanto los que centralizan los ids en un nodo de configuración como los que los traen incrustados.
3. **Ningún archivo del repo menciona un nombre de carpeta retirado.**
4. **El nombre vigente de la raíz aparece en la documentación** donde corresponde.

## `nombresRetirados` es la guarda importante

Cuando una carpeta se renombra —o cuando se clona el proyecto para otra empresa— el nombre viejo se
agrega a `nombresRetirados`, y el test **falla** si algún archivo del repo todavía lo menciona.

Sin esa lista, una instancia recién clonada sigue apuntando a las carpetas de la instancia de origen y
escribe ahí. Es silencioso, funciona perfecto, y es un desastre.

## El orden de trabajo

**Primero el manifiesto, después el test dice qué más tocar.** Al revés se olvida siempre alguno de
los lugares donde estaba el id.

## Guardrails

- **Ningún id de Drive se escribe en dos lugares** sin que el manifiesto sea uno de ellos.
- **Un id que no calza con el manifiesto es motivo para parar**, no para seguir con el que parece
  correcto.
- Este verificador vive en el hub y se sincroniza; **no editarlo dentro del repo consumidor** —
  `sync-hub.mjs --verificar` lo marcaría como deriva, que es justamente lo que tiene que pasar.

## Notas

- Era **idéntico byte a byte** en los dos repos contadores. Todo lo específico —la raíz, los módulos,
  los documentos que deben nombrar la raíz— entra por parámetro o sale del propio manifiesto.
- Se verificó dando salida idéntica a la del test original en los dos repos antes de reemplazarlo.
