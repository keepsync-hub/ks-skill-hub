---
name: ks-skill-nueva-instancia-contador
description: Clona el agente contable de KeepSync para una empresa nueva — qué se hereda, qué hay que reidentificar y en qué orden, con los placeholders que rompen a propósito si alguien despliega sin reemplazarlos y la guarda que impide escribir en el Drive de la instancia anterior. Usar cuando el usuario quiera montar el contador de otro cliente o empresa, replicar el flujo del F29 en una instancia nueva, o preguntar qué falta para que una instancia recién copiada quede operativa.
---

# Montar el contador de una empresa nueva

**Repo** `keepsync-hub/ks-contador-jf` como plantilla, `keepsync-hub/ks-contador-kompu` como la copia
ya hecha · **Docs** `docs/pendientes.md` del repo nuevo, que es el documento de retoma

Existe porque ya se hizo una vez: la segunda instancia arrancó con un commit llamado literalmente
*"Copia base desde …"* y veinte commits después estaba operativa. Esta skill es esa receta, más lo que
salió mal.

## Qué se hereda y qué no

**Se hereda**: la lógica, las convenciones de nombres, la receta de firma del SII, la estructura de
los siete módulos y los workflows de n8n.

**No se hereda nada de datos ni de credenciales.** Y hay una categoría intermedia que es la peligrosa:
**los valores de configuración que parecen razonables**. La tasa de PPM, el vencimiento del
certificado, los tipos de documento vigilados. Un valor heredado que parece razonable es más peligroso
que uno vacío, porque no llama la atención. Van en `null` hasta confirmarlos.

## El orden

1. **Copia base** y renombrar la carta de responsabilidades del agente.
2. **Identidad**: RUT y razón social en la configuración de cada workflow, en el libro del P&L y en el
   catálogo de clientes.
3. **Drive**: crear el árbol, y poner sus ids en `drive/estructura.json` **primero**. Después correr
   `node drive/estructura.test.mjs`, que dice qué más hay que tocar. Ver `ks-skill-drive-manifiesto`.
4. **`nombresRetirados`**: agregar los nombres de carpeta de la instancia de origen. El test falla si
   algún archivo del repo todavía los menciona — es la guarda que impide que la instancia nueva
   escriba en el Drive de la vieja.
5. **Vaciar los datos**: operaciones, recibos, acuses, movimientos y clientes quedan como andamiaje
   vacío, no con los de la otra empresa.
6. **Certificado digital** y credenciales de n8n. Ver `ks-skill-sii-firma-y-token`.
7. **Confirmar la tasa de PPM** contra la Propuesta parcial del portal. Es **bloqueante para
   declarar**.
8. **Desplegar los workflows**: importar, reasignar todos los `REEMPLAZAR_*`, **dejar inactivos**,
   correr un ciclo a mano, y recién ahí activar.
9. **Sincronizar el código compartido**: `node scripts/sync-hub.mjs <repo>` desde el hub, y agregar
   `--verificar` a la lista de tests del README.

## Los placeholders rompen a propósito

`REEMPLAZAR_DATATABLE_*`, `REEMPLAZAR_CREDENCIAL_*`, `REEMPLAZAR_WEBHOOK_ID`,
`REEMPLAZAR_TOKEN_WEBHOOK`. Si alguien importa un JSON sin reasignarlos, **n8n falla en vez de escribir
en los objetos de la instancia anterior**. No reemplazarlos por valores "temporales" que apunten a
algo real.

## Lo que hay que mirar aunque el repo no lo diga

- **La instancia de n8n puede estar compartida** entre empresas, sin carpetas separadas. Hay riesgo
  real de editar o activar el workflow equivocado; conviene prefijar las Data Tables por empresa.
- **Las credenciales de correo y de Drive pueden quedar apuntando a la cuenta de la otra empresa.** El
  flujo funciona igual y el remitente de los avisos es el equivocado. Revisarlo explícitamente.
- **Los tipos de documento vigilados** dependen del giro: una comercializadora emite más de uno.
- **Una tarjeta que mezcla gastos personales y de la empresa** no puede alimentar el P&L sin resolver
  antes qué es reembolso y qué es gasto.

## Guardrails

- **La instancia nueva no se activa hasta haber corrido un ciclo a mano.** Un trigger activo sobre una
  configuración heredada declara sobre datos equivocados.
- **Ninguna credencial viaja en el repo.** Viven en el vault de n8n, siempre.
- **El envío del F29 sigue siendo manual** también en la instancia nueva. No hay atajo.

## Notas

- La deriva es real: la primera instancia quedó **atrás de su propia copia** en cinco cosas. Por eso el
  código compartido se sincroniza desde el hub y `sync-hub.mjs --verificar` va en los tests.
- Lo que todavía **no** se comparte y hay que adaptar a mano: el ensamblado del libro del P&L, el
  reporte de consola y los generadores del informe. Divergieron por motivos reales entre las dos
  instancias.
