// Puente con "Comprobantes en línea" de ARCA (RCEL), Factura C, paso 3 "Datos de la operación".
//
// 1) La lista de precios copia los ítems al portapapeles como texto:  ARCA-ITEMS1{"i":[[desc, cant, unidad, precio], ...]}
// 2) El marcador "Pegar en ARCA" (bookmarklet) corre DENTRO de la página de ARCA, lee ese texto y
//    completa las filas. Usa las funciones propias de la página: insertarFilaDetalle() para agregar
//    líneas y calcularSubtotalDetalle(n) para que ARCA recalcule subtotales y total.
//    Nunca toca "Continuar": la factura la revisa y confirma Diego.
//
// Campos de ARCA (verificados en la página guardada el 11/11/2026):
//   textarea#detalle_descripcionN, #detalle_cantidadN, select#detalle_medidaN, #detalle_precioN
//   Números: punto decimal, hasta 2 decimales (select #numdecimalescantidad admite 4 o 6).
//   Unidad: el select tiene "seleccionar..." y "unidades" ambos con value 7.

export const PREFIJO = 'ARCA-ITEMS1';

// Unidades de ARCA que usa Diego (código ARCA → nombre).
export const UNIDADES = [
  [7, 'unidades'], [98, 'otras unidades'], [1, 'kilogramos'], [5, 'litros'],
];
export const nombreUnidad = (cod) => (UNIDADES.find(([c]) => c === Number(cod)) || UNIDADES[0])[1];

const redondear = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

/** Arma el texto para el portapapeles. items: [{ descripcion, cantidad, unidad, precioUnitario }] */
export function textoParaArca(items) {
  const i = items.map((x) => [
    String(x.descripcion || '').trim(),
    redondear(x.cantidad, 6),
    Number(x.unidad) || 7,
    redondear(x.precioUnitario, 2),
  ]);
  return PREFIJO + JSON.stringify({ i });
}

// ------------------------------------------------------------------ el marcador
// Se escribe como función normal para poder leerla y probarla; se convierte en
// "javascript:..." con codigoMarcador(). No usar comentarios // adentro (se pierde el salto de línea).
function marcador() {
  (async () => {
    const P = 'ARCA-ITEMS1';
    const w = window;
    if (!document.getElementById('detalle_descripcion1') && typeof w.insertarFilaDetalle !== 'function') {
      alert('Usá este marcador en ARCA → Comprobantes en línea, en el paso "Datos de la operación" (donde se cargan los ítems).');
      return;
    }
    let t = '';
    try { t = (await navigator.clipboard.readText()) || ''; } catch (e) { /* sin permiso */ }
    if (!t.startsWith(P)) t = prompt('Pegá acá (Ctrl+V) lo que copiaste con "Copiar para ARCA" en la lista de precios:') || '';
    t = t.trim();
    if (!t) return;
    if (!t.startsWith(P)) { alert('Eso no es una cotización copiada desde la lista de precios.'); return; }
    let items;
    try { items = JSON.parse(t.slice(P.length)).i; } catch (e) { alert('Los datos copiados están incompletos. Volvé a tocar "Copiar para ARCA".'); return; }
    if (!items || !items.length) { alert('La cotización copiada está vacía.'); return; }

    const $ = (id) => document.getElementById(id);
    const textos = () => [...document.querySelectorAll('textarea[name=detalleDescripcion]')];
    const campo = (t, nombre) => t.closest('tr').querySelector('[name=' + nombre + ']');
    const libres = textos().filter((t) => !t.value.trim() && !(campo(t, 'detallePrecio') || {}).value);
    const numeros = textos().map((t) => Number(t.id.replace('detalle_descripcion', ''))).filter((n) => n > 0);
    const maximo = Math.max(0, ...numeros);
    if (typeof w.numFilasDetallesMax === 'number' && w.numFilasDetallesMax < maximo) {
      w.numFilasDetallesMax = maximo;
      w.numFilasDetalles = Math.max(w.numFilasDetalles || 0, numeros.length);
    }

    const decimales = (v) => { const s = String(v); const k = s.includes('.') ? s.split('.')[1].length : 0; return k <= 2 ? 2 : (k <= 4 ? 4 : 6); };
    const dq = Math.max(...items.map((x) => decimales(x[1])));
    const sel = $('numdecimalescantidad');
    if (sel && Number(sel.value) < dq) { sel.value = String(dq); sel.dispatchEvent(new Event('change', { bubbles: true })); }

    let cargados = 0;
    for (const [desc, cant, unidad, precio] of items) {
      let t = libres.shift();
      if (!t) {
        const antes = new Set(textos());
        w.insertarFilaDetalle();
        t = textos().find((x) => !antes.has(x));
        if (!t) { alert('ARCA no dejó agregar más líneas (máximo 100).'); break; }
      }
      t.value = desc;
      campo(t, 'detalleCantidad').value = String(cant);
      campo(t, 'detallePrecio').value = Number(precio).toFixed(2);
      const m = campo(t, 'detalleMedida');
      if (m) {
        const op = [...m.options].find((o, i) => i > 0 && o.value === String(unidad));
        if (op) m.selectedIndex = op.index;
      }
      if (typeof w.ajustarAnchoBlur === 'function') w.ajustarAnchoBlur(t);
      const n = Number(campo(t, 'detalleCantidad').id.replace('detalle_cantidad', ''));
      if (n && typeof w.calcularSubtotalDetalle === 'function') w.calcularSubtotalDetalle(n);
      cargados++;
    }
    const total = $('imptotal') ? $('imptotal').value : '';
    alert('Listo: ' + cargados + (cargados === 1 ? ' ítem cargado' : ' ítems cargados') + (total ? '. Total: $ ' + total : '') + '.\n\nRevisá los datos y tocá "Continuar".');
  })();
}

/** Código listo para el href del marcador. */
export function codigoMarcador() {
  const cuerpo = marcador.toString().replace(/^function marcador\(\)\s*\{/, '').replace(/\}\s*$/, '');
  return 'javascript:' + encodeURIComponent(cuerpo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, ' ').trim());
}
