---
name: ks-skill-three-way-match
description: Valida una operación comercial cruzando cotización, orden de compra y factura con seis chequeos — montos, sobre-facturación, referencia cruzada a la orden, estado de la orden y consistencia de RUTs — antes de que salga o entre plata. Trae el módulo listo para usar, sin dependencias. Usar cuando el usuario pida validar o revisar una operación, cotización, orden de compra o factura, o antes de pagar o cobrar un documento.
---

# 3-way match: cotización ↔ orden de compra ↔ factura

**Código** `lib/three-way-match.mjs` (en este plugin) · **Repos que lo usan**
`keepsync-hub/ks-contador-jf`, `keepsync-hub/ks-contador-kompu`, en `ventas/`

Función pura, sin dependencias. Se puede importar en un script o pegar dentro de un Code node de n8n.

```js
import { validar3Way } from './lib/_hub/three-way-match.mjs'

const r = validar3Way(operacion, { tolerancia: 0 })
// -> { resultado: 'OK' | 'DISCREPANCIA', checks: [...], diferencias: [...] }
```

## Cuándo usar

- Antes de pagar una factura de proveedor o de emitir el cobro de una venta.
- Al dar de alta una operación nueva (ver `ks-skill-registrar-operacion-venta`).
- Para explicar por qué una operación quedó marcada con discrepancia.

## Los seis chequeos

1. **Los tres documentos existen.** Sin uno de los tres no hay match que hacer.
2. **Los montos cuadran** —neto, IVA y total— dentro de la tolerancia.
3. **No hay sobre-facturación**: `factura ≤ orden de compra ≤ cotización`. Es el chequeo que evita
   pagar de más, y el único que es una desigualdad y no una igualdad.
4. **La factura cita el número de la orden** en su referencia. La factura del SII trae algo como
   *"Orden Compra N° … del …"*, así que se busca el número normalizado dentro del texto.
5. **La orden está aceptada.** Una orden emitida pero no aceptada no autoriza nada.
6. **Los RUTs son consistentes** entre los tres documentos.

Devuelve `checks` con el detalle de cada uno y `diferencias` con los montos que no cuadraron: el
resultado dice qué revisar, no solo que algo está mal.

## La tolerancia va en cero por defecto

Y conviene dejarla ahí. Un peso de diferencia en una factura casi nunca es redondeo: es una línea
distinta, un descuento que no se aplicó o un IVA calculado sobre otra base. Subir la tolerancia
convierte un hallazgo en silencio.

## La cadena de nota de crédito

Cuando una factura se anula y se reemplaza, la operación guarda la anulada en `facturasPrevias` con su
nota de crédito, y el match corre contra la **vigente**. Borrar la anulada haría cuadrar el match y
perdería la trazabilidad de por qué existe la segunda factura.

## Guardrails

- **Un `OK` no es una autorización de pago**: es que los tres documentos son consistentes entre sí.
  Que el servicio se haya prestado lo sabe una persona.
- **Una discrepancia no se arregla ajustando el JSON de la operación.** Si la factura no cuadra con la
  orden, el problema está en los documentos, no en el índice.
- **Los RUTs se comparan normalizados** (sin puntos ni guion, en mayúscula), nunca como strings
  literales: el mismo RUT viene escrito de tres formas distintas según el documento.

## Notas

- El contrato está cubierto por `lib/test/three-way-match.test.mjs` en el hub; cada repo consumidor
  además lo corre contra sus operaciones reales.
- El módulo era idéntico en los dos repos salvo tres comentarios con RUTs de ejemplo. Es exactamente
  el tipo de duplicación que este hub existe para terminar.
