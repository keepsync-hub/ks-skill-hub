---
name: ks-skill-parsear-recibo-proveedor
description: Lee el correo de recibo de un proveedor de suscripciones (Anthropic) en sus tres formatos —directo, reenviado por Outlook y reenviado por Gmail—, extrae recibo, factura, fecha, plan, neto, IVA, total y últimos cuatro dígitos de la tarjeta, e imputa el costo al negocio según la cuenta. Trae el parser listo, sin dependencias ni expresiones regulares. Usar cuando llegue un recibo de proveedor, cuando el usuario pida registrar una compra o factura recibida, o cuando una imputación quede marcada para revisión.
---

# Parsear el recibo de un proveedor e imputar el costo

**Código** `lib/parser-recibo.mjs` (en este plugin) · **Repos que lo usan**
`keepsync-hub/ks-contador-jf`, `keepsync-hub/ks-contador-kompu`, en `compras/`

```js
import { parsearRecibo } from './lib/_hub/parser-recibo.mjs'
import { CUENTAS } from '../cuentas.mjs'          // el mapa vive en cada repo, no acá

const r = parsearRecibo(correo, CUENTAS)          // null si el correo no es un recibo
if (r?.requiereRevision) { /* lo mira una persona */ }
```

Es la misma lógica que corre dentro del Code node del workflow de registro semanal. Vive como módulo
aparte para poder probarla sin levantar n8n, contra los formatos de correo reales.

## Cuándo usar

- Registrar una factura recibida en el índice de compras.
- Entender por qué una línea quedó como `por-revisar`.
- Montar el registro de compras de una instancia nueva.

## Dos decisiones que parecen raras y no lo son

1. **Sin expresiones regulares.** Solo `indexOf` y `split`. El correo llega en tres formatos distintos
   y con saltos de línea impredecibles; el emparejamiento por marcas de texto sobrevive mejor a esos
   cambios que un regex afinado a un formato.
2. **Dos vistas del mismo texto.** `plano()` quita las etiquetas HTML para leer los montos; `crudo()`
   **no** las quita, porque en un correo reenviado la cuenta del cliente viaja dentro de angulares
   (`Para: nombre <la-cuenta>`) y el limpiador de HTML se la comería. **Ese bug existió** y hoy lo caza
   un test.

## El mapa de cuentas no vive en el hub

Es lo único específico de la empresa. Cada repo pasa el suyo, y el mismo mapa se copia al Code node
del workflow. Sin mapa, el default vacío deja todo como `por-revisar`, que es el comportamiento
correcto.

## Guardrails

- **La imputación nunca se adivina.** Una cuenta que no está en el mapa sale como `por-revisar` y
  aparece en el correo bajo un aviso. Adivinar a qué negocio cargar un costo es peor que pedir que lo
  mire alguien.
- **El respaldo en Drive es obligatorio.** Una línea del índice sin su documento respaldatorio no es
  un registro contable; el test del repo falla si falta.
- **Si el recibo está incompleto se marca, no se completa.** Sin plan reconocido, sin fecha o sin
  montos, `requiereRevision` queda en verdadero.
- **Un caso que este parser no cubre**: el comprobante reenviado a mano con el cuerpo vacío y el dato
  solo dentro del PDF adjunto. Necesita extracción del adjunto, y hoy no la hay. Está anotado como
  pendiente en el repo, no resuelto en silencio.

## Notas

- La versión canónica es la parametrizada: `parsearRecibo(correo, cuentas)`. Uno de los dos repos
  tenía el mapa hardcodeado y no se podía ejercitar con fixtures propias.
- El contrato está cubierto por `lib/test/parser-recibo.test.mjs` en el hub, incluido el caso de la
  cuenta dentro de angulares.
