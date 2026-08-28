---
name: ks-skill-cruce-facturas-pagos
description: Cruza las facturas que los proveedores emitieron según el Registro de Compras y Ventas contra los pagos que muestran las cartolas del banco, y deja cada factura marcada como pagada, pago agrupado, pago probable o sin evidencia. Trae el motor completo, sin dependencias. Usar cuando llegue una cartola o un estado de cuenta, cuando pregunten qué facturas están pagadas o qué hay pendiente en el INBOX, o cuando pidan rehacer el cruce.
---

# Cruce de facturas recibidas contra pagos

**Código** `lib/cruce/{cartola,cruce,comparar,hoja}.mjs` (en este plugin) · **Repo que lo usa**
`keepsync-hub/ks-contador-kompu`, en `cruce/` · **Docs** `cruce/README.md` y
`docs/cruce-facturas-pagos.md` de ese repo

Responde una pregunta concreta: de todas las facturas que los proveedores emitieron, **¿cuáles están
pagadas?** El SII sabe qué se facturó; el banco sabe qué se pagó. Ninguno de los dos sabe las dos
cosas.

Es el único módulo de este plugin validado contra producción de punta a punta.

## Antes que nada: puede que no haga falta correrlo a mano

El mismo ciclo existe como **página pública de n8n**, sin login: pide una sola cosa —el documento del
banco— y hace la secuencia completa (lo guarda en el INBOX, procesa la bandeja, actualiza la Hoja y
archiva el documento). Corre el mismo criterio, porque su Code node se genera desde estos mismos
módulos.

Si la persona solo quiere que el cruce quede hecho, **la página basta y conviene decírselo**. Esta
skill es el camino **supervisado**: sirve cuando hay que mirar la transcripción antes de escribir,
cuando la página falló y hay que entender por qué, o cuando el documento es raro. Además deja la
transcripción versionada, que la página no hace.

## Los identificadores

Las carpetas del INBOX, de DONE y el archivo de la Hoja **no se listan acá**: salen de
`drive/estructura.json` del repo, que es la fuente única de verdad (ver `ks-skill-drive-manifiesto`).
Si un id no calza con el manifiesto, parar y revisarlo antes de escribir nada.

## El ciclo

1. **Leer el INBOX** sin lo que ya está en DONE, y descartar lo que ya esté transcrito.
2. **Transcribir cada documento** a un JSON en `cruce/cartolas/`, un movimiento por operación: fecha
   ISO, glosa tal como la imprime el banco, monto entero (positivo el cargo, negativo la reversa).
   - **`control.totalDeclarado`** es el total que el propio documento imprime. Es lo que hace que una
     línea olvidada se note. Si el documento no imprime ninguno, hay que poner
     `control.sinTotalDeclarado: true` **con un motivo**: el silencio no vale como cuadratura.
   - **Compras en cuotas**: `monto` es la compra completa (lo que cruza contra la factura) y
     `montoFacturado` la cuota del período (lo que cuadra contra el total del documento).
   - Lo que no es una compra —pagos de la tarjeta, abonos administrativos— va en `excluidos` **con su
     motivo**, no se borra.
   - No hay que deduplicar ni netear reversas a mano: eso lo hace el código, y lo informa.
3. **Recalcular** con `node cruce/actualizar-hoja.mjs --hoja <hoja.csv>`.
4. **Escribir la Hoja** mandando el patch al workflow de n8n, que es el único con la credencial que
   puede reemplazar el contenido sin cambiar el id del archivo.
5. **Cerrar**: mover los documentos a DONE, correr los tests, versionar la transcripción y el informe.

## El criterio, en tres pasadas

| Estado | Criterio |
|---|---|
| `PAGADA` | Monto exacto **y** el nombre del comercio coincide con el proveedor |
| `PAGO AGRUPADO` | Un cargo que es la suma exacta de 2 o 3 facturas del mismo proveedor. Va marcado `REVISAR` |
| `PAGO PROBABLE` | Solo monto exacto. Va marcado `REVISAR` |
| `SIN EVIDENCIA` | Ningún movimiento calza |

El monto exacto manda; la fecha **no filtra**, solo desempata. Un movimiento se asigna a una sola
factura o a un solo grupo: si no, dos facturas del mismo monto quedarían pagadas por el mismo cargo y
el total pagado saldría al doble.

## Las dos fallas deliberadas, que no hay que rodear

- **Una cartola no cuadra contra su documento.** La transcripción está incompleta: volver al documento
  y corregirla.
- **Facturas que la Hoja daba por pagadas quedaron `SIN EVIDENCIA`.** Casi siempre falta una cartola.
  Solo si de verdad corresponde perderlas se repite con `--permitir-regresiones`, y el informe lo deja
  escrito.

## Guardrails

- **`SIN EVIDENCIA` no significa impaga**: significa que estas cartolas no lo saben. Marcar como
  pendiente una factura pagada por otro medio produce un pasivo ficticio.
- **El cruce es indiciario, no contable.** Todo lo que no tiene el nombre del proveedor va `REVISAR`, y
  así se queda hasta que alguien lo mire.
- **El cruce se rehace, no se acumula.** Cada corrida recalcula el estado de todas las facturas sobre
  todas las cartolas juntas; agregar una cartola nueva sin revisar lo ya cruzado deja emparejamientos
  peores.
- **Las diez columnas base son del RCV y no se tocan nunca.** Este flujo solo recalcula las siete
  columnas de pago.
- **Se escribe en el mismo archivo de Drive**, nunca en una Hoja nueva: quien tenga el enlace sigue
  viendo la versión vigente. Y con **escritura optimista**: cada cambio lleva el valor que espera
  encontrar, así que si alguien editó la Hoja a mano el workflow **falla en vez de sobrescribir** ese
  trabajo. Si falla por eso, no forzar: volver a bajar la Hoja y rehacer.
- Si el patch sale vacío, el cruce no cambió nada: **no escribir la Hoja**.

## Al reportar

En este orden: qué documentos entraron, cuántos movimientos aportaron, cómo quedó el reparto por
estado, cuántas filas cambiaron y qué quedó en `REVISAR`. Los cargos del banco sin factura en el RCV
casi siempre son gasto que no pasa por el RCV (comida, parking, bencina, publicidad, impuestos pagados
con la tarjeta); vale la pena nombrar los montos grandes.

**No presentar el cruce como conciliación contable** mientras la evidencia cubra solo una fracción de
lo facturado.
