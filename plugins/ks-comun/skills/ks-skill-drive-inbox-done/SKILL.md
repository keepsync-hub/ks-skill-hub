---
name: ks-skill-drive-inbox-done
description: El ciclo de una bandeja de entrada en Google Drive — un documento llega al INBOX, se identifica, se archiva en su módulo con el nombre estándar, se registra en el repo y recién ahí se mueve a DONE— de modo que lo que queda suelto en la raíz sea exactamente el trabajo pendiente. Usar cuando el usuario pregunte qué hay pendiente en el INBOX, pida procesar documentos que llegaron, o quiera saber dónde archivar un documento nuevo.
---

# El ciclo INBOX → DONE

**Repo** `keepsync-hub/ks-contador-jf`, `keepsync-hub/ks-contador-kompu` · **Docs** `drive/README.md`
de cualquiera de los dos · **Ids** en `drive/estructura.json` (ver `ks-skill-drive-manifiesto`)

Una bandeja de entrada sirve para una sola cosa: que **la raíz vacía signifique "no hay nada
pendiente"**. Todo el diseño sale de ahí.

## Cuándo usar

- Responder "¿qué hay pendiente?".
- Procesar documentos que alguien dejó en la bandeja.
- Decidir dónde va un documento nuevo.

## El ciclo

1. **Leer los hijos directos del INBOX.** La consulta por carpeta padre no baja a `DONE`, así que lo
   ya procesado no aparece. De lo que sí aparece hay que descartar dos cosas: la carpeta `DONE` misma,
   y cualquier documento que ya esté registrado en el repo — se reconoce por el id del archivo.
   Reprocesar uno no rompe nada (se deduplica), pero no aporta.
2. **Identificar qué es** y a qué módulo pertenece.
3. **Archivarlo en su módulo** con el nombre estándar de ese módulo.
4. **Registrarlo en el repo**: el índice del módulo, con el id del archivo de Drive como respaldo. Un
   registro sin su documento respaldatorio no es un registro.
5. **Recién ahí, mover el original a `DONE`.**

Si la raíz del INBOX queda vacía, no hay trabajo pendiente: decirlo y parar.

## Guardrails

- **Mover a `DONE` es el último paso, no el primero.** Mover antes de registrar pierde el rastro de lo
  que falta si algo se interrumpe a la mitad.
- **No se borra nada.** `DONE` es archivo, no papelera.
- **Los ids de las carpetas salen del manifiesto**, no de una constante en un script.
- **Un documento que no se sabe qué es se deja en el INBOX** y se reporta. Archivarlo "en algún lado"
  lo pierde mejor que dejarlo a la vista.

## Notas

- Un modo de falla real que conviene conocer: **un archivo subido por otra cuenta puede no ser
  movible** por la credencial del proyecto, y se queda en la raíz del INBOX para siempre pareciendo
  trabajo pendiente. Cuando un documento no se puede mover, decirlo explícitamente en vez de dejar la
  bandeja sucia sin explicación.
- El ciclo está implementado de punta a punta para un caso (documentos bancarios, ver
  `ks-skill-cruce-facturas-pagos`); para los demás módulos es una convención que se sigue a mano.
