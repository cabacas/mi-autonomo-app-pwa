/* ================= CONTROLADOR PRINCIPAL DE LA APLICACIÓN ================= */
import {
    CATALOGO_IAE,
    CATEGORIAS_COMPRAS,
    getDefaultState,
    guardarAdjuntoIDB,
    abrirAdjuntoIDB,
    contarAdjuntosIDB
} from './storage.js';

import {
    formatEur,
    fechaLocal,
    importePendiente,
    calcularFlujoRegistrado,
    obtenerSaldoBancoActual,
    calculateQuarter
} from './fiscal.js';

import {
    initOrUpdateDashboardChart,
    renderAnalisisEconomicoCharts
} from './charts.js';

import {
    generarHuellaVerifactu,
    descargarXMLFacturae,
    generarQRTributarioSVG
} from './einvoice.js';

let state = getDefaultState();
let iaeSeleccionadoOnboarding = null;
let volverAFactura = false;
let archivoEscaneadoActual = null;


/* ================= REGISTRO SERVICE WORKER Y INSTALACIÓN PWA ================= */
let deferredInstallPrompt = null;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker PWA registrado:', reg.scope))
            .catch(err => console.warn('Error registrando SW:', err));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) {
        btn.classList.remove('hidden');
        btn.classList.add('inline-flex');
    }
});

async function instalarPWA() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
        const btn = document.getElementById('btn-install-pwa');
        if (btn) btn.classList.add('hidden');
    }
    deferredInstallPrompt = null;
}

window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.classList.add('hidden');
    deferredInstallPrompt = null;
});

document.addEventListener('DOMContentLoaded', () => {
    loadStorage();
    poblarCategoriasCompra();
    renderAll();
    if (!state.perfil.onboardingCompletado) {
        abrirOnboarding(false);
    } else if (window.location.hash === '#escanear-factura') {
        switchTab('facturas-recibidas');
    } else if (window.location.hash === '#nueva-factura') {
        openIngresoModal();
    }
});

function loadStorage() {
    const saved = localStorage.getItem('gestor_fiscal_v5');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed, perfil: { ...state.perfil, ...(parsed.perfil || {}) } };
        } catch (e) { console.error(e); }
    } else if (localStorage.getItem('gestor_fiscal_v4')) {
        try {
            const old = JSON.parse(localStorage.getItem('gestor_fiscal_v4'));
            state = { ...state, ...old, perfil: { ...state.perfil, ...(old.perfil || {}) } };
            state.gastos.forEach(g => {
                if (!g.tipo) g.tipo = (Number(g.iva) > 0 || Number(g.baseIva) > 0) ? 'factura' : 'gasto';
            });
        } catch (e) { console.error(e); }
    }
    if (!Number.isFinite(Number(state.perfil.saldoInicialBanco))) {
        state.perfil.saldoInicialBanco = (Number(state.perfil.saldoBanco) || 0) - calcularFlujoRegistrado(state);
    }
}

function saveStorage() {
    localStorage.setItem('gestor_fiscal_v5', JSON.stringify(state));
    renderAll();
}

/* ================= ONBOARDING EPÍGRAFE IAE ================= */
function abrirOnboarding(permitirCerrar = true) {
    document.getElementById('onb-nombre').value = state.perfil.nombre || '';
    document.getElementById('onb-ciudad').value = state.perfil.ciudad || '';
    document.getElementById('onb-btn-cerrar').classList.toggle('hidden', !permitirCerrar);
    iaeSeleccionadoOnboarding = CATALOGO_IAE.find(x => x.codigo === state.perfil.iaeCodigo) || CATALOGO_IAE[0];
    filtrarEpigrafesIAE();
    actualizarTextoTributacion();
    document.getElementById('modal-onboarding').classList.remove('hidden');
}

function cerrarOnboarding() {
    document.getElementById('modal-onboarding').classList.add('hidden');
}

function filtrarEpigrafesIAE() {
    const q = (document.getElementById('onb-buscador-iae').value || '').toLowerCase().trim();
    const sector = document.getElementById('onb-filtro-sector').value;
    const lista = document.getElementById('onb-lista-iae');
    const filtrados = CATALOGO_IAE.filter(item =>
        (!sector || item.sector === sector) &&
        (!q || item.codigo.toLowerCase().includes(q) || item.nombre.toLowerCase().includes(q) || item.sector.toLowerCase().includes(q))
    );
    document.getElementById('onb-count-iae').textContent = filtrados.length;
    lista.innerHTML = filtrados.map(item => {
        const activo = iaeSeleccionadoOnboarding && iaeSeleccionadoOnboarding.codigo === item.codigo;
        return `<button type="button" onclick="seleccionarIAE('${item.codigo}')" class="w-full text-left p-3 flex items-center justify-between gap-2 transition ${activo ? 'bg-blue-600 text-white' : 'hover:bg-blue-50 text-slate-800'}">
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-[11px] font-extrabold px-2 py-0.5 rounded ${activo ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'}">IAE ${item.codigo}</span>
                    <span class="text-[10px] font-semibold ${activo ? 'text-blue-100' : 'text-slate-400'}">${item.sector}</span>
                </div>
                <p class="text-xs sm:text-sm font-bold mt-1 truncate">${item.nombre}</p>
            </div>
            <i class="fa-solid ${activo ? 'fa-circle-check text-white' : 'fa-chevron-right text-slate-400'} shrink-0"></i>
        </button>`;
    }).join('') || '<p class="p-4 text-center text-xs text-slate-500">No hay coincidencias. Prueba con otra palabra.</p>';
}

function seleccionarIAE(codigo) {
    iaeSeleccionadoOnboarding = CATALOGO_IAE.find(x => x.codigo === codigo);
    filtrarEpigrafesIAE();
    actualizarTextoTributacion();
}

function actualizarTextoTributacion() {
    const box = document.getElementById('onb-resumen-fiscal');
    if (!iaeSeleccionadoOnboarding) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const esNuevo = document.getElementById('onb-nuevo-autonomo').checked;
    const retencionFinal = iaeSeleccionadoOnboarding.tipo === 'profesional' ? (esNuevo ? 7 : 15) : 0;
    document.getElementById('onb-texto-tributacion').innerHTML = `
        <strong>Actividad ${iaeSeleccionadoOnboarding.tipo}</strong> · IVA habitual: <strong>${iaeSeleccionadoOnboarding.iva}%</strong> · 
        Retención IRPF en facturas: <strong>${retencionFinal}%</strong> · 
        Modelos trimestrales: <strong>${iaeSeleccionadoOnboarding.modelos}</strong>.
    `;
}


function continuarSinEpigrafe() {
    const nombreInput = document.getElementById('onb-nombre')?.value.trim();
    const ciudadInput = document.getElementById('onb-ciudad')?.value.trim();
    if (nombreInput) state.perfil.nombre = nombreInput;
    if (ciudadInput) state.perfil.ciudad = ciudadInput;
    state.perfil.iaeCodigo = 'GEN';
    state.perfil.iae = 'Régimen General (Estimación Directa Simplificada)';
    state.perfil.ivaDefecto = 21;
    state.perfil.retencionDefecto = 0;
    state.perfil.modelosFiscales = '303, 130';
    state.perfil.onboardingCompletado = true;
    cerrarOnboarding();
    saveStorage();
}

function guardarOnboarding(e) {
    e.preventDefault();
    if (!iaeSeleccionadoOnboarding) { alert('Selecciona un epígrafe de la lista.'); return; }
    const esNuevo = document.getElementById('onb-nuevo-autonomo').checked;
    const retencionFinal = iaeSeleccionadoOnboarding.tipo === 'profesional' ? (esNuevo ? 7 : 15) : 0;
    state.perfil.nombre = document.getElementById('onb-nombre').value.trim();
    state.perfil.ciudad = document.getElementById('onb-ciudad').value.trim();
    state.perfil.iaeCodigo = iaeSeleccionadoOnboarding.codigo;
    state.perfil.iae = `${iaeSeleccionadoOnboarding.codigo} - ${iaeSeleccionadoOnboarding.nombre}`;
    state.perfil.ivaDefecto = iaeSeleccionadoOnboarding.iva;
    state.perfil.retencionDefecto = retencionFinal;
    state.perfil.modelosFiscales = iaeSeleccionadoOnboarding.modelos;
    state.perfil.onboardingCompletado = true;
    cerrarOnboarding();
    saveStorage();
}

/* ================= NAVEGACIÓN ================= */
function toggleQuickActions() {
    document.getElementById('mobile-quick-actions').classList.toggle('hidden');
}

function switchTab(tabId) {
    const target = document.getElementById(`tab-${tabId}`);
    if (!target) return;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    target.classList.remove('hidden');

    document.querySelectorAll('.side-link[data-tab]').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tabId);
    });

    const grupoVentas = ['ingresos', 'presupuestos', 'clientes'];
    const grupoCompras = ['facturas-recibidas', 'gastos-simples'];
    const grupoGestion = ['tesoreria', 'analisis-economico', 'resumen-trimestral', 'aeat', 'perfil'];

    document.getElementById('mobile-subnav-ventas').classList.toggle('!hidden', !grupoVentas.includes(tabId));
    document.getElementById('mobile-subnav-compras').classList.toggle('!hidden', !grupoCompras.includes(tabId));
    document.getElementById('mobile-subnav-gestion').classList.toggle('!hidden', !grupoGestion.includes(tabId));

    document.querySelectorAll('.m-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.subtab === tabId);
    });

    let mnavActivo = tabId;
    if (grupoVentas.includes(tabId)) mnavActivo = 'ventas';
    if (grupoCompras.includes(tabId)) mnavActivo = 'compras';
    if (grupoGestion.includes(tabId)) mnavActivo = 'gestion';

    document.querySelectorAll('.m-nav-btn[data-mnav]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mnav === mnavActivo);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (tabId === 'aeat') updateAEATView();
    if (tabId === 'analisis-economico') renderAnalisisEconomicoCharts(state);
    if (tabId === 'presupuestos') renderPresupuestos();
}

/* ================= ESCANEO OCR LOCAL ================= */
function iniciarEscaneoDocumento(tipo = 'factura') {
    const input = document.getElementById('ocr-file-input');
    input.dataset.tipoDestino = tipo;
    input.value = '';
    input.click();
}

async function manejarArchivoOCR(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const tipo = event.target.dataset.tipoDestino || 'factura';
    archivoEscaneadoActual = file;

    openCompraModal(tipo, true);
    const panelOCR = document.getElementById('comp-ocr-status');
    const barraOCR = document.getElementById('comp-ocr-bar');
    const textoOCR = document.getElementById('comp-ocr-msg');

    panelOCR.classList.remove('hidden');
    barraOCR.style.width = '5%';
    textoOCR.textContent = 'Iniciando motor OCR local...';

    try {
        const { procesarDocumentoOCR } = await import('./ocr.js');
        const resultado = await procesarDocumentoOCR(file, (pct, msg) => {
            barraOCR.style.width = `${pct}%`;
            textoOCR.textContent = msg;
        });

        if (resultado.fecha) {
            document.getElementById('comp-fecha').value = resultado.fecha;
            autoTrimestre('comp-fecha', 'comp-trimestre');
        }
        if (resultado.proveedor) document.getElementById('comp-proveedor').value = resultado.proveedor;
        if (resultado.categoriaSugerida) document.getElementById('comp-categoria').value = resultado.categoriaSugerida;

        if (tipo === 'factura') {
            if (resultado.numFactura) document.getElementById('comp-num-factura').value = resultado.numFactura;
            if (resultado.nif) document.getElementById('comp-nif-proveedor').value = resultado.nif;
            if (resultado.base > 0) document.getElementById('comp-base').value = resultado.base.toFixed(2);
            document.getElementById('comp-iva-pct').value = String(resultado.ivaPct ?? 21);
        } else {
            if (resultado.total > 0) document.getElementById('comp-total-simple').value = resultado.total.toFixed(2);
        }

        actualizarResumenCompra();
        textoOCR.innerHTML = `<span class="text-emerald-700 font-bold"><i class="fa-solid fa-check-circle mr-1"></i>Datos extraídos (${file.name}). Revisa antes de guardar.</span>`;
    } catch (err) {
        console.error('Error OCR:', err);
        textoOCR.innerHTML = `<span class="text-rose-700 font-bold">No se pudo leer automáticamente. Rellena los campos manualmente; el archivo sigue adjunto.</span>`;
    }
}

/* ================= RENDERIZADO PRINCIPAL ================= */
async function renderAll() {
    document.getElementById('nav-autonomo-name').textContent = state.perfil.nombre || 'Autónomo';
    document.getElementById('nav-autonomo-ciudad').textContent = state.perfil.ciudad || 'España';
    document.getElementById('header-actividad-badge').textContent = state.perfil.iae ? `IAE ${state.perfil.iaeCodigo || ''}` : 'Gestor Fiscal';
    document.getElementById('dash-nombre').textContent = (state.perfil.nombre || 'Autónomo').split(' ')[0];
    document.getElementById('dash-subtitulo-actividad').textContent = `${state.perfil.ciudad ? state.perfil.ciudad + ' · ' : ''}Ejercicio 2026`;
    document.getElementById('dash-iae-titulo').textContent = state.perfil.iae || 'Actividad no configurada';
    document.getElementById('dash-iae-detalle').textContent = `IVA ${state.perfil.ivaDefecto ?? 21}% · Retención IRPF: ${state.perfil.retencionDefecto ?? 0}% · Modelos: ${state.perfil.modelosFiscales || '303, 130'}`;

    document.getElementById('prof-nombre').value = state.perfil.nombre || '';
    document.getElementById('prof-nif').value = state.perfil.nif || '';
    document.getElementById('prof-iae').value = state.perfil.iae || '';
    document.getElementById('prof-ciudad').value = state.perfil.ciudad || '';
    document.getElementById('prof-retencion-defecto').value = String(state.perfil.retencionDefecto ?? 15);
    document.getElementById('prof-telefono').value = state.perfil.telefono || '';
    document.getElementById('prof-direccion').value = state.perfil.direccion || '';
    document.getElementById('prof-iban').value = state.perfil.iban || '';
    document.getElementById('prof-saldo').value = obtenerSaldoBancoActual(state);

    const numAdj = await contarAdjuntosIDB();
    const badgeIdb = document.getElementById('idb-usage-badge');
    if (badgeIdb) badgeIdb.textContent = `${numAdj} adjuntos en IndexedDB`;

    renderIngresos();
    renderComprasSeparadas();
    renderClientes();
    renderPresupuestos();
    renderTrimestres();
    renderVencimientos();
    actualizarKPIs();
}

function renderIngresos() {
    const tbody = document.getElementById('tabla-ingresos-body');
    const cardsMobile = document.getElementById('cards-ingresos-mobile');
    tbody.innerHTML = '';
    cardsMobile.innerHTML = '';

    state.ingresos.slice().reverse().forEach(i => {
        const pend = importePendiente(i);
        const badgeClass = i.estado === 'cobrado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';

        tbody.innerHTML += `
            <tr class="border-b hover:bg-slate-50">
                <td class="px-3 py-2.5 font-bold">${i.numero}</td>
                <td class="px-3 py-2.5">${fechaLocal(i.fecha)}</td>
                <td class="px-3 py-2.5 font-semibold text-slate-800">${i.cliente}</td>
                <td class="px-3 py-2.5 text-center"><span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold text-xs">${i.trimestre}T</span></td>
                <td class="px-3 py-2.5 text-right">${formatEur(i.base)}</td>
                <td class="px-3 py-2.5 text-right">${formatEur(i.iva)}</td>
                <td class="px-3 py-2.5 text-right text-rose-600">-${formatEur(i.retencion || 0)}</td>
                <td class="px-3 py-2.5 text-right font-extrabold text-slate-900">${formatEur(i.total)}</td>
                <td class="px-3 py-2.5 text-center"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${badgeClass}">${i.estado.toUpperCase()}</span></td>
                <td class="px-3 py-2.5 text-center whitespace-nowrap">
                    ${pend > 0 ? `<button onclick="marcarCobradoRapido(${i.id})" class="text-emerald-600 px-1.5" title="Cobrar"><i class="fa-solid fa-check-circle"></i></button>` : ''}
                    <button onclick="generarFacturaPDF(${i.id})" class="text-blue-600 hover:text-blue-800 px-1.5" title="Factura PDF + QR"><i class="fa-solid fa-file-pdf"></i></button>
                    <button onclick="exportarFacturaXML(${i.id})" class="text-indigo-600 hover:text-indigo-800 px-1.5 font-bold text-[11px]" title="Descargar XML Facturae 3.2.2">XML</button>
                    <button onclick="deleteIngreso(${i.id})" class="text-rose-600 px-1.5"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;

        cardsMobile.innerHTML += `
            <article class="app-card p-4 space-y-2.5">
                <div class="flex justify-between items-start gap-2">
                    <div><span class="text-xs font-extrabold text-blue-700">${i.numero}</span><h4 class="font-bold text-slate-900 text-base">${i.cliente}</h4></div>
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold ${badgeClass}">${i.estado.toUpperCase()}</span>
                </div>
                <div class="flex justify-between items-end pt-1">
                    <div class="text-xs text-slate-500">
                        <p>${fechaLocal(i.fecha)} · ${i.trimestre}T</p>
                        <p>Base: ${formatEur(i.base)} · IVA: ${formatEur(i.iva)}</p>
                    </div>
                    <p class="text-xl font-black text-slate-900">${formatEur(i.total)}</p>
                </div>
                <div class="flex gap-2 pt-2 border-t">
                    ${pend > 0 ? `<button onclick="marcarCobradoRapido(${i.id})" class="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"><i class="fa-solid fa-check mr-1"></i>Cobrar</button>` : ''}
                    <button onclick="generarFacturaPDF(${i.id})" class="flex-1 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold"><i class="fa-solid fa-file-pdf mr-1"></i>PDF</button>
                    <button onclick="exportarFacturaXML(${i.id})" class="flex-1 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold"><i class="fa-solid fa-code mr-1"></i>Facturae XML</button>
                    <button onclick="deleteIngreso(${i.id})" class="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold"><i class="fa-solid fa-trash"></i></button>
                </div>
            </article>`;
    });
}

function marcarCobradoRapido(id) {
    const item = state.ingresos.find(i => i.id === id);
    if (!item) return;
    item.movimientosPago = [{ id: Date.now(), fecha: new Date().toISOString().slice(0, 10), importe: item.total }];
    item.estado = 'cobrado';
    saveStorage();
}

function poblarCategoriasCompra() {
    document.getElementById('comp-categoria').innerHTML = CATEGORIAS_COMPRAS.map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderComprasSeparadas() {
    const facturasRec = state.gastos.filter(g => g.tipo !== 'gasto');
    const gastosSimples = state.gastos.filter(g => g.tipo === 'gasto');

    document.getElementById('fr-panel-total').textContent = formatEur(facturasRec.reduce((s, g) => s + g.total, 0));
    document.getElementById('fr-panel-iva').textContent = formatEur(facturasRec.reduce((s, g) => s + g.iva, 0));
    document.getElementById('fr-panel-pendiente').textContent = formatEur(facturasRec.reduce((s, g) => s + importePendiente(g), 0));

    document.getElementById('gs-panel-total').textContent = formatEur(gastosSimples.reduce((s, g) => s + g.total, 0));
    document.getElementById('gs-panel-irpf').textContent = formatEur(gastosSimples.reduce((s, g) => s + g.baseIrpf, 0));
    document.getElementById('gs-panel-numero').textContent = gastosSimples.length;

    const tbodyFR = document.getElementById('tabla-facturas-recibidas-body');
    const cardsFR = document.getElementById('cards-facturas-recibidas-mobile');
    tbodyFR.innerHTML = '';
    cardsFR.innerHTML = '';

    facturasRec.slice().reverse().forEach(g => {
        const badgeClass = g.estado === 'pagado' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800';
        const btnAdj = g.adjuntoId ? `<button onclick="abrirAdjuntoIDB('${g.adjuntoId}')" class="text-indigo-600 font-bold" title="${g.adjuntoNombre || 'Ver documento'}"><i class="fa-solid fa-paperclip"></i></button>` : '<span class="text-slate-300">-</span>';

        tbodyFR.innerHTML += `
            <tr class="border-b hover:bg-slate-50">
                <td class="px-3 py-2.5 font-bold text-indigo-700">${g.numFactura || 'S/N'}</td>
                <td class="px-3 py-2.5">${fechaLocal(g.fecha)}</td>
                <td class="px-3 py-2.5"><span class="bg-indigo-50 text-indigo-800 px-1.5 py-0.5 rounded font-bold">${g.trimestre}T</span></td>
                <td class="px-3 py-2.5"><strong>${g.proveedor}</strong><div class="text-[10px] text-slate-400">${g.nifProveedor || ''}</div></td>
                <td class="px-3 py-2.5 text-slate-500">${g.cat}</td>
                <td class="px-3 py-2.5 text-right">${formatEur(g.baseIva)}</td>
                <td class="px-3 py-2.5 text-right font-semibold text-indigo-700">${formatEur(g.iva)} (${g.ivaPct || 21}%)</td>
                <td class="px-3 py-2.5 text-right font-extrabold text-slate-900">${formatEur(g.total)}</td>
                <td class="px-3 py-2.5 text-center">${btnAdj}</td>
                <td class="px-3 py-2.5 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}">${g.estado.toUpperCase()}</span></td>
                <td class="px-3 py-2.5 text-center whitespace-nowrap">
                    ${g.estado !== 'pagado' ? `<button onclick="marcarPagadoRapido(${g.id})" class="text-emerald-600 px-1.5"><i class="fa-solid fa-check-circle"></i></button>` : ''}
                    <button onclick="deleteGasto(${g.id})" class="text-rose-600 px-1.5"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;

        cardsFR.innerHTML += `
            <article class="app-card p-4 space-y-2 border-l-4 border-indigo-500">
                <div class="flex justify-between items-start gap-2">
                    <div>
                        <span class="text-[11px] font-extrabold text-indigo-700">${g.numFactura || 'Factura Recibida'} · ${g.nifProveedor || ''}</span>
                        <h4 class="font-bold text-slate-900 text-base">${g.proveedor}</h4>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold ${badgeClass}">${g.estado.toUpperCase()}</span>
                </div>
                <div class="flex justify-between items-end pt-1">
                    <div class="text-xs text-slate-500">
                        <p>${fechaLocal(g.fecha)} · ${g.cat}</p>
                        <p>Base: ${formatEur(g.baseIva)} · IVA deducible: ${formatEur(g.iva)}</p>
                    </div>
                    <p class="text-xl font-black text-slate-900">${formatEur(g.total)}</p>
                </div>
                <div class="flex gap-2 pt-2 border-t">
                    ${g.estado !== 'pagado' ? `<button onclick="marcarPagadoRapido(${g.id})" class="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Pagar</button>` : ''}
                    ${g.adjuntoId ? `<button onclick="abrirAdjuntoIDB('${g.adjuntoId}')" class="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold"><i class="fa-solid fa-paperclip mr-1"></i>Doc</button>` : ''}
                    <button onclick="deleteGasto(${g.id})" class="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold ml-auto"><i class="fa-solid fa-trash"></i></button>
                </div>
            </article>`;
    });

    const tbodyGS = document.getElementById('tabla-gastos-simples-body');
    const cardsGS = document.getElementById('cards-gastos-simples-mobile');
    tbodyGS.innerHTML = '';
    cardsGS.innerHTML = '';

    gastosSimples.slice().reverse().forEach(g => {
        const badgeClass = g.estado === 'pagado' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800';
        const btnAdj = g.adjuntoId ? `<button onclick="abrirAdjuntoIDB('${g.adjuntoId}')" class="text-rose-600 font-bold"><i class="fa-solid fa-paperclip"></i></button>` : '<span class="text-slate-300">-</span>';

        tbodyGS.innerHTML += `
            <tr class="border-b hover:bg-slate-50">
                <td class="px-3 py-2.5">${fechaLocal(g.fecha)}</td>
                <td class="px-3 py-2.5"><span class="bg-rose-50 text-rose-800 px-1.5 py-0.5 rounded font-bold">${g.trimestre}T</span></td>
                <td class="px-3 py-2.5 font-semibold text-slate-800">${g.proveedor}</td>
                <td class="px-3 py-2.5 text-slate-500">${g.cat}</td>
                <td class="px-3 py-2.5 text-right font-extrabold text-rose-700">${formatEur(g.baseIrpf)}</td>
                <td class="px-3 py-2.5 text-center">${btnAdj}</td>
                <td class="px-3 py-2.5 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}">${g.estado.toUpperCase()}</span></td>
                <td class="px-3 py-2.5 text-center whitespace-nowrap">
                    ${g.estado !== 'pagado' ? `<button onclick="marcarPagadoRapido(${g.id})" class="text-emerald-600 px-1.5"><i class="fa-solid fa-check-circle"></i></button>` : ''}
                    <button onclick="deleteGasto(${g.id})" class="text-rose-600 px-1.5"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;

        cardsGS.innerHTML += `
            <article class="app-card p-4 space-y-2 border-l-4 border-rose-500">
                <div class="flex justify-between items-start gap-2">
                    <div>
                        <span class="text-[10px] font-bold uppercase text-rose-600">${g.cat}</span>
                        <h4 class="font-bold text-slate-900 text-base">${g.proveedor}</h4>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold ${badgeClass}">${g.estado.toUpperCase()}</span>
                </div>
                <div class="flex justify-between items-end pt-1">
                    <p class="text-xs text-slate-500">${fechaLocal(g.fecha)} · ${g.trimestre}T · Deducible IRPF</p>
                    <p class="text-xl font-black text-rose-700">${formatEur(g.baseIrpf)}</p>
                </div>
                <div class="flex gap-2 pt-2 border-t">
                    ${g.estado !== 'pagado' ? `<button onclick="marcarPagadoRapido(${g.id})" class="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Pagar</button>` : ''}
                    ${g.adjuntoId ? `<button onclick="abrirAdjuntoIDB('${g.adjuntoId}')" class="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold"><i class="fa-solid fa-paperclip mr-1"></i>Doc</button>` : ''}
                    <button onclick="deleteGasto(${g.id})" class="px-3 py-2 rounded-xl bg-slate-100 text-rose-600 text-xs font-bold ml-auto"><i class="fa-solid fa-trash"></i></button>
                </div>
            </article>`;
    });
}

function marcarPagadoRapido(id) {
    const g = state.gastos.find(x => x.id === id);
    if (!g) return;
    g.movimientosPago = [{ id: Date.now(), fecha: new Date().toISOString().slice(0, 10), importe: g.total }];
    g.estado = 'pagado';
    saveStorage();
}

/* ================= MODALES COMPRA / GASTO / INGRESO / CLIENTE / PRESUPUESTO ================= */
function openCompraModal(tipo = 'factura', mantenerArchivoOCR = false) {
    const esFactura = tipo === 'factura';
    const hoy = new Date().toISOString().slice(0, 10);
    document.getElementById('comp-tipo').value = tipo;
    document.getElementById('comp-fecha').value = hoy;
    document.getElementById('comp-num-factura').value = '';
    document.getElementById('comp-nif-proveedor').value = '';
    document.getElementById('comp-proveedor').value = '';
    document.getElementById('comp-base').value = '';
    document.getElementById('comp-total-simple').value = '';
    document.getElementById('comp-archivo').value = '';
    if (!mantenerArchivoOCR) {
        archivoEscaneadoActual = null;
        document.getElementById('comp-ocr-status')?.classList.add('hidden');
    }
    autoTrimestre('comp-fecha', 'comp-trimestre');

    document.getElementById('comp-modal-titulo').textContent = esFactura ? 'Registrar Factura Recibida' : 'Registrar Gasto o Ticket';
    document.getElementById('comp-modal-subtitulo').textContent = esFactura ? 'Con datos de proveedor para deducir IVA (Mod. 303)' : 'Cuota RETA, seguros, tasas o tickets sin IVA deducible (Mod. 130)';
    document.getElementById('comp-bloque-factura').classList.toggle('hidden', !esFactura);
    document.getElementById('comp-importes-factura').classList.toggle('hidden', !esFactura);
    document.getElementById('comp-importes-gasto').classList.toggle('hidden', esFactura);
    document.getElementById('comp-label-proveedor').textContent = esFactura ? 'Razón Social / Proveedor *' : 'Concepto / Entidad (Ej. Seguridad Social, Seguro...) *';

    const btn = document.getElementById('comp-btn-guardar');
    btn.className = esFactura ? 'px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold' : 'px-5 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold';

    actualizarResumenCompra();
    document.getElementById('modal-compra').classList.remove('hidden');
}

function closeCompraModal() { document.getElementById('modal-compra').classList.add('hidden'); }

function actualizarResumenCompra() {
    const tipo = document.getElementById('comp-tipo').value;
    const res = document.getElementById('comp-resumen-texto');
    if (tipo === 'factura') {
        const b = Number(document.getElementById('comp-base').value) || 0;
        const pct = Number(document.getElementById('comp-iva-pct').value) || 0;
        const iva = Math.round(b * pct) / 100;
        res.textContent = `Base: ${formatEur(b)} + IVA (${pct}%): ${formatEur(iva)} = Total Factura: ${formatEur(b + iva)}`;
    } else {
        const tot = Number(document.getElementById('comp-total-simple').value) || 0;
        res.textContent = `Importe íntegro deducible en IRPF (Modelo 130): ${formatEur(tot)} · Sin cuota de IVA`;
    }
}

async function saveCompra(e) {
    e.preventDefault();
    const tipo = document.getElementById('comp-tipo').value;
    const fecha = document.getElementById('comp-fecha').value;
    const trimestre = parseInt(document.getElementById('comp-trimestre').value);
    const proveedor = document.getElementById('comp-proveedor').value.trim();
    const cat = document.getElementById('comp-categoria').value;
    const estado = document.getElementById('comp-estado').value;

    let baseIva = 0, baseIrpf = 0, ivaPct = 0, iva = 0, total = 0;
    let numFactura = '', nifProveedor = '';

    if (tipo === 'factura') {
        numFactura = document.getElementById('comp-num-factura').value.trim();
        nifProveedor = document.getElementById('comp-nif-proveedor').value.trim().toUpperCase();
        baseIva = Number(document.getElementById('comp-base').value) || 0;
        baseIrpf = baseIva;
        ivaPct = Number(document.getElementById('comp-iva-pct').value) || 0;
        iva = Math.round(baseIva * ivaPct) / 100;
        total = baseIva + iva;
    } else {
        total = Number(document.getElementById('comp-total-simple').value) || 0;
        baseIrpf = total;
    }

    const id = Date.now();
    const fileInput = document.getElementById('comp-archivo');
    const archivoFinal = (fileInput.files && fileInput.files[0]) ? fileInput.files[0] : archivoEscaneadoActual;
    let adjuntoId = null, adjuntoNombre = '';
    if (archivoFinal) {
        adjuntoId = `adj-${id}`;
        adjuntoNombre = archivoFinal.name;
        await guardarAdjuntoIDB(adjuntoId, archivoFinal);
    }
    archivoEscaneadoActual = null;

    state.gastos.push({
        id, tipo, numFactura, nifProveedor, fecha, trimestre, proveedor, cat,
        baseIva, baseIrpf, ivaPct, iva, total, estado,
        adjuntoId, adjuntoNombre,
        movimientosPago: estado === 'pagado' ? [{ id, fecha, importe: total }] : []
    });

    closeCompraModal();
    saveStorage();
}

function deleteGasto(id) {
    if (!confirm('¿Eliminar este registro?')) return;
    state.gastos = state.gastos.filter(g => g.id !== id);
    saveStorage();
}

function actualizarKPIs() {
    const totBaseIng = state.ingresos.reduce((s, i) => s + i.base, 0);
    const totIvaIng = state.ingresos.reduce((s, i) => s + i.iva, 0);
    const totBaseCompras = state.gastos.reduce((s, g) => s + g.baseIrpf, 0);
    const totIvaDeducible = state.gastos.filter(g => g.tipo !== 'gasto').reduce((s, g) => s + g.iva, 0);

    const cobrosPend = state.ingresos.reduce((s, i) => s + importePendiente(i), 0);
    const pagosPend = state.gastos.reduce((s, g) => s + importePendiente(g), 0);

    const ivaLiq = totIvaIng - totIvaDeducible;
    const q4 = calculateQuarter(state, 4);
    const reservaHacienda = Math.max(0, ivaLiq) + q4.irpf130APagar;
    const saldoBanco = obtenerSaldoBancoActual(state);
    const posNeta = saldoBanco + cobrosPend - pagosPend - reservaHacienda;

    document.getElementById('dash-ingresos-base').textContent = formatEur(totBaseIng);
    document.getElementById('dash-ingresos-iva').textContent = formatEur(totIvaIng);
    document.getElementById('dash-gastos-base').textContent = formatEur(totBaseCompras);
    document.getElementById('dash-gastos-iva').textContent = formatEur(totIvaDeducible);
    document.getElementById('dash-iva-resultado').textContent = formatEur(ivaLiq);
    document.getElementById('dash-irpf-resultado').textContent = formatEur(q4.irpf130APagar);
    document.getElementById('dash-saldo-banco').textContent = formatEur(saldoBanco);
    document.getElementById('dash-cobros-pendientes').textContent = formatEur(cobrosPend);
    document.getElementById('dash-pagos-pendientes').textContent = formatEur(pagosPend);
    document.getElementById('dash-posicion-neta').textContent = formatEur(posNeta);

    document.getElementById('tesoreria-saldo-banco').textContent = formatEur(saldoBanco);
    document.getElementById('tesoreria-cobros').textContent = formatEur(cobrosPend);
    document.getElementById('tesoreria-pagos').textContent = formatEur(pagosPend);
    document.getElementById('tesoreria-impuestos').textContent = formatEur(reservaHacienda);
    document.getElementById('tesoreria-neta').textContent = formatEur(posNeta);

    initOrUpdateDashboardChart(state);
}

function renderTrimestres() {
    const cont = document.getElementById('cards-trimestres');
    cont.innerHTML = [1, 2, 3, 4].map(q => {
        const d = calculateQuarter(state, q);
        return `<div class="border rounded-xl p-4 bg-slate-50 space-y-2">
            <h4 class="font-extrabold text-slate-800 border-b pb-2">${q}º TRIMESTRE</h4>
            <div class="text-xs space-y-1.5">
                <p class="flex justify-between"><span>Ingresos Trim.:</span><strong>${formatEur(d.ingBase)}</strong></p>
                <p class="flex justify-between"><span>Compras+Gastos Trim.:</span><strong>${formatEur(d.gasBaseIrpf)}</strong></p>
                <p class="flex justify-between text-amber-700 font-bold border-t pt-1"><span>Mod. 303 (IVA Trim.):</span><span>${formatEur(d.ivaLiquidacion)}</span></p>
                <div class="bg-blue-50/80 p-2 rounded-lg space-y-1 mt-1">
                    <p class="text-[10px] font-bold uppercase text-blue-800">Modelo 130 (Acumulado 1T-${q}T)</p>
                    <p class="flex justify-between text-[11px]"><span>Rend. Neto Acum.:</span><span>${formatEur(d.rendNetoAcum)}</span></p>
                    <p class="flex justify-between text-[11px]"><span>20% Cuota - Retenc.:</span><span>-${formatEur(d.retencionesAcum)}</span></p>
                    <p class="flex justify-between text-blue-700 font-extrabold"><span>A ingresar Mod. 130:</span><span>${formatEur(d.irpf130APagar)}</span></p>
                </div>
            </div>
        </div>`;
    }).join('');
}

function autoTrimestre(dateId, trimId) {
    const val = document.getElementById(dateId).value;
    if (val) document.getElementById(trimId).value = Math.ceil((new Date(val).getMonth() + 1) / 3);
}

function openIngresoModal() {
    const hoy = new Date().toISOString().slice(0, 10);
    document.getElementById('ing-fecha').value = hoy;
    document.getElementById('ing-numero').value = `F-2026-${String(state.ingresos.length + 1).padStart(4, '0')}`;
    document.getElementById('ing-cliente').innerHTML = '<option value="">Selecciona cliente…</option>' + state.clientes.map(c => `<option value="${c.id}">${c.nombre} (${c.nif})</option>`).join('');
    document.getElementById('ing-irpf').value = String(state.perfil.retencionDefecto ?? 15);
    document.getElementById('ing-lineas').innerHTML = '';
    anadirLineaFactura();
    autoTrimestre('ing-fecha', 'ing-trimestre');
    document.getElementById('modal-ingreso').classList.remove('hidden');
}
function closeIngresoModal() { document.getElementById('modal-ingreso').classList.add('hidden'); }

function anadirLineaFactura() {
    const ivaDef = state.perfil.ivaDefecto ?? 21;
    const div = document.createElement('div');
    div.className = 'grid grid-cols-12 gap-2 items-end border-b pb-2';
    div.dataset.linea = '1';
    div.innerHTML = `
        <div class="col-span-12 sm:col-span-5"><input data-campo="desc" required placeholder="Concepto" class="w-full border rounded-lg p-2 text-sm bg-white"></div>
        <div class="col-span-4 sm:col-span-2"><input data-campo="cant" type="number" step="0.01" value="1" oninput="actualizarTotalesFactura()" class="w-full border rounded-lg p-2 text-sm bg-white"></div>
        <div class="col-span-4 sm:col-span-3"><input data-campo="precio" type="number" step="0.01" required placeholder="Precio €" oninput="actualizarTotalesFactura()" class="w-full border rounded-lg p-2 text-sm bg-white"></div>
        <div class="col-span-4 sm:col-span-2"><select data-campo="iva" onchange="actualizarTotalesFactura()" class="w-full border rounded-lg p-2 text-sm bg-white"><option value="21" ${ivaDef === 21 ? 'selected' : ''}>21%</option><option value="10" ${ivaDef === 10 ? 'selected' : ''}>10%</option><option value="4" ${ivaDef === 4 ? 'selected' : ''}>4%</option><option value="0" ${ivaDef === 0 ? 'selected' : ''}>0%</option></select></div>
    `;
    document.getElementById('ing-lineas').appendChild(div);
    actualizarTotalesFactura();
}

function actualizarTotalesFactura() {
    let base = 0, iva = 0;
    document.querySelectorAll('#ing-lineas [data-linea]').forEach(el => {
        const c = Number(el.querySelector('[data-campo="cant"]').value) || 0;
        const p = Number(el.querySelector('[data-campo="precio"]').value) || 0;
        const iv = Number(el.querySelector('[data-campo="iva"]').value) || 0;
        base += c * p;
        iva += (c * p) * iv / 100;
    });
    const irpfPct = Number(document.getElementById('ing-irpf').value) || 0;
    const ret = base * irpfPct / 100;
    const total = base + iva - ret;
    document.getElementById('ing-resumen-totales').innerHTML = `
        <div class="flex justify-between text-xs text-slate-500"><span>Base: ${formatEur(base)} · IVA: ${formatEur(iva)} · IRPF: -${formatEur(ret)}</span></div>
        <div class="flex justify-between items-center mt-1"><span class="font-bold text-slate-700">TOTAL</span><span class="text-lg font-black text-blue-700">${formatEur(total)}</span></div>
    `;
    return { base, iva, ret, irpfPct, total };
}

async function saveIngreso(e) {
    e.preventDefault();
    const c = state.clientes.find(x => String(x.id) === document.getElementById('ing-cliente').value);
    if (!c) return;
    const t = actualizarTotalesFactura();
    const estado = document.getElementById('ing-estado').value;
    const fecha = document.getElementById('ing-fecha').value;
    const lineasCapturadas = [...document.querySelectorAll('#ing-lineas [data-linea]')].map(el => ({
        descripcion: el.querySelector('[data-campo="desc"]').value.trim(),
        cantidad: Number(el.querySelector('[data-campo="cant"]').value) || 1,
        precio: Number(el.querySelector('[data-campo="precio"]').value) || 0,
        iva: Number(el.querySelector('[data-campo="iva"]').value) || 0
    }));

    const nuevaFactura = {
        id: Date.now(), numero: document.getElementById('ing-numero').value, fecha,
        clienteId: c.id, cliente: c.nombre, nif: c.nif, clienteDireccion: c.direccion || '',
        trimestre: parseInt(document.getElementById('ing-trimestre').value),
        lineas: lineasCapturadas,
        base: t.base, iva: t.iva, retencion: t.ret, retencionPct: t.irpfPct, total: t.total, estado,
        movimientosPago: estado === 'cobrado' ? [{ id: Date.now(), fecha, importe: t.total }] : []
    };

    // Encadenamiento criptográfico Veri*factu (SHA-256 con factura previa)
    const ultimaFactura = state.ingresos[state.ingresos.length - 1];
    const hashPrevio = ultimaFactura?.verifactu?.hashActual || '0000000000000000000000000000000000000000000000000000000000000000';
    nuevaFactura.verifactu = await generarHuellaVerifactu(nuevaFactura, state.perfil, hashPrevio);

    state.ingresos.push(nuevaFactura);
    closeIngresoModal();
    saveStorage();
}

function deleteIngreso(id) {
    if (!confirm('¿Eliminar esta factura?')) return;
    state.ingresos = state.ingresos.filter(i => i.id !== id);
    saveStorage();
}

function renderClientes() {
    const q = (document.getElementById('clientes-busqueda')?.value || '').toLowerCase();
    const filtrados = state.clientes.filter(c => c.nombre.toLowerCase().includes(q) || c.nif.toLowerCase().includes(q) || (c.telefono || '').includes(q));
    document.getElementById('clientes-contador').textContent = `${filtrados.length} clientes`;
    document.getElementById('tabla-clientes-body').innerHTML = filtrados.map(c => {
        const telLimpio = String(c.telefono || '').replace(/[^+\d]/g, '');
        const enlaceTel = telLimpio
            ? `<a href="tel:${telLimpio}" class="inline-flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition"><i class="fa-solid fa-phone text-[11px]"></i> ${c.telefono}</a>`
            : '<span class="text-slate-400">Sin teléfono</span>';
        const enlaceMail = c.email
            ? `<a href="mailto:${c.email}" class="text-blue-600 hover:underline block mt-0.5">${c.email}</a>`
            : '';

        return `
        <tr class="border-b hover:bg-slate-50">
            <td class="p-3 font-bold text-slate-900">${c.nombre}</td>
            <td class="p-3 font-mono text-xs">${c.nif}</td>
            <td class="p-3 text-xs">${enlaceTel}${enlaceMail}</td>
            <td class="p-3 text-center font-bold text-blue-700">${state.ingresos.filter(i => i.clienteId === c.id).length}</td>
            <td class="p-3 text-center"><button onclick="eliminarCliente(${c.id})" class="text-rose-600 hover:text-rose-800 p-1.5" title="Eliminar"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`;
    }).join('');
}

function nuevoClienteDesdeFactura() { volverAFactura = true; openClienteModal(); }
function openClienteModal() {
    document.getElementById('form-cliente').reset();
    const m = document.getElementById('modal-cliente'); m.classList.remove('hidden'); m.classList.add('flex');
}
function closeClienteModal() {
    const m = document.getElementById('modal-cliente'); m.classList.add('hidden'); m.classList.remove('flex');
}
function saveCliente(e) {
    e.preventDefault();
    const nuevo = {
        id: Date.now(), nombre: document.getElementById('cli-nombre').value.trim(),
        nif: document.getElementById('cli-nif').value.trim().toUpperCase(),
        email: document.getElementById('cli-email').value.trim(), telefono: document.getElementById('cli-telefono').value.trim()
    };
    state.clientes.push(nuevo);
    closeClienteModal();
    saveStorage();
    if (volverAFactura) {
        volverAFactura = false;
        openIngresoModal();
        document.getElementById('ing-cliente').value = String(nuevo.id);
    }
}
function eliminarCliente(id) { state.clientes = state.clientes.filter(c => c.id !== id); saveStorage(); }

function abrirModalPresupuesto() {
    document.getElementById('pres-numero').value = `P-2026-${String(state.presupuestos.length + 1).padStart(4, '0')}`;
    document.getElementById('pres-cliente').innerHTML = '<option value="">Selecciona cliente…</option>' + state.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    document.getElementById('pres-lineas').innerHTML = '';
    anadirLineaPresupuesto();
    document.getElementById('modal-presupuesto').classList.remove('hidden');
}
function cerrarModalPresupuesto() { document.getElementById('modal-presupuesto').classList.add('hidden'); }
function anadirLineaPresupuesto() {
    const div = document.createElement('div');
    div.className = 'grid grid-cols-12 gap-2 bg-slate-50 p-2 rounded-xl border';
    div.dataset.plinea = '1';
    div.innerHTML = `
        <div class="col-span-6"><input data-f="desc" required placeholder="Concepto" class="w-full border rounded-lg p-2 text-sm bg-white"></div>
        <div class="col-span-3"><input data-f="cant" type="number" value="1" oninput="calcularPresupuesto()" class="w-full border rounded-lg p-2 text-sm bg-white"></div>
        <div class="col-span-3"><input data-f="precio" type="number" step="0.01" placeholder="Precio €" oninput="calcularPresupuesto()" class="w-full border rounded-lg p-2 text-sm bg-white"></div>
    `;
    document.getElementById('pres-lineas').appendChild(div);
    calcularPresupuesto();
}
function calcularPresupuesto() {
    let base = 0;
    document.querySelectorAll('#pres-lineas [data-plinea]').forEach(el => {
        base += (Number(el.querySelector('[data-f="cant"]').value) || 0) * (Number(el.querySelector('[data-f="precio"]').value) || 0);
    });
    const iva = base * (state.perfil.ivaDefecto ?? 21) / 100;
    const total = base + iva;
    document.getElementById('pres-total-final').textContent = formatEur(total);
    return { base, iva, total };
}
function guardarPresupuesto(e) {
    e.preventDefault();
    const c = state.clientes.find(x => String(x.id) === document.getElementById('pres-cliente').value);
    if (!c) return;
    const t = calcularPresupuesto();
    state.presupuestos.push({
        id: Date.now(), numero: document.getElementById('pres-numero').value,
        fecha: new Date().toISOString().slice(0, 10), clienteId: c.id, cliente: c.nombre, nif: c.nif,
        estado: 'pendiente', ...t
    });
    cerrarModalPresupuesto();
    saveStorage();
}
function renderPresupuestos() {
    const lista = document.getElementById('presupuestos-lista');
    document.getElementById('presupuestos-vacio').classList.toggle('hidden', state.presupuestos.length > 0);
    lista.innerHTML = state.presupuestos.map(p => `
        <article class="border rounded-2xl p-4 bg-white shadow-sm flex flex-col justify-between gap-3">
            <div class="flex justify-between items-start"><div><span class="text-xs font-bold text-blue-600">${p.numero}</span><h4 class="font-bold text-slate-900">${p.cliente}</h4></div><span class="text-lg font-black text-slate-900">${formatEur(p.total)}</span></div>
            ${p.estado !== 'convertido' ? `<button onclick="convertirPresupuesto(${p.id})" class="w-full py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Convertir en Factura</button>` : '<span class="text-xs font-bold text-purple-700">Facturado</span>'}
        </article>
    `).join('');
}
function convertirPresupuesto(id) {
    const p = state.presupuestos.find(x => x.id === id);
    if (!p) return;
    const hoy = new Date().toISOString().slice(0, 10);
    state.ingresos.push({
        id: Date.now(), numero: `F-2026-${String(state.ingresos.length + 1).padStart(4, '0')}`,
        fecha: hoy, clienteId: p.clienteId, cliente: p.cliente, nif: p.nif,
        trimestre: Math.ceil((new Date().getMonth() + 1) / 3),
        base: p.base, iva: p.iva, retencion: 0, total: p.total, estado: 'pendiente', movimientosPago: []
    });
    p.estado = 'convertido';
    saveStorage();
}

function renderVencimientos() {
    const tbody = document.getElementById('tabla-vencimientos-body');
    const pendIng = state.ingresos.filter(i => importePendiente(i) > 0).map(i => ({ tipo: 'COBRO', fecha: i.fecha, nombre: i.cliente, imp: importePendiente(i) }));
    const pendGas = state.gastos.filter(g => importePendiente(g) > 0).map(g => ({ tipo: 'PAGO', fecha: g.fecha, nombre: g.proveedor, imp: importePendiente(g) }));
    const todos = [...pendIng, ...pendGas];
    tbody.innerHTML = todos.length ? todos.map(x => `<tr class="border-b"><td class="p-3"><span class="text-[10px] font-bold px-2 py-0.5 rounded ${x.tipo === 'COBRO' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${x.tipo}</span></td><td class="p-3 text-xs">${fechaLocal(x.fecha)}</td><td class="p-3 font-semibold text-xs">${x.nombre}</td><td class="p-3 text-right font-bold text-xs">${formatEur(x.imp)}</td></tr>`).join('') : '<tr><td colspan="4" class="p-4 text-center text-xs text-slate-400">Sin vencimientos pendientes</td></tr>';
}

function savePerfil(e) {
    e.preventDefault();
    state.perfil.nombre = document.getElementById('prof-nombre').value;
    state.perfil.nif = document.getElementById('prof-nif').value;
    state.perfil.iae = document.getElementById('prof-iae').value;
    state.perfil.ciudad = document.getElementById('prof-ciudad').value;
    state.perfil.retencionDefecto = Number(document.getElementById('prof-retencion-defecto').value);
    state.perfil.telefono = document.getElementById('prof-telefono').value;
    state.perfil.direccion = document.getElementById('prof-direccion').value;
    state.perfil.iban = document.getElementById('prof-iban').value;
    const saldoIntro = parseFloat(document.getElementById('prof-saldo').value) || 0;
    state.perfil.saldoInicialBanco = saldoIntro - calcularFlujoRegistrado(state);
    saveStorage();
    alert('Configuración guardada.');
}

function updateAEATView() {
    const model = document.getElementById('aeat-model-select').value;
    const period = document.getElementById('aeat-period-select').value;
    const q = parseInt(period.replace('T', ''));
    const d = calculateQuarter(state, q);
    const cont = document.getElementById('aeat-print-container');
    if (model === '303') {
        cont.innerHTML = `<div class="border-2 border-slate-800 p-4 space-y-3"><div class="flex justify-between border-b-2 border-slate-800 pb-2"><h3 class="font-extrabold text-sm">AEAT · MODELO 303 (IVA ${period})</h3><span class="text-2xl font-black">303</span></div><p class="font-bold">${state.perfil.nif} - ${state.perfil.nombre}</p><div class="font-mono space-y-1"><p class="flex justify-between"><span>[01] Base Devengada:</span><span>${formatEur(d.ingBase)}</span></p><p class="flex justify-between"><span>[03] IVA Devengado:</span><span>${formatEur(d.ingIva)}</span></p><p class="flex justify-between"><span>[23] IVA Deducible (Facturas Recibidas):</span><span>${formatEur(d.gasIva)}</span></p><p class="flex justify-between font-black bg-blue-50 p-1"><span>[48] RESULTADO LIQUIDACIÓN:</span><span>${formatEur(d.ivaLiquidacion)}</span></p></div></div>`;
    } else if (model === '130') {
        cont.innerHTML = `<div class="border-2 border-slate-800 p-4 space-y-3"><div class="flex justify-between border-b-2 border-slate-800 pb-2"><h3 class="font-extrabold text-sm">AEAT · MODELO 130 (IRPF Acumulativo 1T-${period})</h3><span class="text-2xl font-black">130</span></div><p class="font-bold">${state.perfil.nif} - ${state.perfil.nombre}</p><div class="font-mono space-y-1"><p class="flex justify-between"><span>[01] Ingresos Acumulados:</span><span>${formatEur(d.ingBaseAcum)}</span></p><p class="flex justify-between"><span>[02] Gastos Deducibles Acumulados:</span><span>${formatEur(d.gasBaseAcum)}</span></p><p class="flex justify-between"><span>[03] Rendimiento Neto Acumulado:</span><span>${formatEur(d.rendNetoAcum)}</span></p><p class="flex justify-between"><span>[04] 20% Rendimiento Neto:</span><span>${formatEur(d.cuota20Acum)}</span></p><p class="flex justify-between text-rose-700"><span>[05] Pagos trimestres anteriores:</span><span>-${formatEur(d.pagosAnteriores)}</span></p><p class="flex justify-between text-rose-700"><span>[06] Retenciones soportadas en facturas:</span><span>-${formatEur(d.retencionesAcum)}</span></p><p class="flex justify-between font-black bg-blue-50 p-1"><span>[07] TOTAL A INGRESAR:</span><span>${formatEur(d.irpf130APagar)}</span></p></div></div>`;
    } else {
        const totI = state.ingresos.reduce((s, i) => s + i.iva, 0);
        const totG = state.gastos.filter(g => g.tipo !== 'gasto').reduce((s, g) => s + g.iva, 0);
        cont.innerHTML = `<div class="border-2 border-slate-800 p-4 space-y-3"><h3 class="font-extrabold text-sm border-b-2 border-slate-800 pb-2">MODELO 390 · RESUMEN ANUAL IVA</h3><p class="flex justify-between font-mono"><span>IVA Repercutido:</span><span>${formatEur(totI)}</span></p><p class="flex justify-between font-mono"><span>IVA Soportado Deducible:</span><span>${formatEur(totG)}</span></p><p class="flex justify-between font-mono font-black bg-blue-50 p-1"><span>Resultado Anual:</span><span>${formatEur(totI - totG)}</span></p></div>`;
    }
}

function descargarImpresoPDF() {
    const el = document.getElementById('aeat-print-container');
    html2pdf().from(el).save(`Borrador_${document.getElementById('aeat-model-select').value}_2026.pdf`);
}

function obtenerSiluetaCiudadSVG(ciudadRaw, colorAcento) {
    const c = String(ciudadRaw || '').toLowerCase();
    // Terrassa: Chimenea industrial Vapor Aymerich / Masia Freixa
    if (c.includes('terrassa')) {
        return `<svg viewBox="0 0 220 520" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
            <!-- Chimenea textil emblemática de Terrassa (Vapor Aymerich) -->
            <path d="M58 510 L70 110 L86 110 L98 510 Z" fill="${colorAcento}" opacity="0.88"/>
            <rect x="66" y="102" width="24" height="10" rx="2" fill="${colorAcento}"/>
            <rect x="68" y="122" width="20" height="4" fill="#ffffff" opacity="0.45"/>
            <rect x="65" y="210" width="26" height="5" fill="${colorAcento}"/>
            <rect x="62" y="320" width="32" height="5" fill="${colorAcento}"/>
            <!-- Arcos parabólicos inspirados en Masia Freixa -->
            <path d="M12 510 Q42 405 78 510" fill="none" stroke="${colorAcento}" stroke-width="5" opacity="0.65"/>
            <path d="M78 510 Q125 385 172 510" fill="none" stroke="${colorAcento}" stroke-width="6" opacity="0.75"/>
            <path d="M26 510 Q50 435 78 510" fill="${colorAcento}" opacity="0.16"/>
            <path d="M90 510 Q125 415 160 510" fill="${colorAcento}" opacity="0.22"/>
            <!-- Naves modernistas diente de sierra -->
            <path d="M105 445 L105 410 L132 435 L132 410 L160 435 L160 410 L188 435 L188 510 L105 510 Z" fill="${colorAcento}" opacity="0.35"/>
        </svg>`;
    }
    // Barcelona: Torres Sagrada Familia
    if (c.includes('barcelona')) {
        return `<svg viewBox="0 0 220 520" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
            <path d="M45 510 L58 140 L66 115 L74 140 L87 510 Z" fill="${colorAcento}" opacity="0.85"/>
            <path d="M92 510 L106 90 L115 60 L124 90 L138 510 Z" fill="${colorAcento}" opacity="0.92"/>
            <path d="M142 510 L154 155 L162 130 L170 155 L182 510 Z" fill="${colorAcento}" opacity="0.80"/>
            <circle cx="115" cy="52" r="6" fill="${colorAcento}"/>
            <path d="M35 510 L35 370 Q115 320 195 370 L195 510 Z" fill="${colorAcento}" opacity="0.25"/>
        </svg>`;
    }
    // Madrid: Puerta de Alcalá / Torres
    if (c.includes('madrid')) {
        return `<svg viewBox="0 0 220 520" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
            <path d="M40 510 L40 240 L75 180 L110 240 L110 510 Z" fill="${colorAcento}" opacity="0.85"/>
            <path d="M120 510 L120 150 L155 110 L190 150 L190 510 Z" fill="${colorAcento}" opacity="0.72"/>
            <path d="M20 510 L20 390 L200 390 L200 510 Z" fill="${colorAcento}" opacity="0.30"/>
            <path d="M45 510 L45 435 A22 22 0 0 1 89 435 L89 510 Z" fill="#ffffff" opacity="0.75"/>
            <path d="M125 510 L125 435 A22 22 0 0 1 169 435 L169 510 Z" fill="#ffffff" opacity="0.75"/>
        </svg>`;
    }
    // Skyline arquitectónico mediterráneo genérico elegante (para cualquier ciudad)
    return `<svg viewBox="0 0 220 520" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <!-- Torre campanario / reloj municipal estilizada -->
        <path d="M56 510 L64 145 L88 145 L96 510 Z" fill="${colorAcento}" opacity="0.86"/>
        <polygon points="60,145 76,95 92,145" fill="${colorAcento}"/>
        <circle cx="76" cy="175" r="8" fill="#ffffff" opacity="0.85"/>
        <!-- Edificios históricos con tejados a dos aguas y arcos -->
        <path d="M16 510 L16 360 L54 330 L92 360 L92 510 Z" fill="${colorAcento}" opacity="0.45"/>
        <path d="M98 510 L98 315 L142 280 L186 315 L186 510 Z" fill="${colorAcento}" opacity="0.62"/>
        <path d="M122 510 L122 435 A20 20 0 0 1 162 435 L162 510 Z" fill="#ffffff" opacity="0.7"/>
        <path d="M36 510 L36 445 A16 16 0 0 1 68 445 L68 510 Z" fill="#ffffff" opacity="0.7"/>
    </svg>`;
}


function exportarFacturaXML(id) {
    const f = state.ingresos.find(x => x.id === id);
    if (!f) return;
    const cli = state.clientes.find(c => String(c.id) === String(f.clienteId)) || {};
    descargarXMLFacturae(f, state.perfil, cli);
}

function generarFacturaPDF(id) {
    const f = state.ingresos.find(x => x.id === id);
    if (!f) return;
    const cli = state.clientes.find(c => String(c.id) === String(f.clienteId)) || {};
    const lineas = Array.isArray(f.lineas) && f.lineas.length
        ? f.lineas
        : [{ descripcion: 'Prestación de servicios profesionales / actividad económica', cantidad: 1, precio: f.base, iva: f.base > 0 ? Math.round((f.iva / f.base) * 100) : 21 }];

    // Desglose legal de IVA por tipos (Art. 6.1.h RD 1619/2012)
    const desgloseIva = {};
    lineas.forEach(l => {
        const sub = (Number(l.cantidad) || 1) * (Number(l.precio) || 0);
        const tipo = Number(l.iva) || 0;
        if (!desgloseIva[tipo]) desgloseIva[tipo] = { base: 0, cuota: 0 };
        desgloseIva[tipo].base += sub;
        desgloseIva[tipo].cuota += sub * tipo / 100;
    });

    const filasConceptos = lineas.map(l => {
        const sub = (Number(l.cantidad) || 1) * (Number(l.precio) || 0);
        return `<tr>
            <td class="col-cant">${Number(l.cantidad).toLocaleString('es-ES')}</td>
            <td class="col-desc">${l.descripcion} <span class="iva-tag">(IVA ${l.iva}%)</span></td>
            <td class="col-num">${formatEur(l.precio)}</td>
            <td class="col-num font-bold">${formatEur(sub)}</td>
        </tr>`;
    }).join('');

    const filasDesglose = Object.entries(desgloseIva).map(([tipo, vals]) => `
        <tr>
            <td>Base ${tipo}%: ${formatEur(vals.base)}</td>
            <td style="text-align:right;">Cuota: ${formatEur(vals.cuota)}</td>
        </tr>
    `).join('');

    const nombreEmisor = state.perfil.nombre || 'Mi Actividad Profesional';
    const iniciales = nombreEmisor.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
    const colorPizarra = '#5c7684';
    const ciudadActual = state.perfil.ciudad || 'España';
    const siluetaCiudad = obtenerSiluetaCiudadSVG(ciudadActual, colorPizarra);

    const w = window.open('', '_blank');
    if (!w) { alert('Permite las ventanas emergentes para visualizar e imprimir la factura.'); return; }

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Factura ${f.numero} - ${nombreEmisor}</title>
<style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
        margin: 0;
        padding: 0;
        background: #e2e8f0;
        font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
        color: #334155;
        font-size: 11px;
        line-height: 1.5;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .page-a4 {
        position: relative;
        width: 210mm;
        height: 297mm;
        margin: 15px auto;
        background: #ffffff;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
        overflow: hidden;
    }
    /* Ilustración arquitectónica lateral izquierda anclada al zócalo inferior */
    .left-illustration {
        position: absolute;
        left: 6mm;
        bottom: 9mm;
        width: 54mm;
        height: 142mm;
        pointer-events: none;
        z-index: 1;
    }
    .city-horizon-bg {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 9mm;
        height: 42mm;
        background-image: repeating-linear-gradient(
            90deg,
            rgba(92, 118, 132, 0.035) 0px,
            rgba(92, 118, 132, 0.035) 38px,
            transparent 38px,
            transparent 46px
        );
        border-top: 1px dashed rgba(92, 118, 132, 0.14);
        pointer-events: none;
        z-index: 0;
    }
    /* Zócalo sólido al borde inferior de la hoja */
    .bottom-plinth {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 9mm;
        background: ${colorPizarra};
        z-index: 4;
    }

    /* Contenedor superior: empieza arriba y ocupa el cuerpo natural sin centrarse */
    .top-body {
        position: relative;
        z-index: 2;
        padding: 16mm 18mm 0 18mm;
    }
    .letterhead {
        display: flex;
        align-items: center;
        gap: 15px;
        padding-bottom: 13px;
        border-bottom: 1px solid #cbd5e1;
        margin-bottom: 22px;
    }
    .monogram {
        width: 46px;
        height: 46px;
        border: 1.5px solid ${colorPizarra};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 17px;
        font-weight: bold;
        color: ${colorPizarra};
        letter-spacing: 1px;
        flex-shrink: 0;
    }
    .brand-info h1 {
        margin: 0;
        font-size: 19px;
        font-weight: 600;
        color: ${colorPizarra};
        letter-spacing: 0.3px;
    }
    .brand-info p {
        margin: 2px 0 0 0;
        font-size: 10.5px;
        color: #64748b;
    }
    .doc-badge {
        margin-left: auto;
        text-align: right;
    }
    .doc-badge span {
        display: inline-block;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: ${colorPizarra};
        border: 1.5px solid ${colorPizarra};
        padding: 4px 12px;
        border-radius: 3px;
    }

    /* Bloque de datos y tabla */
    .main-grid {
        padding-left: 34mm;
    }
    .meta-parties {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 24px;
    }
    .client-block {
        width: 54%;
    }
    .section-label {
        font-size: 10.5px;
        font-weight: 700;
        color: ${colorPizarra};
        margin-bottom: 5px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
    }
    .client-block p {
        margin: 2px 0;
        font-size: 11px;
        color: #334155;
    }
    .invoice-meta {
        width: 44%;
        font-size: 11px;
    }
    .meta-row {
        display: flex;
        justify-content: space-between;
        padding: 3px 0;
        border-bottom: 1px dotted #e2e8f0;
    }
    .meta-row span:first-child {
        color: ${colorPizarra};
        font-weight: 600;
    }
    .meta-row span:last-child {
        font-weight: 700;
        color: #1e293b;
    }

    table.items {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 18px;
    }
    table.items th {
        color: ${colorPizarra};
        font-size: 10.5px;
        font-weight: 700;
        padding: 8px 6px;
        border-bottom: 1.5px solid ${colorPizarra};
        text-align: left;
    }
    table.items td {
        padding: 9px 6px;
        border-bottom: 1px solid #f1f5f9;
        color: #334155;
        vertical-align: top;
    }
    .col-cant { width: 12%; text-align: left; }
    .col-desc { width: 52%; }
    .col-num { width: 18%; text-align: right !important; white-space: nowrap; }
    .iva-tag { font-size: 9.5px; color: #94a3b8; margin-left: 4px; }
    .font-bold { font-weight: 700; color: #0f172a; }

    .totals-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-top: 8px;
    }
    .iva-breakdown {
        width: 48%;
        font-size: 9.5px;
        color: #64748b;
    }
    .iva-breakdown table { width: 100%; border-collapse: collapse; }
    .iva-breakdown td { padding: 2px 0; }

    .totals-box {
        width: 48%;
    }
    .tot-line {
        display: flex;
        justify-content: space-between;
        padding: 4px 6px;
        font-size: 11px;
    }
    .tot-line span:first-child {
        color: ${colorPizarra};
        font-weight: 600;
    }
    .tot-line span:last-child {
        font-weight: 700;
        color: #1e293b;
    }
    .tot-grand {
        display: flex;
        justify-content: space-between;
        padding: 8px 6px;
        margin-top: 4px;
        border-top: 1.5px solid ${colorPizarra};
        font-size: 14px;
        font-weight: 800;
    }
    .tot-grand span:first-child { color: ${colorPizarra}; }
    .tot-grand span:last-child { color: #0f172a; }

    .signature-area {
        margin-top: 22px;
        text-align: right;
        padding-right: 10px;
    }
    .signature-script {
        font-family: 'Brush Script MT', 'Segoe Script', Georgia, cursive;
        font-size: 25px;
        color: #1e293b;
        transform: rotate(-3deg);
        display: inline-block;
        border-bottom: 1px solid #cbd5e1;
        padding: 0 14px 2px;
    }
    .signature-caption {
        font-size: 9px;
        color: #94a3b8;
        margin-top: 3px;
    }

    /* BLOQUE INFERIOR FIJO EN EL BOTTOM DE LA HOJA A4 */
    .bottom-docked-footer {
        position: absolute;
        left: 52mm;
        right: 18mm;
        bottom: 13mm;
        z-index: 3;
        border-top: 1px solid #cbd5e1;
        padding-top: 10px;
        font-size: 10px;
    }
    .payment-grid {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 8px;
    }
    .payment-col h4 {
        margin: 0 0 3px 0;
        color: ${colorPizarra};
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
    }
    .payment-col p {
        margin: 1.5px 0;
        color: #475569;
    }
    .legal-note {
        margin: 6px 0 0 0;
        padding-top: 6px;
        border-top: 1px dashed #e2e8f0;
        font-size: 8.5px;
        color: #64748b;
        line-height: 1.35;
    }

    @media print {
        body { background: white; }
        .page-a4 { margin: 0; box-shadow: none; width: 210mm; height: 297mm; }
    }
</style>
</head>
<body>
<div class="page-a4">
    <div class="city-horizon-bg"></div>
    <div class="left-illustration">${siluetaCiudad}</div>

    <!-- PARTE SUPERIOR Y CUERPO (EMPIEZA ARRIBA) -->
    <div class="top-body">
        <header class="letterhead">
            <div class="monogram">${iniciales}</div>
            <div class="brand-info">
                <h1>${nombreEmisor}</h1>
                <p>NIF: ${state.perfil.nif || '—'} &nbsp;·&nbsp; ${state.perfil.direccion || ciudadActual}</p>
                <p>${state.perfil.telefono ? 'Tel. ' + state.perfil.telefono + ' · ' : ''}${state.perfil.iae || 'Actividad Económica'}</p>
            </div>
            <div style="margin-left:auto;display:flex;align-items:center;gap:12px;">
                <div style="text-align:right;">
                    <div class="doc-badge"><span>Factura</span></div>
                    <div style="font-size:8px;color:#64748b;margin-top:4px;font-weight:600;">QR Tributario · Veri*factu</div>
                </div>
                <div style="width:68px;height:68px;border:1px solid #cbd5e1;padding:3px;background:#fff;border-radius:4px;display:flex;align-items:center;justify-content:center;">
                    ${generarQRTributarioSVG(f.verifactu?.urlCotejoAEAT || ('https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=' + encodeURIComponent(state.perfil.nif||'') + '&numserie=' + encodeURIComponent(f.numero) + '&fecha=' + encodeURIComponent(f.fecha) + '&importe=' + Number(f.total||0).toFixed(2)))}
                </div>
            </div>
        </header>

        <div class="main-grid">
            <div class="meta-parties">
                <div class="client-block">
                    <div class="section-label">Facturar a</div>
                    <p class="font-bold" style="font-size:12px;">${cli.nombre || f.cliente}</p>
                    <p>NIF / CIF: ${cli.nif || f.nif || '—'}</p>
                    <p>${cli.direccion || f.clienteDireccion || ''}</p>
                    <p>${cli.email || ''}</p>
                </div>
                <div class="invoice-meta">
                    <div class="meta-row"><span>Nº de factura</span><span>${f.numero}</span></div>
                    <div class="meta-row"><span>Fecha expedición</span><span>${fechaLocal(f.fecha)}</span></div>
                    <div class="meta-row"><span>Fecha operación</span><span>${fechaLocal(f.fecha)}</span></div>
                    <div class="meta-row"><span>Trimestre fiscal</span><span>${f.trimestre}T · 2026</span></div>
                </div>
            </div>

            <table class="items">
                <thead>
                    <tr>
                        <th class="col-cant">Cant.</th>
                        <th class="col-desc">Descripción</th>
                        <th class="col-num">Precio unitario</th>
                        <th class="col-num">Importe</th>
                    </tr>
                </thead>
                <tbody>${filasConceptos}</tbody>
            </table>

            <div class="totals-section">
                <div class="iva-breakdown">
                    <div style="font-weight:700;color:${colorPizarra};margin-bottom:3px;">Desglose fiscal</div>
                    <table>${filasDesglose}</table>
                </div>
                <div class="totals-box">
                    <div class="tot-line"><span>Subtotal</span><span>${formatEur(f.base)}</span></div>
                    <div class="tot-line"><span>IVA repercutido</span><span>${formatEur(f.iva)}</span></div>
                    ${Number(f.retencion) > 0 ? `<div class="tot-line"><span>Retención IRPF (${f.retencionPct || 15}%)</span><span style="color:#be123c;">-${formatEur(f.retencion)}</span></div>` : ''}
                    <div class="tot-grand"><span>Total Factura</span><span>${formatEur(f.total)}</span></div>
                </div>
            </div>

            <div class="signature-area">
                <div class="signature-script">${nombreEmisor}</div>
                <div class="signature-caption">Sello y firma del expedidor</div>
            </div>
        </div>
    </div>

    <!-- PARTE INFERIOR ANCLADA AL BOTTOM DEL A4 -->
    <footer class="bottom-docked-footer">
        <div class="payment-grid">
            <div class="payment-col">
                <h4>Condiciones y forma de pago</h4>
                <p>Transferencia bancaria · Vencimiento a 30 días.</p>
                <p><strong>Titular:</strong> ${nombreEmisor}</p>
            </div>
            <div class="payment-col" style="text-align:right;">
                <h4>Datos bancarios</h4>
                <p><strong>IBAN:</strong> <span style="font-family:monospace;">${state.perfil.iban || 'No especificado en perfil'}</span></p>
                <p><strong>Ref. pago:</strong> ${f.numero}</p>
            </div>
        </div>
        <p class="legal-note">
            Factura expedida conforme al RD 1619/2012 y trazabilidad RD 1007/2023 (Veri*factu).
            ${f.verifactu ? `<br><span style="font-family:monospace;font-size:7.5px;color:#475569;">Huella SHA-256: ${f.verifactu.hashActual}</span>` : ''}
        </p>
    </footer>

    <div class="bottom-plinth"></div>
</div>
<script>window.onload = function() { setTimeout(function(){ window.print(); }, 250); };<\/script>
</body>
</html>`);
    w.document.close();
}

function exportJSON() {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Mi_Autonomo_Backup_${new Date().toISOString().slice(0, 10)}.json`; a.click();
}

function importJSON() {
    const file = document.getElementById('backup-file').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (data && data.perfil && Array.isArray(data.ingresos)) { state = data; saveStorage(); alert('Copia restaurada.'); }
        } catch (e) { alert('Archivo inválido.'); }
    };
    reader.readAsText(file);
}

/* Exponer funciones globales requeridas por los atributos onclick/onsubmit del HTML */
Object.assign(window, {
    switchTab,
    instalarPWA,
    toggleQuickActions,
    abrirOnboarding,
    cerrarOnboarding,
    filtrarEpigrafesIAE,
    seleccionarIAE,
    actualizarTextoTributacion,
    guardarOnboarding,
    continuarSinEpigrafe,
    openCompraModal,
    iniciarEscaneoDocumento,
    manejarArchivoOCR,
    closeCompraModal,
    actualizarResumenCompra,
    saveCompra,
    deleteGasto,
    marcarPagadoRapido,
    openIngresoModal,
    closeIngresoModal,
    anadirLineaFactura,
    actualizarTotalesFactura,
    saveIngreso,
    deleteIngreso,
    marcarCobradoRapido,
    generarFacturaPDF,
    exportarFacturaXML,
    openClienteModal,
    closeClienteModal,
    saveCliente,
    eliminarCliente,
    nuevoClienteDesdeFactura,
    renderClientes,
    abrirModalPresupuesto,
    cerrarModalPresupuesto,
    anadirLineaPresupuesto,
    calcularPresupuesto,
    guardarPresupuesto,
    convertirPresupuesto,
    savePerfil,
    updateAEATView,
    descargarImpresoPDF,
    exportJSON,
    importJSON,
    abrirAdjuntoIDB,
    autoTrimestre,
    renderAnalisisEconomico: () => renderAnalisisEconomicoCharts(state)
});
