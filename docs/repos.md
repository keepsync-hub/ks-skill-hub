# Los repos de KeepSync

Cuatro repos bajo `keepsync-hub`. Este documento existe para que una skill del hub pueda decir
"esto vive en `ks-compra-agil`" y quien la lea sepa qué es eso.

## `ks-compra-agil` — venta al Estado

TypeScript (ESM, `tsx`, sin build), un solo `package.json` en la raíz con 33 scripts, más un
sub-proyecto `licitaciones/` que no tiene el suyo. Publica sus resultados como páginas estáticas en
`docs/` (GitHub Pages) y tiene un panel operativo servido por n8n.

Cubre cinco frentes: Compras Ágiles de los nichos de KeepSync (licencias Claude, asesoría en IA,
cursos), Compras Ágiles y Licitaciones de los servicios de Array, el estudio de mercado del universo
completo, el barrido de leads y el nicho de Transformación Digital / Ley 21.180.

Guardrails que no se relajan: **nunca se envía una oferta automáticamente** (el envío final lo
confirma una persona), **nunca se cotiza sobre el tope presupuestario** (es causal de
inadmisibilidad), no se inventan precios, y ante un CAPTCHA se detiene en vez de reintentar a
ciegas.

Documentación: `CLAUDE.md` (el archivo maestro), `PLAN.md`, `PLAN-VOLUMEN.md`, `README.md`,
`licitaciones/PLAN.md`.

## `ks-contador-jf` y `ks-contador-kompu` — cumplimiento tributario

Dos instancias del mismo agente contable ante el SII de Chile, una por empresa. **Kompu es una copia
de JF**: su primer commit se llama literalmente *"Copia base desde ks-contador-jf"*.

Node ESM puro **sin `package.json`, sin `node_modules` y sin CI** — todo se corre con
`node <archivo>`; la única dependencia de paquete es `openpyxl`, para el informe en Excel. Es una
propiedad deliberada del diseño, y es la razón por la que el hub se consume vendorizado y no por npm.

Mismos siete módulos en los dos: `n8n/` (F29 mensual y seguimiento de estado de DTE),
`ventas/` (ciclo comercial y 3-way match), `dte-emitidos/` (acuses del SII), `compras/` (facturas
recibidas), `pyl/` (P&L histórico), `drive/` (manifiesto de carpetas) y `docs/`. Kompu tiene además
`cruce/` (facturas del RCV contra pagos del banco), que JF no tiene.

Decisiones que no hay que volver a litigar, y están escritas en el `docs/` de los dos: el SII **no
tiene API** para RCV ni F29; las alternativas comerciales son scrapers de pago que exigen entregar
la clave tributaria; el F29 **no se puede enviar por API** y el envío final es siempre manual porque
es una declaración jurada; y el camino elegido usa un **endpoint interno no documentado** del SII,
con fallo ruidoso y un camino de respaldo por CSV.

**Deriva conocida** (la razón de ser del `--verificar` del hub): JF quedó atrás de Kompu en el
parser de recibos parametrizado, en la robustez de `pyl/reporte.mjs`, en el patrón `generar-nodo.mjs`
y en el workflow que reescribe una Hoja sin cambiarle el id.

Documentación por repo: `README.md`, la carta de responsabilidades del agente en `docs/`,
`docs/nodos-firma-sii.md` (la receta técnica), `docs/pendientes.md` (el documento de retoma, con
todos los identificadores).

## `ks-skill-hub` — este repo

La librería. No ejecuta nada de negocio: aloja las skills portables y el código canónico que los
otros tres consumen.
