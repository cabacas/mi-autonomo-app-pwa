# Mi Autónomo — Gestor Fiscal y Contabilidad (PWA Local-First)

Aplicación web progresiva (PWA) orientada a autónomos en España para llevar el control de facturación, compras/gastos, presupuestos, clientes, tesorería y borradores de modelos fiscales (303, 130 y 390) con almacenamiento local en el navegador.

## 1. Arquitectura y almacenamiento local
- **Datos estructurados:** Se guardan en `localStorage` (`gestor_fiscal_v5`), incluyendo perfil fiscal, clientes, facturas emitidas/rectificativas, compras/gastos, presupuestos y ejercicio activo.
- **Documentos adjuntos (PDF / Imágenes):** Se almacenan en `IndexedDB` (`MiAutonomoDB_v1`, almacén `adjuntos`), evitando el límite de tamaño de `localStorage`. Al eliminar un gasto, su adjunto asociado también se borra de `IndexedDB`.
- **Modo Offline (Service Worker):** `sw.js` cachea el shell de la aplicación para permitir su apertura y consulta sin conexión.

## 2. Copias de seguridad y recuperación
1. **Exportar copia completa:** En **Mi perfil y copias -> Copias de Seguridad y Almacenamiento**, pulsa **Exportar copia (.json)**. Se genera un archivo que incluye tanto el estado contable como los adjuntos binarios codificados en Base64 (`adjuntosIDB`).
2. **Restaurar copia:** Selecciona el archivo `.json` en el selector de restauración y pulsa **Restaurar**. La aplicación reconstruye los registros y reinyecta los adjuntos en `IndexedDB`.
3. **Cambio de dispositivo o navegador:** Al ser un sistema local-first sin base de datos centralizada, exporta siempre una copia `.json` antes de limpiar datos del navegador o cambiar de equipo.

## 3. Ejercicios fiscales, amortizaciones y facturación
- **Selector de ejercicio:** Permite cambiar entre ejercicios (`2025`, `2026`, `2027`) para aislar los cálculos de ingresos, gastos, cierres trimestrales y modelos `303`, `130` y `390`, adaptando también la numeración correlativa (`F-YYYY-XXXX` y `P-YYYY-XXXX`).
- **Bienes de inversión y amortización:** Al registrar o editar una compra/gasto, puedes marcar **Bien de inversión / Inmovilizado amortizable** e indicar su **vida útil en años** para imputar la cuota de amortización trimestral correspondiente en el rendimiento neto.
- **Trazabilidad y rectificación:** Las facturas emitidas generan huella `SHA-256` encadenada, código QR de cotejo y exportación `Facturae 3.2.2` (`XML`). Para anular una factura emitida sin romper la cadena, utiliza **Emitir Factura Rectificativa** (`R-YYYY-XXXX`).
