/* ================= MOTOR DE ESCANEO OCR 100% LOCAL (TESSERACT.JS + PDF.JS) ================= */
let tesseractCargado = false;
let pdfjsCargado = false;

function cargarScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
        document.head.appendChild(s);
    });
}

async function asegurarMotoresOCR(onProgress) {
    if (!tesseractCargado) {
        onProgress?.(10, 'Cargando motor OCR local (Tesseract)...');
        await cargarScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
        tesseractCargado = true;
    }
    if (!pdfjsCargado) {
        onProgress?.(20, 'Cargando lector PDF local...');
        await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        pdfjsCargado = true;
    }
}

async function extraerTextoDePDF(file, onProgress) {
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    let textoTotal = '';

    for (let p = 1; p <= Math.min(pdf.numPages, 2); p++) {
        onProgress?.(35 + p * 15, `Leyendo página ${p} del PDF...`);
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        textoTotal += content.items.map(item => item.str).join(' ') + '\n';
    }

    if (textoTotal.trim().length < 25) {
        onProgress?.(55, 'PDF escaneado detectado. Aplicando OCR óptico...');
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        return await ejecutarTesseract(canvas, onProgress);
    }

    return textoTotal;
}

async function ejecutarTesseract(imagenOFile, onProgress) {
    const worker = await window.Tesseract.createWorker('spa', 1, {
        logger: m => {
            if (m.status === 'recognizing text') {
                const pct = Math.round(40 + (m.progress * 55));
                onProgress?.(pct, `Reconociendo texto: ${Math.round(m.progress * 100)}%`);
            }
        }
    });
    const { data: { text } } = await worker.recognize(imagenOFile);
    await worker.terminate();
    return text;
}

export async function procesarDocumentoOCR(file, onProgress) {
    await asegurarMotoresOCR(onProgress);
    let textoExtraido = '';

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        textoExtraido = await extraerTextoDePDF(file, onProgress);
    } else {
        onProgress?.(35, 'Analizando imagen con OCR local...');
        textoExtraido = await ejecutarTesseract(file, onProgress);
    }

    onProgress?.(98, 'Extrayendo campos fiscales...');
    const datos = analizarTextoFacturaEspana(textoExtraido);
    onProgress?.(100, 'Lectura completada');
    return { ...datos, textoRaw: textoExtraido };
}

export function analizarTextoFacturaEspana(textoRaw) {
    const lineas = String(textoRaw || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const textoUpper = lineas.join('\n').toUpperCase();

    const nifsEncontrados = [...textoUpper.matchAll(/\b([A-HJNP-SUVW]\d{7}[0-9A-J]|\d{8}[A-Z])\b/g)].map(m => m[1]);
    const nif = nifsEncontrados.length ? nifsEncontrados[0] : '';

    let proveedor = '';
    for (let i = 0; i < Math.min(lineas.length, 6); i++) {
        const l = lineas[i];
        if (l.length > 3 && !/^(FACTURA|TICKET|SIMPLIFICADA|FECHA|NIF|CIF|TOTAL|BASE|IVA)/i.test(l) && !/^\d+[\/\-]\d+/.test(l)) {
            proveedor = l.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ.,&\-\s]/g, '').trim();
            break;
        }
    }

    let numFactura = '';
    const matchNum = textoUpper.match(/(?:FACTURA|FRA\.?|N[º°o]\s*FRA|DOCUMENTO)[:\s#-]*([A-Z0-9\-\/]{3,20})/);
    if (matchNum && !/^(FECHA|CLIENTE|NIF|DE)$/.test(matchNum[1])) {
        numFactura = matchNum[1];
    }

    let fechaISO = '';
    const matchFecha = textoUpper.match(/\b(\d{2})[\/\-.](\d{2})[\/\-.](20\d{2})\b/);
    if (matchFecha) {
        fechaISO = `${matchFecha[3]}-${matchFecha[2]}-${matchFecha[1]}`;
    }

    let ivaPct = 21;
    if (/\b10(?:[.,]00)?\s*%/.test(textoUpper)) ivaPct = 10;
    else if (/\b4(?:[.,]00)?\s*%/.test(textoUpper)) ivaPct = 4;
    else if (/EXENTO|0(?:[.,]00)?\s*%/.test(textoUpper)) ivaPct = 0;

    let total = 0;
    const matchTotalExplicit = textoUpper.match(/(?:TOTAL\s*(?:FACTURA|A\s*PAGAR|EUR|€)?|IMPORTE\s*TOTAL)[:\s]*(\d{1,6}[.,]\d{2})/);
    if (matchTotalExplicit) {
        total = parseFloat(matchTotalExplicit[1].replace(',', '.'));
    } else {
        const todosImportes = [...textoUpper.matchAll(/(\d{1,6}[.,]\d{2})\s*€?/g)]
            .map(m => parseFloat(m[1].replace(',', '.')))
            .filter(n => !isNaN(n) && n > 0 && n < 500000)
            .sort((a, b) => b - a);
        total = todosImportes.length ? todosImportes[0] : 0;
    }

    let base = 0;
    const matchBaseExplicit = textoUpper.match(/(?:BASE\s*IMPONIBLE|SUBTOTAL|NETO)[:\s]*(\d{1,6}[.,]\d{2})/);
    if (matchBaseExplicit) {
        base = parseFloat(matchBaseExplicit[1].replace(',', '.'));
    } else if (total > 0) {
        base = Math.round((total / (1 + ivaPct / 100)) * 100) / 100;
    }

    let categoriaSugerida = 'OTROS GASTOS';
    if (/ENDESA|IBERDROLA|NATURGY|VODAFONE|MOVISTAR|ORANGE|DIGI|AGUA|LUZ|TELEFON|INTERNET/.test(textoUpper)) {
        categoriaSugerida = 'SUMINISTROS (LUZ, AGUA, INTERNET)';
    } else if (/REPSOL|CEPSA|BP|GALP|GASOLIN|ESTACION DE SERVICIO|CARBURANT|PEAJE|PARKING/.test(textoUpper)) {
        categoriaSugerida = 'TRANSPORTE Y COMBUSTIBLE';
    } else if (/SEGURIDAD SOCIAL|TESORERIA|RETA|AUTONOMO/.test(textoUpper)) {
        categoriaSugerida = 'SEGURIDAD SOCIAL (RETA)';
    } else if (/ALQUILER|ARRENDAMIENTO|INMOBILIARIA/.test(textoUpper)) {
        categoriaSugerida = 'ALQUILER LOCAL/OFICINA';
    } else if (/ASESOR|GESTORIA|NOTARIA|ABOGAD/.test(textoUpper)) {
        categoriaSugerida = 'SERV. PROF. INDEPENDIENTES (GESTORÍA)';
    } else if (/SEGURO|MAPFRE|ALLIANZ|AXA|MUTUA|OCCIDENT/.test(textoUpper)) {
        categoriaSugerida = 'SEGUROS';
    } else if (/AMAZON|GOOGLE|META|MICROSOFT|ADOBE|HOSTING|DOMINIO/.test(textoUpper)) {
        categoriaSugerida = 'PUBLICIDAD Y SOFTWARE';
    }

    return {
        proveedor,
        nif,
        numFactura,
        fecha: fechaISO,
        base,
        ivaPct,
        total,
        categoriaSugerida
    };
}
