// Importar y exportar Excel con SheetJS (se carga solo cuando hace falta).
import { num, precioSinIva, precioFinal } from './calculo.js';

const URL_SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let cargando = null;

function cargarSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  cargando ??= new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = URL_SHEETJS;
    s.onload = () => ok(window.XLSX);
    s.onerror = () => { cargando = null; mal(new Error('No se pudo cargar el lector de Excel. Revisá la conexión.')); };
    document.head.appendChild(s);
  });
  return cargando;
}

const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// Encabezados reconocidos (se compara sin tildes y en mayúsculas).
// "CAEGORIA" está así en la planilla original de Diego.
const COLUMNAS = {
  categoria: (h) => /^CA?T?E?GORIA$|^CAEGORIA$|^RUBRO$/.test(h),
  codigo: (h) => h === 'CODIGO' || h === 'COD',
  descripcion: (h) => h === 'PRODUCTO' || h === 'DESCRIPCION',
  precioUSD: (h) => /^PRECIO U\$?S/.test(h) || h === 'PRECIO USD',
  proveedor: (h) => h === 'PROVEEDOR',
  costoUSD: (h) => h === 'COSTO' || h === 'COSTO U$S' || h === 'COSTO USD',
  margen: (h) => h === '%' || h === 'MARGEN',
  precioARS: (h) => h === 'PRECIO' || h === 'PRECIO $',
};

/**
 * Lee la planilla y devuelve { productos, avisos, cotizacion, descartadas }.
 * No guarda nada: eso se hace después de que el usuario confirma.
 */
export async function leerExcel(archivo) {
  const XLSX = await cargarSheetJS();
  const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });

  const nombreHoja = wb.SheetNames.find((n) => /original/i.test(n)) ?? wb.SheetNames[0];
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, raw: true, defval: null });

  const iEnc = filas.findIndex((f) => f && f.some((c) => norm(c) === 'CODIGO'));
  if (iEnc < 0) throw new Error(`No encontré la columna "CODIGO" en la hoja "${nombreHoja}".`);

  const col = {};
  filas[iEnc].forEach((h, i) => {
    const hn = norm(h);
    for (const [campo, prueba] of Object.entries(COLUMNAS)) {
      if (col[campo] === undefined && prueba(hn)) col[campo] = i;
    }
  });

  const avisos = [];
  const descartadas = [];
  const productos = [];
  const proveedores = new Map(); // unifica "aquarep" / "Aquarep" / "CASAS TDA" / "CASASTDA"

  filas.slice(iEnc + 1).forEach((f, k) => {
    const fila = iEnc + 2 + k; // número de fila como en Excel
    if (!f) return;
    const v = (campo) => (col[campo] === undefined ? null : f[col[campo]]);
    const texto = (campo) => (v(campo) == null ? '' : String(v(campo)).trim());

    const codigo = texto('codigo');
    const descripcion = texto('descripcion');
    if (!codigo && !descripcion) return;
    if (/^caca/i.test(codigo)) { descartadas.push(`Fila ${fila}: "${codigo}" (fila de prueba)`); return; }

    let proveedor = texto('proveedor');
    if (proveedor) {
      const clave = norm(proveedor).replace(/\s/g, '');
      if (!proveedores.has(clave)) proveedores.set(clave, proveedor);
      proveedor = proveedores.get(clave);
    }

    const precioUSD = num(v('precioUSD'));
    const precioARS = num(v('precioARS'));
    const p = {
      codigo,
      descripcion,
      categoria: texto('categoria').toUpperCase().replace(/\s+/g, ' ') || 'SIN CATEGORÍA', // conserva la Ñ
      proveedor,
      costoUSD: num(v('costoUSD')) || null,
      margen: num(v('margen')) || null,
      favorito: false,
    };
    if (precioUSD > 0) {
      Object.assign(p, { moneda: 'USD', precioUSD });
    } else if (precioARS > 0) {
      Object.assign(p, { moneda: 'ARS', precioARS });
    } else {
      Object.assign(p, { moneda: 'USD', precioUSD: 0 });
      avisos.push(`Fila ${fila} (${codigo || 'sin código'}): sin precio.`);
    }
    if (!descripcion) avisos.push(`Fila ${fila} (${codigo}): sin descripción.`);
    if (!texto('categoria')) avisos.push(`Fila ${fila} (${codigo}): sin categoría.`);
    productos.push(p);
  });

  const repetidos = contarRepetidos(productos.map((p) => norm(p.codigo)).filter(Boolean));
  repetidos.forEach((c) => avisos.push(`El código ${c} está repetido.`));

  return { productos, avisos, descartadas, cotizacion: buscarCotizacion(wb, XLSX), hoja: nombreHoja };
}

/** En la planilla de Diego la cotización está en la hoja " Busqueda", celda D2. */
function buscarCotizacion(wb, XLSX) {
  const nombre = wb.SheetNames.find((n) => /busqueda/i.test(norm(n)));
  if (!nombre) return null;
  const celda = wb.Sheets[nombre].D2;
  const n = celda ? num(celda.v) : 0;
  return n > 0 ? n : null;
}

function contarRepetidos(lista) {
  const vistos = new Set(), rep = new Set();
  lista.forEach((c) => (vistos.has(c) ? rep.add(c) : vistos.add(c)));
  return [...rep];
}

/** Descarga la lista actual como Excel (sirve de copia de seguridad). */
export async function exportarExcel(productos, cotizacion) {
  const XLSX = await cargarSheetJS();
  const filas = productos.map((p) => ({
    CATEGORIA: p.categoria,
    CODIGO: p.codigo,
    PRODUCTO: p.descripcion,
    PROVEEDOR: p.proveedor || '',
    MONEDA: p.moneda,
    'COSTO U$S': p.costoUSD ?? '',
    '%': p.margen ?? '',
    'PRECIO U$S': p.moneda === 'USD' ? num(p.precioUSD) : '',
    'PRECIO $ SIN IVA': round2(precioSinIva(p, cotizacion)),
    'FINAL $': round2(precioFinal(p, cotizacion)),
    FAVORITO: p.favorito ? 'SI' : '',
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja['!cols'] = [12, 18, 55, 16, 8, 10, 6, 11, 16, 14, 9].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, 'Precios');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cotización dólar', cotizacion]]), 'Cotizacion');
  const hoy = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `precios-${hoy}.xlsx`);
}

const round2 = (n) => Math.round(n * 100) / 100;
