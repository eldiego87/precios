// Ojo: la pantalla de ítems tiene los datos del receptor en campos ocultos con los mismos ids:
// por eso se detecta antes que la del receptor (que tiene #idivareceptor como <select>).
// Puente con "Comprobantes en línea" de ARCA (RCEL), Factura C.
//
// 1) La lista de precios copia la cotización al portapapeles como texto:
//      ARCA-COT1{"c":{"cuit","iva"},"f":"DD/MM/AAAA","i":[[desc, cant, unidad, precio], ...]}
// 2) El marcador "Pegar en ARCA" (bookmarklet) corre DENTRO de la página de ARCA. Se toca una vez por pantalla;
//    reconoce cuál es, la completa y toca "Continuar" (validarCampos() de la propia página):
//      menú → "Generar Comprobantes" · punto de venta (el único) + "Factura C" · emisión: fecha + concepto
//      "Productos" · receptor: condición IVA, CUIT (espera la razón social), domicilio, "Cuenta Corriente" ·
//      ítems (agrega filas con insertarFilaDetalle()) — acá NO toca "Continuar": Diego revisa y continúa
//      (si ARCA da error y se vuelve atrás, borra todos los ítems).
//    En la pantalla final de confirmación NO hace nada: la factura la confirma Diego.
//
// Campos verificados en las páginas guardadas el 11/11/2026:
//   pv: select#puntodeventa (onchange → ajax tipos), select#universocomprobante
//   emisión: input#fc (DD/MM/AAAA), select#idconcepto (1 Productos); Productos admite hoy ±5 días
//   receptor: select#idivareceptor (jQuery change → tipos doc), #idtipodocreceptor (80 CUIT, 96 DNI),
//     #nrodocreceptor (change → ajax razón social), #razonsocialreceptor, #domicilioreceptorcombo (se elige el Nº
//     `dom` del cliente entre las opciones con valor; "Otro..." tiene valor vacío),
//     checkbox formaDePago value 96 = Cuenta Corriente
//   ítems: textarea#detalle_descripcionN, #detalle_cantidadN, select#detalle_medidaN, #detalle_precioN.
//     Punto decimal, hasta 2 decimales (#numdecimalescantidad admite 4/6). "seleccionar..." y "unidades" valen 7.

export const PREFIJO = 'ARCA-COT1';        // cotización completa (cliente, fecha, ítems)
export const PREFIJO_VIEJO = 'ARCA-ITEMS1'; // versión anterior: solo ítems (el marcador la sigue aceptando)

// Unidades de ARCA que usa Diego (código ARCA → nombre).
export const UNIDADES = [
  [7, 'unidades'], [98, 'otras unidades'], [1, 'kilogramos'], [5, 'litros'],
];
export const nombreUnidad = (cod) => (UNIDADES.find(([c]) => c === Number(cod)) || UNIDADES[0])[1];

const redondear = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Arma el texto para el portapapeles.
 * cot: { items: [{ descripcion, cantidad, unidad, precioUnitario }], cliente: { cuit, condicionIva } | null, fecha: 'AAAA-MM-DD' }
 */
export function textoParaArca({ items, cliente, fecha }) {
  const i = items.map((x) => [
    String(x.descripcion || '').trim(),
    redondear(x.cantidad, 6),
    Number(x.unidad) || 7,
    redondear(x.precioUnitario, 2),
  ]);
  const c = cliente && cliente.cuit
    ? { cuit: String(cliente.cuit).replace(/\D/g, ''), iva: cliente.condicionIva || '', dom: Number(cliente.domicilio) || 1 }
    : null;
  const f = fecha ? fecha.split('-').reverse().join('/') : null; // DD/MM/AAAA, como lo pide ARCA
  return PREFIJO + JSON.stringify({ c, f, i });
}

// ------------------------------------------------------------------ el marcador
// Se escribe como función normal para poder leerla y probarla; se convierte en
// "javascript:..." con codigoMarcador(). No usar comentarios // adentro (se pierde el salto de línea).
function marcador() {
  (async () => {
    const P1 = 'ARCA-COT1';
    const P0 = 'ARCA-ITEMS1';
    const w = window;
    const d = document;
    const $ = (id) => d.getElementById(id);
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    const esperarQue = async (cond, ms) => {
      const fin = Date.now() + ms;
      while (Date.now() < fin) { try { if (cond()) return true; } catch (e) { /* sigue */ } await espera(150); }
      return false;
    };
    const cambio = (el) => { if (w.jQuery) w.jQuery(el).trigger('change'); else el.dispatchEvent(new Event('change', { bubbles: true })); };
    const continuar = () => { if (typeof w.validarCampos === 'function') w.validarCampos(); };

    let pantalla = '';
    if ($('btn_gen_cmp')) pantalla = 'menu';
    else if ($('puntodeventa') && $('universocomprobante')) pantalla = 'pv';
    else if ($('idconcepto') && $('fc')) pantalla = 'emisor';
    else if ($('detalle_descripcion1') || typeof w.insertarFilaDetalle === 'function') pantalla = 'items';
    else if ($('idivareceptor') && $('idivareceptor').tagName === 'SELECT' && $('nrodocreceptor')) pantalla = 'receptor';
    if (!pantalla) {
      alert('El marcador trabaja en ARCA → Comprobantes en línea (menú, punto de venta, emisión, receptor e ítems).\n\nEn la pantalla final de confirmación no hace nada: revisá y confirmá vos.');
      return;
    }

    if (pantalla === 'menu') { location.href = $('btn_gen_cmp').href; return; }

    if (pantalla === 'pv') {
      const pv = $('puntodeventa');
      if (!pv.value) {
        const reales = [...pv.options].filter((o) => o.value);
        if (reales.length !== 1) { alert('Elegí el punto de venta y volvé a tocar el marcador.'); return; }
        pv.value = reales[0].value;
        pv.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const tc = $('universocomprobante');
      const esC = (o) => /^\s*factura c\s*$/i.test(o.text);
      if (!(await esperarQue(() => [...tc.options].some(esC), 10000))) { alert('No apareció "Factura C" en Tipo de Comprobante. Elegilo a mano y tocá Continuar.'); return; }
      const op = [...tc.options].find(esC);
      tc.selectedIndex = op.index;
      if (typeof w.actualizarDescripcionTC === 'function') w.actualizarDescripcionTC(op.index);
      continuar();
      return;
    }

    let t = '';
    let bloqueado = false;
    try { t = ((await navigator.clipboard.readText()) || '').trim(); } catch (e) { bloqueado = true; }
    if (!t.startsWith(P1) && !t.startsWith(P0)) {
      const motivo = bloqueado
        ? 'El navegador no deja leer el portapapeles (permitilo con el ícono 📋 de la barra de direcciones).'
        : 'En el portapapeles no hay una cotización: ¿tocaste "📋 Copiar" en la lista de precios después de copiar otra cosa?';
      t = prompt(motivo + '\n\nPodés pegarla acá con Ctrl+V:') || '';
    }
    t = t.trim();
    if (!t) return;
    let datos = null;
    try {
      if (t.startsWith(P1)) datos = JSON.parse(t.slice(P1.length));
      else if (t.startsWith(P0)) datos = { i: JSON.parse(t.slice(P0.length)).i };
    } catch (e) { datos = null; }
    if (!datos || !datos.i) { alert('Eso no es una cotización copiada desde la lista de precios. Volvé a tocar "Copiar".'); return; }

    if (pantalla === 'emisor') {
      if (!datos.f) { alert('Lo copiado no tiene fecha (versión anterior). Volvé a tocar "Copiar" en la lista de precios.'); return; }
      $('fc').value = datos.f;
      const concepto = $('idconcepto');
      concepto.value = '1';
      if (typeof w.mostrarOcultar === 'function') w.mostrarOcultar('1');
      continuar();
      return;
    }

    if (pantalla === 'receptor') {
      const cli = datos.c;
      if (!cli || !cli.cuit) { alert('La cotización copiada no tiene cliente con CUIT. Completá este paso a mano.'); return; }
      const iva = $('idivareceptor');
      const opIva = [...iva.options].find((o) => o.value && o.text.trim().toLowerCase() === String(cli.iva || '').trim().toLowerCase());
      if (!opIva) { alert('No encontré en ARCA la condición frente al IVA "' + cli.iva + '". Elegila a mano.'); return; }
      iva.value = opIva.value;
      cambio(iva);
      const td = $('idtipodocreceptor');
      const tipo = cli.cuit.length === 11 ? '80' : '96';
      if (!(await esperarQue(() => [...td.options].some((o) => o.value === tipo), 4000))) { alert('ARCA no ofrece ' + (tipo === '80' ? 'CUIT' : 'DNI') + ' para esa condición frente al IVA. Completá a mano.'); return; }
      td.value = tipo;
      cambio(td);
      const nro = $('nrodocreceptor');
      nro.value = cli.cuit;
      cambio(nro);
      if (!(await esperarQue(() => $('razonsocialreceptor').value.trim() !== '', 12000))) { alert('ARCA no devolvió la razón social del CUIT ' + cli.cuit + '. Revisalo.'); return; }
      const dom = $('domicilioreceptorcombo');
      const nDom = Number(cli.dom) || 1;
      if (dom && dom.offsetParent !== null) {
        const reales = [...dom.options].filter((x) => x.value);
        if (reales.length < nDom) {
          alert('Este cliente usa el domicilio ' + nDom + 'º, pero ARCA muestra ' + reales.length + (reales.length === 1 ? ' domicilio' : ' domicilios') + ' para el CUIT ' + cli.cuit + '.\n\nElegilo a mano y tocá "Continuar".');
          return;
        }
        dom.value = reales[nDom - 1].value;
        cambio(dom);
      }
      const cc = d.querySelector('input[name=formaDePago][value="96"]') || $('formadepago4');
      if (cc && !cc.checked) cc.click();
      await espera(200);
      continuar();
      return;
    }

    const items = datos.i;
    if (!items.length) { alert('La cotización copiada no tiene ítems.'); return; }
    const textos = () => [...d.querySelectorAll('textarea[name=detalleDescripcion]')];
    const campo = (tx, nombre) => tx.closest('tr').querySelector('[name=' + nombre + ']');
    const libres = textos().filter((tx) => !tx.value.trim() && !(campo(tx, 'detallePrecio') || {}).value);
    const numeros = textos().map((tx) => Number(tx.id.replace('detalle_descripcion', ''))).filter((n) => n > 0);
    const maximo = Math.max(0, ...numeros);
    if (typeof w.numFilasDetallesMax === 'number' && w.numFilasDetallesMax < maximo) {
      w.numFilasDetallesMax = maximo;
      w.numFilasDetalles = Math.max(w.numFilasDetalles || 0, numeros.length);
    }
    const decimales = (v) => { const s = String(v); const k = s.includes('.') ? s.split('.')[1].length : 0; return k <= 2 ? 2 : (k <= 4 ? 4 : 6); };
    const dq = Math.max(...items.map((x) => decimales(x[1])));
    const sel = $('numdecimalescantidad');
    if (sel && Number(sel.value) < dq) { sel.value = String(dq); sel.dispatchEvent(new Event('change', { bubbles: true })); }

    for (const [desc, cant, unidad, precio] of items) {
      let tx = libres.shift();
      if (!tx) {
        const antes = new Set(textos());
        w.insertarFilaDetalle();
        tx = textos().find((x) => !antes.has(x));
        if (!tx) { alert('ARCA no dejó agregar más líneas (máximo 100).'); return; }
      }
      tx.value = desc;
      campo(tx, 'detalleCantidad').value = String(cant);
      campo(tx, 'detallePrecio').value = Number(precio).toFixed(2);
      const m = campo(tx, 'detalleMedida');
      if (m) {
        const op = [...m.options].find((o, i) => i > 0 && o.value === String(unidad));
        if (op) m.selectedIndex = op.index;
      }
      if (typeof w.ajustarAnchoBlur === 'function') w.ajustarAnchoBlur(tx);
      const n = Number(campo(tx, 'detalleCantidad').id.replace('detalle_cantidad', ''));
      if (n && typeof w.calcularSubtotalDetalle === 'function') w.calcularSubtotalDetalle(n);
    }
    /* En ítems NO se continúa solo: si ARCA da un error y se vuelve atrás, borra todos los ítems. */
    const total = $('imptotal') ? $('imptotal').value : '';
    alert('Listo: ' + items.length + (items.length === 1 ? ' ítem cargado' : ' ítems cargados') + (total ? '. Total: $ ' + total : '') + '.\n\nRevisalos y tocá "Continuar" vos.');
  })();
}

/** Código listo para el href del marcador. */
export function codigoMarcador() {
  const cuerpo = marcador.toString().replace(/^function marcador\(\)\s*\{/, '').replace(/\}\s*$/, '');
  return 'javascript:' + encodeURIComponent(cuerpo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, ' ').trim());
}
