---
name: ks-skill-hoja-google-formulas-vivas
description: Publica una Hoja de Google o un Excel con fórmulas reales en vez de números congelados, de modo que cambiar un supuesto recalcule todo el informe, y la reescribe conservando el mismo archivo para que el enlace compartido no se rompa. Trae las cuatro reglas anti-desalineación y la escritura optimista que falla si alguien editó a mano. Usar cuando el usuario pida publicar, actualizar o corregir un informe en una Hoja de Google o en Excel, o pregunte por qué una fórmula quedó apuntando a la fila equivocada.
---

# Una Hoja con fórmulas vivas, reescrita sin cambiarle el id

**Repo** `keepsync-hub/ks-contador-jf`, `keepsync-hub/ks-contador-kompu` · **Entrypoint**
`node pyl/reporte.mjs --json | node pyl/sheet.mjs` (CSV → Hoja nativa) y `python3 pyl/excel.py`
(`.xlsx` de varias pestañas) · **Escritura** el workflow `cruce-escribir-hoja.json`

La diferencia entre un informe **publicado** y un informe **vivo**: si el tipo de cambio es una celda
amarilla y todo lo demás son fórmulas sobre ella, cambiar ese supuesto recalcula el resultado de todos
los meses. Si son números congelados, hay que volver a generar el archivo y el enlace cambia.

## Cuándo usar

- Publicar o actualizar un informe que otra gente va a leer por un enlace.
- Corregir una fórmula que quedó apuntando mal.
- Entender por qué el informe se reescribe en el mismo archivo y no en uno nuevo.

## Las cuatro reglas anti-desalineación

Una Hoja generada se reordena, se filtra y se le insertan filas. Todo lo que dependa de una posición
se rompe en silencio.

1. **Ninguna fórmula referencia una fila.** Se usa la columna completa más un criterio literal:
   `SUMIF($A:$A, 202608, $K:$K)`, nunca `SUM(K12:K37)`.
2. **Mapa de columnas fijo.** Las columnas están declaradas y no se derivan del orden en que se
   escriben.
3. **El criterio va literal**, no como comodín: `">=202601"` y no `"20*"`, que también matchea 2005 y
   cualquier cosa que empiece con 20.
4. **Una fila `VERIFICACION`** que cuadra el mismo total por **dos caminos independientes**. Si el
   informe se desalinea, esa fila lo dice antes que nadie.

En el `.xlsx`, el supuesto vive en una celda con **nombre definido**, y el generador **verifica antes
de guardar** que ese nombre apunte a un número y que ninguna conversión tenga una celda escrita a
mano.

## Cómo verificar que las fórmulas quedaron bien

**Exportando a CSV y mirando el texto**, no leyendo la representación en pantalla: la vista muestra el
resultado calculado, que se ve idéntico esté la fórmula bien o mal.

## Escritura optimista, en el mismo archivo

La Hoja se reescribe **en el mismo id**, nunca en una copia nueva: quien tenga el enlace sigue viendo
la versión vigente.

El patch que se manda lleva, por cada cambio, **el valor que espera encontrar** además del nuevo. Si
alguien editó la Hoja a mano, el flujo **falla en vez de sobrescribir** ese trabajo. Si falla por eso,
no forzar: volver a bajar la Hoja y rehacer el cálculo sobre la versión actual.

## Guardrails

- **No convertir las fórmulas en valores** "para que quede más limpio": eso mata el informe vivo, que
  es el punto.
- **No escribir una Hoja nueva.** Rompe todos los enlaces compartidos y deja dos versiones circulando.
- **No forzar la escritura optimista.** El conflicto es información, no un obstáculo.
- **Si el patch sale vacío, no escribir nada.**
- La credencial de Drive necesita **desactivada** la restricción de uso en nodos HTTP: sin eso no hay
  forma de reemplazar el contenido de una Hoja ni de convertir un CSV a Hoja nativa.

## Notas

- Se llega a la Hoja nativa vía CSV, sin credencial de Google Sheets: Drive convierte el CSV al
  subirlo. Una dependencia menos.
- El único paquete que necesita el `.xlsx` es `openpyxl`; el resto es Node sin dependencias.
- Los generadores del informe **no** están en `lib/` de este hub: divergieron por motivos reales entre
  las dos instancias (una maneja gastos ya en pesos que la otra no tiene; la otra generalizó el
  encabezado y el supuesto). Unificarlos es fusionar la semántica de un informe publicado, y es otro
  trabajo.
