/* ================= CALENDARIO FISCAL, DE LIBROS Y DE OPERACIONES ================= */
import { formatEur, importePendiente } from './fiscal.js';

export function obtenerEventosCalendarioEjercicio(state, anioObjetivo) {
    const anioStr = String(anioObjetivo || state.ejercicioActivo || new Date().getFullYear());
    const anioNum = parseInt(anioStr, 10) || new Date().getFullYear();
    const eventosPorFecha = {};

    const agregarEvento = (fechaIso, item) => {
        if (!fechaIso || !String(fechaIso).startsWith(anioStr)) return;
        if (!eventosPorFecha[fechaIso]) eventosPorFecha[fechaIso] = [];
        eventosPorFecha[fechaIso].push(item);
    };

    // 1. Hitos fijos de IVA (Mod. 303), IRPF (Mod. 130) y presentación/cierre de libros
    // Trimestres: 1T (abril), 2T (julio), 3T (octubre), 4T (enero del ejercicio indicado)
    const ventanasTrimestrales = [
        { mes: '01', trimLabel: '4T año ant.', desc: 'Liquidación IVA (Mod. 303) / IRPF (Mod. 130) y cierre de libros' },
        { mes: '04', trimLabel: '1T', desc: 'Liquidación IVA (Mod. 303) / IRPF (Mod. 130) y revisión de libros' },
        { mes: '07', trimLabel: '2T', desc: 'Liquidación IVA (Mod. 303) / IRPF (Mod. 130) y revisión de libros' },
        { mes: '10', trimLabel: '3T', desc: 'Liquidación IVA (Mod. 303) / IRPF (Mod. 130) y revisión de libros' }
    ];

    ventanasTrimestrales.forEach(v => {
        const fechaInicio = `${anioStr}-${v.mes}-01`;
        const fechaLimite = `${anioStr}-${v.mes}-20`;

        agregarEvento(fechaInicio, {
            categoria: 'IVA / LIBROS',
            nivel: 'info',
            titulo: `Inicio plazo ${v.trimLabel} (IVA / Libros)`,
            detalle: `Abre el periodo de cálculo de IVA, revisión de libros registro y preparación de modelos (${v.desc}).`
        });

        agregarEvento(fechaLimite, {
            categoria: 'LÍMITE IVA / LIBROS',
            nivel: 'critica',
            titulo: `Límite presentación ${v.trimLabel} (IVA / Libros)`,
            detalle: `Fecha límite habitual (día 20) para presentar IVA (Mod. 303) / IRPF (Mod. 130) y exportar libros registro.`
        });
    });

    // Hitos de cierre anual y presentación de libros / resumen anual
    agregarEvento(`${anioStr}-01-30`, {
        categoria: 'LIBROS / MOD. 390',
        nivel: 'aviso',
        titulo: 'Resumen anual IVA (Mod. 390) y archivo de libros',
        detalle: 'Plazo habitual de cierre y archivo de libros registro y resumen anual de IVA.'
    });

    agregarEvento(`${anioStr}-12-20`, {
        categoria: 'CIERRE DE LIBROS',
        nivel: 'aviso',
        titulo: `Cierre anual de libros y amortizaciones ${anioStr}`,
        detalle: 'Revisa amortizaciones de bienes de inversión, facturas pendientes y descarga los libros CSV.'
    });

    agregarEvento(`${anioStr}-12-31`, {
        categoria: 'CIERRE EJERCICIO',
        nivel: 'info',
        titulo: `Fin del ejercicio fiscal ${anioStr}`,
        detalle: 'Último día natural del año para imputar operaciones y copias de seguridad.'
    });

    // 2. Operaciones reales registradas en el ejercicio (facturas emitidas, compras/gastos y cobros/pagos)
    (state.ingresos || []).forEach(i => {
        if (!String(i.fecha || '').startsWith(anioStr)) return;
        const esRect = i.tipoDocumento === 'rectificativa';
        const pend = esRect ? 0 : importePendiente(i);
        agregarEvento(i.fecha, {
            categoria: esRect ? 'RECTIFICATIVA' : 'FRA. EMITIDA',
            nivel: pend > 0 ? 'aviso' : 'ok',
            titulo: `${i.numero} · ${i.cliente}`,
            detalle: `${formatEur(i.total)}${pend > 0 ? ` (Pendiente: ${formatEur(pend)})` : ''}`
        });

        (i.movimientosPago || []).forEach(m => {
            if (!String(m.fecha || '').startsWith(anioStr)) return;
            agregarEvento(m.fecha, {
                categoria: 'COBRO',
                nivel: 'ok',
                titulo: `Cobro ${i.numero}`,
                detalle: `${i.cliente} · +${formatEur(m.importe)}`
            });
        });
    });

    (state.gastos || []).forEach(g => {
        if (!String(g.fecha || '').startsWith(anioStr)) return;
        const pend = importePendiente(g);
        agregarEvento(g.fecha, {
            categoria: g.tipo === 'gasto' ? 'GASTO / TICKET' : 'FRA. RECIBIDA',
            nivel: pend > 0 ? 'aviso' : 'info',
            titulo: `${g.numFactura ? g.numFactura + ' · ' : ''}${g.proveedor}`,
            detalle: `${formatEur(g.total)}${pend > 0 ? ` (Pendiente: ${formatEur(pend)})` : ''}`
        });

        (g.movimientosPago || []).forEach(m => {
            if (!String(m.fecha || '').startsWith(anioStr)) return;
            agregarEvento(m.fecha, {
                categoria: 'PAGO',
                nivel: 'info',
                titulo: `Pago ${g.numFactura || g.proveedor}`,
                detalle: `${g.proveedor} · -${formatEur(m.importe)}`
            });
        });
    });

    return {
        anio: anioNum,
        anioStr,
        eventosPorFecha
    };
}
