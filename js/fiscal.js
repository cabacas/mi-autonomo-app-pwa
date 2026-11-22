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

export function calculateQuarter(state, q) {
    const ingQ = state.ingresos.filter(i => i.trimestre === q);
    const gasQ = state.gastos.filter(g => g.trimestre === q);
    const ingBaseQ = ingQ.reduce((a, b) => a + (Number(b.base) || 0), 0);
    const ingIvaQ = ingQ.reduce((a, b) => a + (Number(b.iva) || 0), 0);
    const gasBaseIrpfQ = gasQ.reduce((a, b) => a + (Number(b.baseIrpf) || 0), 0);
    const gasIvaQ = gasQ.filter(g => g.tipo !== 'gasto').reduce((a, b) => a + (Number(b.iva) || 0), 0);
    const ivaLiquidacion = ingIvaQ - gasIvaQ;

    const ingAcum = state.ingresos.filter(i => i.trimestre <= q);
    const gasAcum = state.gastos.filter(g => g.trimestre <= q);
    const ingBaseAcum = ingAcum.reduce((a, b) => a + (Number(b.base) || 0), 0);
    const gasBaseAcum = gasAcum.reduce((a, b) => a + (Number(b.baseIrpf) || 0), 0);
    const rendNetoAcum = ingBaseAcum - gasBaseAcum;
    const cuota20Acum = rendNetoAcum > 0 ? rendNetoAcum * 0.20 : 0;

    const retencionesAcum = ingAcum.reduce((a, b) => a + (Number(b.retencion) || 0), 0);

    let pagosAnteriores = 0;
    for (let prev = 1; prev < q; prev++) {
        const prevData = calculateQuarter(state, prev);
        if (prevData.irpf130APagar > 0) pagosAnteriores += prevData.irpf130APagar;
    }

    const irpf130APagar = Math.max(0, cuota20Acum - retencionesAcum - pagosAnteriores);

    return {
        q,
        ingBase: ingBaseQ,
        ingIva: ingIvaQ,
        gasBaseIrpf: gasBaseIrpfQ,
        gasIva: gasIvaQ,
        rendNetoTrimestre: ingBaseQ - gasBaseIrpfQ,
        ivaLiquidacion,
        ingBaseAcum,
        gasBaseAcum,
        rendNetoAcum,
        cuota20Acum,
        retencionesAcum,
        pagosAnteriores,
        irpf130APagar
    };
}
