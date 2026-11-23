/* ================= MOTOR FISCAL AEAT (MOD 303, 130 ACUMULATIVO, 390 Y TESORERÍA) ================= */
export function formatEur(val) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val || 0);
}

export function fechaLocal(f) {
    if (!f) return '-';
    const [y, m, d] = f.split('-');
    return `${d}/${m}/${y}`;
}

export function totalMovimientosPago(item) {
    return (item.movimientosPago || []).reduce((s, m) => s + (Number(m.importe) || 0), 0);
}

export function importePendiente(item) {
    return Math.max(0, Math.round((Math.abs(Number(item.total) || 0) - totalMovimientosPago(item)) * 100) / 100);
}

export function calcularFlujoRegistrado(state) {
    const cobros = state.ingresos.reduce((s, i) => s + totalMovimientosPago(i), 0);
    const pagos = state.gastos.reduce((s, g) => s + totalMovimientosPago(g), 0);
    return cobros - pagos;
}

export function obtenerSaldoBancoActual(state) {
    return (Number(state.perfil.saldoInicialBanco) || 0) + calcularFlujoRegistrado(state);
}


/* ================= AMORTIZACIÓN DE BIENES DE INVERSIÓN (ESTIMACIÓN DIRECTA) ================= */
export function calcularAmortizacionTrimestralBien(gasto, q, anioObjetivo) {
    if (!gasto || !gasto.esBienInversion) return 0;
    const baseBien = Number(gasto.baseIrpf ?? gasto.baseIva ?? gasto.total ?? 0);
    if (baseBien <= 0) return 0;

    const aniosVida = Math.max(1, parseInt(gasto.vidaUtilAnios || 4, 10));
    const anioAlta = parseInt(String(gasto.fecha || '').slice(0, 4), 10);
    const trimAlta = parseInt(gasto.trimestre || 1, 10);
    const anioActualNum = parseInt(String(anioObjetivo), 10);

    if (isNaN(anioAlta) || isNaN(anioActualNum)) return 0;
    if (anioActualNum < anioAlta || anioActualNum >= anioAlta + aniosVida) return 0;

    // Si es el primer año y el trimestre actual es anterior al alta, aún no aplica amortización
    if (anioActualNum === anioAlta && q < trimAlta) return 0;

    // Amortización lineal anual repartida en 4 trimestres (25% de la cuota anual por trimestre)
    const cuotaAnual = baseBien / aniosVida;
    const cuotaTrimestral = cuotaAnual / 4;
    return Math.round(cuotaTrimestral * 100) / 100;
}

export function calcularGastoIrpfImputableTrimestre(state, q, anioObjetivo) {
    const anioStr = String(anioObjetivo);
    let total = 0;

    (state.gastos || []).forEach(g => {
        if (g.esBienInversion) {
            total += calcularAmortizacionTrimestralBien(g, q, anioStr);
        } else if (String(g.fecha || '').startsWith(anioStr) && Number(g.trimestre) === Number(q)) {
            total += (Number(g.baseIrpf) || 0);
        }
    });

    return Math.round(total * 100) / 100;
}

export function calculateQuarter(state, q, anio = null) {
    const anioObjetivo = anio ? String(anio) : String(state.ejercicioActivo || new Date().getFullYear());
    const esMismoAnio = (item) => String(item.fecha || '').startsWith(anioObjetivo);

    // IVA (Modelo 303): Estanco por trimestre y ejercicio
    const ingQ = state.ingresos.filter(i => esMismoAnio(i) && i.trimestre === q);
    const gasQ = state.gastos.filter(g => esMismoAnio(g) && g.trimestre === q);
    const ingBaseQ = ingQ.reduce((a, b) => a + (Number(b.base) || 0), 0);
    const ingIvaQ = ingQ.reduce((a, b) => a + (Number(b.iva) || 0), 0);
    const gasBaseIrpfQ = calcularGastoIrpfImputableTrimestre(state, q, anioObjetivo);
    const gasIvaQ = gasQ.filter(g => g.tipo !== 'gasto').reduce((a, b) => a + (Number(b.iva) || 0), 0);
    const ivaLiquidacion = ingIvaQ - gasIvaQ;

    // IRPF (Modelo 130): Acumulativo desde 1T hasta trimestre q dentro del mismo año fiscal
    const ingAcum = state.ingresos.filter(i => esMismoAnio(i) && i.trimestre <= q);
    const ingBaseAcum = ingAcum.reduce((a, b) => a + (Number(b.base) || 0), 0);
    let gasBaseAcum = 0;
    for (let t = 1; t <= q; t++) {
        gasBaseAcum += calcularGastoIrpfImputableTrimestre(state, t, anioObjetivo);
    }
    gasBaseAcum = Math.round(gasBaseAcum * 100) / 100;

    // Rendimiento neto previo acumulado
    const rendNetoPrevioAcum = ingBaseAcum - gasBaseAcum;
    // Deducción AEAT del 5% por provisiones y gastos de difícil justificación (Est. Directa Simplificada, tope 2.000 €/año)
    const gastosDificilJustificacion = rendNetoPrevioAcum > 0
        ? Math.min(2000, Math.round(rendNetoPrevioAcum * 0.05 * 100) / 100)
        : 0;
    const rendNetoAcum = rendNetoPrevioAcum - gastosDificilJustificacion;
    const cuota20Acum = rendNetoAcum > 0 ? rendNetoAcum * 0.20 : 0;

    // Casilla 06 Mod 130: Retenciones IRPF soportadas acumuladas
    const retencionesAcum = ingAcum.reduce((a, b) => a + (Number(b.retencion) || 0), 0);

    // Casilla 05 Mod 130: Pagos fraccionados positivos ingresados en trimestres anteriores del mismo año
    let pagosAnteriores = 0;
    for (let prev = 1; prev < q; prev++) {
        const prevData = calculateQuarter(state, prev, anioObjetivo);
        if (prevData.irpf130APagar > 0) pagosAnteriores += prevData.irpf130APagar;
    }

    const irpf130APagar = Math.max(0, cuota20Acum - retencionesAcum - pagosAnteriores);

    return {
        q,
        anio: anioObjetivo,
        ingBase: ingBaseQ,
        ingIva: ingIvaQ,
        gasBaseIrpf: gasBaseIrpfQ,
        gasIva: gasIvaQ,
        rendNetoTrimestre: ingBaseQ - gasBaseIrpfQ,
        ivaLiquidacion,
        ingBaseAcum,
        gasBaseAcum,
        rendNetoPrevioAcum,
        gastosDificilJustificacion,
        rendNetoAcum,
        cuota20Acum,
        retencionesAcum,
        pagosAnteriores,
        irpf130APagar
    };
}

/* ================= VALIDADOR OFICIAL DE NIF / NIE / CIF ESPAÑOL (AEAT) ================= */
export function validarDocumentoFiscalES(docRaw) {
    const doc = String(docRaw || '').trim().toUpperCase().replace(/[\s\-]/g, '');
    if (!doc) return { valido: false, tipo: 'VACÍO', mensaje: 'El NIF/CIF es obligatorio.' };

    // 1. DNI / NIF (8 dígitos + letra) y NIE (X/Y/Z + 7 dígitos + letra)
    const nifRegex = /^[XYZ\d]\d{7}[A-Z]$/;
    if (nifRegex.test(doc)) {
        const letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
        let numeroStr = doc.slice(0, 8)
            .replace(/^X/, '0')
            .replace(/^Y/, '1')
            .replace(/^Z/, '2');
        const numero = parseInt(numeroStr, 10);
        const letraEsperada = letras[numero % 23];
        const letraActual = doc.charAt(8);
        const tipo = /^[XYZ]/.test(doc) ? 'NIE' : 'DNI/NIF';
        if (letraActual === letraEsperada) {
            return { valido: true, tipo, mensaje: `${tipo} válido.` };
        }
        return {
            valido: false,
            tipo,
            mensaje: `${tipo} incorrecto: para ese número corresponde la letra "${letraEsperada}" (has puesto "${letraActual}").`
        };
    }

    // 2. CIF Personas Jurídicas (Letra A-H, J, N, P-S, U-W + 7 dígitos + dígito/letra control)
    const cifRegex = /^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-J])$/;
    const matchCif = doc.match(cifRegex);
    if (matchCif) {
        const letraOrg = matchCif[1];
        const digitos = matchCif[2];
        const controlActual = matchCif[3];

        let sumaPares = 0;
        let sumaImpares = 0;
        for (let i = 0; i < 7; i++) {
            const n = parseInt(digitos.charAt(i), 10);
            if ((i + 1) % 2 === 0) {
                sumaPares += n;
            } else {
                const doble = n * 2;
                sumaImpares += Math.floor(doble / 10) + (doble % 10);
            }
        }
        const sumaTotal = sumaPares + sumaImpares;
        const unidad = sumaTotal % 10;
        const digitoControl = unidad === 0 ? 0 : 10 - unidad;
        const letraControl = 'JABCDEFGHI'[digitoControl];

        // Organizaciones que llevan obligatoriamente letra vs número vs ambos
        const soloLetra = 'KPQRSNW'.includes(letraOrg);
        const soloNumero = 'ABEH'.includes(letraOrg);

        let esValido = false;
        let esperadoTxt = '';
        if (soloLetra) {
            esValido = controlActual === letraControl;
            esperadoTxt = `letra "${letraControl}"`;
        } else if (soloNumero) {
            esValido = controlActual === String(digitoControl);
            esperadoTxt = `dígito "${digitoControl}"`;
        } else {
            esValido = (controlActual === String(digitoControl) || controlActual === letraControl);
            esperadoTxt = `"${digitoControl}" o "${letraControl}"`;
        }

        if (esValido) {
            return { valido: true, tipo: 'CIF', mensaje: 'CIF de entidad válido.' };
        }
        return {
            valido: false,
            tipo: 'CIF',
            mensaje: `CIF incorrecto: el carácter de control debería ser ${esperadoTxt} (has puesto "${controlActual}").`
        };
    }

    return {
        valido: false,
        tipo: 'DESCONOCIDO',
        mensaje: 'Formato no reconocido. Debe ser DNI (8 números + letra), NIE (X/Y/Z + 7 números + letra) o CIF (Letra + 7 números + control).'
    };
}


/* ================= LIBRO DE BIENES DE INVERSIÓN Y CUENTA DE PÉRDIDAS Y GANANCIAS ================= */
export function calcularDetalleAmortizacionBien(gasto, anioObjetivo) {
    const anioNum = parseInt(String(anioObjetivo || new Date().getFullYear()), 10);
    const baseAdq = Math.round((Number(gasto.baseIrpf ?? gasto.baseIva ?? gasto.total ?? 0)) * 100) / 100;
    const vidaUtil = Math.max(1, parseInt(gasto.vidaUtilAnios || 4, 10));
    const cuotaAnualTeorica = Math.round((baseAdq / vidaUtil) * 100) / 100;

    const anioAlta = parseInt(String(gasto.fecha || '').slice(0, 4), 10);
    const trimAlta = Math.max(1, Math.min(4, parseInt(gasto.trimestre || 1, 10)));

    let cuotaEjercicio = 0;
    let amortizadoAcumuladoAnterior = 0;

    if (!isNaN(anioAlta) && !isNaN(anioNum)) {
        // Calcular cuota imputable en cada año desde el alta hasta anioNum
        for (let y = anioAlta; y <= anioNum; y++) {
            if (y >= anioAlta + vidaUtil) break;
            let trimestresActivosEnY = 4;
            if (y === anioAlta) {
                trimestresActivosEnY = 5 - trimAlta; // ej. alta en 2T -> 2T, 3T, 4T = 3 trimestres
            }
            const cuotaAnioY = Math.round(((cuotaAnualTeorica / 4) * trimestresActivosEnY) * 100) / 100;
            if (y < anioNum) {
                amortizadoAcumuladoAnterior += cuotaAnioY;
            } else if (y === anioNum) {
                cuotaEjercicio = cuotaAnioY;
            }
        }
    }

    amortizadoAcumuladoAnterior = Math.min(baseAdq, Math.round(amortizadoAcumuladoAnterior * 100) / 100);
    cuotaEjercicio = Math.min(Math.max(0, baseAdq - amortizadoAcumuladoAnterior), Math.round(cuotaEjercicio * 100) / 100);
    const amortizadoTotal = Math.round((amortizadoAcumuladoAnterior + cuotaEjercicio) * 100) / 100;
    const valorNetoPendiente = Math.max(0, Math.round((baseAdq - amortizadoTotal) * 100) / 100);

    return {
        id: gasto.id,
        fechaAlta: gasto.fecha,
        trimAlta,
        concepto: gasto.proveedor || 'Bien de inversión',
        categoria: gasto.cat || 'INMOVILIZADO',
        vidaUtil,
        baseAdq,
        cuotaAnualTeorica,
        amortizadoAnterior: amortizadoAcumuladoAnterior,
        cuotaEjercicio,
        amortizadoTotal,
        valorNetoPendiente
    };
}

export function generarCuentaPyG(state, anioObjetivo) {
    const anioStr = String(anioObjetivo || state.ejercicioActivo || new Date().getFullYear());
    const ingresos = (state.ingresos || []).filter(i => String(i.fecha || '').startsWith(anioStr));
    const gastos = (state.gastos || []).filter(g => String(g.fecha || '').startsWith(anioStr));

    const ingresosExplotacion = ingresos.reduce((s, i) => s + (Number(i.base) || 0), 0);

    // Agrupar gastos corrientes (no bienes de inversión) por categoría y sumar amortizaciones de bienes de inversión
    const porCategoria = {};
    let totalAmortizaciones = 0;

    (state.gastos || []).forEach(g => {
        if (g.esBienInversion) {
            const det = calcularDetalleAmortizacionBien(g, anioStr);
            if (det.cuotaEjercicio > 0) {
                totalAmortizaciones += det.cuotaEjercicio;
                const catKey = 'AMORTIZACIONES INMOVILIZADO';
                porCategoria[catKey] = (porCategoria[catKey] || 0) + det.cuotaEjercicio;
            }
        } else if (String(g.fecha || '').startsWith(anioStr)) {
            const catKey = g.cat || 'OTROS GASTOS';
            porCategoria[catKey] = (porCategoria[catKey] || 0) + (Number(g.baseIrpf) || 0);
        }
    });

    const gastosCorrientes = Object.entries(porCategoria)
        .filter(([k]) => k !== 'AMORTIZACIONES INMOVILIZADO')
        .reduce((s, [, v]) => s + v, 0);

    const totalGastosExplotacion = Math.round((gastosCorrientes + totalAmortizaciones) * 100) / 100;
    const resultadoAntesImpuestos = Math.round((ingresosExplotacion - totalGastosExplotacion) * 100) / 100;
    const reduccion5DificilJust = resultadoAntesImpuestos > 0
        ? Math.min(2000, Math.round(resultadoAntesImpuestos * 0.05 * 100) / 100)
        : 0;
    const rendimientoNetoSimplificado = Math.round((resultadoAntesImpuestos - reduccion5DificilJust) * 100) / 100;

    return {
        anio: anioStr,
        ingresosExplotacion,
        porCategoria,
        gastosCorrientes,
        totalAmortizaciones,
        totalGastosExplotacion,
        resultadoAntesImpuestos,
        reduccion5DificilJust,
        rendimientoNetoSimplificado
    };
}
