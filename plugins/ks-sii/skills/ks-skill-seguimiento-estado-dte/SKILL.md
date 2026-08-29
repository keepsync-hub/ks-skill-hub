---
name: ks-skill-seguimiento-estado-dte
description: Vigila si las facturas electrónicas emitidas y recibidas fueron aceptadas o reclamadas por la contraparte, y alerta cuando se acerca la aceptación tácita de los 8 días de la Ley 19.983. Consulta seis fuentes del RCV, deriva el estado de cada documento y notifica solo los cambios reales. Usar cuando el usuario pregunte si una factura fue aceptada o reclamada, pida revisar el estado de los DTE, o cuando llegue una alerta de aceptación tácita.
---

# Seguimiento del estado de los DTE

**Repo** `keepsync-hub/ks-contador-jf`, `keepsync-hub/ks-contador-kompu` · **Entrypoint**
`n8n/workflows/estado-dte-sii-directo.json` · **Tests** `node n8n/test/estado-dte-nodes.test.mjs`
(usa el runner compartido `lib/_hub/runners/n8n-estado-dte-nodes.mjs`)

Responde una pregunta con consecuencias de plata: **¿la contraparte aceptó, reclamó, o todavía no
respondió?** Y avisa antes de que el plazo se cierre solo.

## Cuándo usar

- Revisar el estado de las facturas emitidas o recibidas de un período.
- Entender una alerta de aceptación tácita.
- Decidir si una factura `RECLAMADA` debe salir del crédito fiscal.

## Cómo deriva el estado

De seis consultas al RCV (venta del período actual y del anterior; compra en sus cuatro estados
contables), sobre dos campos del detalle:

- `detFecAcuse` con fecha → **Aceptada** (aceptación expresa).
- `detFecReclamado` con fecha → **Reclamada**.
- Los dos `null` y menos de 8 días corridos desde la fecha del documento → **Pendiente**, en plazo.
- Los dos `null` y 8 días o más → **alerta de aceptación tácita**.

**No hay una cuarta categoría "Rechazada".** El reclamo de la Ley 19.983 *es* el mecanismo de rechazo,
y el SII no distingue las dos cosas a este nivel: tratarlas como un solo estado, no inventar una
distinción que el dato no sostiene.

Si `dcvEstadoContab` ya trae un valor del SII, **ese manda**. La alerta de los 8 días es informativa,
no una tercera fuente de verdad — es el mismo principio de "reconciliar, no recalcular".

## Anti-ruido

El nodo diffea contra el estado guardado y notifica **solo los cambios reales**. Un documento ya
notificado no vuelve a avisar, y uno que se ve por primera vez pero ya está resuelto no genera alerta
retroactiva. Sin eso el correo diario se vuelve ruido y se deja de leer, que es la forma más común de
que un flujo de vigilancia deje de servir.

## Guardrails

- **`codRespuesta 99` es "sin documentos", no un error.** Tratarlo como falla llenaría el buzón de
  alarmas falsas todos los días que no haya movimiento.
- **Que las seis consultas fallen de verdad sí es un error, y tiene que ser ruidoso.** Un flujo de
  vigilancia que se cae en silencio es peor que no tenerlo.
- **El detalle del RCV exige token de producción.** Ver `ks-skill-sii-consultar-rcv`.
- **Esto vigila, no actúa.** Sacar una factura reclamada del crédito fiscal es una decisión humana.

## Notas

- Los tests ejecutan el `jsCode` real leído del JSON del workflow, no una transcripción: cubren la
  derivación de estado, el umbral de 8 días, la idempotencia de la notificación y el caso "visto por
  primera vez pero ya resuelto".
- El tipo de documento vigilado se configura. Una empresa comercializadora probablemente emita más de
  un tipo: revisarlo al montar una instancia nueva en vez de heredar el valor.
