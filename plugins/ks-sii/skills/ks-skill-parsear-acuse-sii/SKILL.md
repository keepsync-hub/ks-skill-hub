---
name: ks-skill-parsear-acuse-sii
description: Lee el RESULTADO_ENVIO que el SII devuelve por correo como acuse de cada envío de documentos tributarios electrónicos, extrae el track id, el estado y los conteos por tipo de documento, y decide si el envío necesita que lo mire un humano. Trae el parser listo, sin dependencias. Usar cuando llegue un acuse del SII, cuando el usuario pida revisar o respaldar los acuses de DTE emitidos, o cuando un envío quede en un estado distinto de aceptado.
---

# Parsear el acuse de envío del SII

**Código** `lib/resultado-envio.mjs` (en este plugin) · **Repos que lo usan**
`keepsync-hub/ks-contador-jf`, `keepsync-hub/ks-contador-kompu`, en `dte-emitidos/`

```js
import { parseResultadoEnvio, nombreTipoDoc } from './lib/_hub/resultado-envio.mjs'
const acuse = parseResultadoEnvio(xml)
if (acuse.requiereRevision) { /* avisar */ }
```

El `RESULTADO_ENVIO` es un XML chico en ISO-8859-1 con la identificación del envío y uno o más
`SUBTOTAL` con el conteo por tipo de documento. **No trae folios ni montos**: es el acuse de que el
SII procesó el envío, no el documento en sí.

## Cuándo usar

- Respaldar los acuses que llegan por correo desde el SII.
- Entender por qué un envío quedó marcado para revisión.
- Reconstruir qué se envió y cuándo, sin entrar al portal.

## Qué devuelve

`trackId`, `rutEmisor`, `rutEnvia`, el timestamp de recepción ya convertido a ISO más su `periodo` y
`ymd`, el `estado`, los tipos de documento con su nombre legible, los conteos
(`informados` / `aceptados` / `rechazos` / `reparos`), el derivado `noAceptados`, y
**`requiereRevision`**.

`requiereRevision` es verdadero si hay documentos no aceptados, rechazos, reparos, o si el estado no
es el de aceptación. Es el único campo que hay que mirar para decidir si sigue de largo o para a una
persona.

## La ausencia de un tag es cero, no es error

Los envíos aceptados **no traen** `RECHAZA` ni `REPARO`. Si la ausencia se leyera como `NaN`,
`requiereRevision` daría falso siempre y un acuse con rechazos pasaría en silencio. El parser suma
todas las apariciones de cada tag y devuelve cero cuando no hay ninguna — está cubierto por test
porque es la forma silenciosa de que este flujo deje de servir.

## Guardrails

- **El correo es solo el canal de entrada.** El acuse se respalda en Drive y se indexa; el buzón no es
  el archivo.
- **Un envío con reparos no se archiva y se olvida.** `requiereRevision` existe para que alguien lo
  mire.
- **El XML viene en ISO-8859-1.** Leerlo como UTF-8 corrompe las razones sociales con acento.

## Notas

- El módulo era **idéntico byte a byte** en los dos repos contadores antes de vivir acá.
- Cada repo verifica además que el `jsCode` embebido en su workflow de n8n produzca exactamente lo
  mismo que este módulo: es lo que impide que el nodo desplegado y el repo se separen.
- La tabla de tipos de DTE cubre los 12 habituales; un código desconocido devuelve `Tipo <codigo>` en
  vez de reventar.
