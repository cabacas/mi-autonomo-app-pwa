/* ================= EVALUADOR DE POSICIONAMIENTO SECTORIAL Y COMPETENCIA LOCAL (FASE 3) ================= */
import { formatEur } from './fiscal.js';

// Benchmarks estadísticos por sector / epígrafe IAE (basados en medias AEAT / INE para autónomos en España)
const BENCHMARKS_SECTOR = {
    "Tecnología y Marketing": {
        facturacionTrimestralMedia: 9800,
        ratioGastosPct: 28,
        margenNetoPct: 72,
        ticketMedio: 1150,
        osmTags: '["office"~"it|company|advertising|coworking"]',
        keywordsLocal: ['informatica', 'software', 'marketing', 'diseño', 'web', 'consultoria']
    },
    "Construcción y Reformas": {
        facturacionTrimestralMedia: 14500,
        ratioGastosPct: 54,
        margenNetoPct: 46,
        ticketMedio: 1850,
        osmTags: '["craft"~"electrician|plumber|carpenter|painter|builder"]',
        keywordsLocal: ['reformas', 'electricista', 'fontaneria', 'construccion', 'carpinteria', 'pintura']
    },
    "Comercio y Hostelería": {
        facturacionTrimestralMedia: 18200,
        ratioGastosPct: 68,
        margenNetoPct: 32,
        ticketMedio: 45,
        osmTags: '["shop"~"clothes|bakery|convenience|supermarket|hardware"]["amenity"~"cafe|bar|restaurant"]',
        keywordsLocal: ['comercio', 'tienda', 'bar', 'restaurante', 'cafeteria']
    },
    "Transporte y Logística": {
        facturacionTrimestralMedia: 12600,
        ratioGastosPct: 58,
        margenNetoPct: 42,
        ticketMedio: 320,
        osmTags: '["amenity"="taxi"]["office"="logistics"]',
        keywordsLocal: ['transporte', 'mensajeria', 'logistica', 'mudanzas']
    },
    "Profesionales y Consultoría": {
        facturacionTrimestralMedia: 10500,
        ratioGastosPct: 31,
        margenNetoPct: 69,
        ticketMedio: 650,
        osmTags: '["office"~"lawyer|accountant|tax_advisor|financial|consulting"]',
        keywordsLocal: ['abogado', 'gestoria', 'asesoria', 'consultor']
    },
    "Salud, Formación y Estética": {
        facturacionTrimestralMedia: 8400,
        ratioGastosPct: 36,
        margenNetoPct: 64,
        ticketMedio: 65,
        osmTags: '["amenity"~"clinic|dentist|doctors|school|training"]["shop"~"hairdresser|beauty"]',
        keywordsLocal: ['fisioterapia', 'clinica', 'academia', 'peluqueria', 'estetica']
    },
    "Industria y Mantenimiento": {
        facturacionTrimestralMedia: 13400,
        ratioGastosPct: 52,
        margenNetoPct: 48,
        ticketMedio: 420,
        osmTags: '["shop"="car_repair"]["craft"~"electronics_repair|cleaning|gardener"]',
        keywordsLocal: ['taller', 'reparacion', 'limpieza', 'jardineria', 'mantenimiento']
    },
    "General": {
        facturacionTrimestralMedia: 11200,
        ratioGastosPct: 45,
        margenNetoPct: 55,
        ticketMedio: 580,
        osmTags: '["office"]',
        keywordsLocal: ['servicios', 'empresa', 'profesional']
    }
};

// Coeficiente corrector por tamaño/poder adquisitivo de ciudad/provincia
function obtenerFactorCiudad(ciudadRaw) {
    const c = String(ciudadRaw || '').toLowerCase();
    if (/madrid|barcelona/.test(c)) return 1.22;
    if (/valencia|sevilla|bilbao|malaga|zaragoza/.test(c)) return 1.10;
    if (/terrassa|sabadell|hospitalet|badalona|alicante|murcia|palma|coruña|vigo|gijon|valladolid/.test(c)) return 1.04;
    return 0.94;
}

export function obtenerBenchmarkSectorial(perfil, catalogoIAE) {
    const iaeObj = catalogoIAE.find(x => x.codigo === perfil.iaeCodigo);
    const sector = iaeObj ? iaeObj.sector : 'General';
    const baseBench = BENCHMARKS_SECTOR[sector] || BENCHMARKS_SECTOR['General'];
    const factorCiudad = obtenerFactorCiudad(perfil.ciudad);

    return {
        sector,
        iaeNombre: perfil.iae || 'Régimen General',
        ciudad: perfil.ciudad || 'España (Media Nacional)',
        facturacionTrimestralMedia: Math.round(baseBench.facturacionTrimestralMedia * factorCiudad),
        facturacionAnualMedia: Math.round(baseBench.facturacionTrimestralMedia * factorCiudad * 4),
        ratioGastosPct: baseBench.ratioGastosPct,
        margenNetoPct: baseBench.margenNetoPct,
        ticketMedio: Math.round(baseBench.ticketMedio * factorCiudad),
        osmTags: baseBench.osmTags,
        keywordsLocal: baseBench.keywordsLocal
    };
}

/**
 * Consulta registros públicos abiertos de OpenStreetMap (Nominatim + espejos Overpass con CORS)
 * con fallback automático entre servidores para evitar saturación o bloqueos CORS.
 */
export async function consultarCompetenciaLocalOSM(ciudad, sector, osmTags) {
    const ciudadLimpia = String(ciudad || '').trim();
    if (!ciudadLimpia) throw new Error('Configura primero tu ciudad en Mi Perfil.');

    // 1. Geocodificar municipio con Nominatim (OSM)
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ciudadLimpia + ', España')}&format=json&limit=1`;
    const resNom = await fetch(nomUrl, { headers: { 'Accept-Language': 'es' } });
    if (!resNom.ok) throw new Error('No se pudo conectar con el servicio de mapas.');
    const dataNom = await resNom.json();
    if (!Array.isArray(dataNom) || !dataNom.length) {
        throw new Error(`No se encontró el municipio "${ciudadLimpia}" en el registro geográfico.`);
    }

    const lat = parseFloat(dataNom[0].lat);
    const lon = parseFloat(dataNom[0].lon);
    const nombreOficial = dataNom[0].display_name.split(',')[0];

    // 2. Construir consulta Overpass según sector
    let filtroOverpass = '';
    if (sector === 'Tecnología y Marketing') {
        filtroOverpass = `node["office"~"it|company|advertising"](around:3500,${lat},${lon});way["office"~"it|company|advertising"](around:3500,${lat},${lon});`;
    } else if (sector === 'Construcción y Reformas') {
        filtroOverpass = `node["craft"~"electrician|plumber|carpenter|painter|builder"](around:3500,${lat},${lon});node["office"="architect"](around:3500,${lat},${lon});`;
    } else if (sector === 'Comercio y Hostelería') {
        filtroOverpass = `node["shop"](around:2500,${lat},${lon});node["amenity"~"cafe|bar|restaurant"](around:2500,${lat},${lon});`;
    } else if (sector === 'Profesionales y Consultoría') {
        filtroOverpass = `node["office"~"lawyer|accountant|tax_advisor|financial|consulting"](around:3500,${lat},${lon});`;
    } else if (sector === 'Salud, Formación y Estética') {
        filtroOverpass = `node["amenity"~"clinic|dentist|doctors|school"](around:3500,${lat},${lon});node["shop"~"hairdresser|beauty"](around:3500,${lat},${lon});`;
    } else if (sector === 'Industria y Mantenimiento') {
        filtroOverpass = `node["shop"="car_repair"](around:3500,${lat},${lon});node["craft"~"electronics_repair|cleaning|gardener"](around:3500,${lat},${lon});`;
    } else {
        filtroOverpass = `node["office"](around:3000,${lat},${lon});node["craft"](around:3000,${lat},${lon});`;
    }

    const query = `[out:json][timeout:10];(${filtroOverpass});out center 50;`;

    // Lista de servidores Overpass con soporte CORS (si el principal está saturado/504 sin cabeceras CORS, salta al siguiente)
    const endpointsOverpass = [
        'https://overpass.kumi.systems/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        'https://overpass-api.de/api/interpreter'
    ];

    let elementos = null;
    for (const baseEndpoint of endpointsOverpass) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 9000);
            const resp = await fetch(`${baseEndpoint}?data=${encodeURIComponent(query)}`, {
                signal: controller.signal
            });
            clearTimeout(timer);
            if (resp.ok) {
                const json = await resp.json();
                if (json && Array.isArray(json.elements)) {
                    elementos = json.elements;
                    break;
                }
            }
        } catch {
            // Probar el siguiente espejo Overpass
        }
    }

    // Respaldo secundario con búsqueda Nominatim por palabra clave en la ciudad si todos los espejos Overpass están caídos
    if (!elementos) {
        const kw = (BENCHMARKS_SECTOR[sector]?.keywordsLocal || ['empresa'])[0];
        const fallbackUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(kw + ' ' + nombreOficial)}&format=json&limit=20`;
        const resFb = await fetch(fallbackUrl, { headers: { 'Accept-Language': 'es' } });
        const dataFb = resFb.ok ? await resFb.json() : [];
        const muestraFb = (Array.isArray(dataFb) ? dataFb : []).map(item => ({
            nombre: item.display_name.split(',')[0],
            categoria: sector,
            direccion: item.display_name.split(',').slice(1, 3).join(',').trim() || nombreOficial
        }));
        return {
            ciudadOficial: nombreOficial,
            totalDetectados: muestraFb.length,
            muestraNegocios: muestraFb.slice(0, 12),
            radioKm: 3.5
        };
    }

    const negociosConNombre = [];
    const vistos = new Set();

    elementos.forEach(el => {
        const tags = el.tags || {};
        const nombre = tags.name || tags['name:es'] || tags.operator;
        if (nombre && !vistos.has(nombre.toLowerCase())) {
            vistos.add(nombre.toLowerCase());
            const tipoTag = tags.office || tags.craft || tags.shop || tags.amenity || sector;
            const calle = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ');
            negociosConNombre.push({
                nombre,
                categoria: tipoTag,
                direccion: calle || nombreOficial
            });
        }
    });

    return {
        ciudadOficial: nombreOficial,
        totalDetectados: elementos.length,
        muestraNegocios: negociosConNombre.slice(0, 12),
        radioKm: 3.5
    };
}

export function generarDiagnosticoPosicionamiento(tusMetricas, bench) {
    const puntos = [];

    // 1. Análisis de Margen Operativo
    const diffMargen = tusMetricas.margenNetoPct - bench.margenNetoPct;
    if (tusMetricas.ingresosAnuales === 0) {
        puntos.push({
            tipo: 'info',
            titulo: 'Sin facturación registrada en este ejercicio',
            texto: `Registra tus primeras facturas emitidas para comparar tu margen neto frente al ${bench.margenNetoPct}% habitual en ${bench.sector}.`
        });
    } else if (diffMargen >= 5) {
        puntos.push({
            tipo: 'ok',
            titulo: `Margen neto superior al sector (+${diffMargen.toFixed(1)} puntos)`,
            texto: `Tu margen operativo es del ${tusMetricas.margenNetoPct.toFixed(1)}%, superando la media del ${bench.margenNetoPct}% de los autónomos de ${bench.sector} en ${bench.ciudad}. Tienes una estructura de costes muy eficiente.`
        });
    } else if (diffMargen >= -5) {
        puntos.push({
            tipo: 'ok',
            titulo: 'Margen alineado con la media de tu ciudad',
            texto: `Tu rentabilidad (${tusMetricas.margenNetoPct.toFixed(1)}%) está en la franja estándar del sector (${bench.margenNetoPct}%).`
        });
    } else {
        puntos.push({
            tipo: 'alerta',
            titulo: `Estructura de gastos elevada (${tusMetricas.ratioGastosPct.toFixed(1)}% sobre ingresos)`,
            texto: `Tus gastos absorben el ${tusMetricas.ratioGastosPct.toFixed(1)}% de lo que facturas, frente al ${bench.ratioGastosPct}% habitual en ${bench.sector}. Revisa suministros, suscripciones o tarifas.`
        });
    }

    // 2. Análisis de Ticket Medio por Factura
    if (tusMetricas.numFacturas > 0) {
        if (tusMetricas.ticketMedio >= bench.ticketMedio) {
            puntos.push({
                tipo: 'ok',
                titulo: `Ticket medio competitivo (${formatEur(tusMetricas.ticketMedio)})`,
                texto: `Tu importe medio por factura supera la referencia local de ${formatEur(bench.ticketMedio)} en ${bench.ciudad}.`
            });
        } else {
            puntos.push({
                tipo: 'info',
                titulo: `Ticket medio por debajo de la media local (${formatEur(tusMetricas.ticketMedio)} vs ${formatEur(bench.ticketMedio)})`,
                texto: `Considera agrupar servicios en bonos mensuales o revisar tus tarifas por hora/proyecto para acercarte a la media de ${bench.ciudad}.`
            });
        }
    }

    return puntos;
}
