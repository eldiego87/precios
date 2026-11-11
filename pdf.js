// PDF de una cotización guardada, con el estilo de la orden de servicio (form3):
// azul Casas TDA, recuadros redondeados y el logo. Se dibuja con jsPDF (no es una imagen
// de fondo fija) para que la tabla crezca y pase a otra hoja si hay muchos ítems.
import { pesos, numero } from './calculo.js';

const URL_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const AZUL = [0, 74, 146];
const FONDO = [245, 248, 251];
const BORDE = [150, 166, 204];
const TEXTO = [28, 38, 56];
const GRIS = [110, 120, 135];
const ABREV = { 1: 'kg', 5: 'l' }; // unidades: kilogramos y litros se muestran junto a la cantidad

let cargando = null;
function cargarJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  cargando ??= new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = URL_JSPDF;
    s.onload = () => ok(window.jspdf.jsPDF);
    s.onerror = () => { cargando = null; mal(new Error('No se pudo cargar el generador de PDF. Revisá la conexión.')); };
    document.head.appendChild(s);
  });
  return cargando;
}

let logo = null;
function cargarLogo() {
  logo ??= new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null); // sin logo igual se genera
    img.src = new URL('./logo.png', import.meta.url).href;
  });
  return logo;
}

const fmtFecha = (ymd) => (ymd ? ymd.split('-').reverse().join('/') : '');
const fmtCuit = (c) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : d; };
const nro = (n) => String(n || 0).padStart(4, '0');
const nombreArchivo = (c) => `Cotizacion-${nro(c.numero)}${c.cliente?.nombre ? '-' + c.cliente.nombre.replace(/[^\w\-]+/g, '_') : ''}.pdf`;

/** Genera y descarga el PDF. c = cotización guardada (numero, fechaFactura, cliente, items, totales). */
export async function descargarPdfCotizacion(c) {
  const [JsPDF, img] = await Promise.all([cargarJsPDF(), cargarLogo()]);
  const doc = new JsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = 210, M = 12, ANCHO = W - 2 * M, LIMITE = 270;
  const color = (rgb, tipo = 'text') => (tipo === 'text' ? doc.setTextColor(...rgb) : tipo === 'fill' ? doc.setFillColor(...rgb) : doc.setDrawColor(...rgb));

  // ---- Encabezado de la primera hoja
  if (img) doc.addImage(img, 'PNG', M, 9, 70, 25);
  color(BORDE, 'draw'); doc.setLineWidth(0.6);
  doc.line(88, 9, 88, 35); doc.line(160, 9, 160, 35);
  color(AZUL); doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
  doc.text('COTIZACIÓN', 124, 21, { align: 'center' });
  color(AZUL, 'fill'); doc.roundedRect(102, 25, 44, 9, 2, 2, 'F');
  color([255, 255, 255]); doc.setFontSize(13);
  doc.text(`Nº ${nro(c.numero)}`, 124, 31.4, { align: 'center' });
  color(GRIS); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('FECHA', 179, 17, { align: 'center' });
  color(TEXTO); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(fmtFecha(c.fechaFactura) || '', 179, 25, { align: 'center' });

  // ---- Cliente
  color(FONDO, 'fill'); color(BORDE, 'draw'); doc.setLineWidth(0.4);
  doc.roundedRect(M, 41, ANCHO, 20, 3, 3, 'FD');
  color(AZUL); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('CLIENTE', M + 5, 48);
  color(TEXTO); doc.setFontSize(15);
  doc.text(c.cliente?.nombre || '—', M + 5, 56);
  if (c.cliente?.cuit) {
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(`CUIT ${fmtCuit(c.cliente.cuit)}`, W - M - 5, 51, { align: 'right' });
    if (c.cliente.condicionIva) {
      color(GRIS); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(c.cliente.condicionIva, W - M - 5, 56.5, { align: 'right' });
    }
  }

  // ---- Tabla de ítems
  const COL = { cant: M + 17, desc: M + 22, unit: M + 152, total: W - M - 3 };
  const ANCHO_DESC = 100;
  const encabezadoTabla = (y) => {
    color(AZUL, 'fill'); doc.roundedRect(M, y, ANCHO, 9, 2, 2, 'F');
    color([255, 255, 255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('CANT.', COL.cant, y + 6, { align: 'right' });
    doc.text('DESCRIPCIÓN', COL.desc, y + 6);
    doc.text('PRECIO UNIT.', COL.unit, y + 6, { align: 'right' });
    doc.text('TOTAL', COL.total, y + 6, { align: 'right' });
    return y + 9;
  };
  const encabezadoContinuacion = () => {
    doc.addPage();
    if (img) doc.addImage(img, 'PNG', M, 8, 42, 15);
    color(AZUL); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(`Cotización Nº ${nro(c.numero)} (continuación)`, W - M, 17, { align: 'right' });
    return encabezadoTabla(28);
  };

  let y = encabezadoTabla(68);
  let total = 0;
  (c.items || []).forEach((it, i) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const lineas = doc.splitTextToSize(String(it.descripcion || ''), ANCHO_DESC);
    const alto = Math.max(8, lineas.length * 4.6 + 3.6);
    if (y + alto > LIMITE) y = encabezadoContinuacion();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); // el encabezado de la tabla deja negrita
    if (i % 2 === 1) { color(FONDO, 'fill'); doc.rect(M, y, ANCHO, alto, 'F'); }
    const subtotal = Math.round(it.precio * it.cantidad * 100) / 100;
    total += subtotal;
    const base = y + 5.4;
    color(TEXTO);
    doc.text(`${numero(it.cantidad)}${ABREV[it.unidad] ? ' ' + ABREV[it.unidad] : ''}`, COL.cant, base, { align: 'right' });
    doc.text(lineas, COL.desc, base);
    doc.text(pesos(it.precio), COL.unit, base, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(pesos(subtotal), COL.total, base, { align: 'right' });
    y += alto;
    color(BORDE, 'draw'); doc.setLineWidth(0.2); doc.line(M, y, W - M, y);
  });

  // ---- Total
  if (y + 24 > LIMITE) y = encabezadoContinuacion();
  y += 5;
  color(AZUL, 'fill'); doc.roundedRect(W - M - 82, y, 82, 13, 3, 3, 'F');
  color([255, 255, 255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('TOTAL', W - M - 77, y + 8.5);
  doc.setFontSize(15);
  doc.text(pesos(total), W - M - 4, y + 8.8, { align: 'right' });
  color(GRIS); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text('Precios finales en pesos argentinos.', M, y + 5);
  doc.text(`${(c.items || []).length} ${(c.items || []).length === 1 ? 'ítem' : 'ítems'}`, M, y + 10);

  // ---- Pie con número de página
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    color(BORDE, 'draw'); doc.setLineWidth(0.3); doc.line(M, 285, W - M, 285);
    color(GRIS); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`Casas Tratamiento de Agua · Cotización Nº ${nro(c.numero)}`, M, 290);
    doc.text(`Página ${p} de ${paginas}`, W - M, 290, { align: 'right' });
  }

  doc.save(nombreArchivo(c));
}
