// Cálculos de precios y búsqueda. Sin dependencias: se puede probar solo.
//
// Cada producto tiene:
//   moneda: 'USD' → precio = precioUSD × cotización del dólar
//           'ARS' → precio fijo en pesos (precioARS)
//   costoUSD y margen son informativos: si están los dos, precioUSD = costo × margen.
// Todos los precios guardados son SIN IVA; el "final" suma el 21%
// (así trabaja Diego aunque sea monotributista: el final es lo que factura).

export const IVA = 0.21;

export function precioSinIva(p, cotizacion) {
  if (p.moneda === 'ARS') return num(p.precioARS);
  return num(p.precioUSD) * num(cotizacion);
}

export function precioFinal(p, cotizacion) {
  return precioSinIva(p, cotizacion) * (1 + IVA);
}

/**
 * Costo en pesos CON IVA (lo que se le paga al proveedor; el monotributista no lo
 * recupera). null si el producto no tiene costo cargado.
 */
export function costoFinal(p, cotizacion) {
  if (p.moneda !== 'USD' || !(num(p.costoUSD) > 0)) return null;
  return num(p.costoUSD) * num(cotizacion) * (1 + IVA);
}

export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lee un número escrito "a la argentina": "1.535" = mil quinientos treinta y cinco,
 * "1.535,50" y "1535,5" también. Devuelve null si está vacío o no es un número.
 */
export function leerNumero(texto) {
  let t = String(texto ?? '').replace(/\s|\$|US/gi, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Número para poner en un campo de texto: coma decimal, sin separador de miles. */
export const paraCampo = (n) => (n == null || n === '' ? '' : String(Math.round(num(n) * 1e6) / 1e6).replace('.', ','));

/** Minúsculas, sin tildes, sin símbolos raros: para comparar textos. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[½]/g, ' 1/2').replace(/[¼]/g, ' 1/4').replace(/[¾]/g, ' 3/4')
    .replace(/[”“″]/g, '"')
    .replace(/\s+/g, ' ').trim();
}

/** Texto donde se busca: código, descripción, categoría y proveedor. */
export function textoBuscable(p) {
  return normalizar([p.codigo, p.descripcion, p.categoria, p.proveedor, p.abono ? 'abono' : ''].join(' '));
}

/** Todas las palabras de la búsqueda tienen que aparecer (en cualquier orden). */
export function coincide(p, busqueda) {
  const palabras = normalizar(busqueda).split(' ').filter(Boolean);
  if (!palabras.length) return true;
  const texto = p._buscable ?? textoBuscable(p);
  return palabras.every((w) => texto.includes(w));
}

const fmtPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export const pesos = (n) => fmtPesos.format(num(n));
export const dolares = (n) => 'US$ ' + fmtNum.format(num(n));
export const numero = (n) => fmtNum.format(num(n));
