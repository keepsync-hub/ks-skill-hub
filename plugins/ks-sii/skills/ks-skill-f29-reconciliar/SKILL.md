---
name: ks-skill-f29-reconciliar
description: Arma el borrador mensual del F29 (declaración de IVA en Chile) reconciliando las cifras que entrega el propio SII en vez de recalcularlas, estima solo el PPM y lo marca como estimación, y se detiene en una aprobación humana por correo. Cubre también el ciclo mensual de la persona — contrastar contra la Propuesta parcial, declarar en sii.cl y archivar el comprobante. Usar cuando el usuario pida armar, revisar o aprobar el F29 de un período, o pregunte por la tasa de PPM.
---

# El F29 mensual: reconciliar, no recalcular

**Repo** `keepsync-hub/ks-contador-jf`, `keepsync-hub/ks-contador-kompu` · **Entrypoint**
`n8n/workflows/f29-sii-directo.json` (camino principal) o `f29-mensual.json` (respaldo por CSV) ·
**Docs** `docs/plan-f29-sii.md` y el runbook mensual del `README.md`

El workflow **no calcula el F29: lo reconcilia.** Las cifras salen del propio SII vía
`ks-skill-sii-consultar-rcv`; lo único que estima es el PPM, y va marcado como estimación. Esa
distinción es la que hace que el borrador sea revisable en dos minutos en vez de auditable en dos
horas.

## Cuándo usar

- El ciclo mensual: revisar el borrador, aprobarlo o rechazarlo, declarar y archivar.
- Entender por qué una cifra del borrador no coincide con la Propuesta parcial del SII.
- Montar el F29 de una empresa nueva (ver también `ks-skill-nueva-instancia-contador`).

## Los dos caminos

| | Camino A — CSV desde Drive (respaldo) | Camino B — conexión directa (principal) |
|---|---|---|
| Credenciales del SII | Ninguna | El certificado, en el vault de n8n |
| Estabilidad | Función estable del portal | Endpoint interno no documentado |
| Trabajo humano | ~2 min/mes bajando dos CSV | Ninguno |

El B es el que corre. El A existe porque el endpoint del B puede desaparecer sin aviso, y entonces
hay que poder declarar igual.

## El flujo, y dónde se detiene

```
Trigger mensual → Configuracion → semilla → firma → Token
  → resumen RCV compras + ventas → remanente del período anterior
  → Reconciliar F29 → Data Table
  → aprobación humana por correo   ← SE PAUSA ACÁ
  → comprobante a Drive → declarar en sii.cl   ← MANUAL, SIEMPRE
```

## El PPM es lo único estimado, y es lo que más se equivoca

No se hereda de otra empresa ni de la tabla. En régimen Pro Pyme la tasa fija (0,25% / 0,5%) solo
aplica los primeros tres años; después el SII recalcula una tasa variable. **En una de las dos
instancias la tasa real resultó 1%: cuatro veces la de la tabla.**

Por eso se deja en `null` a propósito hasta confirmarla contra la **Propuesta parcial** del portal, y
por eso conviene desconfiar de un valor heredado: *un valor heredado que parece razonable es más
peligroso que uno vacío, porque no llama la atención*.

## El ciclo humano del mes

1. Llega el correo con el borrador. Contrastar el PPM contra la Propuesta parcial de sii.cl.
2. Aprobar o rechazar **desde el correo**. Rechazar es una respuesta válida, no una falla.
3. Declarar en sii.cl **a mano**.
4. Archivar el comprobante en su carpeta de Drive.
5. Verificar el mes siguiente que el remanente se arrastró bien.

## Guardrails

- **El envío es siempre manual.** El F29 no se puede enviar por API (solo carga de `.txt` con
  certificación previa del software) y, sobre todo, **es una declaración jurada**: la firma un humano.
- **El workflow nunca declara ni paga.** Deja un borrador y se detiene.
- **Ninguna cifra se inventa.** Lo que no viene del SII se marca como estimación en el propio correo.
- **En compras, estado `REGISTRO`.** Ver `ks-skill-sii-consultar-rcv`: los otros estados no dan
  crédito fiscal.
- **Ojo con el día del trigger.** Corre temprano en el mes, pero el RCV sigue recibiendo documentos
  después: el borrador puede no reflejar lo que finalmente se declara. Los plazos reales son día 20 o
  día 28 según la modalidad.

## Límites conocidos, declarados

Las retenciones quedan en cero (no salen del RCV), el parser asume CLP entero, y el seguimiento cubre
solo el tipo de documento configurado. Están escritos en el README del repo, no descubiertos acá.

## Notas

- La reconciliación se validó contra un F29 ya declarado: los tests del repo cuadran contra ese folio
  real, así que una regresión en el motor de agregación se nota.
- La Data Table del borrador guarda el remanente, que es de donde lo toma el mes siguiente. Si se
  corrige una cifra a mano en el portal, **hay que corregirla también ahí** o el arrastre queda mal.
