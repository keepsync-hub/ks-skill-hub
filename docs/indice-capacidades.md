# Índice de capacidades de KeepSync

Las **~40 capacidades** que existen hoy en los cuatro repos, dónde vive cada una, y si está
documentada como skill.

La regla de reparto: **una skill vive donde se ejecuta**. Lo que corre en cualquier repo está en este
hub; lo que necesita el código, la configuración y los datos de un repo concreto va en ese repo.
Documentarla acá no la haría reutilizable, la sacaría del lugar donde sirve.

---

## En el hub (18) — portables

Instalables con `/plugin marketplace add keepsync-hub/ks-skill-hub`.

| Skill | Plugin | Origen |
|---|---|---|
| `ks-skill-cotizar-usd` | ks-comun | `ks-compra-agil` (era skill) |
| `ks-skill-keepsync-pdf` | ks-comun | `ks-compra-agil` (era skill) |
| `ks-skill-hoja-google-formulas-vivas` | ks-comun | los dos contadores |
| `ks-skill-drive-manifiesto` | ks-comun | los dos contadores |
| `ks-skill-drive-inbox-done` | ks-comun | los dos contadores |
| `ks-skill-n8n-codigo-versionado` | ks-comun | los tres repos con n8n |
| `ks-skill-indice-jsonl-append-only` | ks-comun | `ks-compra-agil` |
| `ks-skill-extraer-texto-documentos` | ks-comun | `ks-compra-agil` |
| `ks-skill-sii-firma-y-token` | ks-sii | los dos contadores |
| `ks-skill-sii-consultar-rcv` | ks-sii | los dos contadores |
| `ks-skill-f29-reconciliar` | ks-sii | los dos contadores |
| `ks-skill-seguimiento-estado-dte` | ks-sii | los dos contadores |
| `ks-skill-three-way-match` | ks-sii | los dos contadores |
| `ks-skill-parsear-acuse-sii` | ks-sii | los dos contadores |
| `ks-skill-parsear-recibo-proveedor` | ks-sii | los dos contadores |
| `ks-skill-pyl-neto-devengado` | ks-sii | los dos contadores |
| `ks-skill-cruce-facturas-pagos` | ks-sii | `ks-contador-kompu` (era skill) |
| `ks-skill-nueva-instancia-contador` | ks-sii | la copia ya hecha, como receta |

---

## En `ks-compra-agil` — venta al Estado

### Ya son skill (8, en su `.claude/skills/`)

| Skill | Comando |
|---|---|
| `compra-agil-radar-claude` | `npm run radar` |
| `compra-agil-indice` | `npm run indexar` |
| `compra-agil-ofertar` | `npm run cotizar`, `npm run cotizar-capacitacion` |
| `array-compras-agiles-radar` | `npm run array-radar` |
| `array-compras-agiles-cotizar` | `npm run array-cotizar` |
| `radar_licitaciones` | `npm run radar-licitaciones` |
| `cotizar_licitaciones` | `npm run cotizar-licitaciones` |
| `subir-documento-drive` | `npm run subir-documento` |

Dos de ellas usan guion bajo por herencia. Al tocarlas, normalizarlas a `ks-skill-<nombre>`.

### Pendientes de documentar (12) — Fase 2, en ese repo

| Nombre propuesto | Cubre | Lo que hay que capturar |
|---|---|---|
| `ks-skill-cotizar-capacitacion` | `npm run cotizar-capacitacion` | Hoy está dentro de `compra-agil-ofertar`, que cubre dos rubros en 172 líneas. Precio = tope × 0,9; score de apertura 0–100% (−5% por criterio direccionador, **no** es probabilidad de adjudicación); los dos bloqueos vivos del rubro |
| `ks-skill-cotizar-suscripcion` | `npm run cotizar-suscripcion` | Cotización fuera de compra pública; multi-línea que **falla en voz alta** si no vienen los cinco campos; el tipo de cambio a mano y por qué |
| `ks-skill-compra-agil-leads` | `npm run leads` | El contacto no está en la API (verificado): sale de los adjuntos, que no gastan cuota. Cita obligatoria; nombre deducido marcado como deducción; buzones de cuentas por pagar segregados. Rendimiento medido 2026-08-24: 97/258 (38%) |
| `ks-skill-compra-agil-digest` | `npm run digest` | Cero llamadas. Es **orden de revisión sugerido**, nunca probabilidad de ganar |
| `ks-skill-estudio-mercado` | `mercado` + `estudio` + `criterios` | Página de 25 (con 50 la API da 504 tres de cada cuatro veces); el total de una consulta es **cota superior contaminada**; el tope de 10.000 hace de los estados terminales cotas inferiores; el archivo de propuestas es **inerte** y promover es un paso humano |
| `ks-skill-transformacion-digital` | `npm run transformacion-digital` | Rotar el criterio de orden bate a ventanear por fecha (tres órdenes comparten 162 de 1.000 filas; unión 2.545 códigos); dos campos de exclusión; el excluyente en plural y por qué; el reparto jsonl/manifiesto; el reselle del timestamp |
| `ks-skill-antecedentes-licitacion` | `antecedentes-licitacion`, `leer-adjuntos`, `adjuntos-licitacion` | La ficha pública trae las bases sin ticket, sin login y sin CAPTCHA; la decisión se lee de la ficha generada, no de las bases crudas; el visor rechaza con score 0–0,1 contra umbral 0,5 **incluso autenticado** |
| `ks-skill-generar-documentos-oferta` | `npm run generar-documento` | La taxonomía formulario / generable / **acopio**; 15 de 30 documentos son acopio y generarlos sería falsificar evidencia; un `.docx` sin marcar falla **en silencio** |
| `ks-skill-keywords-radar` | `keywords`, `keywords-licitaciones` | Frases literales, no regex; una frase agregada **no salta** los filtros de la categoría; la API responde 500 a cualquier consulta con la palabra suelta "de" |
| `ks-skill-cuota-api` | `cuota`, `diagnostico-api` | El 429 a las 9 llamadas fue un episodio, no el límite; cota inferior medida 234/día; toda corrida configura la cuota primero |
| `ks-skill-login-portal` | `login-portal` (+ estado de `login` y `form-fill`) | ClaveÚnica es la única puerta para un RUN chileno; `fill()` no sirve, hay que escribir tecla a tecla; el error de conexión era TLS 1.3 contra el proxy; el llenado del formulario sigue sin verificarse contra el DOM real |
| `ks-skill-panel-mercado-publico` | `postear-n8n` + el workflow de Actions + los tres de n8n | El reparto (n8n orquesta y habla con Drive; Actions corre los scripts reales); la concurrencia serializada; un solo job porque el directorio de trabajo es efímero; find-or-create en Drive; la bandeja de entregables es de **revisión**, no de salida |

Sin skill y sin necesitarla: `npm run typecheck`, `npm run informe`.

---

## En `ks-contador-jf` y `ks-contador-kompu` — cumplimiento tributario

Lo portable ya está en el hub. Queda lo que depende de la estructura de carpetas, del índice y de los
datos de cada empresa.

### Pendientes de documentar (5) — Fase 2, en cada repo

| Nombre propuesto | Cubre |
|---|---|
| `ks-skill-registrar-operacion-venta` | El runbook de alta: crear las cuatro subcarpetas en Drive, subir cada PDF con el nombre estándar, crear el JSON de la operación, correr el 3-way match, actualizar el catálogo de clientes |
| `ks-skill-registrar-compra-proveedor` | El runbook de alta de una factura recibida: parsear, imputar, agregar al índice, sumar al costo de la operación, correr los tests |
| `ks-skill-informe-pyl` | La cadena completa: reporte de consola → agregado JSON → Hoja nativa → `.xlsx`. Usa `ks-skill-pyl-neto-devengado` y `ks-skill-hoja-google-formulas-vivas` |
| `ks-skill-respaldar-acuses-sii` | El flujo de correo → Drive → índice. Usa `ks-skill-parsear-acuse-sii` |
| `ks-skill-certificado-digital-sii` | Extraer del `.pfx` y cargar en n8n. El contenido está en `ks-skill-sii-firma-y-token`; acá van los pasos con las rutas del repo |

Sin skill propia y sin necesitarla, porque el patrón ya está documentado en
`ks-skill-n8n-codigo-versionado`: `cruce/test/pagina-publica.test.mjs` y
`cruce/n8n/generar-nodo.mjs --verificar`, que son la instancia concreta de "el Code node se genera
desde el módulo y hay un verificador que falla si se separan".

### Las suites de los contadores, y qué skill documenta cada una

Cierra la cobertura: no hay ninguna suite cuyo tema no esté escrito en algún lado.

| Suite | Skill que la documenta |
|---|---|
| `ventas/test/three-way-match.test.mjs` | `ks-skill-three-way-match` |
| `pyl/test/pyl.test.mjs` | `ks-skill-pyl-neto-devengado` |
| `compras/test/parser-recibo.test.mjs` | `ks-skill-parsear-recibo-proveedor` |
| `dte-emitidos/test/resultado-envio.test.mjs` | `ks-skill-parsear-acuse-sii` |
| `n8n/test/f29-nodes.test.mjs` | `ks-skill-f29-reconciliar` |
| `n8n/test/estado-dte-nodes.test.mjs` | `ks-skill-seguimiento-estado-dte` |
| `drive/estructura.test.mjs` | `ks-skill-drive-manifiesto` |
| `cruce/test/cartola.test.mjs`, `cruce/test/cruce.test.mjs` | `ks-skill-cruce-facturas-pagos` |
| `cruce/test/pagina-publica.test.mjs` | `ks-skill-n8n-codigo-versionado` |
| `compras/test/compras.test.mjs` | `ks-skill-registrar-compra-proveedor` (Fase 2) |
| `lib/verificar-hub.mjs` | el propio hub: ver "El código compartido" en el README del repo |

---

---

## Lo que salió de la exploración y no es una skill

Hallazgos que merecen decisión, no documentación:

- **`ks-contador-jf` va por detrás de `ks-contador-kompu`** en el ensamblado del libro del P&L y en el
  reporte de consola. Los módulos que sí se pudieron unificar ya están en `lib/` del hub; estos dos
  divergieron por motivos reales y unificarlos es fusionar semántica, no de-duplicar.
- **Los generadores del informe** (la Hoja y el `.xlsx`) también divergieron en las dos direcciones:
  una instancia agregó manejo de gastos ya en pesos, la otra generalizó el encabezado y el supuesto.
- **`compras/README.md` de `ks-contador-jf` enlaza un workflow que no existe** en el repo. Es el único
  workflow activo sin versionar.
- **Contradicción en `ks-contador-jf`** entre la sección de seguridad del README ("sin certificado
  digital") y el camino vigente, que sí lo tiene en el vault.
- **`ks-compra-agil` tiene dos módulos idénticos** en `src/lib/` y `licitaciones/src/lib/`. Es
  duplicación interna de un repo: se arregla con un import, no con el hub.
- **Bug vigente en `ks-compra-agil`**: un archivo de estado quedó gitignoreado, así que el radar en la
  nube nunca detecta a los compradores repetidos.
- **Riesgo abierto en `ks-contador-kompu`**: la tarjeta mezcla gastos personales y de la empresa. Hay
  que resolver qué es reembolso antes de que alimente el P&L.
