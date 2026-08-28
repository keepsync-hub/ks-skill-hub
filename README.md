# ks-skill-hub — la librería de skills de KeepSync

Marketplace de plugins de Claude Code con **lo que sirve en cualquier repo de KeepSync**: las
reglas de negocio, los patrones de ingeniería y —cuando el código es portable— el **código
canónico** que los repos consumen en vez de copiar.

No es un catálogo de todo lo que hace KeepSync. Es la parte **reutilizable**. Lo que solo corre
dentro de su repo (el radar de Compra Ágil, el F29, el cruce contra la Hoja de un cliente) vive en
ese repo; el mapa completo está en [`docs/indice-capacidades.md`](docs/indice-capacidades.md).

## Instalar

```bash
/plugin marketplace add keepsync-hub/ks-skill-hub
/plugin install ks-comun@keepsync
/plugin install ks-sii@keepsync
```

Para dejarlo fijo en un repo, en su `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "keepsync": { "source": { "source": "github", "repo": "keepsync-hub/ks-skill-hub" } }
  },
  "enabledPlugins": { "ks-comun@keepsync": true, "ks-sii@keepsync": true }
}
```

Las skills quedan disponibles como `/ks-comun:ks-skill-cotizar-usd`,
`/ks-sii:ks-skill-three-way-match`, etc.

## Los dos plugins

El corte es por **dominio portable**, no por repo de origen: cada skill habilitada gasta contexto
con su `description`, así que quien trabaja en un contador habilita `ks-sii` y no carga lo
comercial.

### `ks-comun` — patrones de ingeniería y reglas comerciales

| Skill | Lleva código | Qué resuelve |
|---|---|---|
| `ks-skill-cotizar-usd` | ✅ | La regla de precio USD→CLP de KeepSync, con su desglose paso a paso |
| `ks-skill-keepsync-pdf` | — | El look and feel único de los PDF de cotización |
| `ks-skill-hoja-google-formulas-vivas` | ✅ | Publicar una Hoja de Google con fórmulas reales, y reescribirla sin cambiarle el id |
| `ks-skill-drive-manifiesto` | ✅ | Un manifiesto como fuente única de los IDs de Drive, con test de consistencia |
| `ks-skill-drive-inbox-done` | — | El ciclo INBOX → archivar → registrar → DONE |
| `ks-skill-n8n-codigo-versionado` | ✅ | Que el código de un Code node viva en el repo y no se separe de n8n |
| `ks-skill-indice-jsonl-append-only` | — | El índice histórico versionado y sus dos trampas |
| `ks-skill-extraer-texto-documentos` | — | Sacar texto de PDF/DOCX/XLSX, y qué hacer con los escaneados |

### `ks-sii` — contabilidad chilena

| Skill | Lleva código | Qué resuelve |
|---|---|---|
| `ks-skill-sii-firma-y-token` | — | Autenticarse contra el SII con certificado digital, sin librerías |
| `ks-skill-sii-consultar-rcv` | — | Leer el Registro de Compras y Ventas |
| `ks-skill-f29-reconciliar` | — | Armar el borrador del F29 reconciliando, no recalculando |
| `ks-skill-three-way-match` | ✅ | Validar cotización ↔ orden de compra ↔ factura |
| `ks-skill-parsear-acuse-sii` | ✅ | Leer el `RESULTADO_ENVIO` de un envío de DTE |
| `ks-skill-parsear-recibo-proveedor` | ✅ | Leer el correo de recibo de un proveedor e imputar el costo |
| `ks-skill-pyl-neto-devengado` | ✅ | El P&L sobre el neto, devengado por fecha de documento |
| `ks-skill-cruce-facturas-pagos` | ✅ | Cruzar las facturas del RCV contra los pagos del banco |

## El código compartido (`lib/`)

Los módulos de `lib/` son **Node puro sin dependencias** (más un script Python que necesita
`openpyxl`). Esa restricción no es casual: los repos contadores no tienen `package.json` y todo se
corre con `node <archivo>`.

Un repo no los importa por npm ni por submódulo —las dos vías rompen esa propiedad, y un submódulo
además deja un clone roto **en silencio**—. Los consume **vendorizados**:

```bash
node scripts/sync-hub.mjs /ruta/al/repo             # copia lib/ -> <repo>/lib/_hub/
node scripts/sync-hub.mjs /ruta/al/repo --verificar  # falla si el repo y el hub se separaron
```

El `--verificar` es la pieza que justifica todo esto. `ks-contador-kompu` nació como copia de
`ks-contador-jf` y los dos **ya se separaron** sin que nada avisara: JF quedó atrás en cinco
módulos. Con el verificador en la lista de tests, la deriva pasa de invisible a test rojo.

Lo que **no** viaja en `lib/`: RUT, razón social, correos, IDs de Drive, mapas de cuentas. Los
módulos los reciben como parámetro; cada repo los pasa desde su propio `drive/estructura.json` y su
`identidad.mjs`. El validador falla si algo de eso se cuela.

## Validar

```bash
node scripts/validar.mjs --lista        # linter propio, sin dependencias
claude plugin validate . --strict       # marketplace
claude plugin validate plugins/ks-sii --strict
```

## Cómo se contribuye

Ver [`CONTRIBUTING.md`](CONTRIBUTING.md). Lo esencial: **el hub es la fuente de verdad de lo
portable**; una skill nueva que solo corre dentro de un repo va en ese repo, no acá.
