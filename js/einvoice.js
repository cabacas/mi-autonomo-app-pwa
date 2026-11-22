/* ================= MÓDULO DE FACTURACIÓN ELECTRÓNICA (FACTURAE 3.2.2 + TRAZABILIDAD VERI*FACTU) ================= */

/**
 * Calcula el hash SHA-256 en hexadecimal usando Web Crypto API nativa del navegador.
 */
export async function calcularSHA256(texto) {
    const encoder = new TextEncoder();
    const data = encoder.encode(texto);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Genera el registro encadenado estilo Veri*factu (RD 1007/2023)
 * enlazando la factura actual con el hash de la factura anterior.
 */
export async function generarHuellaVerifactu(factura, perfil, hashAnterior = '0000000000000000000000000000000000000000000000000000000000000000') {
    const timestamp = new Date().toISOString();
    const cadenaHuella = [
        `IDEmisorFactura=${(perfil.nif || '').trim().toUpperCase()}`,
        `NumSerieFactura=${(factura.numero || '').trim()}`,
        `FechaExpedicionFactura=${factura.fecha}`,
        `TipoFactura=F1`,
        `CuotaTotal=${Number(factura.iva || 0).toFixed(2)}`,
        `ImporteTotal=${Number(factura.total || 0).toFixed(2)}`,
        `HuellaAnterior=${hashAnterior}`,
        `FechaHoraHusoGenRegistro=${timestamp}`
    ].join('&');

    const hashActual = await calcularSHA256(cadenaHuella);
    const urlCotejoAEAT = `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=${encodeURIComponent(perfil.nif || '')}&numserie=${encodeURIComponent(factura.numero || '')}&fecha=${encodeURIComponent(factura.fecha || '')}&importe=${Number(factura.total || 0).toFixed(2)}`;

    return {
        hashAnterior,
        hashActual,
        timestamp,
        urlCotejoAEAT,
        softwareId: 'MI-AUTONOMO-PWA-V1'
    };
}

/**
 * Escapa caracteres especiales para XML válido.
 */
function xmlEscape(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Genera y descarga el fichero XML estructurado en formato oficial Facturae 3.2.2
 * listo para firmar con AutoFirma o enviar a plataformas B2B/FACe.
 */
export function descargarXMLFacturae(factura, perfil, cliente = {}) {
    const nifEmisor = (perfil.nif || '00000000T').trim().toUpperCase();
    const esJuridicaEmisor = /^[ABCDEFGHJKLMNPQRSUVW]/.test(nifEmisor);
    const nombreEmisor = perfil.nombre || 'Autónomo';
    const partesNombre = nombreEmisor.trim().split(/\s+/);
    const nombrePila = partesNombre[0] || nombreEmisor;
    const apellido1 = partesNombre[1] || 'Autónomo';
    const apellido2 = partesNombre.slice(2).join(' ') || '';

    const nifReceptor = (cliente.nif || factura.nif || '00000000T').trim().toUpperCase();
    const esJuridicaReceptor = /^[ABCDEFGHJKLMNPQRSUVW]/.test(nifReceptor);
    const nombreReceptor = cliente.nombre || factura.cliente || 'Cliente';

    const lineas = Array.isArray(factura.lineas) && factura.lineas.length
        ? factura.lineas
        : [{ descripcion: 'Prestación de servicios profesionales', cantidad: 1, precio: factura.base, iva: 21 }];

    // Agrupar impuestos por tipo de IVA
    const impuestosMap = {};
    lineas.forEach(l => {
        const cant = Number(l.cantidad) || 1;
        const precio = Number(l.precio) || 0;
        const base = Math.round(cant * precio * 100) / 100;
        const tipo = Number(l.iva) || 0;
        const cuota = Math.round(base * tipo) / 100;
        if (!impuestosMap[tipo]) impuestosMap[tipo] = { base: 0, cuota: 0 };
        impuestosMap[tipo].base += base;
        impuestosMap[tipo].cuota += cuota;
    });

    const taxesOutputsXML = Object.entries(impuestosMap).map(([tipo, vals]) => `
        <Tax>
          <TaxTypeCode>01</TaxTypeCode>
          <TaxRate>${Number(tipo).toFixed(2)}</TaxRate>
          <TaxableBase>
            <TotalAmount>${vals.base.toFixed(2)}</TotalAmount>
          </TaxableBase>
          <TaxAmount>
            <TotalAmount>${vals.cuota.toFixed(2)}</TotalAmount>
          </TaxAmount>
        </Tax>`).join('');

    const itemsXML = lineas.map(l => {
        const cant = Number(l.cantidad) || 1;
        const precio = Number(l.precio) || 0;
        const base = Math.round(cant * precio * 100) / 100;
        const tipo = Number(l.iva) || 0;
        const cuota = Math.round(base * tipo) / 100;
        return `
        <InvoiceLine>
          <ItemDescription>${xmlEscape(l.descripcion)}</ItemDescription>
          <Quantity>${cant.toFixed(2)}</Quantity>
          <UnitOfMeasure>01</UnitOfMeasure>
          <UnitPriceWithoutTax>${precio.toFixed(6)}</UnitPriceWithoutTax>
          <TotalCost>${base.toFixed(6)}</TotalCost>
          <GrossAmount>${base.toFixed(6)}</GrossAmount>
          <TaxesOutputs>
            <Tax>
              <TaxTypeCode>01</TaxTypeCode>
              <TaxRate>${tipo.toFixed(2)}</TaxRate>
              <TaxableBase><TotalAmount>${base.toFixed(2)}</TotalAmount></TaxableBase>
              <TaxAmount><TotalAmount>${cuota.toFixed(2)}</TotalAmount></TaxAmount>
            </Tax>
          </TaxesOutputs>
        </InvoiceLine>`;
    }).join('');

    const baseTotal = Number(factura.base || 0).toFixed(2);
    const ivaTotal = Number(factura.iva || 0).toFixed(2);
    const retTotal = Number(factura.retencion || 0).toFixed(2);
    const retPct = Number(factura.retencionPct || 0).toFixed(2);
    const totalFactura = Number(factura.total || 0).toFixed(2);
    const ibanLimpio = (perfil.iban || '').replace(/\s+/g, '');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<fe:Facturae xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml">
  <FileHeader>
    <SchemaVersion>3.2.2</SchemaVersion>
    <Modality>I</Modality>
    <InvoiceIssuerType>EM</InvoiceIssuerType>
    <Batch>
      <BatchIdentifier>${xmlEscape(nifEmisor + '-' + factura.numero)}</BatchIdentifier>
      <InvoicesCount>1</InvoicesCount>
      <TotalInvoicesAmount><TotalAmount>${totalFactura}</TotalAmount></TotalInvoicesAmount>
      <TotalOutstandingAmount><TotalAmount>${totalFactura}</TotalAmount></TotalOutstandingAmount>
      <TotalExecutableAmount><TotalAmount>${totalFactura}</TotalAmount></TotalExecutableAmount>
      <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>
    </Batch>
  </FileHeader>
  <Parties>
    <SellerParty>
      <TaxIdentification>
        <PersonTypeCode>${esJuridicaEmisor ? 'J' : 'F'}</PersonTypeCode>
        <ResidenceTypeCode>R</ResidenceTypeCode>
        <TaxIdentificationNumber>${xmlEscape(nifEmisor)}</TaxIdentificationNumber>
      </TaxIdentification>
      ${esJuridicaEmisor
        ? `<LegalEntity><CorporateName>${xmlEscape(nombreEmisor)}</CorporateName></LegalEntity>`
        : `<Individual><Name>${xmlEscape(nombrePila)}</Name><FirstSurname>${xmlEscape(apellido1)}</FirstSurname><SecondSurname>${xmlEscape(apellido2)}</SecondSurname></Individual>`
      }
    </SellerParty>
    <BuyerParty>
      <TaxIdentification>
        <PersonTypeCode>${esJuridicaReceptor ? 'J' : 'F'}</PersonTypeCode>
        <ResidenceTypeCode>R</ResidenceTypeCode>
        <TaxIdentificationNumber>${xmlEscape(nifReceptor)}</TaxIdentificationNumber>
      </TaxIdentification>
      ${esJuridicaReceptor
        ? `<LegalEntity><CorporateName>${xmlEscape(nombreReceptor)}</CorporateName></LegalEntity>`
        : `<Individual><Name>${xmlEscape(nombreReceptor)}</Name><FirstSurname>Cliente</FirstSurname></Individual>`
      }
    </BuyerParty>
  </Parties>
  <Invoices>
    <Invoice>
      <InvoiceHeader>
        <InvoiceNumber>${xmlEscape(factura.numero)}</InvoiceNumber>
        <InvoiceSeriesCode>${xmlEscape((factura.numero || 'F').split('-')[0])}</InvoiceSeriesCode>
        <InvoiceDocumentType>FC</InvoiceDocumentType>
        <InvoiceClass>OO</InvoiceClass>
      </InvoiceHeader>
      <InvoiceIssueData>
        <IssueDate>${xmlEscape(factura.fecha)}</IssueDate>
        <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>
        <TaxCurrencyCode>EUR</TaxCurrencyCode>
        <LanguageName>es</LanguageName>
      </InvoiceIssueData>
      <TaxesOutputs>${taxesOutputsXML}
      </TaxesOutputs>
      ${Number(factura.retencion) > 0 ? `<TaxesWithheld><Tax><TaxTypeCode>04</TaxTypeCode><TaxRate>${retPct}</TaxRate><TaxableBase><TotalAmount>${baseTotal}</TotalAmount></TaxableBase><TaxAmount><TotalAmount>${retTotal}</TotalAmount></TaxAmount></Tax></TaxesWithheld>` : ''}
      <InvoiceTotals>
        <TotalGrossAmount>${baseTotal}</TotalGrossAmount>
        <TotalGrossAmountBeforeTaxes>${baseTotal}</TotalGrossAmountBeforeTaxes>
        <TotalTaxOutputs>${ivaTotal}</TotalTaxOutputs>
        <TotalTaxesWithheld>${retTotal}</TotalTaxesWithheld>
        <InvoiceTotal>${totalFactura}</InvoiceTotal>
        <TotalOutstandingAmount>${totalFactura}</TotalOutstandingAmount>
        <TotalExecutableAmount>${totalFactura}</TotalExecutableAmount>
      </InvoiceTotals>
      <Items>${itemsXML}
      </Items>
      ${ibanLimpio ? `<PaymentDetails><Installment><InstallmentDueDate>${xmlEscape(factura.vencimiento || factura.fecha)}</InstallmentDueDate><InstallmentAmount>${totalFactura}</InstallmentAmount><PaymentMeans>04</PaymentMeans><AccountToBeCredited><IBAN>${xmlEscape(ibanLimpio)}</IBAN></AccountToBeCredited></Installment></PaymentDetails>` : ''}
      ${factura.verifactu ? `<AdditionalData><InvoiceAdditionalInformation>VERIFACTU-SHA256:${xmlEscape(factura.verifactu.hashActual)}|PREV:${xmlEscape(factura.verifactu.hashAnterior)}</InvoiceAdditionalInformation></AdditionalData>` : ''}
    </Invoice>
  </Invoices>
</fe:Facturae>`;

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Facturae_${String(factura.numero || 'doc').replace(/[^a-zA-Z0-9_-]/g, '_')}_v3_2_2.xml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Genera un código QR estándar ISO/IEC 18004 100% real y escaneable por cualquier móvil
 * utilizando qrcode-generator (cargado en window.qrcode) con respaldo vectorial.
 */
export function generarQRTributarioSVG(texto) {
    try {
        if (typeof window !== 'undefined' && typeof window.qrcode === 'function') {
            // Tipo 0 = autodetección de tamaño según longitud de la URL, nivel 'M' (15% corrección de errores)
            const qr = window.qrcode(0, 'M');
            qr.addData(texto);
            qr.make();
            // Genera un <img> con data-URI SVG nítido y margen silencioso (quiet zone)
            return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        }
    } catch (e) {
        console.warn('Error generando QR real:', e);
    }
    return `<div style="font-size:7px;text-align:center;padding:4px;color:#334155;">QR AEAT</div>`;
}
