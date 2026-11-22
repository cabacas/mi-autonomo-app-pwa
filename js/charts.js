/* ================= GESTIÓN DE GRÁFICAS (CHART.JS) ================= */
import { calculateQuarter, formatEur } from './fiscal.js';

let chartTrimestres = null;
let chartAnalisisEconomico = null;
let chartEcoCategorias = null;
let chartRentabilidadClientes = null;

export function initOrUpdateDashboardChart(state) {
    const canvas = document.getElementById('chartTrimestres');
    if (!canvas || typeof Chart === 'undefined') return;

    const dataIng = [1, 2, 3, 4].map(q => calculateQuarter(state, q).ingBase);
    const dataGas = [1, 2, 3, 4].map(q => calculateQuarter(state, q).gasBaseIrpf);

    if (chartTrimestres) {
        chartTrimestres.data.datasets[0].data = dataIng;
        chartTrimestres.data.datasets[1].data = dataGas;
        chartTrimestres.update();
        return;
    }

    chartTrimestres = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['1T', '2T', '3T', '4T'],
            datasets: [
                { label: 'Ingresos (€)', data: dataIng, backgroundColor: '#10b981', borderRadius: 6 },
                { label: 'Compras + Gastos (€)', data: dataGas, backgroundColor: '#f43f5e', borderRadius: 6 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

export function renderAnalisisEconomicoCharts(state) {
    const selA = document.getElementById('eco-anio-a');
    const selB = document.getElementById('eco-anio-b');
    if (!selA || !selB) return;

    if (!selA.options.length) {
        selA.innerHTML = '<option value="2026">2026</option><option value="2025">2025</option>';
        selB.innerHTML = '<option value="2025">2025</option><option value="2026">2026</option>';
    }

    const anioA = Number(selA.value);
    const anioB = Number(selB.value);
    const filtrarAnio = (arr, y) => arr.filter(x => String(x.fecha || '').startsWith(String(y)));

    const ingA = filtrarAnio(state.ingresos, anioA);
    const gasA = filtrarAnio(state.gastos, anioA);
    const ingB = filtrarAnio(state.ingresos, anioB);
    const gasB = filtrarAnio(state.gastos, anioB);

    const sumIngA = ingA.reduce((s, i) => s + i.base, 0);
    const sumGasA = gasA.reduce((s, g) => s + g.baseIrpf, 0);
    const resA = sumIngA - sumGasA;

    const sumIngB = ingB.reduce((s, i) => s + i.base, 0);
    const sumGasB = gasB.reduce((s, g) => s + g.baseIrpf, 0);
    const resB = sumIngB - sumGasB;

    document.getElementById('eco-label-ing-a').textContent = `Ingresos ${anioA}`;
    document.getElementById('eco-ing-a').textContent = formatEur(sumIngA);
    document.getElementById('eco-ing-b').textContent = `${anioB}: ${formatEur(sumIngB)}`;
    document.getElementById('eco-gas-a').textContent = formatEur(sumGasA);
    document.getElementById('eco-gas-b').textContent = `${anioB}: ${formatEur(sumGasB)}`;
    document.getElementById('eco-res-a').textContent = formatEur(resA);
    document.getElementById('eco-res-b').textContent = `${anioB}: ${formatEur(resB)}`;
    document.getElementById('eco-margen-a').textContent = sumIngA > 0 ? ((resA / sumIngA) * 100).toFixed(1) + '%' : 'N/D';
    document.getElementById('eco-margen-b').textContent = sumIngB > 0 ? `${anioB}: ${((resB / sumIngB) * 100).toFixed(1)}%` : `${anioB}: N/D`;

    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const mIng = Array(12).fill(0), mFacRec = Array(12).fill(0), mGasSimp = Array(12).fill(0), mRes = Array(12).fill(0);

    ingA.forEach(i => { const m = new Date(i.fecha).getMonth(); if (!isNaN(m)) mIng[m] += i.base; });
    gasA.forEach(g => {
        const m = new Date(g.fecha).getMonth();
        if (!isNaN(m)) {
            if (g.tipo === 'gasto') mGasSimp[m] += g.baseIrpf;
            else mFacRec[m] += g.baseIrpf;
        }
    });
    for (let m = 0; m < 12; m++) mRes[m] = mIng[m] - (mFacRec[m] + mGasSimp[m]);

    document.getElementById('eco-tabla-meses').innerHTML = mesesNombres.map((mes, idx) => `
        <tr class="border-b hover:bg-slate-50">
            <td class="p-2.5 font-bold">${mes} ${anioA}</td>
            <td class="p-2.5 text-right text-emerald-700 font-semibold">${formatEur(mIng[idx])}</td>
            <td class="p-2.5 text-right text-indigo-700">${formatEur(mFacRec[idx])}</td>
            <td class="p-2.5 text-right text-rose-700">${formatEur(mGasSimp[idx])}</td>
            <td class="p-2.5 text-right font-extrabold ${mRes[idx] >= 0 ? 'text-slate-900' : 'text-rose-600'}">${formatEur(mRes[idx])}</td>
        </tr>
    `).join('');

    if (typeof Chart === 'undefined') return;

    const ctx1 = document.getElementById('chartAnalisisEconomico');
    if (ctx1) {
        if (chartAnalisisEconomico) chartAnalisisEconomico.destroy();
        chartAnalisisEconomico = new Chart(ctx1.getContext('2d'), {
            type: 'bar',
            data: {
                labels: mesesNombres,
                datasets: [
                    { label: 'Ingresos', data: mIng, backgroundColor: '#10b981', borderRadius: 4 },
                    { label: 'Facturas Recibidas', data: mFacRec, backgroundColor: '#6366f1', borderRadius: 4 },
                    { label: 'Gastos / Tickets', data: mGasSimp, backgroundColor: '#f43f5e', borderRadius: 4 },
                    { label: 'Resultado Neto', data: mRes, type: 'line', borderColor: '#0f172a', borderWidth: 2, tension: 0.3, fill: false }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    const porCat = {};
    gasA.forEach(g => { porCat[g.cat] = (porCat[g.cat] || 0) + g.baseIrpf; });
    const ctx2 = document.getElementById('chartEcoCategorias');
    if (ctx2) {
        if (chartEcoCategorias) chartEcoCategorias.destroy();
        chartEcoCategorias = new Chart(ctx2.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: Object.keys(porCat),
                datasets: [{
                    data: Object.values(porCat),
                    backgroundColor: ['#3b82f6', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#64748b']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } } }
        });
    }

    const porCli = {};
    ingA.forEach(i => { porCli[i.cliente] = (porCli[i.cliente] || 0) + i.base; });
    const topClientes = Object.entries(porCli).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const ctx3 = document.getElementById('chartRentabilidadClientes');
    if (ctx3) {
        if (chartRentabilidadClientes) chartRentabilidadClientes.destroy();
        chartRentabilidadClientes = new Chart(ctx3.getContext('2d'), {
            type: 'bar',
            data: {
                labels: topClientes.map(x => x[0]),
                datasets: [{ label: 'Facturación Base (€)', data: topClientes.map(x => x[1]), backgroundColor: '#2563eb', borderRadius: 6 }]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }
}