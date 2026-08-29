---
name: ks-skill-pyl-neto-devengado
description: Agrega el estado de resultados mensual sobre el neto y devengado por fecha de documento, tratando el IVA sin crédito fiscal como costo y fallando en voz alta si un documento en moneda extranjera no trae tipo de cambio. Trae el motor listo, sin dependencias, y explica el corte contable que lo hace cuadrar con el F29. Usar cuando el usuario pida el P&L, el resultado de un mes, el margen por negocio, o pregunte por qué una cifra del informe no coincide con lo declarado.
---

# El P&L: sobre el neto y devengado por fecha de documento

**Código** `lib/pyl.mjs` (en este plugin) · **Repos que lo usan**
`keepsync-hub/ks-contador-jf`, `keepsync-hub/ks-contador-kompu`, en `pyl/`

```js
import { agregarPorMes, montoResultado, aCLP } from './lib/_hub/pyl.mjs'
const { meses, total } = agregarPorMes(movimientos)
```

Para publicar el informe, ver `ks-skill-hoja-google-formulas-vivas`.

## Cuándo usar

- Producir o revisar el resultado mensual.
- Explicar el margen de un negocio concreto.
- Entender una diferencia entre el P&L y el F29.

## Las dos reglas contables, y por qué importan

1. **Corre sobre el neto.** El IVA no es ingreso ni gasto: es un impuesto que se recauda y se
   descuenta. Un P&L sobre montos totales infla las dos columnas y deja el margen igual, lo que es
   peor que estar mal: parece razonable.
2. **Devengado por fecha de documento**, el mismo corte que usan el RCV y el F29. Es lo que permite
   cuadrar el informe contra lo declarado; con criterio de caja no cuadraría nunca y no habría forma
   de saber si el desajuste es un error o el método.

Una nota de crédito rebaja con signo negativo, no se borra el documento original.

## El IVA sin crédito fiscal SÍ es costo

Un gasto marcado `ivaRecuperable: false` aporta **neto + IVA**. Es el caso del proveedor extranjero:
ese IVA no se recupera contra nada, así que es plata que salió y no vuelve.

## Falla en voz alta con la moneda extranjera

`aCLP()` **lanza** si un documento en moneda extranjera no trae `tipoCambio.valor`. Preferimos
reventar antes que publicar un P&L que sumó pesos con dólares — y sin la excepción esa suma se ve
perfectamente normal.

Y convierte **antes** de redondear. Redondear un monto en dólares con decimales y multiplicar después
desvía el costo; es una regresión que ya ocurrió y hoy la cubre un test.

## Guardrails

- **Lo que no es resultado no entra.** Aportes, préstamos y traspasos se marcan `no-resultado`,
  aportan cero y quedan apartados en su mes, visibles. No se borran.
- **El tipo de cambio es un supuesto, y se declara como tal.** Mientras no haya una cartola con el
  cargo real en pesos, esa celda mueve el resultado de todos los meses a la vez. Va marcada.
- **El P&L no reemplaza a la contabilidad.** Es un informe de gestión que cuadra con el F29, no un
  balance.

## Notas

- El motor era idéntico en los dos repos salvo el comentario de cabecera con la razón social.
- Lo que **no** se comparte y sigue en cada repo: el ensamblado del libro (una de las dos instancias
  deriva gastos de pagos de impuestos que la otra no tiene) y el reporte de consola. Divergieron por
  motivos reales, no por descuido.
- El contrato está cubierto por `lib/test/pyl.test.mjs`; cada repo además cuadra el motor contra un
  F29 ya declarado, que es la prueba que de verdad importa.
