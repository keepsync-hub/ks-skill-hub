---
name: ks-skill-sii-consultar-rcv
description: Consulta el Registro de Compras y Ventas del SII de Chile por su endpoint interno — getResumen para los agregados que alimentan el F29, getDetalleCompra y getDetalleVenta para el documento por documento con su fecha de acuse y de reclamo. Trae el contrato exacto del request y cómo distinguir un "sin datos" de un error. Usar cuando el usuario pida leer el RCV, revisar qué se facturó o se compró en un período, o cuando una consulta al RCV devuelva un código de respuesta raro.
---

# Consultar el RCV del SII

**Repo** `keepsync-hub/ks-contador-jf`, `keepsync-hub/ks-contador-kompu` · **Entrypoint** los nodos
`Consultar RCV Compras/Ventas` de `n8n/workflows/f29-sii-directo.json` · **Docs**
`docs/nodos-firma-sii.md`, sección "Contrato del endpoint"

El SII **no tiene API pública** para el RCV: `api.sii.cl` solo publica boleta electrónica. Lo que sí
existe es el endpoint interno que usa la propia pantalla del portal, y es el que se consume acá.

Requiere un token de `ks-skill-sii-firma-y-token`.

## Cuándo usar

- Armar el borrador del F29 (`ks-skill-f29-reconciliar` lo usa).
- Vigilar aceptación y reclamo de DTE (`ks-skill-seguimiento-estado-dte`).
- Responder "¿qué facturó o compró la empresa en tal período?" sin entrar al portal.

## El contrato

```
POST https://www4.sii.cl/consdcvinternetui/services/data/facadeService/<metodo>
Cookie: TOKEN=<token>
Content-Type: application/json; charset=utf-8
Accept: */*
```

```json
{ "metaData": { "namespace": "cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/<metodo>",
                "conversationId": "<el token>", "transactionId": "0", "page": null },
  "data": { "rutEmisor": "<rut sin dv>", "dvEmisor": "<dv>", "ptributario": "<YYYYMM>",
            "operacion": "COMPRA", "estadoContab": "REGISTRO", "codTipoDoc": "0" } }
```

El `<metodo>` va **dos veces**: en la URL y dentro del `namespace`. Si no coinciden, el SII rechaza.

## Las cuatro trampas, cada una con lo que costó

Salieron de siete ejecuciones y son propiedades del endpoint, no de ninguna empresa:

1. **`Accept: application/json` rompe el endpoint.** Devuelve un 500 de JBoss, no un 406. La traza
   muestra que la ruta sí matcheó y que falló la negociación de contenido. Va `Accept: */*`.
2. **No mandar la cookie `NETSCAPE_LIVEWIRE.rut`.** Parece la pieza que falta porque cambia un error
   mudo por uno explícito, pero el mensaje que produce —*"no está autorizado para representar"*— es
   **consecuencia de mandarla**: fuerza la vía de representación electrónica, que no corresponde
   cuando el titular accede por derecho propio. Sin ella no hay ningún problema de permisos.
3. **`conversationId` es el token, no el RUT.** El servicio lo valida: con otra cosa responde
   `codRespuesta 99, "El token no es valido"`.
4. **`codRespuesta 3` no es un error de forma**: significa "no hay carga del RCV para ese período y
   operación". Es un caso normal — avisar, no reintentar.

## Diferencias entre resumen y detalle

| | `getResumen` | `getDetalleVenta` / `getDetalleCompra` |
|---|---|---|
| Nivel | Agregado por tipo de documento | Documento por documento |
| `codTipoDoc` | Acepta `null` o `"0"` (todos) | **Exige un código explícito** (ej. `"33"`); con `null` da `codRespuesta 2` |
| `estadoContab` | Obligatorio | En `VENTA` acepta `null`; en `COMPRA` es **obligatorio**. Asimetría no documentada en ningún lado, confirmada en vivo |
| Token | Producción (certificación nunca se probó) | **Exige token de producción**: uno de certificación da un `401` de JBoss |
| "Sin datos" | `codRespuesta 3` | `codRespuesta 99` |

En el detalle, los dos campos que importan para el seguimiento son **`detFecAcuse`** y
**`detFecReclamado`**: responden "¿aceptó, reclamó o no respondió el receptor?" a nivel de documento,
sin ningún webservice adicional. `dcvEstadoContab` puede venir `null` en documentos muy recientes:
parece poblarse cuando el SII termina de clasificar el documento, no al emitirse.

Fuera de `data` viene `dataCabecera` con `dcvFecCreacion` / `dcvFecModificacion`: **la fecha de
actualización del registro**. Es lo que permite saber si el RCV cambió después de armado un borrador.

## Guardrails

- **En compras, `estadoContab: REGISTRO`.** Los otros tres (`PENDIENTE`, `NO_INCLUIR`, `RECLAMADO`)
  **no dan crédito fiscal**, y mezclarlos infla el IVA a favor. Es el error más caro de este flujo.
- **Un `codRespuesta` distinto de 0 nunca se trata como cero documentos en silencio.** 3 y 99 son
  "sin datos" y hay que decirlo; cualquier otro es una falla y tiene que ser ruidosa.
- **Es un endpoint interno, no documentado ni versionado por el SII: puede cambiar sin aviso.** El
  riesgo está aceptado explícitamente y por eso existe el camino de respaldo por CSV bajados a mano
  del portal. Si un día deja de responder, no es un bug: es el riesgo materializándose.

## Notas

- Validado contra la pantalla del portal el 2026-08-19: el resumen cuadró **peso a peso**, y hasta la
  fecha de actualización coincidió con la que muestra el SII.
- `codTipoDoc` con `"0"` o con `null` da lo mismo en `getResumen`. Verificado.
- Sin confirmar todavía: si `codTipoDoc` acepta más de un tipo por llamada en el detalle, o si hay que
  iterar tipo por tipo. Solo se probó con `"33"`.
