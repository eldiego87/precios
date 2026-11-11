// Interfaz: categorías (izquierda) · productos (centro) · cotización rápida (derecha).
import * as datos from './datos.js';
import {
  precioFinal, precioSinIva, costoFinal, coincide, textoBuscable, normalizar,
  leerNumero, paraCampo, pesos, dolares, numero, IVA,
} from './calculo.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const estado = {
  productos: [],
  cotizacion: 0,
  cotizacionFecha: null,
  filtro: 'todas', // 'todas' | 'favoritos' | nombre de categoría
  busqueda: '',
  cotizador: [], // [{ id, cantidad }] en el orden en que se agregaron
};

// ---------------------------------------------------------------- inicio
function mostrarMensaje(texto, conBoton = false) {
  $('app').hidden = true;
  $('pantalla-mensaje').hidden = false;
  $('mensaje-texto').textContent = texto;
  $('btn-entrar').hidden = !conBoton;
}

if (!datos.configurado()) {
  mostrarMensaje('Falta conectar la base de datos (Firebase). Completá firebase-config.js.');
} else {
  datos.iniciar(async (usuario) => {
    if (!usuario) { mostrarMensaje('Iniciá sesión para ver tu lista de precios.', true); return; }
    mostrarMensaje('Cargando tu lista…');
    try {
      const [config, productos] = await Promise.all([datos.cargarConfig(), datos.cargarProductos()]);
      estado.cotizacion = config.cotizacion || 0;
      estado.cotizacionFecha = config.cotizacionFecha || null;
      estado.productos = productos.map(prepararProducto);
      estado.cotizador = cargarCotizadorGuardado();
      $('usuario-email').textContent = usuario.email;
      $('pantalla-mensaje').hidden = true;
      $('app').hidden = false;
      dibujarTodo();
      $('busqueda').focus();
    } catch (e) {
      console.error(e);
      const sinPermiso = e?.code === 'permission-denied';
      mostrarMensaje(sinPermiso
        ? `La cuenta ${usuario.email} no tiene acceso. Cerrá sesión y entrá con otra.`
        : 'No se pudo cargar la lista. Revisá la conexión y recargá la página.', true);
      $('btn-entrar').textContent = sinPermiso ? 'Entrar con otra cuenta' : 'Reintentar';
    }
  });
}

$('btn-entrar').addEventListener('click', async () => {
  try {
    if ($('btn-entrar').textContent.startsWith('Entrar con otra')) await datos.salir();
    await datos.entrar();
  } catch (e) {
    if (e?.code !== 'auth/popup-closed-by-user') aviso('No se pudo iniciar sesión: ' + (e?.message || e));
  }
});
$('btn-salir').addEventListener('click', () => datos.salir());

const prepararProducto = (p) => ({ ...p, _buscable: textoBuscable(p) });
const porId = (id) => estado.productos.find((p) => p.id === id);

// ---------------------------------------------------------------- dibujo general
function dibujarTodo() {
  dibujarCotizacion();
  dibujarFiltros();
  dibujarLista();
  dibujarCotizador();
  dibujarSugerencias();
}

function dibujarCotizacion() {
  $('cot-valor').textContent = estado.cotizacion ? '$ ' + numero(estado.cotizacion) : 'cargar';
}

function dibujarSugerencias() {
  const opciones = (valores) => [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
    .map((v) => `<option value="${esc(v)}">`).join('');
  $('lista-categorias').innerHTML = opciones(estado.productos.map((p) => p.categoria));
  $('lista-proveedores').innerHTML = opciones(estado.productos.map((p) => p.proveedor));
}

function capitalizar(t) {
  const s = String(t || '').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------- categorías
function dibujarFiltros() {
  const cuenta = new Map();
  estado.productos.forEach((p) => cuenta.set(p.categoria, (cuenta.get(p.categoria) || 0) + 1));
  const cats = [...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  if (estado.filtro !== 'todas' && estado.filtro !== 'favoritos' && !cuenta.has(estado.filtro)) estado.filtro = 'todas';

  const boton = (valor, texto, n) =>
    `<li><button class="cat" data-filtro="${esc(valor)}" aria-current="${valor === estado.filtro}"><span>${esc(texto)}</span><span class="cant">${n}</span></button></li>`;
  $('filtros').innerHTML = boton('todas', 'Todas', estado.productos.length)
    + boton('favoritos', '★ Favoritos', estado.productos.filter((p) => p.favorito).length)
    + '<li class="separador"></li>'
    + cats.map(([c, n]) => boton(c, capitalizar(c), n)).join('');
}

$('filtros').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtro]');
  if (!b) return;
  estado.filtro = b.dataset.filtro;
  // Al elegir una categoría se limpia la búsqueda para ver la categoría completa.
  if (estado.busqueda) { estado.busqueda = ''; $('busqueda').value = ''; }
  dibujarFiltros();
  dibujarLista();
  document.querySelector('.productos').scrollTop = 0;
});

// ---------------------------------------------------------------- productos
function productosVisibles() {
  const { filtro, busqueda } = estado;
  const hayBusqueda = !!busqueda.trim();
  let lista = estado.productos;
  // Con búsqueda se busca en toda la lista (salvo en Favoritos).
  if (filtro === 'favoritos') lista = lista.filter((p) => p.favorito);
  else if (filtro !== 'todas' && !hayBusqueda) lista = lista.filter((p) => p.categoria === filtro);
  lista = lista.filter((p) => coincide(p, busqueda));

  const q = normalizar(busqueda);
  const puntaje = (p) => {
    const c = normalizar(p.codigo);
    if (q && c === q) return 0;
    if (q && c.startsWith(q)) return 1;
    return 2;
  };
  return [...lista].sort((a, b) =>
    puntaje(a) - puntaje(b)
    || (hayBusqueda ? 0 : a.categoria.localeCompare(b.categoria, 'es'))
    || (a.descripcion || '').localeCompare(b.descripcion || '', 'es'));
}

const lineaDe = (id) => estado.cotizador.find((l) => l.id === id);

function htmlProducto(p) {
  const sinPrecio = p.moneda === 'ARS' ? !p.precioARS : !p.precioUSD;
  let final, base = '';
  if (sinPrecio) {
    final = '<span class="sin-precio">sin precio</span>';
  } else if (p.moneda === 'USD') {
    final = estado.cotizacion ? pesos(precioFinal(p, estado.cotizacion)) : '—';
    base = `${dolares(p.precioUSD * (1 + IVA))} final`;
  } else {
    final = pesos(precioFinal(p, estado.cotizacion));
    base = 'precio fijo en $';
  }
  const linea = lineaDe(p.id);
  const accion = linea
    ? `<input class="cantidad" data-cantidad value="${esc(paraCampo(linea.cantidad))}" inputmode="decimal" aria-label="Cantidad" title="Cantidad">
       <button class="quitar" data-quitar title="Quitar de la cotización" aria-label="Quitar de la cotización">×</button>`
    : `<button class="btn chico" data-agregar ${sinPrecio ? 'disabled' : ''}>Agregar</button>`;
  return `<li class="item ${linea ? 'en-cotizacion' : ''}" data-id="${esc(p.id)}">
    <button class="estrella ${p.favorito ? 'si' : ''}" data-estrella aria-label="${p.favorito ? 'Quitar de' : 'Agregar a'} favoritos" title="Favorito">★</button>
    <div>
      <div class="item-desc">${esc(p.descripcion || '(sin descripción)')}</div>
      <div class="item-meta"><span class="codigo">${esc(p.codigo)}</span><span>${esc(capitalizar(p.categoria))}</span>${p.proveedor ? `<span>${esc(p.proveedor)}</span>` : ''}</div>
    </div>
    <div class="item-precio">
      <div class="item-final">${final}</div>
      ${base ? `<div class="item-base">${base}</div>` : ''}
    </div>
    <div class="item-accion">${accion}</div>
  </li>`;
}

function dibujarLista() {
  const lista = productosVisibles();
  const total = estado.productos.length;

  if (!total) {
    $('lista').innerHTML = '';
    $('resumen').textContent = '';
    $('vacio').hidden = false;
    $('vacio').innerHTML = `<p>Todavía no hay productos cargados.</p>
      <button class="btn primario" data-accion="importar">Importar desde Excel</button>`;
    return;
  }
  $('vacio').hidden = lista.length > 0;
  $('vacio').innerHTML = '<p>No hay productos que coincidan.</p>';

  const hayBusqueda = !!estado.busqueda.trim();
  const donde = estado.filtro === 'favoritos' ? ' en Favoritos'
    : hayBusqueda ? ' (buscando en todas las categorías)'
      : estado.filtro !== 'todas' ? ` en ${capitalizar(estado.filtro)}` : '';
  $('resumen').textContent = `${lista.length} de ${total} productos${donde}`
    + (estado.cotizacion ? '' : ' · Cargá la cotización del dólar para ver los precios en pesos');

  $('lista').innerHTML = lista.map(htmlProducto).join('');
}

/** Redibuja un solo producto (sin perder el foco del resto). */
function redibujarProducto(id, enfocarCantidad = false) {
  const li = $('lista').querySelector(`.item[data-id="${CSS.escape(id)}"]`);
  const p = porId(id);
  if (!li || !p) return;
  li.outerHTML = htmlProducto(p);
  if (enfocarCantidad) {
    const input = $('lista').querySelector(`.item[data-id="${CSS.escape(id)}"] [data-cantidad]`);
    input?.focus(); input?.select();
  }
}

let temporizador;
$('busqueda').addEventListener('input', (e) => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { estado.busqueda = e.target.value; dibujarLista(); }, 80);
});
$('busqueda').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.target.value = ''; estado.busqueda = ''; dibujarLista(); }
});

$('lista').addEventListener('click', async (e) => {
  const li = e.target.closest('.item');
  if (!li) return;
  const id = li.dataset.id;
  const p = porId(id);
  if (!p) return;

  if (e.target.closest('[data-agregar]')) { agregarAlCotizador(id); return; }
  if (e.target.closest('[data-quitar]')) { quitarDelCotizador(id); return; }
  if (e.target.closest('[data-cantidad]')) return; // escribir la cantidad no abre la ficha
  if (e.target.closest('[data-estrella]')) {
    p.favorito = !p.favorito;
    dibujarFiltros(); redibujarProducto(id);
    try { await datos.guardarProducto(p); } catch {
      p.favorito = !p.favorito; dibujarFiltros(); redibujarProducto(id);
      aviso('No se pudo guardar el favorito.');
    }
    return;
  }
  abrirFicha(p);
});

$('vacio').addEventListener('click', (e) => {
  if (e.target.closest('[data-accion="importar"]')) abrirImportar();
});

// ---------------------------------------------------------------- cotización rápida
const CLAVE_COTIZADOR = 'precios.cotizador';

function cargarCotizadorGuardado() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_COTIZADOR) || '[]');
    return guardado.filter((l) => porId(l.id) && l.cantidad > 0);
  } catch { return []; }
}
function guardarCotizador() {
  try { localStorage.setItem(CLAVE_COTIZADOR, JSON.stringify(estado.cotizador)); } catch { /* sin almacenamiento */ }
}

function agregarAlCotizador(id) {
  if (!lineaDe(id)) estado.cotizador.push({ id, cantidad: 1 });
  guardarCotizador();
  redibujarProducto(id, true);
  dibujarCotizador();
}

function quitarDelCotizador(id) {
  estado.cotizador = estado.cotizador.filter((l) => l.id !== id);
  guardarCotizador();
  redibujarProducto(id);
  dibujarCotizador();
}

function cambiarCantidad(id, texto, origen) {
  const linea = lineaDe(id);
  if (!linea) return;
  const n = leerNumero(texto);
  if (n == null || n <= 0) return; // mientras escribe (vacío, "0,") no se toca
  linea.cantidad = n;
  guardarCotizador();
  // Sincronizar el otro campo de cantidad (lista ↔ cotización) sin pisar el que se está usando.
  document.querySelectorAll(`[data-id="${CSS.escape(id)}"] [data-cantidad]`).forEach((input) => {
    if (input !== origen) input.value = paraCampo(n);
  });
  actualizarNumerosCotizador();
}

function calcularLinea(l) {
  const p = porId(l.id);
  const costoU = costoFinal(p, estado.cotizacion);
  return {
    p,
    costo: costoU == null ? null : costoU * l.cantidad,
    venta: precioFinal(p, estado.cotizacion) * l.cantidad,
  };
}

function dibujarCotizador() {
  const cont = $('cotizador');
  $('btn-vaciar').hidden = !estado.cotizador.length;
  if (!estado.cotizador.length) {
    cont.innerHTML = '<p class="cot-vacia">Tocá <strong>Agregar</strong> en un producto para armar una cotización: vas a ver el costo de los materiales y el precio de venta.</p>';
    return;
  }
  const filas = estado.cotizador.map((l) => {
    const { p } = calcularLinea(l);
    return `<tr data-id="${esc(l.id)}">
      <td><input class="cantidad" data-cantidad value="${esc(paraCampo(l.cantidad))}" inputmode="decimal" aria-label="Cantidad"></td>
      <td class="item-cot">${esc(p.descripcion || p.codigo)}<small>${esc(p.codigo)}</small></td>
      <td class="num" data-costo></td>
      <td class="num" data-venta></td>
      <td><button class="quitar" data-quitar title="Quitar" aria-label="Quitar">×</button></td>
    </tr>`;
  }).join('');
  cont.innerHTML = `
    <table class="tabla-cot">
      <thead><tr><th>Cant.</th><th>Ítem</th><th class="num">Costo total</th><th class="num">Precio de venta</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><td data-total-cant class="num"></td><td>Totales</td><td class="num" data-total-costo></td><td class="num" data-total-venta></td><td></td></tr></tfoot>
    </table>
    <div class="cot-resumen" data-resumen></div>`;
  actualizarNumerosCotizador();
}

/** Recalcula los importes sin redibujar los campos (para no perder el foco). */
function actualizarNumerosCotizador() {
  const cont = $('cotizador');
  let costoTotal = 0, ventaTotal = 0, sinCosto = 0;
  estado.cotizador.forEach((l) => {
    const { costo, venta } = calcularLinea(l);
    const fila = cont.querySelector(`tr[data-id="${CSS.escape(l.id)}"]`);
    if (fila) {
      fila.querySelector('[data-costo]').innerHTML = costo == null ? '<span class="falta" title="Este producto no tiene costo cargado">—</span>' : pesos(costo);
      fila.querySelector('[data-venta]').textContent = pesos(venta);
    }
    ventaTotal += venta;
    if (costo == null) sinCosto++; else costoTotal += costo;
  });
  const set = (sel, html) => { const el = cont.querySelector(sel); if (el) el.innerHTML = html; };
  set('[data-total-costo]', pesos(costoTotal));
  set('[data-total-venta]', pesos(ventaTotal));

  const ganancia = ventaTotal - costoTotal;
  const pct = costoTotal > 0 ? `${numero(Math.round((ganancia / costoTotal) * 1000) / 10)}% sobre el costo. ` : '';
  set('[data-resumen]', `
    <span>Diferencia venta − costo</span><span class="num ganancia">${pesos(ganancia)}</span>
    <span class="nota">${pct}Costos y ventas con IVA incluido, al dólar $ ${numero(estado.cotizacion)}.
    ${sinCosto ? `<br><strong>${sinCosto} ${sinCosto === 1 ? 'ítem no tiene' : 'ítems no tienen'} costo cargado</strong> (servicios o precio fijo): la diferencia los cuenta como ganancia completa.` : ''}</span>`);
}

$('cotizador').addEventListener('input', (e) => {
  if (!e.target.matches('[data-cantidad]')) return;
  cambiarCantidad(e.target.closest('tr').dataset.id, e.target.value, e.target);
});
$('lista').addEventListener('input', (e) => {
  if (!e.target.matches('[data-cantidad]')) return;
  cambiarCantidad(e.target.closest('.item').dataset.id, e.target.value, e.target);
});
// Al salir del campo, si quedó vacío o inválido se vuelve a mostrar la cantidad vigente.
document.addEventListener('focusout', (e) => {
  if (!e.target.matches?.('[data-cantidad]')) return;
  const id = e.target.closest('[data-id]')?.dataset.id;
  const l = id && lineaDe(id);
  if (l) e.target.value = paraCampo(l.cantidad);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('[data-cantidad]')) { e.target.blur(); $('busqueda').focus(); }
});
$('cotizador').addEventListener('click', (e) => {
  if (e.target.closest('[data-quitar]')) quitarDelCotizador(e.target.closest('tr').dataset.id);
});
$('btn-vaciar').addEventListener('click', () => {
  if (!confirm('¿Vaciar la cotización?')) return;
  estado.cotizador = [];
  guardarCotizador();
  dibujarLista();
  dibujarCotizador();
});

// ---------------------------------------------------------------- menú y diálogos
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-cerrar]')) e.target.closest('dialog').close();
  const menu = document.querySelector('.menu');
  if (menu.open && (!menu.contains(e.target) || e.target.closest('.menu-lista button'))) menu.open = false;
});

// ---------------------------------------------------------------- cotización del dólar
$('btn-cotizacion').addEventListener('click', () => {
  const f = $('form-cotizacion');
  f.cotizacion.value = estado.cotizacion ? paraCampo(estado.cotizacion) : '';
  $('cot-nota').textContent = estado.cotizacionFecha
    ? `Última actualización: ${new Date(estado.cotizacionFecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`
    : 'Todos los precios en dólares se recalculan con este valor.';
  $('dlg-cotizacion').showModal();
  f.cotizacion.select();
});

$('form-cotizacion').addEventListener('submit', async (e) => {
  e.preventDefault();
  const valor = leerNumero(e.target.cotizacion.value);
  if (!valor || valor <= 0) { e.target.cotizacion.focus(); return; }
  const anterior = [estado.cotizacion, estado.cotizacionFecha];
  estado.cotizacion = valor;
  estado.cotizacionFecha = new Date().toISOString();
  $('dlg-cotizacion').close();
  dibujarCotizacion(); dibujarLista(); dibujarCotizador();
  try {
    await datos.guardarConfig({ cotizacion: estado.cotizacion, cotizacionFecha: estado.cotizacionFecha });
    aviso(`Dólar actualizado: $ ${numero(valor)}`);
  } catch {
    [estado.cotizacion, estado.cotizacionFecha] = anterior;
    dibujarCotizacion(); dibujarLista(); dibujarCotizador();
    aviso('No se pudo guardar la cotización.');
  }
});

// ---------------------------------------------------------------- ficha de producto
const fp = $('form-producto');
let editando = null; // producto abierto (null = nuevo)

function modoEdicion(activo) {
  $('campos-producto').disabled = !activo;
  $('chk-editar').checked = activo;
  $('btn-guardar').hidden = !activo;
  $('btn-borrar').hidden = !activo || !editando;
  $('btn-cerrar-prod').textContent = activo ? 'Cancelar' : 'Cerrar';
  $('prod-error').hidden = true;
}

function abrirFicha(p = null) {
  editando = p;
  fp.reset();
  $('prod-titulo').textContent = p ? 'Producto' : 'Nuevo producto';
  $('lbl-editar').hidden = !p;
  const v = p || { moneda: 'USD', categoria: estado.filtro !== 'todas' && estado.filtro !== 'favoritos' ? estado.filtro : '' };
  llenarFicha(v);
  modoEdicion(!p); // un producto existente abre en solo lectura; uno nuevo, editable
  $('dlg-producto').showModal();
  if (!p) fp.codigo.focus();
  else $('chk-editar').focus();
}

function llenarFicha(v) {
  fp.codigo.value = v.codigo || '';
  fp.categoria.value = v.categoria || '';
  fp.descripcion.value = v.descripcion || '';
  fp.proveedor.value = v.proveedor || '';
  fp.moneda.value = v.moneda || 'USD';
  fp.costoUSD.value = paraCampo(v.costoUSD);
  fp.margen.value = paraCampo(v.margen);
  fp.precioUSD.value = paraCampo(v.precioUSD);
  fp.precioARS.value = paraCampo(v.precioARS);
  fp.favorito.checked = !!v.favorito;
  actualizarDesglose();
}

$('chk-editar').addEventListener('change', (e) => {
  if (!e.target.checked && editando) llenarFicha(editando); // destildar descarta cambios
  modoEdicion(e.target.checked);
  if (e.target.checked) fp.descripcion.focus();
});

function leerFicha() {
  const moneda = fp.moneda.value;
  return {
    codigo: fp.codigo.value.trim(),
    categoria: fp.categoria.value.trim().toUpperCase() || 'SIN CATEGORÍA',
    descripcion: fp.descripcion.value.trim(),
    proveedor: fp.proveedor.value.trim(),
    moneda,
    costoUSD: leerNumero(fp.costoUSD.value),
    margen: leerNumero(fp.margen.value),
    precioUSD: moneda === 'USD' ? (leerNumero(fp.precioUSD.value) ?? 0) : null,
    precioARS: moneda === 'ARS' ? (leerNumero(fp.precioARS.value) ?? 0) : null,
    favorito: fp.favorito.checked,
  };
}

/** Tabla con toda la información interna: sin IVA, IVA y final, en US$ y en $. */
function actualizarDesglose() {
  const p = leerFicha();
  $('campos-usd').hidden = p.moneda !== 'USD';
  $('campos-ars').hidden = p.moneda !== 'ARS';
  const cot = estado.cotizacion;
  const sinIva = precioSinIva(p, cot);
  const fila = (titulo, usd, ars, clase = '') =>
    `<tr class="${clase}"><th>${titulo}</th><td class="num">${usd}</td><td class="num">${ars}</td></tr>`;
  let html;
  if (p.moneda === 'USD') {
    const u = p.precioUSD || 0;
    const costo = costoFinal(p, cot);
    html = `<thead><tr><th></th><th>US$</th><th>$ (dólar ${numero(cot)})</th></tr></thead><tbody>`
      + (p.costoUSD ? fila('Costo con IVA', dolares(p.costoUSD * (1 + IVA)), cot ? pesos(costo) : '—') : '')
      + fila('Precio sin IVA', dolares(u), cot ? pesos(sinIva) : '—')
      + fila('IVA 21%', dolares(u * IVA), cot ? pesos(sinIva * IVA) : '—')
      + fila('Precio final', dolares(u * (1 + IVA)), cot ? pesos(sinIva * (1 + IVA)) : '—', 'total')
      + '</tbody>';
  } else {
    html = '<thead><tr><th></th><th></th><th>$</th></tr></thead><tbody>'
      + fila('Precio sin IVA', '', pesos(sinIva))
      + fila('IVA 21%', '', pesos(sinIva * IVA))
      + fila('Precio final', '', pesos(sinIva * (1 + IVA)), 'total')
      + '</tbody>';
  }
  $('prod-desglose').innerHTML = html;
}

// Costo × margen = precio. Si se escribe el precio a mano, se recalcula el margen.
fp.addEventListener('input', (e) => {
  const n = e.target.name;
  const costo = leerNumero(fp.costoUSD.value);
  if ((n === 'costoUSD' || n === 'margen') && costo && leerNumero(fp.margen.value)) {
    fp.precioUSD.value = paraCampo(Math.round(costo * leerNumero(fp.margen.value) * 10000) / 10000);
  } else if (n === 'precioUSD' && costo) {
    const precio = leerNumero(fp.precioUSD.value);
    fp.margen.value = precio ? paraCampo(Math.round((precio / costo) * 1000) / 1000) : '';
  }
  actualizarDesglose();
});

fp.addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('campos-producto').disabled) return;
  const p = leerFicha();
  const error = (t) => { $('prod-error').textContent = t; $('prod-error').hidden = false; };
  if (!p.codigo || !p.descripcion) return error('Completá el código y la descripción.');
  const repetido = estado.productos.find((x) => x !== editando && normalizar(x.codigo) === normalizar(p.codigo));
  if (repetido) return error(`Ya existe otro producto con el código ${repetido.codigo}.`);

  const boton = $('btn-guardar');
  boton.disabled = true;
  try {
    const id = await datos.guardarProducto({ ...p, id: editando?.id });
    const nuevo = prepararProducto({ ...p, id });
    if (editando) estado.productos[estado.productos.indexOf(editando)] = nuevo;
    else estado.productos.push(nuevo);
    $('dlg-producto').close();
    dibujarTodo();
    aviso(editando ? 'Producto actualizado.' : 'Producto agregado.');
  } catch (err) {
    console.error(err);
    error('No se pudo guardar. Revisá la conexión.');
  } finally {
    boton.disabled = false;
  }
});

$('btn-borrar').addEventListener('click', async () => {
  if (!editando || !confirm(`¿Borrar "${editando.descripcion}"? No se puede deshacer.`)) return;
  try {
    await datos.borrarProducto(editando.id);
    estado.productos = estado.productos.filter((x) => x !== editando);
    estado.cotizador = estado.cotizador.filter((l) => l.id !== editando.id);
    guardarCotizador();
    $('dlg-producto').close();
    dibujarTodo();
    aviso('Producto borrado.');
  } catch {
    aviso('No se pudo borrar.');
  }
});

$('btn-nuevo').addEventListener('click', () => abrirFicha());

// ---------------------------------------------------------------- importar / exportar
let importacion = null;

function abrirImportar() {
  importacion = null;
  $('form-importar').reset();
  $('imp-resumen').hidden = true;
  $('imp-error').hidden = true;
  $('btn-confirmar-importar').disabled = true;
  $('dlg-importar').showModal();
}
$('btn-importar').addEventListener('click', abrirImportar);

$('archivo').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  importacion = null;
  $('btn-confirmar-importar').disabled = true;
  $('imp-resumen').hidden = true;
  $('imp-error').hidden = true;
  if (!archivo) return;
  try {
    const { leerExcel } = await import('./excel.js');
    importacion = await leerExcel(archivo);
    const { productos, avisos, descartadas, cotizacion, hoja } = importacion;
    const enPesos = productos.filter((p) => p.moneda === 'ARS').length;
    $('imp-resumen').innerHTML = `
      <strong>${productos.length} productos</strong> encontrados en la hoja "${esc(hoja)}"
      (${productos.length - enPesos} en dólares, ${enPesos} con precio fijo en pesos).<br>
      ${cotizacion ? `Cotización del dólar en la planilla: <strong>$ ${numero(cotizacion)}</strong> (se va a usar esa).` : ''}
      ${descartadas.length ? `<div>Se descartan:</div><ul>${descartadas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${avisos.length ? `<div>Para revisar después:</div><ul>${avisos.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${estado.productos.length ? `<p class="alerta">Atención: se reemplazan los ${estado.productos.length} productos que tenés cargados ahora (los favoritos se conservan).</p>` : ''}`;
    $('imp-resumen').hidden = false;
    $('btn-confirmar-importar').disabled = !productos.length;
  } catch (err) {
    console.error(err);
    $('imp-error').textContent = err.message || 'No se pudo leer el archivo.';
    $('imp-error').hidden = false;
  }
});

$('form-importar').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!importacion) return;
  const boton = $('btn-confirmar-importar');
  boton.disabled = true;
  boton.textContent = 'Importando…';
  try {
    const favs = new Set(estado.productos.filter((p) => p.favorito).map((p) => normalizar(p.codigo)));
    importacion.productos.forEach((p) => { if (favs.has(normalizar(p.codigo))) p.favorito = true; });

    await datos.reemplazarProductos(importacion.productos);
    if (importacion.cotizacion) {
      estado.cotizacion = importacion.cotizacion;
      estado.cotizacionFecha = new Date().toISOString();
      await datos.guardarConfig({ cotizacion: estado.cotizacion, cotizacionFecha: estado.cotizacionFecha });
    }
    estado.productos = (await datos.cargarProductos()).map(prepararProducto);
    estado.cotizador = []; // los ids cambiaron
    guardarCotizador();
    $('dlg-importar').close();
    estado.filtro = 'todas';
    dibujarTodo();
    aviso(`Listo: ${estado.productos.length} productos importados.`);
  } catch (err) {
    console.error(err);
    $('imp-error').textContent = 'No se pudo guardar la importación. Revisá la conexión.';
    $('imp-error').hidden = false;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Importar';
  }
});

$('btn-exportar').addEventListener('click', async () => {
  try {
    const { exportarExcel } = await import('./excel.js');
    await exportarExcel(estado.productos, estado.cotizacion);
  } catch (err) {
    aviso(err.message || 'No se pudo generar el Excel.');
  }
});

// ---------------------------------------------------------------- aviso flotante
let temporizadorAviso;
function aviso(texto) {
  const el = $('aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { el.hidden = true; }, 3000);
}
