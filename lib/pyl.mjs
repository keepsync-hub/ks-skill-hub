// Agregacion del P&L (perdidas y ganancias) de INSUMOS DE COMPUTACION JOSE ENRIQUE URREA
// ROSALES E.I.R.L. (Kompu) a partir del libro de movimientos (pyl/movimientos.json).
//
// Funcion pura, sin dependencias externas, en la misma linea que ventas/lib/three-way-match.mjs:
// sirve para el CLI (pyl/reporte.mjs), para los tests y para pegarse tal cual en un Code node
// de n8n el dia que esto se automatice.
//
// Dos reglas de fondo, y de ellas sale todo lo demas:
//
//   1. El P&L corre sobre el NETO. El IVA no es ingreso ni gasto: en una venta es debito fiscal
//      que se le cobra al cliente y se entera al SII, y en una compra es credito fiscal que se
//      recupera. Solo cuando un IVA soportado NO da credito fiscal (ivaRecuperable=false) se
//      vuelve costo de verdad y entra al resultado.
//   2. Devengado por fecha de documento. Cada movimiento pesa en el mes en que se emitio el
//      documento, no en el que se pago. Es el mismo corte que usa el RCV y el F29, asi que el
//      reporte cuadra contra el SII sin traducciones.

// Cuanto pesa un movimiento en el resultado del mes, en CLP.
// Devuelve un numero con signo: positivo suma al resultado, negativo lo resta.
export function montoResultado(mov) {
  if (mov.tipo === 'no-resultado') return 0;

  // Ojo: NO se redondea aca. En moneda extranjera los montos traen decimales (USD 23,80) y
  // redondearlos antes de convertir deformaria el costo; el redondeo a peso lo hace aCLP().
  const enMoneda = mov.tipo === 'gasto' && mov.ivaRecuperable === false
    ? numero(mov.neto) + numero(mov.iva) // el IVA sin credito fiscal es costo
    : numero(mov.neto);

  return aCLP(enMoneda, mov);
}

// Convierte un monto de la moneda del documento a CLP.
// Falla en voz alta si un documento en moneda extranjera no trae tipo de cambio: preferimos
// reventar a publicar un P&L que sumo pesos con dolares.
export function aCLP(monto, mov) {
  const moneda = mov.moneda || 'CLP';
  if (moneda === 'CLP') return redondea(monto);

  const tc = mov.tipoCambio && numero(mov.tipoCambio.valor);
  if (!tc) {
    throw new Error(
      `Movimiento ${mov.id}: esta en ${moneda} y no trae tipoCambio.valor. ` +
      'Sin tipo de cambio no se puede convertir a CLP.'
    );
  }
  return redondea(monto * tc);
}

const numero = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const redondea = (x) => Math.round(x);

// Agrupa los movimientos por periodo (YYYYMM) y arma el P&L de cada mes.
//
// Devuelve { meses: [...], total: {...} }. Cada mes trae su propio `fueraDeResultado`.
// Cada mes trae sus lineas de detalle ya clasificadas, para que el reporte no tenga que
// volver a decidir que es que.
export function agregarPorMes(movimientos) {
  const porPeriodo = new Map();

  for (const mov of movimientos) {
    const periodo = mov.periodo || (mov.fecha || '').slice(0, 7).replace('-', '');
    if (!porPeriodo.has(periodo)) {
      porPeriodo.set(periodo, {
        periodo,
        etiqueta: etiquetaPeriodo(periodo),
        ingresos: [], gastos: [], fueraDeResultado: [],
        totalIngresos: 0, totalGastos: 0, resultado: 0, margen: null,
        tieneEstimados: false,
      });
    }
    const mes = porPeriodo.get(periodo);
    const monto = montoResultado(mov);
    const linea = { ...mov, montoCLP: monto };

    if (mov.tipo === 'ingreso') {
      mes.ingresos.push(linea);
      mes.totalIngresos += monto;
    } else if (mov.tipo === 'gasto') {
      mes.gastos.push(linea);
      mes.totalGastos += monto;
    } else {
      mes.fueraDeResultado.push(linea);
    }
    if (mov.estimado) mes.tieneEstimados = true;
  }

  const meses = [...porPeriodo.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
  for (const mes of meses) {
    mes.resultado = mes.totalIngresos - mes.totalGastos;
    mes.margen = mes.totalIngresos !== 0 ? mes.resultado / mes.totalIngresos : null;
  }

  const totalIngresos = meses.reduce((a, m) => a + m.totalIngresos, 0);
  const totalGastos = meses.reduce((a, m) => a + m.totalGastos, 0);

  return {
    meses,
    total: {
      totalIngresos,
      totalGastos,
      resultado: totalIngresos - totalGastos,
      margen: totalIngresos !== 0 ? (totalIngresos - totalGastos) / totalIngresos : null,
      tieneEstimados: meses.some((m) => m.tieneEstimados),
    },
  };
}

// Avisos derivados de los propios datos, no escritos a mano: se recalculan solos cuando
// cambia el libro. Se suman a los avisos cualitativos que trae movimientos.json.
export function avisosDerivados(agregado) {
  const avisos = [];

  for (const mes of agregado.meses) {
    if (mes.totalIngresos > 0 && mes.gastos.length === 0) {
      avisos.push({
        gravedad: 'alta',
        titulo: `${mes.etiqueta}: ingresos sin ningun costo registrado`,
        detalle: `El mes tiene ${fmtCLP(mes.totalIngresos)} de ingreso neto y cero lineas de gasto. ` +
          'El resultado que se muestra es un techo, no un margen.',
      });
    }
    const sinDrive = [...mes.ingresos, ...mes.gastos].filter((l) => l.drive === null || l.drive === undefined);
    if (sinDrive.length > 0) {
      avisos.push({
        gravedad: 'media',
        titulo: `${mes.etiqueta}: ${sinDrive.length} documento(s) sin respaldo en Drive`,
        detalle: 'El PDF existe solo como adjunto de un correo. El principio del proyecto es que Gmail ' +
          `sea solo el canal de entrada: ${sinDrive.map((l) => l.id).join(', ')}.`,
      });
    }

    const estimadas = [...mes.ingresos, ...mes.gastos].filter((l) => l.estimado);
    if (estimadas.length > 0) {
      const monto = estimadas.reduce((a, l) => a + Math.abs(l.montoCLP), 0);
      avisos.push({
        gravedad: 'media',
        titulo: `${mes.etiqueta}: ${estimadas.length} linea(s) con monto estimado`,
        detalle: `${fmtCLP(monto)} del mes dependen de un supuesto (${estimadas.map((l) => l.id).join(', ')}).`,
      });
    }
  }
  return avisos;
}

export function etiquetaPeriodo(periodo) {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const anio = String(periodo).slice(0, 4);
  const mes = Number(String(periodo).slice(4, 6));
  return meses[mes - 1] ? `${meses[mes - 1]} ${anio}` : String(periodo);
}

// Formato CLP: separador de miles con punto, sin decimales, tal como se lee en el SII.
export function fmtCLP(n) {
  const v = Math.round(numero(n));
  const signo = v < 0 ? '-' : '';
  return signo + '$' + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function fmtPct(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return (x * 100).toFixed(1).replace('.', ',') + '%';
}
