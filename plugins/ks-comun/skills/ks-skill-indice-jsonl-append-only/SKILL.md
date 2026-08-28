---
name: ks-skill-indice-jsonl-append-only
description: Guarda un índice histórico como archivo jsonl append-only versionado en git, de modo que cada corrida continúe la anterior sin volver a pedir lo ya visto y se pueda republicar sin gastar una sola llamada. Trae las dos trampas que rompen este patrón en silencio — el límite de bytes por línea y el desempate por timestamp. Usar cuando el usuario pida guardar un histórico, republicar sin volver a consultar una API, o cuando una corrida vuelva a bajar datos que ya tenía.
---

# El índice histórico como jsonl append-only

**Repo** `keepsync-hub/ks-compra-agil` · **Código** `src/lib/indice.ts` (`proyectar`, `anexar`,
`leer`, `ultimaPorCodigo`, `obtenerDetalleConCache`) · **Datos** `historico/*.jsonl`

Un radar que consulta una API con cuota tiene un problema doble: no puede volver a pedir lo mismo cada
día, y el directorio de trabajo es efímero. La solución es un archivo `.jsonl` **versionado en git**,
al que solo se anexa: una línea por observación, la última de cada código manda.

Lo que habilita, y es el punto: **republicar con cero llamadas**. La página o el informe se regeneran
enteros desde el índice, así que una corrida `--solo-indice` no toca la API.

## Cuándo usar

- Guardar el histórico de algo que se consulta periódicamente.
- Republicar un resultado sin volver a pedir los datos.
- Diagnosticar por qué una corrida vuelve a bajar lo que ya tenía.

## Por qué `historico/` y no `data/`

`data/` es caché regenerable y está en el `.gitignore`. En un agente que corre en la nube ese
directorio **no existe al empezar**, así que un índice ahí se pierde entero cada vez. Todo lo que la
corrida siguiente necesita saber va a `historico/`, versionado.

## Las dos trampas, que rompen esto en silencio

**1. Una línea tiene que caber en 4.000 bytes.** Es el límite de escritura atómica de `appendFileSync`:
por encima, dos procesos concurrentes pueden entrelazar una línea y dejar el archivo corrupto. Un
registro completo puede pasarse fácil —una URL con un parámetro codificado se lleva 400 caracteres
sola—. La solución es **repartir el peso**: el jsonl guarda la *observación* (lo mínimo para saber que
algo existe y cuándo se vio) y un JSON aparte guarda el *contenido*; al republicar se rehidratan
juntos. **No son dos fuentes de verdad**: salen del mismo arreglo en la misma corrida.

**2. `ultimaPorCodigo()` desempata con un `>` estricto.** Una línea enriquecida que conserve el
timestamp original **empata con la vieja y pierde**. El síntoma es completamente silencioso: la ficha
se baja, se escribe, y la corrida siguiente la lee como si nunca se hubiera indexado — y vuelve a
bajarla, para siempre. Hay que **resellar el timestamp al republicar**.

## Guardrails

- **Solo se anexa. Nunca se reescribe ni se compacta el archivo.** Perder el historial pierde la
  capacidad de saber cuándo cambió algo.
- **Lo que no se alcanzó a verificar hoy se arrastra del índice, marcado como tal**, en vez de
  desaparecer de la salida. La alternativa —todo o nada— produce una página congelada con datos
  cerrados y sin ningún aviso, que es peor que una desactualizada que lo dice.
- **Una línea que no parsea no se descarta en silencio**: se reporta.

## Notas

- El mismo patrón sostiene varios índices del repo (observaciones, leads, revisiones, cuota, mercado):
  vale la pena revisar cuál ya existe antes de crear uno nuevo.
- Un bug vigente que conviene conocer: un archivo de estado que quedó en `data/` —y por lo tanto
  gitignoreado— hace que el agente corriendo en la nube nunca detecte a los compradores repetidos.
  Está anotado en el repo. Es exactamente el error que esta skill previene.
