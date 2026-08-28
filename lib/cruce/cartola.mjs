// Normalizacion, validacion y consolidacion de las cartolas y estados de cuenta que
// llegan al INBOX de Drive.
//
// El documento del banco NO se parsea aca. Cada banco manda otro formato (la cartola
// .xlsx trae "Ultimos Movimientos"; el estado de cuenta CMR es un PDF con sus cargos
// repartidos en secciones) y un parser afinado a uno se rompe con el siguiente. La
// transcripcion la hace quien lee el documento y queda versionada en cruce/cartolas/;
// lo que hace este modulo es lo que una persona no puede verificar a ojo:
//
//   1. **Cuadrar la transcripcion contra el propio documento.** Si el estado de cuenta
//      declara un total, la suma de lo transcrito tiene que darlo. Sin esto, una linea
//      olvidada pasa desapercibida y el cruce entrega menos pagos con cara de exito.
//   2. **Deduplicar entre documentos.** La misma operacion aparece en mas de un
//      documento: la compra en cuotas de Helly Hansen del 17/06 esta en el estado de
//      cuenta de julio (como cuota) y en la cartola de agosto (completa). Contarla dos
//      veces daria por pagadas dos facturas con una sola compra.
//   3. **Netear las reversas.** Un cargo revertido no es evidencia de pago. Sin esto,
//      las dos compras de Ripley de julio ($2.699.970 y $3.599.960), revertidas cuatro
//      dias despues, seguirian dando por pagada cualquier factura de ese monto.
//
// El cruce se rehace sobre TODAS las cartolas, nunca de forma incremental: agregar una
// cartola nueva sin revisar lo ya cruzado deja emparejamientos peores (ver
// docs/cruce-facturas-pagos.md).

// Ventana en dias dentro de la cual una reversa se considera del cargo original. Las
// reversas reales del banco llegan en dias; una diferencia mayor es otra operacion.
export const VENTANA_REVERSA_DIAS = 15;

const PREFIJOS = ['COMPRA ', 'CARGO ', 'CUOTAS SIN INTERES ', 'COMPRA INTERNACIONAL '];

// Palabras que aparecen en casi toda glosa y no identifican a nadie.
const VACIAS_GLOSA = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'SPA', 'SA', 'LTDA',
  'LIMITADA', 'EIRL', 'AG', 'CIA', 'COM', 'CL', 'WEB', 'TITULAR', 'ADICIONAL']);

export function sinAcentos(texto) {
  return String(texto == null ? '' : texto).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Deja la glosa del banco comparable: mayusculas, sin acentos, sin el prefijo del tipo
// de movimiento y sin los separadores que cada banco usa (`*`, guiones, puntos).
export function normalizarGlosa(glosa) {
  let s = sinAcentos(glosa).toUpperCase();
  for (const p of PREFIJOS) { if (s.startsWith(p)) { s = s.slice(p.length); } }
  s = s.replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  return s;
}

// Como se escribe la glosa en la Hoja: mayusculas, sin acentos y sin el prefijo del tipo
// de movimiento, pero conservando la puntuacion del banco (`MP *LENOVO`). Es la forma en
// que la columna "Glosa Banco" ya esta publicada, y mantenerla evita que cada corrida
// genere decenas de cambios que solo son de mayusculas.
export function glosaParaHoja(glosa) {
  let s = sinAcentos(glosa).toUpperCase().replace(/\s+/g, ' ').trim();
  for (const p of PREFIJOS) { if (s.startsWith(p)) { s = s.slice(p.length); } }
  return s.trim();
}

export function tokensGlosa(glosa) {
  return normalizarGlosa(glosa).split(' ').filter((t) => t.length >= 4 && !VACIAS_GLOSA.has(t));
}

// Dos glosas son compatibles si una contiene a la otra o comparten un token
// significativo. Es deliberadamente laxo: solo se usa junto con fecha y monto identicos,
// donde el riesgo no es unir de mas sino dejar pasar la misma operacion escrita distinto
// ("Helly hanse" en el estado de cuenta, "CUOTAS SIN INTERES HELLY HANSE" en la cartola).
export function glosasCompatibles(a, b) {
  const na = normalizarGlosa(a);
  const nb = normalizarGlosa(b);
  if (!na || !nb) { return false; }
  if (na === nb || na.includes(nb) || nb.includes(na)) { return true; }
  const ta = new Set(tokensGlosa(a));
  return tokensGlosa(b).some((t) => ta.has(t));
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function aFecha(iso) {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

export function diasEntre(isoA, isoB) {
  return Math.round((aFecha(isoB) - aFecha(isoA)) / 86400000);
}

function error(archivo, mensaje) {
  throw new Error('cartola ' + archivo + ': ' + mensaje);
}

// Valida una cartola transcrita y devuelve sus movimientos normalizados.
//
// `control.totalDeclarado` es el numero que el propio documento imprime (en el estado de
// cuenta CMR, "Monto Total Facturado a Pagar"). Cuando el documento no declara ninguno
// —la cartola de "Ultimos Movimientos" no lo hace— hay que decirlo explicito con
// `control.sinTotalDeclarado` y un motivo: el silencio nunca vale como cuadratura.
export function validarCartola(cartola, archivo = '(sin nombre)') {
  if (!cartola || typeof cartola !== 'object') { error(archivo, 'no es un objeto JSON'); }
  const doc = cartola.documento;
  if (!doc || !doc.titulo) { error(archivo, 'falta documento.titulo'); }
  if (!doc.driveFileId) { error(archivo, 'falta documento.driveFileId (de que archivo de Drive salio)'); }
  if (!doc.periodo || !ISO.test(doc.periodo.desde || '') || !ISO.test(doc.periodo.hasta || '')) {
    error(archivo, 'documento.periodo.desde/hasta deben ser fechas YYYY-MM-DD');
  }

  const control = cartola.control || {};
  const declarado = control.totalDeclarado;
  if (declarado == null && control.sinTotalDeclarado !== true) {
    error(archivo, 'falta control.totalDeclarado. Si el documento no imprime ningun total, ' +
      'poner control.sinTotalDeclarado = true y control.motivo explicando por que');
  }
  if (control.sinTotalDeclarado === true && !control.motivo) {
    error(archivo, 'control.sinTotalDeclarado exige control.motivo');
  }

  const movimientos = Array.isArray(cartola.movimientos) ? cartola.movimientos : null;
  if (!movimientos || movimientos.length === 0) {
    error(archivo, 'movimientos debe ser un arreglo con al menos un movimiento');
  }

  const normalizados = movimientos.map((m, i) => {
    if (!ISO.test(m.fecha || '')) { error(archivo, 'movimiento ' + i + ': fecha "' + m.fecha + '" no es YYYY-MM-DD'); }
    if (!m.glosa) { error(archivo, 'movimiento ' + i + ': falta glosa'); }
    if (!Number.isInteger(m.monto) || m.monto === 0) {
      error(archivo, 'movimiento ' + i + ' (' + m.glosa + '): monto debe ser un entero distinto de 0 ' +
        '(positivo = cargo, negativo = reversa o abono)');
    }
    // En una compra en cuotas el documento factura la cuota del periodo, pero la factura
    // del proveedor es por la compra completa: `monto` es el que cruza, `montoFacturado`
    // el que cuadra contra el total del documento.
    const facturado = m.montoFacturado == null ? m.monto : m.montoFacturado;
    if (!Number.isInteger(facturado)) {
      error(archivo, 'movimiento ' + i + ' (' + m.glosa + '): montoFacturado debe ser un entero');
    }
    return {
      fecha: m.fecha,
      glosa: String(m.glosa).trim(),
      monto: m.monto,
      montoFacturado: facturado,
      documento: doc.titulo,
      archivo,
    };
  });

  if (declarado != null) {
    const suma = normalizados.reduce((t, m) => t + m.montoFacturado, 0);
    const tolerancia = control.tolerancia == null ? 0 : control.tolerancia;
    if (Math.abs(suma - declarado) > tolerancia) {
      error(archivo, 'la transcripcion no cuadra con el documento: los ' + normalizados.length +
        ' movimientos suman ' + suma + ' y el documento declara ' + declarado +
        ' (diferencia ' + (suma - declarado) + ', tolerancia ' + tolerancia + '). Faltan o sobran lineas');
    }
  }

  return normalizados;
}

// Une varias cartolas en una sola lista de evidencia de pago.
//
// Devuelve `{ evidencia, duplicados, reversas, negativosSinCargo }`. `evidencia` son los
// cargos que quedan en pie: es lo unico contra lo que se cruza. El resto no se descarta
// en silencio, se devuelve para que el informe lo muestre.
export function consolidar(cartolas, opciones = {}) {
  const ventana = opciones.ventanaReversaDias == null ? VENTANA_REVERSA_DIAS : opciones.ventanaReversaDias;

  const ordenadas = [...cartolas].sort((a, b) => {
    const d = a.periodoHasta.localeCompare(b.periodoHasta);
    return d !== 0 ? d : a.archivo.localeCompare(b.archivo);
  });

  const aceptados = [];
  const duplicados = [];
  for (const cartola of ordenadas) {
    // Un ancla ya usada no vuelve a servir: si un documento trae dos cargos identicos y
    // otro trae uno, el total sigue siendo dos, no tres.
    const anclasUsadas = new Set();
    for (const mov of cartola.movimientos) {
      const anclaIdx = aceptados.findIndex((a, i) =>
        !anclasUsadas.has(i) &&
        a.archivo !== mov.archivo &&
        a.fecha === mov.fecha &&
        a.monto === mov.monto &&
        glosasCompatibles(a.glosa, mov.glosa));
      if (anclaIdx >= 0) {
        anclasUsadas.add(anclaIdx);
        duplicados.push({ ...mov, yaEstabaEn: aceptados[anclaIdx].documento });
        continue;
      }
      aceptados.push(mov);
    }
  }

  const cronologico = [...aceptados].sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || a.glosa.localeCompare(b.glosa) || a.monto - b.monto);

  const anulados = new Set();
  const reversas = [];
  const negativosSinCargo = [];
  for (let i = 0; i < cronologico.length; i++) {
    const rev = cronologico[i];
    if (rev.monto >= 0) { continue; }
    anulados.add(i);
    const cargoIdx = cronologico.findIndex((c, j) =>
      j !== i && !anulados.has(j) &&
      c.monto === -rev.monto &&
      c.fecha <= rev.fecha &&
      diasEntre(c.fecha, rev.fecha) <= ventana &&
      glosasCompatibles(c.glosa, rev.glosa));
    if (cargoIdx >= 0) {
      anulados.add(cargoIdx);
      reversas.push({ cargo: cronologico[cargoIdx], reversa: rev });
    } else {
      // Un abono o una reversa parcial sin cargo identificable. Nunca es evidencia de
      // pago, pero se reporta: puede estar tapando un cargo mal transcrito.
      negativosSinCargo.push(rev);
    }
  }

  return {
    evidencia: cronologico.filter((_, i) => !anulados.has(i)),
    duplicados,
    reversas,
    negativosSinCargo,
  };
}
