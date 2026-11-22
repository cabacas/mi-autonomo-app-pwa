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

export function calculateQuarter(state, q, anio = null) {
    const anioObjetivo = anio ? String(anio) : String(state.ejercicioActivo || new Date().getFullYear());
    const esMismoAnio = (item) => String(item.fecha || '').startsWith(anioObjetivo);

    // IVA (Modelo 303): Estanco por trimestre y ejercicio
    const ingQ = state.ingresos.filter(i => esMismoAnio(i) && i.trimestre === q);
    const gasQ = state.gastos.filter(g => esMismoAnio(g) && g.trimestre === q);
    const ingBaseQ = ingQ.reduce((a, b) => a + (Number(b.base) || 0), 0);
    const ingIvaQ = ingQ.reduce((a, b) => a + (Number(b.iva) || 0), 0);
    const gasBaseIrpfQ = gasQ.reduce((a, b) => a + (Number(b.baseIrpf) || 0), 0);
    const gasIvaQ = gasQ.filter(g => g.tipo !== 'gasto').reduce((a, b) => a + (Number(b.iva) || 0), 0);
    const ivaLiquidacion = ingIvaQ - gasIvaQ;

    // IRPF (Modelo 130): Acumulativo desde 1T hasta trimestre q dentro del mismo año fiscal
    const ingAcum = state.ingresos.filter(i => esMismoAnio(i) && i.trimestre <= q);
    const gasAcum = state.gastos.filter(g => esMismoAnio(g) && g.trimestre <= q);
    const ingBaseAcum = ingAcum.reduce((a, b) => a + (Number(b.base) || 0), 0);
    const gasBaseAcum = gasAcum.reduce((a, b) => a + (Number(b.baseIrpf) || 0), 0);

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
