// Interfaz: categorías (izquierda) · productos (centro) · cotización rápida (derecha).
import * as datos from './datos.js';
import {
  precioFinal, precioSinIva, costoFinal, coincide, textoBuscable, normalizar,
  leerNumero, paraCampo, pesos, dolares, numero, IVA,
} from './calculo.js';
import { UNIDADES, nombreUnidad, textoParaArca, codigoMarcador } from './arca.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const estado = {
  productos: [],
  cotizacion: 0,
  cotizacionFecha: null, // ISO: cuándo la publicó el banco (o cuándo se escribió a mano)
  cotizacionFuente: null, // 'bna' | 'guardada' | 'manual'
  cotizacionVia: null, // servicio que la trajo (CriptoYa / DolarApi)
  filtro: 'todas', // 'todas' | 'favoritos' | nombre de categoría
  busqueda: '',
  cotizador: [], // líneas de la cotización abierta (ver sección "cotización rápida")
  cotCliente: null,
  cotEditando: null,
  cotCambios: false,
  clientes: [],
  cotizaciones: [],
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
      const [config, productos, clientes, cotizaciones] = await Promise.all([
        datos.cargarConfig(), datos.cargarProductos(), datos.cargarColeccion('clientes'), datos.cargarColeccion('cotizaciones'),
      ]);
      estado.clientes = clientes;
      estado.cotizaciones = cotizaciones;
      // Primero la última guardada; enseguida se consulta la actual del Banco Nación.
      estado.cotizacion = config.cotizacion || 0;
      estado.cotizacionFecha = config.cotizacionFecha || null;
      estado.cotizacionVia = config.cotizacionVia || null;
      estado.cotizacionFuente = 'guardada';
      estado.productos = productos.map(prepararProducto);
      cargarCotizadorGuardado();
      $('usuario-email').textContent = usuario.email;
      $('pantalla-mensaje').hidden = true;
      $('app').hidden = false;
      dibujarTodo();
      $('busqueda').focus();
      obtenerCotizacion({ silencioso: true });
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
  dibujarInsignia();
}

function dibujarCotizacion() {
  const { cotizacion, cotizacionFecha, cotizacionFuente } = estado;
  const manual = cotizacionFuente === 'manual';
  $('cot-etiqueta').textContent = manual ? 'Dólar MANUAL' : 'Dólar BNA';
  $('cot-valor').textContent = cotizacion ? '$ ' + numero(cotizacion) : 'obtener';
  $('cot-fecha').textContent = manual ? 'temporal' : (cotizacionFecha ? fmtFecha(cotizacionFecha) : '');
  $('btn-cotizacion').classList.toggle('manual', manual);
  // Fecha en rojo si no es de hoy (en fin de semana es normal: muestra la del último día hábil).
  $('btn-cotizacion').classList.toggle('vieja', !manual && !!cotizacion && (cotizacionFuente === 'guardada' || !esDeHoy(cotizacionFecha)));
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
  // Orden pedido por Diego: Favoritos y Servicios arriba; después Todas y el resto alfabético.
  const fijas = cats.filter(([c]) => CATEGORIAS_ARRIBA.includes(c));
  const resto = cats.filter(([c]) => !CATEGORIAS_ARRIBA.includes(c));
  $('filtros').innerHTML = boton('favoritos', '★ Favoritos', estado.productos.filter((p) => p.favorito).length)
    + fijas.map(([c, n]) => boton(c, capitalizar(c), n)).join('')
    + '<li class="separador"></li>'
    + boton('todas', 'Todas', estado.productos.length)
    + resto.map(([c, n]) => boton(c, capitalizar(c), n)).join('');

  // Mismo orden en el desplegable del celular.
  const opcion = (valor, texto, n) =>
    `<option value="${esc(valor)}" ${valor === estado.filtro ? 'selected' : ''}>${esc(texto)} (${n})</option>`;
  $('sel-categoria').innerHTML = opcion('favoritos', '★ Favoritos', estado.productos.filter((p) => p.favorito).length)
    + fijas.map(([c, n]) => opcion(c, capitalizar(c), n)).join('')
    + '<option disabled>──────────</option>'
    + opcion('todas', 'Todas', estado.productos.length)
    + resto.map(([c, n]) => opcion(c, capitalizar(c), n)).join('');
}

$('sel-categoria').addEventListener('change', (e) => {
  estado.filtro = e.target.value;
  if (estado.busqueda) { estado.busqueda = ''; $('busqueda').value = ''; }
  dibujarFiltros();
  dibujarLista();
  window.scrollTo(0, 0);
});
const CATEGORIAS_ARRIBA = ['SERVICIOS'];

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
    + (estado.cotizacion ? '' : ' · Sin cotización del dólar: tocá «Dólar» arriba a la derecha');

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
// Líneas de estado.cotizador:
//   producto "vivo":  { id: <id del producto>, cantidad }      → precio según dólar y lista actuales
//   línea fija:       { id: 'f-…', fija: true, productoId|null, codigo, descripcion, unidad, precio, costo, cantidad }
//                     → precio congelado (ítem provisorio o cotización guardada que se abrió)
// estado.cotCliente: { id, nombre, cuit, condicionIva } | null
// estado.cotEditando: { id, numero, estado, fecha, dolar } | null  (cotización guardada abierta)
const CLAVE_COTIZADOR = 'precios.cotizador.v2';
const centavos = (n) => Math.round(n * 100) / 100;
const nuevoIdLinea = () => 'f-' + Math.random().toString(36).slice(2, 10);
const fmtNumero = (n) => 'Nº ' + String(n || 0).padStart(4, '0');
const fmtCuit = (c) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : d; };
const fmtDia = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');

function cargarCotizadorGuardado() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_COTIZADOR) || 'null');
    if (!g) return;
    estado.cotizador = (g.lineas || []).filter((l) => l.cantidad > 0 && (l.fija || porId(l.id)));
    estado.cotCliente = g.cliente || null;
    estado.cotEditando = g.editando || null;
    estado.cotCambios = !!g.cambios;
  } catch { /* sin almacenamiento */ }
}
function guardarCotizador() {
  try {
    localStorage.setItem(CLAVE_COTIZADOR, JSON.stringify({
      lineas: estado.cotizador, cliente: estado.cotCliente, editando: estado.cotEditando, cambios: estado.cotCambios,
    }));
  } catch { /* sin almacenamiento */ }
}
function huboCambios() { estado.cotCambios = true; guardarCotizador(); }

/** Línea por id de línea o por id de producto (la lista de productos usa el del producto). */
const lineaDe = (id) => estado.cotizador.find((l) => l.id === id || (l.productoId && l.productoId === id));

function inputsDeLinea(l) {
  const ids = [l.id, l.productoId].filter(Boolean).map((x) => `[data-id="${CSS.escape(x)}"] [data-cantidad]`);
  return document.querySelectorAll(ids.join(','));
}

function agregarAlCotizador(id) {
  if (!lineaDe(id)) estado.cotizador.push({ id, cantidad: 1 });
  huboCambios();
  redibujarProducto(id, true);
  dibujarCotizador();
}

function quitarDelCotizador(id) {
  const l = lineaDe(id);
  if (!l) return;
  estado.cotizador = estado.cotizador.filter((x) => x !== l);
  huboCambios();
  redibujarProducto(l.productoId || l.id);
  dibujarCotizador();
}

function cambiarCantidad(id, texto, origen) {
  const linea = lineaDe(id);
  if (!linea) return;
  const n = leerNumero(texto);
  if (n == null || n <= 0) return; // mientras escribe (vacío, "0,") no se toca
  linea.cantidad = n;
  huboCambios();
  inputsDeLinea(linea).forEach((input) => { if (input !== origen) input.value = paraCampo(n); });
  actualizarNumerosCotizador();
}

/** Datos de una línea, con los mismos redondeos que ARCA. */
function calcularLinea(l) {
  if (l.fija) {
    return {
      descripcion: l.descripcion, codigo: l.codigo || '', unidad: l.unidad || 7,
      precioUnitario: l.precio, costoUnitario: l.costo ?? null,
      costo: l.costo == null ? null : l.costo * l.cantidad,
      venta: centavos(l.precio * l.cantidad),
    };
  }
  const p = porId(l.id) || { descripcion: '(producto borrado)', codigo: '', moneda: 'ARS', precioARS: 0 };
  const costoU = costoFinal(p, estado.cotizacion);
  const precioUnitario = centavos(precioFinal(p, estado.cotizacion));
  return {
    descripcion: p.descripcion || p.codigo, codigo: p.codigo, unidad: p.unidad || 7,
    precioUnitario, costoUnitario: costoU,
    costo: costoU == null ? null : costoU * l.cantidad,
    venta: centavos(precioUnitario * l.cantidad),
  };
}

function totales(lineas = estado.cotizador) {
  let venta = 0, costo = 0, sinCosto = 0;
  lineas.forEach((l) => {
    const c = calcularLinea(l);
    venta += c.venta;
    if (c.costo == null) sinCosto++; else costo += c.costo;
  });
  return { venta: centavos(venta), costo: centavos(costo), sinCosto };
}

function htmlCliente() {
  const c = estado.cotCliente;
  if (!c) return '<button class="btn chico" data-elegir-cliente type="button">+ Cliente</button>';
  return `<div class="cliente-sel">
    <div><strong>${esc(c.nombre)}</strong><small>${esc(c.condicionIva || '')}</small></div>
    <div class="cliente-cuit">
      ${c.cuit ? `<span class="codigo">${esc(fmtCuit(c.cuit))}</span><button class="btn chico" data-copiar-cuit type="button" title="Copiar CUIT (sin guiones)">Copiar CUIT</button>` : ''}
      <button class="enlace" data-elegir-cliente type="button">Cambiar</button>
    </div>
  </div>`;
}

function dibujarCotizador() {
  const cont = $('cotizador');
  const hay = estado.cotizador.length > 0;
  const ed = estado.cotEditando;
  const activo = hay || estado.cotCliente || ed;

  $('titulo-cot').innerHTML = ed
    ? `Cotización ${fmtNumero(ed.numero)} <span class="estado-cot ${ed.estado}">${ed.estado === 'facturada' ? 'Facturada' : 'Pendiente'}</span>`
      + (estado.cotCambios ? ' <span class="sin-guardar">cambios sin guardar</span>' : '')
    : 'Cotización rápida';
  $('btn-vaciar').hidden = !activo;
  $('btn-vaciar').textContent = ed ? 'Cerrar' : 'Vaciar';
  $('barra-cot').hidden = !activo;
  if (!activo && document.body.classList.contains('cot-abierta')) cerrarCotizadorMovil();

  const filas = estado.cotizador.map((l) => {
    const c = calcularLinea(l);
    const extra = [c.codigo, nombreUnidad(c.unidad), l.fija && !l.productoId ? 'ítem provisorio' : (l.fija ? 'precio guardado' : '')].filter(Boolean).join(' · ');
    return `<tr data-id="${esc(l.id)}">
      <td><input class="cantidad" data-cantidad value="${esc(paraCampo(l.cantidad))}" inputmode="decimal" aria-label="Cantidad"></td>
      <td class="item-cot">${esc(c.descripcion)}<small>${esc(extra)}</small></td>
      <td class="num" data-costo></td>
      <td class="num" data-venta></td>
      <td><button class="quitar" data-quitar title="Quitar" aria-label="Quitar">×</button></td>
    </tr>`;
  }).join('');

  const dolarGuardado = ed?.dolar?.valor ? ` · dólar guardado $ ${numero(ed.dolar.valor)} (${fmtDia(ed.fecha)})` : '';
  cont.innerHTML = `
    <div class="cot-cliente">${htmlCliente()}</div>
    ${hay ? `
    <table class="tabla-cot">
      <thead><tr><th>Cant.</th><th>Ítem</th><th class="num">Costo total</th><th class="num">Precio de venta</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><td></td><td>Totales</td><td class="num" data-total-costo></td><td class="num" data-total-venta></td><td></td></tr></tfoot>
    </table>` : `<p class="cot-vacia">Tocá <strong>Agregar</strong> en un producto, o agregá un ítem provisorio, para armar la cotización.</p>`}
    <div class="cot-agregar"><button class="btn chico" data-agregar-libre type="button">+ Agregar ítem</button>${dolarGuardado ? `<span class="nota">${dolarGuardado.slice(3)}</span>` : ''}</div>
    ${hay ? `
    <div class="cot-resumen" data-resumen></div>
    <div class="cot-acciones">
      <button class="btn primario" data-guardar-cot type="button">💾 ${ed ? 'Guardar cambios' : 'Guardar cotización'}</button>
      <button class="btn" data-copiar-arca type="button" title="Copia los ítems para pegarlos en ARCA con el marcador">📋 Copiar para ARCA</button>
      ${ed && ed.estado !== 'facturada' ? '<button class="btn" data-marcar-facturada type="button">✓ Marcar facturada</button>' : ''}
      <button class="enlace" data-ayuda-arca type="button">¿Cómo se usa?</button>
    </div>` : ''}`;
  actualizarNumerosCotizador();
}

/** Recalcula los importes sin redibujar los campos (para no perder el foco). */
function actualizarNumerosCotizador() {
  const cont = $('cotizador');
  estado.cotizador.forEach((l) => {
    const { costo, venta } = calcularLinea(l);
    const fila = cont.querySelector(`tr[data-id="${CSS.escape(l.id)}"]`);
    if (!fila) return;
    fila.querySelector('[data-costo]').innerHTML = costo == null ? '<span class="falta" title="Sin costo cargado">—</span>' : pesos(costo);
    fila.querySelector('[data-venta]').textContent = pesos(venta);
  });
  const t = totales();
  const set = (sel, html) => { const el = cont.querySelector(sel); if (el) el.innerHTML = html; };
  set('[data-total-costo]', pesos(t.costo));
  set('[data-total-venta]', pesos(t.venta));

  const n = estado.cotizador.length;
  $('bc-items').textContent = estado.cotEditando ? `${fmtNumero(estado.cotEditando.numero)} · ${n} ${n === 1 ? 'ítem' : 'ítems'}` : `${n} ${n === 1 ? 'ítem' : 'ítems'}`;
  $('bc-venta').textContent = pesos(t.venta);
  $('bc-costo').textContent = `costo ${pesos(t.costo)}${t.sinCosto ? ' *' : ''}`;

  const ganancia = t.venta - t.costo;
  const pct = t.costo > 0 ? `${numero(Math.round((ganancia / t.costo) * 1000) / 10)}% sobre el costo. ` : '';
  set('[data-resumen]', `
    <span>Diferencia venta − costo</span><span class="num ganancia">${pesos(ganancia)}</span>
    <span class="nota">${pct}Costos y ventas con IVA incluido.
    ${t.sinCosto ? `<br><strong>${t.sinCosto} ${t.sinCosto === 1 ? 'ítem no tiene' : 'ítems no tienen'} costo cargado</strong> (servicios, precio fijo o provisorios): la diferencia los cuenta como ganancia completa.` : ''}</span>`);
}

// ---- Copiar para ARCA (desde la cotización abierta o desde una guardada)
async function copiarItemsArca(items) {
  const texto = textoParaArca(items);
  try {
    await navigator.clipboard.writeText(texto);
    aviso(`Copiado: ${items.length} ${items.length === 1 ? 'ítem' : 'ítems'}. En ARCA tocá el marcador "Pegar en ARCA".`);
  } catch {
    prompt('Copiá este texto (Ctrl+C) y pegalo cuando el marcador lo pida:', texto);
  }
}

async function copiarParaArca() {
  const hayVivos = estado.cotizador.some((l) => !l.fija);
  if (hayVivos && estado.cotizacionFuente !== 'manual' && estado.cotizacionFuente !== 'bna'
    && !confirm('El dólar no está actualizado (no se pudo consultar el Banco Nación). ¿Copiar igual?')) return;
  await copiarItemsArca(estado.cotizador.map((l) => {
    const c = calcularLinea(l);
    return { descripcion: c.descripcion, cantidad: l.cantidad, unidad: c.unidad, precioUnitario: c.precioUnitario };
  }));
}

async function copiarCuit(cuit) {
  const d = String(cuit || '').replace(/\D/g, '');
  if (!d) return;
  try { await navigator.clipboard.writeText(d); aviso(`CUIT copiado: ${d}`); } catch { prompt('Copiá el CUIT:', d); }
}

function abrirAyudaArca() {
  $('link-marcador').href = codigoMarcador();
  $('dlg-arca').showModal();
}
$('btn-marcador').addEventListener('click', abrirAyudaArca);
$('btn-copiar-marcador').addEventListener('click', async () => {
  const codigo = codigoMarcador();
  try {
    await navigator.clipboard.writeText(codigo);
    aviso('Código copiado. Ahora: clic derecho en la barra de favoritos → Agregar página… y pegalo en URL.');
  } catch {
    prompt('Copiá este código (Ctrl+C) y pegalo en el campo URL del marcador:', codigo);
  }
});
$('link-marcador').addEventListener('click', (e) => { e.preventDefault(); aviso('Arrastralo a la barra de favoritos (no hace falta tocarlo acá).'); });

// ---- Guardar cotización (el "pantallazo": todo con precios congelados)
function lineaFija(l) {
  if (l.fija) return { ...l };
  const c = calcularLinea(l);
  return {
    id: nuevoIdLinea(), fija: true, productoId: l.id, codigo: c.codigo, descripcion: c.descripcion,
    unidad: c.unidad, precio: c.precioUnitario, costo: c.costoUnitario == null ? null : centavos(c.costoUnitario), cantidad: l.cantidad,
  };
}

async function guardarCotizacion() {
  if (!estado.cotizador.length) return;
  if (!estado.cotCliente && !confirm('La cotización no tiene cliente. ¿Guardarla igual?')) return;
  const ed = estado.cotEditando;
  const lineas = estado.cotizador.map(lineaFija);
  const t = totales(lineas);
  const numero = ed?.numero || (Math.max(0, ...estado.cotizaciones.map((c) => c.numero || 0)) + 1);
  const ahora = new Date().toISOString();
  const doc = {
    id: ed?.id,
    numero,
    fecha: ed?.fecha || ahora,
    estado: ed?.estado || 'pendiente',
    facturadaEn: ed?.facturadaEn || null,
    cliente: estado.cotCliente ? { ...estado.cotCliente } : null,
    dolar: ed?.dolar || { valor: estado.cotizacion, fuente: estado.cotizacionFuente, fecha: estado.cotizacionFecha },
    items: lineas.map(({ productoId, codigo, descripcion, unidad, precio, costo, cantidad }) =>
      ({ productoId: productoId || null, codigo: codigo || '', descripcion, unidad, precio, costo: costo ?? null, cantidad })),
    totales: t,
    modificada: ed ? ahora : null,
  };
  const boton = $('cotizador').querySelector('[data-guardar-cot]');
  if (boton) boton.disabled = true;
  try {
    const id = await datos.guardarEn('cotizaciones', doc);
    const guardada = { ...doc, id };
    const i = estado.cotizaciones.findIndex((c) => c.id === id);
    if (i >= 0) estado.cotizaciones[i] = guardada; else estado.cotizaciones.push(guardada);
    abrirCotizacionGuardada(guardada, { sinPreguntar: true });
    dibujarInsignia();
    aviso(`Cotización ${fmtNumero(numero)} guardada.`);
  } catch (err) {
    console.error(err);
    aviso('No se pudo guardar la cotización. Revisá la conexión.');
    if (boton) boton.disabled = false;
  }
}

/** Carga una cotización guardada en el panel, con sus precios congelados. */
function abrirCotizacionGuardada(c, { sinPreguntar = false } = {}) {
  if (!sinPreguntar && estado.cotCambios && estado.cotizador.length
    && !confirm('La cotización abierta tiene cambios sin guardar. ¿Descartarlos y abrir la otra?')) return false;
  estado.cotizador = (c.items || []).map((it) => ({ id: nuevoIdLinea(), fija: true, ...it }));
  estado.cotCliente = c.cliente || null;
  estado.cotEditando = { id: c.id, numero: c.numero, estado: c.estado, fecha: c.fecha, dolar: c.dolar, facturadaEn: c.facturadaEn || null };
  estado.cotCambios = false;
  guardarCotizador();
  dibujarLista();
  dibujarCotizador();
  return true;
}

async function marcarFacturada(id, facturada = true) {
  const c = estado.cotizaciones.find((x) => x.id === id);
  if (!c) return;
  const antes = { estado: c.estado, facturadaEn: c.facturadaEn };
  c.estado = facturada ? 'facturada' : 'pendiente';
  c.facturadaEn = facturada ? new Date().toISOString() : null;
  if (estado.cotEditando?.id === id) { estado.cotEditando.estado = c.estado; estado.cotEditando.facturadaEn = c.facturadaEn; guardarCotizador(); }
  dibujarCotizaciones(); dibujarCotizador(); dibujarInsignia();
  try {
    await datos.guardarEn('cotizaciones', c);
    aviso(facturada ? `${fmtNumero(c.numero)} marcada como facturada.` : `${fmtNumero(c.numero)} volvió a pendiente.`);
  } catch {
    Object.assign(c, antes);
    dibujarCotizaciones(); dibujarCotizador(); dibujarInsignia();
    aviso('No se pudo guardar el cambio.');
  }
}

function nuevaCotizacion() {
  estado.cotizador = [];
  estado.cotCliente = null;
  estado.cotEditando = null;
  estado.cotCambios = false;
  guardarCotizador();
  dibujarLista();
  dibujarCotizador();
}

// ---- Eventos del panel
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
  const t = e.target;
  if (t.closest('[data-copiar-arca]')) return copiarParaArca();
  if (t.closest('[data-ayuda-arca]')) return abrirAyudaArca();
  if (t.closest('[data-guardar-cot]')) return guardarCotizacion();
  if (t.closest('[data-marcar-facturada]')) return marcarFacturada(estado.cotEditando.id, true);
  if (t.closest('[data-agregar-libre]')) return abrirItemLibre();
  if (t.closest('[data-elegir-cliente]')) return abrirClientes();
  if (t.closest('[data-copiar-cuit]')) return copiarCuit(estado.cotCliente?.cuit);
  if (t.closest('[data-quitar]')) quitarDelCotizador(t.closest('tr').dataset.id);
});

// Celular: la cotización se abre en pantalla completa. Se agrega un paso al historial
// para que el botón "atrás" del teléfono la cierre en vez de salir de la página.
function abrirCotizadorMovil() {
  document.body.classList.add('cot-abierta');
  history.pushState({ cotizador: true }, '');
}
function cerrarCotizadorMovil() {
  if (!document.body.classList.contains('cot-abierta')) return;
  document.body.classList.remove('cot-abierta');
  if (history.state?.cotizador) history.back();
}
$('barra-cot').addEventListener('click', abrirCotizadorMovil);
$('btn-cerrar-cot').addEventListener('click', cerrarCotizadorMovil);
window.addEventListener('popstate', () => document.body.classList.remove('cot-abierta'));

$('btn-vaciar').addEventListener('click', () => {
  const ed = estado.cotEditando;
  if (ed ? (estado.cotCambios && !confirm('Hay cambios sin guardar en esta cotización. ¿Cerrarla igual?'))
    : !confirm('¿Vaciar la cotización?')) return;
  nuevaCotizacion();
});

// ---- Ítem provisorio
const fl = $('form-libre');
$('sel-unidad-libre').innerHTML = UNIDADES.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('');
function abrirItemLibre() {
  fl.reset();
  fl.cantidad.value = '1';
  $('libre-error').hidden = true;
  $('dlg-libre').showModal();
  fl.descripcion.focus();
}
fl.addEventListener('submit', (e) => {
  e.preventDefault();
  const descripcion = fl.descripcion.value.trim();
  const cantidad = leerNumero(fl.cantidad.value);
  const precio = leerNumero(fl.precio.value);
  const error = (m) => { $('libre-error').textContent = m; $('libre-error').hidden = false; };
  if (!descripcion) return error('Escribí la descripción.');
  if (!cantidad || cantidad <= 0) return error('La cantidad tiene que ser mayor que cero.');
  if (precio == null || precio < 0) return error('Escribí el precio unitario (ej. 15.000 o 15000,50).');
  estado.cotizador.push({
    id: nuevoIdLinea(), fija: true, productoId: null, codigo: '', descripcion,
    unidad: Number(fl.unidad.value) || 7, precio: centavos(precio), costo: null, cantidad,
  });
  huboCambios();
  $('dlg-libre').close();
  dibujarCotizador();
});

// ---- Clientes
const CONDICIONES_IVA = ['Consumidor Final', 'IVA Responsable Inscripto', 'Responsable Monotributo', 'IVA Sujeto Exento', 'Monotributista Social', 'IVA no alcanzado'];
const fc = $('form-cliente');
$('sel-condicion').innerHTML = CONDICIONES_IVA.map((c) => `<option>${esc(c)}</option>`).join('');
let clienteEditando = null;

function abrirClientes() {
  $('cli-buscar').value = '';
  mostrarListaClientes();
  $('dlg-cliente').showModal();
  if (estado.clientes.length) $('cli-buscar').focus(); else abrirFormCliente(null);
}
function mostrarListaClientes() {
  $('cli-elegir').hidden = false;
  $('cli-formulario').hidden = true;
  $('cli-acciones').hidden = false;
  dibujarListaClientes();
}
function dibujarListaClientes() {
  const q = normalizar($('cli-buscar').value);
  const lista = estado.clientes
    .filter((c) => !q || normalizar(`${c.nombre} ${c.cuit}`).includes(q) || String(c.cuit || '').includes(q.replace(/\D/g, '') || '¬'))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  $('cli-lista').innerHTML = lista.length ? lista.map((c) => `<li data-cli="${esc(c.id)}">
      <button type="button" class="cli-elegir" data-usar><strong>${esc(c.nombre)}</strong><small>${esc(fmtCuit(c.cuit))} · ${esc(c.condicionIva || '')}</small></button>
      <button type="button" class="enlace" data-editar>Editar</button>
    </li>`).join('')
    : `<li class="nota">${estado.clientes.length ? 'Ningún cliente coincide.' : 'Todavía no cargaste clientes.'}</li>`;
}
function abrirFormCliente(c) {
  clienteEditando = c;
  fc.reset();
  fc.nombre.value = c?.nombre || $('cli-buscar').value.trim();
  fc.cuit.value = c ? fmtCuit(c.cuit) : '';
  fc.condicionIva.value = c?.condicionIva || 'Consumidor Final';
  $('btn-cli-borrar').hidden = !c;
  $('cli-error').hidden = true;
  $('cli-elegir').hidden = true;
  $('cli-acciones').hidden = true;
  $('cli-formulario').hidden = false;
  fc.nombre.focus();
}
function usarCliente(c) {
  estado.cotCliente = { id: c.id, nombre: c.nombre, cuit: c.cuit || '', condicionIva: c.condicionIva || '' };
  huboCambios();
  $('dlg-cliente').close();
  dibujarCotizador();
}
$('cli-buscar').addEventListener('input', dibujarListaClientes);
$('cli-lista').addEventListener('click', (e) => {
  const li = e.target.closest('[data-cli]');
  const c = li && estado.clientes.find((x) => x.id === li.dataset.cli);
  if (!c) return;
  if (e.target.closest('[data-editar]')) abrirFormCliente(c);
  else if (e.target.closest('[data-usar]')) usarCliente(c);
});
$('btn-cli-nuevo').addEventListener('click', () => abrirFormCliente(null));
$('btn-cli-volver').addEventListener('click', () => (estado.clientes.length ? mostrarListaClientes() : $('dlg-cliente').close()));
fc.addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = (m) => { $('cli-error').textContent = m; $('cli-error').hidden = false; };
  const nombre = fc.nombre.value.trim();
  const cuit = fc.cuit.value.replace(/\D/g, '');
  if (!nombre) return error('Escribí un nombre.');
  if (cuit && cuit.length !== 11 && (cuit.length < 7 || cuit.length > 8)) return error('El CUIT tiene 11 números (o el DNI 7 u 8).');
  const cliente = { id: clienteEditando?.id, nombre, cuit, condicionIva: fc.condicionIva.value };
  try {
    const id = await datos.guardarEn('clientes', cliente);
    const guardado = { ...cliente, id };
    const i = estado.clientes.findIndex((x) => x.id === id);
    if (i >= 0) estado.clientes[i] = guardado; else estado.clientes.push(guardado);
    usarCliente(guardado);
  } catch (err) {
    console.error(err);
    error('No se pudo guardar el cliente. Revisá la conexión.');
  }
});
$('btn-cli-borrar').addEventListener('click', async () => {
  const c = clienteEditando;
  if (!c || !confirm(`¿Borrar el cliente "${c.nombre}"? Las cotizaciones guardadas conservan sus datos.`)) return;
  try {
    await datos.borrarDe('clientes', c.id);
    estado.clientes = estado.clientes.filter((x) => x.id !== c.id);
    mostrarListaClientes();
  } catch { $('cli-error').textContent = 'No se pudo borrar.'; $('cli-error').hidden = false; }
});

// ---- Cotizaciones guardadas (línea de ensamblaje)
let filtroCots = 'pendiente';
function dibujarInsignia() {
  const n = estado.cotizaciones.filter((c) => c.estado !== 'facturada').length;
  $('insignia-pend').hidden = !n;
  $('insignia-pend').textContent = n;
}
function abrirCotizaciones() {
  dibujarCotizaciones();
  $('dlg-cotizaciones').showModal();
}
function dibujarCotizaciones() {
  if (!$('dlg-cotizaciones')) return;
  document.querySelectorAll('#cots-pestanas [data-estado]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.estado === filtroCots)));
  const q = normalizar($('cots-buscar').value);
  const lista = estado.cotizaciones
    .filter((c) => filtroCots === 'todas' || (filtroCots === 'facturada' ? c.estado === 'facturada' : c.estado !== 'facturada'))
    .filter((c) => !q || normalizar(`${c.cliente?.nombre || ''} ${c.cliente?.cuit || ''} ${c.numero} ${fmtNumero(c.numero)}`).includes(q))
    .sort((a, b) => (filtroCots === 'pendiente' ? a.numero - b.numero : b.numero - a.numero));
  if (!lista.length) {
    $('cots-lista').innerHTML = `<p class="cot-vacia">${estado.cotizaciones.length ? 'No hay cotizaciones en esta vista.' : 'Todavía no guardaste cotizaciones. Armá una y tocá "Guardar cotización".'}</p>`;
    return;
  }
  $('cots-lista').innerHTML = `<table class="tabla-cots">
    <thead><tr><th>Nº</th><th>Fecha</th><th>Cliente</th><th class="num">Ítems</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead>
    <tbody>${lista.map((c) => `<tr data-cot="${esc(c.id)}" class="${estado.cotEditando?.id === c.id ? 'abierta' : ''}">
      <td class="codigo-num">${esc(fmtNumero(c.numero))}</td>
      <td>${esc(fmtDia(c.fecha))}</td>
      <td>${c.cliente ? `<strong>${esc(c.cliente.nombre)}</strong><small>${c.cliente.cuit ? `${esc(fmtCuit(c.cliente.cuit))} <button type="button" class="enlace" data-cuit>copiar</button> · ` : ''}${esc(c.cliente.condicionIva || '')}</small>` : '<span class="nota">sin cliente</span>'}</td>
      <td class="num">${(c.items || []).length}</td>
      <td class="num"><strong>${pesos(c.totales?.venta)}</strong></td>
      <td>${c.estado === 'facturada'
        ? `<span class="estado-cot facturada">Facturada ${esc(fmtDia(c.facturadaEn))}</span> <button type="button" class="enlace" data-deshacer>deshacer</button>`
        : '<span class="estado-cot pendiente">Pendiente</span>'}</td>
      <td><div class="acciones-fila">
        <button type="button" class="btn chico primario" data-copiar title="Copiar ítems para el marcador de ARCA">📋 Copiar</button>
        ${c.estado !== 'facturada' ? '<button type="button" class="btn chico" data-facturada>✓ Facturada</button>' : ''}
        <button type="button" class="btn chico" data-abrir>Abrir</button>
        <button type="button" class="quitar" data-borrar title="Borrar cotización" aria-label="Borrar">🗑</button>
      </div></td>
    </tr>`).join('')}</tbody></table>`;
}
$('btn-cotizaciones').addEventListener('click', abrirCotizaciones);
$('cots-buscar').addEventListener('input', dibujarCotizaciones);
$('cots-pestanas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-estado]');
  if (!b) return;
  filtroCots = b.dataset.estado;
  dibujarCotizaciones();
});
$('cots-lista').addEventListener('click', async (e) => {
  const tr = e.target.closest('[data-cot]');
  const c = tr && estado.cotizaciones.find((x) => x.id === tr.dataset.cot);
  if (!c) return;
  const t = e.target;
  if (t.closest('[data-cuit]')) return copiarCuit(c.cliente?.cuit);
  if (t.closest('[data-copiar]')) {
    return copiarItemsArca((c.items || []).map((it) => ({ descripcion: it.descripcion, cantidad: it.cantidad, unidad: it.unidad, precioUnitario: it.precio })));
  }
  if (t.closest('[data-facturada]')) return marcarFacturada(c.id, true);
  if (t.closest('[data-deshacer]')) return marcarFacturada(c.id, false);
  if (t.closest('[data-abrir]')) {
    if (abrirCotizacionGuardada(c)) { $('dlg-cotizaciones').close(); if (matchMedia('(max-width: 900px)').matches) abrirCotizadorMovil(); }
    return;
  }
  if (t.closest('[data-borrar]')) {
    if (!confirm(`¿Borrar la cotización ${fmtNumero(c.numero)}${c.cliente ? ` de ${c.cliente.nombre}` : ''}? No se puede deshacer.`)) return;
    try {
      await datos.borrarDe('cotizaciones', c.id);
      estado.cotizaciones = estado.cotizaciones.filter((x) => x.id !== c.id);
      if (estado.cotEditando?.id === c.id) { estado.cotEditando = null; estado.cotCambios = true; guardarCotizador(); dibujarCotizador(); }
      dibujarCotizaciones(); dibujarInsignia();
    } catch { aviso('No se pudo borrar.'); }
  }
});

// ---------------------------------------------------------------- menú y diálogos
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-cerrar]')) e.target.closest('dialog').close();
  const menu = document.querySelector('.menu');
  if (menu.open && (!menu.contains(e.target) || e.target.closest('.menu-lista button'))) menu.open = false;
});

// ---------------------------------------------------------------- cotización del dólar
// Fuentes posibles (estado.cotizacionFuente):
//   'bna'      → recién traída del Banco Nación (billete, venta)
//   'guardada' → la última del BNA guardada en Firebase (no se pudo traer la actual)
//   'manual'   → escrita a mano; temporal: dura hasta "Obtener cotización" o recargar
const fmtFecha = (iso) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const esDeHoy = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();

function textoEstadoCotizacion() {
  const { cotizacion, cotizacionFecha, cotizacionFuente, cotizacionVia } = estado;
  if (!cotizacion) return 'Todavía no hay cotización. Tocá "Obtener cotización" o escribila a mano.';
  if (cotizacionFuente === 'manual') return `<strong>$ ${numero(cotizacion)}</strong> · ingresada a mano (temporal).`;
  const cuando = cotizacionFecha ? fmtFecha(cotizacionFecha) : '';
  return `<strong>$ ${numero(cotizacion)}</strong> · Banco Nación, billete venta`
    + `<br><span class="nota">Publicada ${cuando}${cotizacionVia ? ` (vía ${esc(cotizacionVia)})` : ''}`
    + `${cotizacionFuente === 'guardada' ? '. No se pudo actualizar: es la última guardada.' : ''}</span>`;
}

async function obtenerCotizacion({ silencioso = false } = {}) {
  const boton = $('btn-obtener');
  boton.disabled = true;
  boton.textContent = 'Consultando…';
  $('cot-error').hidden = true;
  try {
    const { cotizacionBNA } = await import('./dolar.js');
    const { valor, fecha, via } = await cotizacionBNA();
    Object.assign(estado, { cotizacion: valor, cotizacionFecha: fecha.toISOString(), cotizacionFuente: 'bna', cotizacionVia: via });
    redibujarPorCotizacion();
    if (!silencioso) aviso(`Dólar Banco Nación: $ ${numero(valor)}`);
    // Se guarda como respaldo por si otro día no se puede consultar.
    datos.guardarConfig({ cotizacion: valor, cotizacionFecha: estado.cotizacionFecha, cotizacionVia: via }).catch(console.error);
    return true;
  } catch (err) {
    console.error(err);
    if (estado.cotizacionFuente !== 'manual' && estado.cotizacion) estado.cotizacionFuente = 'guardada';
    redibujarPorCotizacion();
    const msg = estado.cotizacion && estado.cotizacionFuente === 'guardada'
      ? `No se pudo consultar el Banco Nación. Se usa la última guardada (${fmtFecha(estado.cotizacionFecha)}).`
      : 'No se pudo consultar el Banco Nación. Probá de nuevo o escribila a mano.';
    $('cot-error').textContent = msg;
    $('cot-error').hidden = false;
    aviso(msg);
    return false;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Obtener cotización del Banco Nación';
  }
}

function redibujarPorCotizacion() {
  dibujarCotizacion(); dibujarLista(); dibujarCotizador();
  $('cot-estado').innerHTML = textoEstadoCotizacion();
  $('cot-estado').classList.toggle('manual', estado.cotizacionFuente === 'manual');
}

$('btn-cotizacion').addEventListener('click', () => {
  const f = $('form-cotizacion');
  f.cotizacion.value = estado.cotizacionFuente === 'manual' ? paraCampo(estado.cotizacion) : '';
  $('cot-estado').innerHTML = textoEstadoCotizacion();
  $('cot-estado').classList.toggle('manual', estado.cotizacionFuente === 'manual');
  $('cot-error').hidden = true;
  $('dlg-cotizacion').showModal();
  $('btn-obtener').focus();
});

$('btn-obtener').addEventListener('click', async () => {
  if (await obtenerCotizacion()) $('dlg-cotizacion').close();
});

$('form-cotizacion').addEventListener('submit', (e) => {
  e.preventDefault();
  const valor = leerNumero(e.target.cotizacion.value);
  if (!valor || valor <= 0) {
    $('cot-error').textContent = 'Escribí un valor válido, por ejemplo 1.535 o 1535,50.';
    $('cot-error').hidden = false;
    e.target.cotizacion.focus();
    return;
  }
  // Manual = temporal: no se guarda en Firebase.
  Object.assign(estado, { cotizacion: valor, cotizacionFecha: new Date().toISOString(), cotizacionFuente: 'manual', cotizacionVia: null });
  $('dlg-cotizacion').close();
  redibujarPorCotizacion();
  aviso(`Usando dólar manual: $ ${numero(valor)}`);
});

// ---------------------------------------------------------------- ficha de producto
const fp = $('form-producto');
$('sel-unidad').innerHTML = UNIDADES.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('');
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
  fp.unidad.value = String(v.unidad || 7);
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
    unidad: Number(fp.unidad.value) || 7,
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
$('btn-nuevo-menu').addEventListener('click', () => abrirFicha());

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
      ${cotizacion ? `La planilla tiene el dólar a $ ${numero(cotizacion)}; no se usa: los precios se calculan con el del Banco Nación.` : ''}
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
    estado.productos = (await datos.cargarProductos()).map(prepararProducto);
    estado.cotizador = estado.cotizador.filter((l) => l.fija); // los ids de productos cambiaron
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
