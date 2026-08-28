# QA de la migración de los contadores al código compartido

**Fecha** 2026-08-28 · **Repos** `ks-contador-jf`, `ks-contador-kompu` · **Resultado: aprobada con una
diferencia esperada y explicada.**

Los dos repos están en producción. El criterio no fue "compila", sino que las suites y las salidas
deterministas dieran **exactamente** lo mismo que antes de tocar nada.

## QA-0 — línea base

Capturada con `node scripts/qa-contador.mjs <repo> --baseline` sobre los repos **sin ninguna
modificación**, antes del primer cambio. **22 artefactos, los 22 en verde**: 13 de Kompu (11 suites +
el agregado del P&L + el cruce) y 9 de JF (8 suites + el agregado del P&L).

Se versionan huellas SHA-256, no las salidas: el agregado del P&L trae cifras, RUTs y nombres de
clientes reales, y este repo no aloja datos de ninguna empresa.

## Qué se migró

Ocho módulos puros y tres corredores de test, todos a `lib/_hub/` (vendorizado, ver
`scripts/sync-hub.mjs`):

| Módulo | Cómo estaba |
|---|---|
| `resultado-envio.mjs`, `drive-estructura`, `n8n-f29-nodes` | **idénticos byte a byte** en los dos repos |
| `three-way-match.mjs`, `pyl.mjs` | diferían **solo en comentarios** |
| `n8n-estado-dte-nodes` | difería en **una línea** (el RUT emisor) → ahora entra por parámetro |
| `parser-recibo.mjs` | se tomó la versión parametrizada; el mapa de cuentas salió a `compras/cuentas.mjs` de cada repo |
| `cruce/{cartola,cruce,comparar,hoja}.mjs` | existían solo en Kompu; JF los gana |

**Quedó deliberadamente fuera**: el ensamblado del libro del P&L, el reporte de consola y los
generadores del informe (la Hoja y el `.xlsx`). Divergieron **en las dos direcciones** —una instancia
agregó manejo de gastos ya en pesos, la otra generalizó el encabezado y el supuesto—, así que
unificarlos es fusionar la semántica de un informe financiero publicado, no de-duplicar código. Es
otro trabajo y no se metió en esta migración.

## QA-1 — equivalencia

`node scripts/qa-contador.mjs <repo> --comparar`, después de migrar.

| Artefacto | Kompu | JF |
|---|---|---|
| Las 11 / 8 suites de tests | ✅ idénticas | ✅ idénticas |
| `pyl/reporte.mjs --json` (el agregado del P&L) | ✅ **idéntico byte a byte** | ✅ **idéntico byte a byte** |
| `cruce/actualizar-hoja.mjs` sobre las cartolas versionadas | ✅ idéntico | — |
| `drive/estructura.test.mjs` | ⚠️ una línea (ver abajo) | ⚠️ una línea (ver abajo) |

### La única diferencia, y por qué se acepta

```
antes:   ok   revisados 53 archivos, 0 nombres retirados sueltos     (Kompu; JF: 38)
ahora:   ok   revisados 59 archivos, 0 nombres retirados sueltos     (Kompu; JF: 48)
```

Es el contador del escaneo de nombres de carpeta retirados. Subió porque `lib/_hub/` agregó archivos
al repo: 11 módulos + el verificador + el manifiesto de huellas, menos los que se borraron, más
`compras/cuentas.mjs`. Los números cuadran exactamente en los dos repos (+6 en Kompu, +10 en JF).

**El resultado del chequeo no cambió** —cero nombres retirados sueltos— y ahora cubre más archivos,
que es estrictamente mejor: la guarda que impide que una instancia clonada escriba en el Drive de la
instancia anterior ahora también mira el código compartido.

### Otras dos cosas que cambiaron y no son diferencias de comportamiento

- **`cruce/n8n/nodo-cruce.js`**: el generador ahora lee de `lib/_hub/cruce/`, así que se regeneró. El
  diff es de **una línea**: el comentario de procedencia. El código aplanado que corre en n8n es
  **byte a byte el mismo**, verificado con `diff`. El workflow desplegado no necesita reimportarse.
- **`parsearRecibo` sin mapa** ahora deja todo en `por-revisar`, porque el default del módulo
  compartido es un mapa vacío. Los tests de los dos repos pasan su propio mapa de forma explícita, y
  su salida no cambió. Es el comportamiento correcto: un módulo compartido no puede conocer a ninguna
  empresa, y adivinar una imputación es peor que pedir revisión.

## QA-1 — chequeos de integridad

| Chequeo | Kompu | JF |
|---|---|---|
| `node lib/verificar-hub.mjs` (la copia local no fue editada) | ✅ 11 archivos | ✅ 11 archivos |
| `node scripts/sync-hub.mjs <repo> --verificar` (no se quedó atrás) | ✅ | ✅ |
| `git status` sin cambios en archivos de datos (operaciones, recibos, acuses, cartolas, movimientos) | ✅ ninguno | ✅ ninguno |

## Lo que la QA NO tocó, a propósito

**No se escribió en Drive, ni en n8n, ni en el SII, ni en ningún banco.** El cruce corrió en seco
contra las cartolas ya versionadas; el webhook que reescribe la Hoja **no se llamó**. Ningún workflow
se importó, se activó ni se desactivó. Ningún trigger se tocó.

Una migración de código no necesita tocar un sistema externo para probarse, y si lo necesitara habría
que cambiar la migración, no la QA.

## QA-2 y QA-3

| Chequeo | Resultado |
|---|---|
| `node scripts/validar.mjs` | ✅ 18 skills, 2 plugins, 0 avisos |
| `claude plugin validate . --strict` (marketplace) | ✅ |
| `claude plugin validate plugins/ks-comun --strict` | ✅ |
| `claude plugin validate plugins/ks-sii --strict` | ✅ |
| Los 5 tests de `lib/test/` | ✅ |
| **Instalación real**: `marketplace add` → `plugin install` → `plugin list` | ✅ los dos plugins instalados y habilitados |
| Cobertura: los 31 npm scripts de `ks-compra-agil` en el índice | ✅ todos |
| Cobertura: las 19 suites de los contadores mapeadas a una skill | ✅ todas |

El corte en dos plugins queda justificado con la medición que da el propio CLI: `ks-sii` cuesta
**~2.048 tokens siempre encendidos** con sus 10 skills. Un solo plugin de 18 pondría casi el doble en
**cada** sesión, incluidas las de un contador que no necesita nada de lo comercial.

El marketplace local que se usó para probar la instalación se quitó al terminar: apuntaba a una ruta
de este contenedor, y el que manda es el de GitHub que declaran los `settings.json` de los repos.

## Rollback

La migración de cada repo es **un solo commit**. Deshacerla es `git revert` de ese commit. No hay
estado externo que revertir, porque la QA no escribió en ningún sistema externo.

## Después de la aprobación

La línea base se vuelve a capturar sobre el estado migrado, para que sea la referencia de los cambios
siguientes. Las huellas previas a la migración quedan en la historia de git de este repo.
