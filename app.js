// Interfaz de la lista de precios.
import * as datos from './datos.js';
import {
  precioFinal, precioSinIva, coincide, textoBuscable, normalizar,
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
      $('usuario-email').textContent = usuario.email;
      $('pantalla-mensaje').hidden = true;
      $('app').hidden = false;
      dibujarTodo();
      if (matchMedia('(min-width: 700px)').matches) $('busqueda').focus();
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

function prepararProducto(p) {
  return { ...p, _buscable: textoBuscable(p) };
}

// ---------------------------------------------------------------- dibujo
function dibujarTodo() {
  dibujarCotizacion();
  dibujarFiltros();
  dibujarLista();
  dibujarSugerencias();
}

function dibujarCotizacion() {
  $('cot-valor').textContent = estado.cotizacion ? '$ ' + numero(estado.cotizacion) : 'cargar';
}

function categorias() {
  const cuenta = new Map();
  estado.productos.forEach((p) => cuenta.set(p.categoria, (cuenta.get(p.categoria) || 0) + 1));
  return [...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
}

function dibujarFiltros() {
  const favs = estado.productos.filter((p) => p.favorito).length;
  const chips = [
    ['todas', 'Todas', estado.productos.length],
    ['favoritos', '★ Favoritos', favs],
    ...categorias().map(([c, n]) => [c, capitalizar(c), n]),
  ];
  if (!chips.some(([v]) => v === estado.filtro)) estado.filtro = 'todas';
  $('filtros').innerHTML = chips.map(([valor, texto, n]) =>
    `<button class="chip" role="tab" data-filtro="${esc(valor)}" aria-selected="${valor === estado.filtro}">${esc(texto)}<span class="cant">${n}</span></button>`,
  ).join('');
}

function productosVisibles() {
  const { filtro, busqueda } = estado;
  let lista = estado.productos;
  // Si hay búsqueda, se busca en toda la lista salvo que esté en "favoritos".
  if (filtro === 'favoritos') lista = lista.filter((p) => p.favorito);
  else if (filtro !== 'todas' && !busqueda.trim()) lista = lista.filter((p) => p.categoria === filtro);
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
    || (busqueda ? 0 : a.categoria.localeCompare(b.categoria, 'es'))
    || (a.descripcion || '').localeCompare(b.descripcion || '', 'es'));
}

function dibujarLista() {
  const lista = productosVisibles();
  const total = estado.productos.length;
  const ul = $('lista');

  if (!total) {
    ul.innerHTML = '';
    $('resumen').textContent = '';
    $('vacio').hidden = false;
    $('vacio').innerHTML = `<p>Todavía no hay productos cargados.</p>
      <button class="btn primario" data-accion="importar">Importar desde Excel</button>`;
    return;
  }
  $('vacio').hidden = lista.length > 0;
  $('vacio').innerHTML = '<p>No hay productos que coincidan.</p>';

  const filtroTxt = estado.filtro === 'favoritos' ? ' en favoritos'
    : (estado.filtro !== 'todas' && !estado.busqueda.trim() ? ` en ${capitalizar(estado.filtro)}` : '');
  $('resumen').textContent = `${lista.length} de ${total} productos${filtroTxt}`
    + (estado.cotizacion ? '' : ' · Cargá la cotización del dólar para ver los precios en pesos');

  ul.innerHTML = lista.map((p) => {
    const sinPrecio = p.moneda === 'ARS' ? !p.precioARS : !p.precioUSD;
    const base = p.moneda === 'ARS' ? 'precio fijo en $' : `${dolares(p.precioUSD)} + IVA`;
    const final = sinPrecio ? '<span class="sin-precio">sin precio</span>'
      : (p.moneda === 'USD' && !estado.cotizacion ? dolares(p.precioUSD * (1 + IVA)) : pesos(precioFinal(p, estado.cotizacion)));
    return `<li class="item" data-id="${esc(p.id)}">
      <button class="estrella ${p.favorito ? 'si' : ''}" data-estrella aria-label="${p.favorito ? 'Quitar de' : 'Agregar a'} favoritos" title="Favorito">★</button>
      <div class="item-texto">
        <div class="item-desc">${esc(p.descripcion || '(sin descripción)')}</div>
        <div class="item-meta"><span class="codigo">${esc(p.codigo)}</span><span>${esc(capitalizar(p.categoria))}</span>${p.proveedor ? `<span>${esc(p.proveedor)}</span>` : ''}</div>
      </div>
      <div class="item-precio">
        <div class="item-final">${final}</div>
        ${sinPrecio ? '' : `<div class="item-base">${base}</div>`}
      </div>
    </li>`;
  }).join('');
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

// ---------------------------------------------------------------- eventos de la lista
let temporizador;
$('busqueda').addEventListener('input', (e) => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { estado.busqueda = e.target.value; dibujarLista(); }, 80);
});
$('busqueda').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.target.value = ''; estado.busqueda = ''; dibujarLista(); }
});

$('filtros').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-filtro]');
  if (!chip) return;
  estado.filtro = chip.dataset.filtro;
  dibujarFiltros();
  dibujarLista();
});

$('lista').addEventListener('click', async (e) => {
  const li = e.target.closest('.item');
  if (!li) return;
  const p = estado.productos.find((x) => x.id === li.dataset.id);
  if (!p) return;
  if (e.target.closest('[data-estrella]')) {
    p.favorito = !p.favorito;
    dibujarFiltros();
    dibujarLista();
    try { await datos.guardarProducto(p); } catch (err) {
      p.favorito = !p.favorito; dibujarFiltros(); dibujarLista();
      aviso('No se pudo guardar el favorito.');
    }
    return;
  }
  abrirEditor(p);
});

$('vacio').addEventListener('click', (e) => {
  if (e.target.closest('[data-accion="importar"]')) abrirImportar();
});

document.addEventListener('click', (e) => {
  // Cerrar diálogos con los botones "Cancelar"
  if (e.target.closest('[data-cerrar]')) e.target.closest('dialog').close();
  // Cerrar el menú al tocar afuera o elegir una opción
  const menu = document.querySelector('.menu');
  if (menu.open && (!menu.contains(e.target) || e.target.closest('.menu-lista button'))) menu.open = false;
});

// ---------------------------------------------------------------- cotización
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
  dibujarCotizacion();
  dibujarLista();
  try {
    await datos.guardarConfig({ cotizacion: estado.cotizacion, cotizacionFecha: estado.cotizacionFecha });
    aviso(`Dólar actualizado: $ ${numero(valor)}`);
  } catch (err) {
    [estado.cotizacion, estado.cotizacionFecha] = anterior;
    dibujarCotizacion(); dibujarLista();
    aviso('No se pudo guardar la cotización.');
  }
});

// ---------------------------------------------------------------- editor de producto
const fp = $('form-producto');
let editando = null; // producto que se está editando (null = nuevo)

function abrirEditor(p = null) {
  editando = p;
  fp.reset();
  $('prod-titulo').textContent = p ? 'Editar producto' : 'Nuevo producto';
  $('btn-borrar').hidden = !p;
  $('prod-error').hidden = true;
  const v = p || { moneda: 'USD', categoria: estado.filtro !== 'todas' && estado.filtro !== 'favoritos' ? estado.filtro : '' };
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
  actualizarVistaEditor();
  $('dlg-producto').showModal();
  if (!p) fp.codigo.focus();
}

function leerEditor() {
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

function actualizarVistaEditor() {
  const p = leerEditor();
  $('campos-usd').hidden = p.moneda !== 'USD';
  $('campos-ars').hidden = p.moneda !== 'ARS';
  if (p.moneda === 'USD' && !estado.cotizacion) {
    $('prod-final').textContent = dolares(p.precioUSD * (1 + IVA));
    $('prod-detalle').textContent = 'Cargá la cotización del dólar para verlo en pesos.';
    return;
  }
  $('prod-final').textContent = pesos(precioFinal(p, estado.cotizacion));
  $('prod-detalle').textContent = p.moneda === 'USD'
    ? `${dolares(p.precioUSD)} × $ ${numero(estado.cotizacion)} = ${pesos(precioSinIva(p, estado.cotizacion))} + 21%`
    : `${pesos(p.precioARS)} + 21%`;
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
  actualizarVistaEditor();
});

fp.addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = leerEditor();
  const error = (t) => { $('prod-error').textContent = t; $('prod-error').hidden = false; };
  if (!p.codigo || !p.descripcion) return error('Completá el código y la descripción.');
  const repetido = estado.productos.find((x) => x !== editando && normalizar(x.codigo) === normalizar(p.codigo));
  if (repetido) return error(`Ya existe otro producto con el código ${repetido.codigo}.`);

  const boton = fp.querySelector('[type=submit]');
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
    $('dlg-producto').close();
    dibujarTodo();
    aviso('Producto borrado.');
  } catch (err) {
    aviso('No se pudo borrar.');
  }
});

$('btn-nuevo').addEventListener('click', () => abrirEditor());
$('btn-nuevo-menu').addEventListener('click', () => abrirEditor());

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
      ${estado.productos.length ? `<p class="alerta">Atención: se reemplazan los ${estado.productos.length} productos que tenés cargados ahora.</p>` : ''}`;
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
    // Mantener los favoritos que ya estaban marcados (por código).
    const favs = new Set(estado.productos.filter((p) => p.favorito).map((p) => normalizar(p.codigo)));
    importacion.productos.forEach((p) => { if (favs.has(normalizar(p.codigo))) p.favorito = true; });

    await datos.reemplazarProductos(importacion.productos);
    if (importacion.cotizacion) {
      estado.cotizacion = importacion.cotizacion;
      estado.cotizacionFecha = new Date().toISOString();
      await datos.guardarConfig({ cotizacion: estado.cotizacion, cotizacionFecha: estado.cotizacionFecha });
    }
    estado.productos = (await datos.cargarProductos()).map(prepararProducto);
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
