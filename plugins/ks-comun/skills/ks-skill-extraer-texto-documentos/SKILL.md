---
name: ks-skill-extraer-texto-documentos
description: Extrae el texto de archivos PDF, DOCX y XLSX para poder buscar y citar dentro de ellos, y reporta explícitamente los que no tienen capa de texto en vez de devolverlos vacíos. Usar cuando el usuario pida leer, buscar dentro de o citar el contenido de documentos adjuntos, bases de licitación, anexos o PDFs, o cuando un documento parezca vacío.
---

# Extraer el texto de un documento

**Repo** `keepsync-hub/ks-compra-agil` · **Código** `licitaciones/src/lib/documentos-texto.ts`
(`extraerTexto`), ya importado cross-proyecto desde el barrido de contactos

PDF con `pdfjs`; DOCX y XLSX con un lector de ZIP propio —son archivos ZIP con XML adentro, y no hace
falta una librería para eso—.

## Cuándo usar

- Leer las bases de una licitación o los adjuntos de una compra para decidir si participar.
- Buscar un dato (un correo, un requisito, un plazo) dentro de documentos que no se pueden leer a mano.
- Entender por qué un documento "no dice nada".

## El límite real, y hay que publicarlo

**Muchos PDF del Estado son escaneos sin capa de texto.** No es un caso raro: en un barrido de 258
compras, 34 no traían ningún adjunto y varias de las que traían eran escaneos. El rendimiento medido
del método completo fue **97 de 258 (38%)**.

Un PDF escaneado devuelve vacío. Eso **se reporta como "escaneado, sin capa de texto"**, nunca como
"no dice nada" ni como un documento sin requisitos. La diferencia importa: lo primero es un límite
conocido del método, lo segundo es una afirmación falsa sobre el documento.

## Nada se afirma sin cita

Todo lo que se extraiga de un documento se guarda con **el archivo del que salió y la ventana de texto
que lo rodea**, y se muestra junto al dato. Los PDF están maquetados por terceros y una tabla puede
pegar dos campos distintos: sin la cita no hay forma de que alguien verifique.

Cuando un dato solo se pudo **deducir** —un nombre inferido de una dirección de correo, por ejemplo—
se publica **marcado como deducción y con confianza baja**, no como un hecho.

## Guardrails

- **Un documento vacío se reporta, no se omite.** Una lista de resultados que solo muestra los
  aciertos se lee como si fuera completa.
- **Publicar siempre cuánto no se pudo ver**: cuántos documentos se revisaron, cuántos dieron algo, y
  qué se perdió por cada motivo.
- **No inventar OCR.** Si un documento necesita OCR y no hay OCR, eso se dice; no se rellena el dato
  con lo que parece razonable.
- Extraer texto de un adjunto público **no cuesta cuota de API**: lo caro suele ser el listado que lo
  descubre, no el documento. Vale la pena mirar dónde está el costo real antes de optimizar.

## Notas

- No lleva el código dentro de este plugin porque `pdfjs` es una dependencia npm y este hub es Node
  puro. Se usa desde `ks-compra-agil`, o se replica la parte de ZIP para DOCX/XLSX, que sí es
  autocontenida.
