/* ================= CATÁLOGOS Y ALMACENAMIENTO (LOCALSTORAGE + INDEXEDDB) ================= */
export const CATALOGO_IAE = [
    { codigo: "763", sector: "Tecnología y Marketing", nombre: "Programadores y Analistas de Informática", tipo: "profesional", iva: 21, retencion: 15, modelos: "303, 130" },
    { codigo: "845", sector: "Tecnología y Marketing", nombre: "Explotación electrónica por cuenta de terceros (SaaS / Web)", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "844", sector: "Tecnología y Marketing", nombre: "Servicios de Publicidad, Marketing Digital y RRPP", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "881", sector: "Tecnología y Marketing", nombre: "Diseñadores gráficos, UX/UI y creativos", tipo: "profesional", iva: 21, retencion: 15, modelos: "303, 130" },
    { codigo: "751", sector: "Tecnología y Marketing", nombre: "Profesionales de la publicidad y relaciones públicas", tipo: "profesional", iva: 21, retencion: 15, modelos: "303, 130" },
    { codigo: "961.1", sector: "Tecnología y Marketing", nombre: "Producción y grabación de fotografía y vídeo", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "504.1", sector: "Construcción y Reformas", nombre: "Instalaciones eléctricas en general (Electricistas)", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "504.2", sector: "Construcción y Reformas", nombre: "Instalaciones de fontanería, frío y climatización", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "505.5", sector: "Construcción y Reformas", nombre: "Carpintería, ebanistería y cerrajería", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "505.6", sector: "Construcción y Reformas", nombre: "Pintura, escayola y revestimientos", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "501.3", sector: "Construcción y Reformas", nombre: "Albañilería y pequeños trabajos de construcción", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "411", sector: "Construcción y Reformas", nombre: "Arquitectos", tipo: "profesional", iva: 21, retencion: 15, modelos: "303, 130" },
    { codigo: "421", sector: "Construcción y Reformas", nombre: "Arquitectos técnicos y aparejadores", tipo: "profesional", iva: 21, retencion: 15, modelos: "303, 130" },
    { codigo: "659.9", sector: "Comercio y Hostelería", nombre: "Comercio al por menor (Tienda física / E-commerce)", tipo: "empresarial", iva: 21, retencion: 0, modelos: "130 (Recargo Equivalencia)" },
    { codigo: "651.2", sector: "Comercio y Hostelería", nombre: "Comercio al por menor de prendas de vestir y calzado", tipo: "empresarial", iva: 21, retencion: 0, modelos: "130 (Recargo Equivalencia)" },
    { codigo: "673.2", sector: "Comercio y Hostelería", nombre: "Cafeterías, bares y restauración", tipo: "empresarial", iva: 10, retencion: 0, modelos: "303, 130" },
    { codigo: "671.4", sector: "Comercio y Hostelería", nombre: "Restaurantes de un tenedor", tipo: "empresarial", iva: 10, retencion: 0, modelos: "303, 130" },
    { codigo: "644.1", sector: "Comercio y Hostelería", nombre: "Comercio al por menor de pan, pastelería y confitería", tipo: "empresarial", iva: 10, retencion: 0, modelos: "130 (Recargo Equivalencia)" },
    { codigo: "722", sector: "Transporte y Logística", nombre: "Transporte de mercancías por carretera (Furgoneta/Camión)", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "721.2", sector: "Transporte y Logística", nombre: "Transporte por autotaxis y VTC", tipo: "empresarial", iva: 10, retencion: 0, modelos: "303, 130" },
    { codigo: "849.5", sector: "Transporte y Logística", nombre: "Servicios de mensajería, recadería y reparto", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "731", sector: "Profesionales y Consultoría", nombre: "Abogados", tipo: "profesional", iva: 21, retencion: 15, modelos: "303, 130" },
    { codigo: "741", sector: "Profesionales y Consultoría", nombre: "Economistas, consultores y asesores financieros", tipo: "profesional", iva: 21, retencion: 15, modelos: "303, 130" },
    { codigo: "742", sector: "Profesionales y Consultoría", nombre: "Intérpretes y traductores", tipo: "profesional", iva: 21, retencion: 15, modelos: "303, 130" },
    { codigo: "849.7", sector: "Profesionales y Consultoría", nombre: "Servicios de gestión administrativa y gestoría", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "599", sector: "Profesionales y Consultoría", nombre: "Agentes comerciales y comisionistas", tipo: "profesional", iva: 21, retencion: 15, modelos: "303, 130" },
    { codigo: "826", sector: "Salud, Formación y Estética", nombre: "Personal docente de enseñanzas diversas (Formación)", tipo: "profesional", iva: 0, retencion: 15, modelos: "130 (Exento IVA Art. 20)" },
    { codigo: "836", sector: "Salud, Formación y Estética", nombre: "Fisioterapeutas, ATS y enfermería", tipo: "profesional", iva: 0, retencion: 15, modelos: "130 (Exento IVA Sanidad)" },
    { codigo: "831", sector: "Salud, Formación y Estética", nombre: "Médicos de medicina general y especialistas", tipo: "profesional", iva: 0, retencion: 15, modelos: "130 (Exento IVA Sanidad)" },
    { codigo: "776", sector: "Salud, Formación y Estética", nombre: "Psicólogos", tipo: "profesional", iva: 0, retencion: 15, modelos: "130 (Exento IVA Sanidad)" },
    { codigo: "972.1", sector: "Salud, Formación y Estética", nombre: "Servicios de peluquería de señora y caballero", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "972.2", sector: "Salud, Formación y Estética", nombre: "Salones e institutos de belleza y estética", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "691.2", sector: "Industria y Mantenimiento", nombre: "Reparación de vehículos automóviles y bicicletas", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "691.9", sector: "Industria y Mantenimiento", nombre: "Reparación de ordenadores y equipos electrónicos", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "922", sector: "Industria y Mantenimiento", nombre: "Servicios de limpieza de interiores y edificios", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" },
    { codigo: "911", sector: "Industria y Mantenimiento", nombre: "Servicios agrícolas, ganaderos y jardinería", tipo: "empresarial", iva: 21, retencion: 0, modelos: "303, 130" }
];

export const CATEGORIAS_COMPRAS = [
    "CONSUMOS EXPLOTACIÓN", "SEGURIDAD SOCIAL (RETA)", "ALQUILER LOCAL/OFICINA",
    "REPARACIÓN Y CONSERVACIÓN", "SERV. PROF. INDEPENDIENTES (GESTORÍA)",
    "SUMINISTROS (LUZ, AGUA, INTERNET)", "SEGUROS", "TRANSPORTE Y COMBUSTIBLE",
    "FORMACIÓN", "PUBLICIDAD Y SOFTWARE", "TRIBUTOS Y TASAS", "OTROS GASTOS"
];

const IDB_NAME = 'MiAutonomoDB_v1';
const IDB_STORE = 'adjuntos';

export function abrirIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function guardarAdjuntoIDB(id, file) {
    const db = await abrirIDB();
    const buffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put({
            id,
            nombre: file.name,
            tipo: file.type,
            tamano: file.size,
            data: buffer,
            fecha: new Date().toISOString()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

export async function abrirAdjuntoIDB(id) {
    const db = await abrirIDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(id);
        req.onsuccess = () => {
            const item = req.result;
            if (!item) { alert('No se encontró el archivo en IndexedDB.'); return; }
            const blob = new Blob([item.data], { type: item.tipo || 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            resolve(true);
        };
        req.onerror = () => reject(req.error);
    });
}

export async function contarAdjuntosIDB() {
    try {
        const db = await abrirIDB();
        return new Promise(resolve => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).count();
            req.onsuccess = () => resolve(req.result || 0);
            req.onerror = () => resolve(0);
        });
    } catch { return 0; }
}


export async function eliminarAdjuntoIDB(id) {
    if (!id) return;
    try {
        const db = await abrirIDB();
        return new Promise((resolve) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } catch { return false; }
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

export async function exportarTodosAdjuntosIDB() {
    try {
        const db = await abrirIDB();
        return new Promise((resolve) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).getAll();
            req.onsuccess = () => {
                const items = req.result || [];
                const serializados = items.map(item => ({
                    id: item.id,
                    nombre: item.nombre,
                    tipo: item.tipo,
                    tamano: item.tamano,
                    fecha: item.fecha,
                    dataBase64: item.data ? arrayBufferToBase64(item.data) : null
                }));
                resolve(serializados);
            };
            req.onerror = () => resolve([]);
        });
    } catch { return []; }
}

export async function importarTodosAdjuntosIDB(listaAdjuntos) {
    if (!Array.isArray(listaAdjuntos) || !listaAdjuntos.length) return 0;
    try {
        const db = await abrirIDB();
        return new Promise((resolve) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            let count = 0;
            listaAdjuntos.forEach(item => {
                if (item && item.id && item.dataBase64) {
                    store.put({
                        id: item.id,
                        nombre: item.nombre,
                        tipo: item.tipo,
                        tamano: item.tamano,
                        fecha: item.fecha,
                        data: base64ToArrayBuffer(item.dataBase64)
                    });
                    count++;
                }
            });
            tx.oncomplete = () => resolve(count);
            tx.onerror = () => resolve(0);
        });
    } catch { return 0; }
}

export function getDefaultState() {
    return {
        perfil: {
            nombre: "Rafa Jiménez",
            nif: "12345678A",
            iae: "763 - Programadores y Analistas de Informática",
            iaeCodigo: "763",
            ciudad: "Terrassa",
            ivaDefecto: 21,
            retencionDefecto: 15,
            modelosFiscales: "303, 130",
            onboardingCompletado: false,
            direccion: "Terrassa, Barcelona",
            telefono: "612345678",
            iban: "ES91 2100 0418 4502 0005 4321",
            saldoBanco: 12450.00
        },
        ingresos: [
            { id: 1, numero: "F-2026-0001", fecha: "2026-01-15", clienteId: 101, cliente: "Cliente Alpha SL", nif: "B65432109", base: 2500, trimestre: 1, iva: 525, retencion: 375, retencionPct: 15, total: 2650, estado: "cobrado", movimientosPago: [{id:1, fecha:"2026-02-10", importe:2650}] },
            { id: 2, numero: "F-2026-0002", fecha: "2026-04-10", clienteId: 102, cliente: "Cliente Beta SA", nif: "A98765432", base: 1800, trimestre: 2, iva: 378, retencion: 270, retencionPct: 15, total: 1908, estado: "pendiente", movimientosPago: [] }
        ],
        clientes: [
            { id: 101, nombre: "Cliente Alpha SL", nif: "B65432109", email: "admin@alpha.es", telefono: "937000001" },
            { id: 102, nombre: "Cliente Beta SA", nif: "A98765432", email: "pagos@beta.es", telefono: "937000002" }
        ],
        gastos: [
            { id: 1, tipo: "factura", numFactura: "FRA-9921", nifProveedor: "B60000001", fecha: "2026-01-05", trimestre: 1, proveedor: "Inmobiliaria Terrassa SL", cat: "ALQUILER LOCAL/OFICINA", baseIva: 350, baseIrpf: 350, ivaPct: 21, iva: 73.5, total: 423.5, estado: "pagado", movimientosPago: [{id:1, fecha:"2026-01-05", importe:423.5}] },
            { id: 2, tipo: "factura", numFactura: "END-2026-02", nifProveedor: "A81948077", fecha: "2026-02-12", trimestre: 1, proveedor: "Endesa Energía", cat: "SUMINISTROS (LUZ, AGUA, INTERNET)", baseIva: 95, baseIrpf: 95, ivaPct: 21, iva: 19.95, total: 114.95, estado: "pagado", movimientosPago: [{id:2, fecha:"2026-02-15", importe:114.95}] },
            { id: 3, tipo: "gasto", fecha: "2026-02-28", trimestre: 1, proveedor: "Tesorería Seguridad Social (Cuota RETA)", cat: "SEGURIDAD SOCIAL (RETA)", baseIva: 0, baseIrpf: 310, ivaPct: 0, iva: 0, total: 310, estado: "pagado", movimientosPago: [{id:3, fecha:"2026-02-28", importe:310}] },
            { id: 4, tipo: "gasto", fecha: "2026-04-02", trimestre: 2, proveedor: "Seguro Responsabilidad Civil", cat: "SEGUROS", baseIva: 0, baseIrpf: 185, ivaPct: 0, iva: 0, total: 185, estado: "pagado", movimientosPago: [{id:4, fecha:"2026-04-02", importe:185}] }
        ],
        presupuestos: []
    };
}
