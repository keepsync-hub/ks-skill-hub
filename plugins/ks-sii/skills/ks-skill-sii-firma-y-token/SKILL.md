---
name: ks-skill-sii-firma-y-token
description: Autentica contra el Servicio de Impuestos Internos de Chile con certificado digital desde n8n, sin librerías externas — semilla, firma XML-DSig armada a mano, y canje del token por SOAP. Incluye las trampas que cuesta descubrir y los comandos openssl para sacar la llave del .pfx. Usar cuando el usuario pida conectarse al SII, obtener o renovar un token, montar el contador de una empresa nueva, o cuando una consulta al SII falle con ESTADO 05, con -3 o con un 401.
---

# Autenticación contra el SII con certificado digital

**Repo** `keepsync-hub/ks-contador-jf`, `keepsync-hub/ks-contador-kompu` · **Entrypoint** los 9 nodos
de `n8n/workflows/f29-sii-directo.json` · **Docs** `docs/nodos-firma-sii.md` de cualquiera de los dos

Es el prerrequisito de todo lo que toca al SII: el F29, el RCV y el seguimiento de estado de DTE
empiezan los tres por acá. Está probado en producción contra `palena.sii.cl` y la firma validó al
primer intento.

Lo notable es que **no hace falta ninguna librería ni infraestructura externa**: ni `xml-crypto`, ni
`node-forge`, ni un microservicio. Solo nodos nativos de n8n, con la llave privada guardada
únicamente en el vault de credenciales.

## Cuándo usar

- Montar el contador de una empresa nueva y llegar al primer token.
- Renovar el certificado digital (ver más abajo: son **tres** cosas, no una).
- Diagnosticar por qué el SII rechaza una consulta.

## Requisitos

- El `.pfx` del certificado digital cargado como credencial **Crypto** en n8n. La llave privada la
  toca un solo nodo y no sale de ahí.
- El titular del certificado (una persona natural) registrado como **Representante Electrónico** de
  la empresa en sii.cl. Si no lo está, la autenticación puede funcionar igual y aun así el RCV
  responde *"NO ESTÁ AUTORIZADO PARA REPRESENTAR"*.
- El RUT de la **empresa**, partido en cuerpo y dígito verificador. No se deduce del `.pfx`: ese
  identifica a la persona.

## La cadena de nodos

`CrSeed` → `Extraer semilla` → `Digest SHA1` → `Armar SignedInfo` → `Firmar SignedInfo` (nodo Crypto
nativo) → `Armar SOAP getToken` → `GetTokenFromSeed` → `Leer Token`.

Host: `palena.sii.cl` en producción, `maullin.sii.cl` en certificación. **Al cambiar de ambiente hay
que tocar el host en dos lugares**, no solo en la URL de los nodos HTTP: también en el
`xmlns:m="https://<host>/DTEWS/GetTokenFromSeed.jws"` del nodo que arma el SOAP. Es el olvido clásico.

## Los tres strings donde se gana o se pierde

La firma XML-DSig falla por detalles de bytes, no de lógica.

1. **Documento canónico a digerir**: sin declaración XML y **sin un solo espacio entre etiquetas**.
2. **`SignedInfo` a firmar**: con el `xmlns` heredado **explícito** y los elementos vacíos expandidos
   a par apertura/cierre (`<X></X>`, nunca `<X/>`). Las dos cosas las exige la canonicalización C14N
   inclusiva, y omitir cualquiera de las dos produce `ESTADO 05 — firma inválida`. Era el riesgo
   técnico principal de todo el diseño y quedó cerrado.
3. **Documento final**: acá el `SignedInfo` va **sin** `xmlns` — lo hereda de `<Signature>`. El SII lo
   canonicaliza al verificar y reconstruye el string 2. Todo en una sola línea: **cualquier salto de
   línea entre `</item>` y `<Signature>` rompe el digest**.

## Cómo leer el resultado

| Respuesta | Qué significa |
|---|---|
| `ESTADO 00, "Token Creado"` | Listo. |
| `ESTADO 05` | Firma inválida: revisar los strings 2 y 3, en ese orden. |
| `-3` | El RUT no está habilitado en ese ambiente. Pasa típicamente en certificación. |
| `401` de JBoss, *"This request requires HTTP authentication"* | No es un `codRespuesta` del SII: es del servlet. En el RCV a nivel detalle significa que el token es de **certificación** y ese endpoint exige uno de **producción**. |

## Renovar el certificado: son tres cosas, no una

La que se olvida es la segunda, y el workflow falla en silencio el mes que caduca:

1. La llave privada, a la credencial Crypto de n8n.
2. Las constantes `CERT` y `MODULO` (el certificado en base64 y el módulo RSA) **en cada workflow que
   firma**, no solo en uno.
3. `CERTIFICADO_VENCE` en el nodo `Configuracion`, que alimenta el aviso de expiración.

`CERT` y `MODULO` son datos públicos —viajan en cada firma— pero traen nombre, RUT y correo del
titular, así que **no se versionan**: van como constantes dentro del Code node, con placeholder en el
JSON del repo.

Los valores salen del `.pfx` con `openssl`; los comandos exactos están en `docs/nodos-firma-sii.md`
del repo consumidor. El exponente RSA habitual es 65537, que en base64 es `AQAB`.

## Guardrails

- **La clave tributaria del SII no se maneja nunca.** Ni acá ni en ningún otro flujo. Todo pasa por el
  certificado digital.
- **La llave privada vive solo en el vault de n8n.** Nunca en el repo, ni en una Data Table, ni en el
  JSON de un workflow.
- **Autenticarse y leer son de solo lectura.** Esta cadena no declara ni modifica nada en el SII.
- Se descartaron LibreDTE, SimpleAPI, Factronica, BaseAPI, ApiPyme y Odoo: son scrapers de pago que
  exigen entregar la clave tributaria o la llave privada. La decisión está tomada y documentada en
  `docs/plan-f29-sii.md`; no volver a litigarla sin un motivo nuevo.

## Notas

- Verificado contra producción el 2026-08-18 (firma) y el 2026-08-19 (RCV). La firma validó al primer
  intento; no hubo `ESTADO 05`.
- **No hay reCAPTCHA y no hace falta ninguna sesión web.** El `JSESSIONID` que se temía necesario
  nunca apareció; el token solo alcanza.
