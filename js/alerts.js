/* ================= MOTOR DE ALERTAS FISCALES, OPERATIVAS Y DE FACTURACIÓN ================= */
import { formatEur, importePendiente, calculateQuarter } from './fiscal.js';

export function evaluarAlertasAutonomo(state, fechaReferencia = null) {
    const alertas = [];
    const hoyStr = fechaReferencia || new Date().toISOString().slice(0, 10);
    const hoy = new Date(hoyStr + 'T12:00:00');
    const anioAct = String(state.ejercicioActivo || hoy.getFullYear());
    const mes = hoy.getMonth() + 1; // 1..12
    const dia = hoy.getDate();

    const trimActual = Math.ceil(mes / 3);
    const qData = calculateQuarter(state, trimActual, anioAct);

    // 1. ALERTAS DE PLAZOS FISCALES AEAT (MODELOS 303 / 130) Y PRESENTACIÓN DE LIBROS
    // Ventanas habituales de presentación trimestral (abril, julio, octubre y enero del año siguiente)
    const esMesLiquidacion = [1, 4, 7, 10].includes(mes);
    if (esMesLiquidacion && dia <= 22) {
        const diasRestantes = Math.max(0, 20 - dia);
        alertas.push({
            id: `plazo-aeat-${anioAct}-${mes}`,
            categoria: 'PLAZO AEAT',
            nivel: diasRestantes <= 5 ? 'critica' : 'aviso',
            titulo: `Plazo trimestral Modelos 303 / 130 abierto`,
            detalle: diasRestantes > 0
                ? `Quedan ${diasRestantes} día(s) hasta el día 20 para revisar cierres, exportar libros CSV y presentar los modelos.`
                : `Hoy es día límite habitual (día 20) para la presentación trimestral y descarga de libros registro.`
        });
    } else if (mes === 12 && dia >= 15) {
        alertas.push({
            id: `cierre-anual-libros-${anioAct}`,
            categoria: 'LIBROS Y CIERRE',
            nivel: 'aviso',
            titulo: `Cierre de ejercicio ${anioAct} y exportación de libros`,
            detalle: `Revisa facturas pendientes, amortizaciones de bienes de inversión y exporta los libros CSV de Ventas, Compras y Bienes antes del cierre.`
        });
    }

    // 2. ALERTAS DE IVA (MOD. 303 A INGRESAR)
    if (qData.ivaLiquidacion > 0) {
        alertas.push({
            id: `iva-a-pagar-${anioAct}-${trimActual}T`,
            categoria: 'IVA · MOD. 303',
            nivel: qData.ivaLiquidacion >= 1500 ? 'critica' : 'aviso',
            titulo: `Reserva pendiente de IVA en ${trimActual}T (${formatEur(qData.ivaLiquidacion)})`,
            detalle: `Tu IVA repercutido supera al soportado deducible en ${formatEur(qData.ivaLiquidacion)}. Mantén ese importe reservado en liquidez para el Modelo 303.`
        });
    }

    // 3. ALERTAS DE RITMO DE FACTURACIÓN ("Vas mal, has de facturar más...")
    const ingAnio = (state.ingresos || []).filter(i => String(i.fecha || '').startsWith(anioAct) && i.tipoDocumento !== 'rectificativa');
    const facturadoAnio = ingAnio.reduce((s, i) => s + (Number(i.base) || 0), 0);
    const objetivoMensual = Number(state.perfil?.objetivoFacturacionMensual) || 2500;
    const mesesTranscurridos = Math.max(1, mes);
    const facturacionEsperadaAcumulada = objetivoMensual * mesesTranscurridos;
    const desvioPct = facturacionEsperadaAcumulada > 0
        ? ((facturadoAnio - facturacionEsperadaAcumulada) / facturacionEsperadaAcumulada) * 100
        : 0;

    if (facturadoAnio === 0 || desvioPct <= -20) {
        const deficit = Math.max(0, facturacionEsperadaAcumulada - facturadoAnio);
        alertas.push({
            id: `ritmo-facturacion-${anioAct}-${mes}`,
            categoria: 'RITMO DE VENTAS',
            nivel: 'critica',
            titulo: `Vas mal, has de facturar más (${formatEur(deficit)} por debajo del ritmo)`,
            detalle: `Llevas facturados ${formatEur(facturadoAnio)} frente a un ritmo esperado de ${formatEur(facturacionEsperadaAcumulada)} (${objetivoMensual.toLocaleString('es-ES')} €/mes). Toca activar presupuestos o cerrar ventas.`
        });
    } else if (desvioPct < 0) {
        const deficit = Math.max(0, facturacionEsperadaAcumulada - facturadoAnio);
        alertas.push({
            id: `ritmo-facturacion-leve-${anioAct}-${mes}`,
            categoria: 'RITMO DE VENTAS',
            nivel: 'aviso',
            titulo: `Ligeramente por debajo del objetivo de facturación (-${formatEur(deficit)})`,
            detalle: `Acumulas ${formatEur(facturadoAnio)} frente a los ${formatEur(facturacionEsperadaAcumulada)} previstos a estas alturas del año.`
        });
    } else {
        alertas.push({
            id: `ritmo-facturacion-ok-${anioAct}-${mes}`,
            categoria: 'RITMO DE VENTAS',
            nivel: 'ok',
            titulo: `Ritmo de facturación en objetivo (+${desvioPct.toFixed(0)}%)`,
            detalle: `Acumulas ${formatEur(facturadoAnio)} de base frente a una referencia de ${formatEur(facturacionEsperadaAcumulada)}.`
        });
    }

    // 4. ALERTAS DE COBROS Y PAGOS PENDIENTES
    const cobrosPendientes = (state.ingresos || []).filter(i => i.tipoDocumento !== 'rectificativa' && importePendiente(i) > 0);
    if (cobrosPendientes.length > 0) {
        const totalCobros = cobrosPendientes.reduce((s, i) => s + importePendiente(i), 0);
        alertas.push({
            id: `cobros-pendientes-${anioAct}`,
            categoria: 'TESORERÍA · COBROS',
            nivel: 'aviso',
            titulo: `${cobrosPendientes.length} factura(s) pendiente(s) de cobro (${formatEur(totalCobros)})`,
            detalle: `Revisa los cobros pendientes para evitar tensiones de caja antes de impuestos o cuotas.`
        });
    }

    const pagosPendientes = (state.gastos || []).filter(g => importePendiente(g) > 0);
    if (pagosPendientes.length > 0) {
        const totalPagos = pagosPendientes.reduce((s, g) => s + importePendiente(g), 0);
        alertas.push({
            id: `pagos-pendientes-${anioAct}`,
            categoria: 'TESORERÍA · PAGOS',
            nivel: 'aviso',
            titulo: `${pagosPendientes.length} compra(s)/gasto(s) pendiente(s) de pago (${formatEur(totalPagos)})`,
            detalle: `Tienes facturas o gastos marcados como pendientes de pago en tesorería.`
        });
    }

    // 5. ALERTA DE COPIA DE SEGURIDAD
    if (!state.ultimoBackupFecha) {
        alertas.push({
            id: 'backup-sin-registro',
            categoria: 'SEGURIDAD LOCAL',
            nivel: 'aviso',
            titulo: 'Sin copia de seguridad .json exportada',
            detalle: `Como los datos residen en el navegador (localStorage e IndexedDB), conviene exportar una copia .json periódicamente.`
        });
    }

    return alertas;
}

export function construirEnlaceCorreoAlertas(perfil, alertas, anioAct) {
    const destino = encodeURIComponent(perfil?.email || '');
    const asunto = encodeURIComponent(`Alertas Mi Autónomo (${anioAct}) · ${alertas.length} aviso(s)`);
    const lineas = [
        `Resumen de alertas · Ejercicio ${anioAct}`,
        `Titular: ${perfil?.nombre || 'Autónomo'} (${perfil?.nif || 'sin NIF'})`,
        '----------------------------------------',
        ...alertas.map(a => `[${a.categoria}] ${a.titulo}
${a.detalle}
`)
    ];
    const cuerpo = encodeURIComponent(lineas.join('
'));
    return `mailto:${destino}?subject=${asunto}&body=${cuerpo}`;
}
