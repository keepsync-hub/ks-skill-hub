// Parser del correo de recibo de Anthropic, PBC.
//
// Es la misma logica que corre dentro del Code node "Parsear recibo y PDFs" del workflow
// de n8n `Compras Anthropic - Registro semanal`. Vive aca aparte para poder probarla sin
// levantar n8n, contra los formatos reales de correo.
//
// Dos decisiones que parecen raras y no lo son:
//
//   1. **Sin expresiones regulares.** Solo indexOf/split. El correo de Anthropic llega en
//      tres formatos distintos (directo, reenviado por Outlook, reenviado por Gmail) y con
//      saltos de linea impredecibles; el emparejamiento por marcas de texto sobrevive mejor
//      a esos cambios que un regex afinado a un formato.
//   2. **Dos vistas del mismo texto.** `plano()` quita las etiquetas HTML para leer los
//      montos; `crudo()` NO las quita, porque en un correo reenviado la cuenta del cliente
//      viaja dentro de angulares (`Para: nombre <la-cuenta>`) y el limpiador de HTML se
//      la comeria. Ese bug existio y lo caza el test.
//
// La imputacion nunca se adivina: si la cuenta Claude no esta en el mapa, la linea sale
// marcada `requiereRevision` y un humano la resuelve.

const NL = String.fromCharCode(10);
const MESES = { January:"01",February:"02",March:"03",April:"04",May:"05",June:"06",July:"07",August:"08",September:"09",October:"10",November:"11",December:"12" };
const PLANES = ["Max plan - 20x","Max plan - 5x","Claude Pro","Prepaid extra usage"];
// El mapa de cuentas Claude -> imputacion NO vive aca: es lo unico especifico de la empresa,
// asi que cada repo consumidor pasa el suyo (en KeepSync y en Kompu, `compras/cuentas.mjs`) y
// el mismo mapa se copia al Code node del workflow de n8n. Sin mapa no se adivina nada: toda
// cuenta desconocida sale marcada `requiereRevision`, que es el comportamiento correcto.
export const CUENTAS = [];

function unaLinea(t) {
  let s = t.split(NL).join(" ").split(String.fromCharCode(13)).join(" ").split(String.fromCharCode(9)).join(" ");
  while (s.indexOf("  ") >= 0) { s = s.split("  ").join(" "); }
  return s;
}
function crudo(j) {
  const partes = [j.text, j.textAsHtml, j.html, j.subject, j.Subject, j.to, j.To, j.from, j.From, j.cc, j.Cc];
  let t = "";
  for (const p of partes) { if (typeof p === "string") { t = t + " " + p; } }
  // En los recibos que Anthropic manda directo, la cuenta esta en la cabecera To, no en el cuerpo.
  if (j.headers) { try { t = t + " " + JSON.stringify(j.headers); } catch (e) { t = t + " "; } }
  return unaLinea(t);
}
function plano(j) {
  let fuera = false; let limpio = "";
  for (const c of crudo(j)) { if (c === "<") { fuera = true; } else if (c === ">") { fuera = false; } else if (!fuera) { limpio = limpio + c; } }
  return unaLinea(limpio);
}
function tras(t, marca, largo) { const i = t.indexOf(marca); if (i < 0) { return ""; } return t.slice(i + marca.length, i + marca.length + largo).trim(); }
function plata(t, marca) {
  const s = tras(t, marca, 40); const i = s.indexOf("$"); if (i < 0) { return null; }
  let n = "";
  for (let k = i + 1; k < s.length; k++) { const c = s[k];
    if (c >= "0" && c <= "9") { n = n + c; } else if (c === ".") { n = n + c; } else if (c === ",") { continue; } else { break; } }
  return n.length > 0 ? Number(n) : null;
}
function token(t, marca) { const s = tras(t, marca, 60); return s.split(" ")[0].trim(); }
function digitos(s) { let d = ""; for (const c of s) { if (c >= "0" && c <= "9") { d = d + c; } } return d; }
function tarjetaDe(t) {
  let s = tras(t, "Payment method", 60);
  const corte = s.indexOf("Receipt #");
  if (corte >= 0) { s = s.slice(0, corte); }
  return digitos(s).slice(-4);
}
function aIso(t) {
  const s = tras(t, "Paid ", 30); const partes = s.split(" ");
  if (partes.length < 3) { return null; }
  const mes = MESES[partes[0]]; const dia = digitos(partes[1]); const anio = digitos(partes[2]);
  if (!mes || dia.length === 0 || anio.length !== 4) { return null; }
  return anio + "-" + mes + "-" + (dia.length === 1 ? "0" + dia : dia);
}
// `cuentas` es el mapa de imputacion del repo consumidor. Sin el, el default vacio deja toda
// linea como `por-revisar`: es el comportamiento correcto, porque adivinar a que negocio
// imputar un costo es peor que pedir que lo mire un humano.
export function parsearRecibo(j, cuentas = CUENTAS) {
  const t = plano(j);
  const sinLimpiar = crudo(j);
  const recibo = token(t, "Receipt number");
  if (recibo.length < 10) { return null; }
  const fechaPago = aIso(t);
  let concepto = "";
  for (const p of PLANES) { if (concepto === "" && t.indexOf(p) >= 0) { concepto = p; } }
  let imp = { tipo:"por-revisar", operacion:"", cliente:"", cuenta:"" };
  for (const c of cuentas) { if (imp.cuenta === "" && sinLimpiar.indexOf(c.cuenta) >= 0) { imp = { tipo:c.tipo, operacion:c.operacion, cliente:c.cliente, cuenta:c.cuenta }; } }
  const neto = plata(t, "Total excluding tax");
  const iva = plata(t, "VAT");
  const total = plata(t, "Amount paid");
  return { recibo, invoice: token(t,"Invoice number"), fechaPago,
    periodo: fechaPago ? fechaPago.slice(0,4)+fechaPago.slice(5,7) : "",
    concepto, periodoServicio: tras(t, "Receipt #"+recibo, 60), neto, iva, total,
    tarjeta: tarjetaDe(t),
    cuentaClaude: imp.cuenta, imputacionTipo: imp.tipo, operacion: imp.operacion, cliente: imp.cliente,
    requiereRevision: imp.tipo === "por-revisar" || concepto === "" || !fechaPago || neto === null || total === null };
}
