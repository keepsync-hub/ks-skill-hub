---
name: ks-skill-n8n-codigo-versionado
description: Mantiene el código que corre dentro de un Code node de n8n versionado en el repo en vez de escrito en la interfaz, generándolo desde módulos con tests y verificando que lo desplegado y lo versionado no se separen. Cubre también cómo inyectar HTML y CSS en un workflow cuando el SDK del constructor no admite imports. Usar cuando el usuario pida crear o modificar un workflow de n8n, tocar un Code node, o cuando el comportamiento de n8n no coincida con lo que dice el repo.
---

# El código de n8n vive en el repo, no en la interfaz

**Repo** `keepsync-hub/ks-contador-kompu` (`cruce/n8n/generar-nodo.mjs`),
`keepsync-hub/ks-compra-agil` (`n8n/construir.mjs`) · **Tests** los `n8n/test/*.test.mjs` de los
contadores

El modo de falla clásico de n8n: alguien edita un Code node en la interfaz para arreglar algo urgente,
el repo queda con la versión vieja, y a partir de ahí **nadie sabe cuál es la verdad**. Los tests
prueban un código que ya no corre.

Hay tres piezas, y las tres apuntan a lo mismo.

## 1. El test lee el código del workflow, no una transcripción

La pieza más barata y la que más rinde: en vez de copiar la lógica del Code node al test, el test
**abre el JSON del workflow versionado, saca el `jsCode` y lo ejecuta** contra fixtures reales.

Así el test no puede quedar probando otra versión: si el JSON del repo se desactualiza respecto de
n8n, se nota al desplegar; si alguien cambia el JSON, el test corre el código nuevo.

## 2. El nodo se genera desde el módulo, y hay un `--verificar`

Cuando la lógica ya existe como módulo con tests, el Code node **se genera** desde ahí en vez de
escribirse dos veces: el generador concatena y aplana los módulos —quita imports, exports y
comentarios— y les agrega el conector con `$input` y `$()`.

`--verificar` no genera: **compara y falla** si el nodo versionado dejó de corresponder al módulo.
Va en la lista de tests.

## 3. Los chunks, cuando el SDK no alcanza

El SDK del constructor de workflows es **un subconjunto muy acotado de TypeScript**: sin `import`, sin
`require`, sin `Object.assign` ni spread, sin `.join()`. Para meter HTML, CSS o lógica larga adentro,
el constructor reemplaza marcadores `__CHUNK:archivo__` por el contenido del archivo, **ya escapado
como literal**, resolviendo en cascada (un chunk de JS puede a su vez incrustar HTML: un escapado por
nivel).

El CSS y el JS de las páginas quedan como archivos revisables en el diff, en vez de enterrados en un
literal gigante.

## Guardrails

- **No editar un Code node en la interfaz de n8n** salvo para diagnosticar, y volcarlo al repo
  enseguida.
- **No editar a mano un archivo generado.** El `--verificar` lo va a marcar, que es lo correcto.
- **Los placeholders `REEMPLAZAR_*` no se completan con valores "temporales" que apunten a algo real.**
  Existen para que una importación incompleta **falle** en vez de escribir en los objetos de otra
  instancia.
- **El CSS que se inyecta en un nodo no puede llevar ningún `<`**: n8n lo sanitiza y el resultado se
  ve roto sin ningún error.
- **Nada de imágenes por URL externa** en un correo o una página generada: van en base64 o no van.

## Notas

- Una instancia de n8n puede estar **compartida entre varias empresas** sin carpetas separadas: hay
  riesgo real de editar o activar el workflow equivocado. Conviene prefijar las Data Tables por
  empresa.
- En un nodo que avisa por correo después de una escritura ya hecha conviene `onError` en modo
  continuar y `executeOnce`: si el correo falla, la corrida no se cae **después** de haber escrito.
- Idempotencia por `upsert` con una clave natural (un track id, un número de recibo, la clave de un
  documento), no por orden de llegada.
