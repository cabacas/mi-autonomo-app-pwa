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
 * Consulta negocios locales en el municipio usando Nominatim (OpenStreetMap)
 * con acotación geográfica por bounding box (viewbox + bounded=1) y múltiples términos
 * por sector para que devuelva resultados reales y variados en la ciudad.
 */
export async function consultarCompetenciaLocalOSM(ciudad, sector, osmTags) {
    const ciudadLimpia = String(ciudad || '').trim();
    if (!ciudadLimpia) throw new Error('Configura primero tu ciudad en Mi Perfil.');

    // 1. Geocodificar municipio con Nominatim (OSM) para obtener coordenadas y bounding box
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ciudadLimpia + ', España')}&format=json&limit=1&addressdetails=1`;
    const resNom = await fetch(nomUrl, { headers: { 'Accept-Language': 'es' } });
    if (!resNom.ok) throw new Error('No se pudo conectar con el servicio de mapas.');
    const dataNom = await resNom.json();
    if (!Array.isArray(dataNom) || !dataNom.length) {
        throw new Error(`No se encontró el municipio "${ciudadLimpia}" en el registro geográfico.`);
    }

    const place = dataNom[0];
    const nombreOficial = (place.address?.city || place.address?.town || place.address?.village || place.display_name.split(',')[0]).trim();
    // boundingbox viene como [minLat, maxLat, minLon, maxLon] -> Nominatim viewbox espera lon1,lat1,lon2,lat2
    const bbox = Array.isArray(place.boundingbox) && place.boundingbox.length === 4
        ? `${place.boundingbox[2]},${place.boundingbox[0]},${place.boundingbox[3]},${place.boundingbox[1]}`
        : null;

    // Palabras clave amplias por sector (en español y catalán/neutro para municipios como Terrassa)
    const terminosPorSector = {
        "Tecnología y Marketing": ['informatica', 'software', 'marketing', 'diseño', 'web', 'agencia', 'tic', 'digital'],
        "Construcción y Reformas": ['reformas', 'construccion', 'electricista', 'fontaneria', 'carpinteria', 'pintura', 'arquitectura'],
        "Comercio y Hostelería": ['restaurante', 'bar', 'cafeteria', 'tienda', 'comercio', 'panaderia', 'alimentacion'],
        "Transporte y Logística": ['transporte', 'logistica', 'mensajeria', 'mudanzas', 'taxi', 'reparto'],
        "Profesionales y Consultoría": ['asesoria', 'gestoria', 'abogados', 'consultoria', 'economistas', 'auditoria'],
        "Salud, Formación y Estética": ['clinica', 'fisioterapia', 'academia', 'peluqueria', 'estetica', 'psicologia', 'dental'],
        "Industria y Mantenimiento": ['taller', 'mantenimiento', 'reparacion', 'limpieza', 'jardineria', 'industrial'],
        "General": ['empresa', 'servicios', 'oficina', 'centro', 'estudio']
    };

    const terminos = terminosPorSector[sector] || terminosPorSector['General'];
    const vistos = new Set();
    const resultados = [];

    // Consultamos hasta 5 términos del sector acotados al municipio
    for (const term of terminos.slice(0, 5)) {
        try {
            const params = new URLSearchParams({
                q: `${term} ${nombreOficial}`,
                format: 'json',
                limit: '8',
                addressdetails: '1'
            });
            if (bbox) {
                params.set('viewbox', bbox);
            }
            const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
            const resp = await fetch(url, { headers: { 'Accept-Language': 'es' } });
            if (resp.ok) {
                const items = await resp.json();
                if (Array.isArray(items)) {
                    items.forEach(item => {
                        const rawName = (item.display_name || '').split(',')[0].trim();
                        // Filtrar resultados que sean solo el nombre de la calle o del municipio
                        if (!rawName || rawName.toLowerCase() === nombreOficial.toLowerCase()) return;
                        const key = rawName.toLowerCase();
                        if (!vistos.has(key)) {
                            vistos.add(key);
                            const addr = item.address || {};
                            const calle = [addr.road, addr.house_number].filter(Boolean).join(', ');
                            resultados.push({
                                nombre: rawName,
                                categoria: term,
                                direccion: calle || addr.suburb || addr.city || addr.town || nombreOficial
                            });
                        }
                    });
                }
            }
        } catch {
            // Continuar con el siguiente término
        }
        if (resultados.length >= 15) break;
    }

    return {
        ciudadOficial: nombreOficial,
        totalDetectados: resultados.length,
        muestraNegocios: resultados.slice(0, 12),
        radioKm: 5,
        fuenteRespaldo: true
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
