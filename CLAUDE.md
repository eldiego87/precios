# precios — Lista de precios + facturación (Casas TDA)

Sistema web propio de Diego (Factura C, ~110 ítems).
Reemplaza su Google Sheets "PRECIOS". Interfaz en español con voseo. Diego no es programador:
explicar simple y guiarlo paso a paso (ver `../form3/CLAUDE.md`, mismo esquema y forma de trabajo).

## Etapas
1. **Lista de precios web** ← actual. PC: 3 columnas (categorías | productos | cotización rápida). Celular/tablet (≤ 900 px): misma página adaptable.
2. Cotizaciones con cliente, ítems provisorios, guardado congelado y lista "línea de ensamblaje" ← hecho (11/11/2026)
3. Facturación real por **web service de ARCA (WSFE)** con certificado; primero homologación.
   Necesita parte servidor (Cloud Functions → plan Blaze: consultarlo con Diego antes).
4. Multiusuario para otros contribuyentes (delegación del servicio WSFE al CUIT de Diego), solo si funciona bien.

Descartado: embeber ARCA en un iframe (la política de mismo origen impide completar sus campos).

## Archivos
| Archivo | Qué es |
|---|---|
| `index.html`, `estilos.css` | Página única (claro/oscuro, apta iPhone). |
| `app.js` | Interfaz: búsqueda, filtros por categoría/favoritos, editor, cotización, importar/exportar. |
| `calculo.js` | Precios, búsqueda sin tildes, `leerNumero` ("1.535" = 1535). Sin dependencias. |
| `datos.js` | Firebase (SDK web 12.4.0 de gstatic, sin build). |
| `dolar.js` | Dólar actual BNA billete venta: CriptoYa (`bancostodos` → `bna.ask`), si falla DolarApi (`oficial`). |
| `arca.js` | "Copiar para ARCA" (texto `ARCA-ITEMS1{json}`) + código del marcador (bookmarklet) "Pegar en ARCA". |
| `pdf.js` + `logo.png` | PDF de cotización guardada (jsPDF 2.5.1 de cdnjs, carga diferida). Logo recortado del fondo de form3. |
| `excel.js` | Importa la planilla de Diego / exporta copia. SheetJS 0.18.5 de cdnjs, carga diferida. |
| `firestore.rules` | Diego las pega a mano en la consola. Lista de emails permitidos dentro. |
| `firebase-config.js` | Config pública; `null` = muestra "falta configurar". |
| `_prueba/` | **No se sube** (.gitignore). Stubs de Firebase en memoria + `control.js` que importa `PRECIOS.xlsx` y conduce la app por `?paso=`; `servidor.py` (puerto 8765, `/demora` retrasa el load para las capturas). |

## Firebase
Proyecto `casastda-precios` (cuenta eldiego87@gmail.com), plan Spark gratis, Firestore `southamerica-east1`,
Auth Google, dominios `localhost` + `eldiego87.github.io`. Nunca pasar a Blaze sin que Diego lo pida.

## Modelo de datos (Firestore)
- `usuarios/{uid}`: última cotización BNA obtenida (`cotizacion`, `cotizacionFecha` = publicación, `cotizacionVia`). Respaldo si falla la consulta.
- `usuarios/{uid}/clientes/{id}`, `usuarios/{uid}/cotizaciones/{id}`: ver sección Cotizaciones.
- Reglas: `match /usuarios/{uid}/{coleccion}/{id}` con lista blanca de colecciones; al sumar una, actualizar reglas.
- `usuarios/{uid}/productos/{id}`: `codigo`, `descripcion`, `categoria` (MAYÚSCULAS, conserva Ñ), `proveedor`,
  `moneda` (`USD`|`ARS`), `precioUSD` o `precioARS` (**sin IVA**), `costoUSD`, `margen` (informativos;
  costo × margen = precioUSD), `favorito`, `actualizado`.
- Final = sin IVA × 1,21. **Decisión de Diego**: aunque es monotributista sigue sumando 21% (costumbre de
  cuando era RI y proveedores con "precio + IVA"); ese final es lo que factura. No re-discutir.
- Datos de negocio (costos, márgenes, proveedores) **nunca** en el repo (es público para Pages).

## Interfaz (pedidos de Diego)
- Uso principal en PC, horizontal. Categorías a la izquierda: ★ Favoritos, Servicios, ─, Todas, resto alfabético (`CATEGORIAS_ARRIBA`).
- Lista: precio final en $ grande y **US$ final** chico (el "+ IVA" solo en la ficha interna).
- Ficha de producto en **solo lectura**; se edita tildando "Habilitar edición".
- Cotización rápida (derecha): Agregar → cantidad (1 por defecto, admite decimales) en el ítem y en la tabla;
  columnas Cant. | Ítem | Costo total | Precio de venta + totales y diferencia. Costo = costoUSD × dólar × 1,21
  (con IVA: el monotributista no lo recupera). Se guarda en localStorage del navegador.

## Dólar (decisión de Diego)
- Usa **Banco Nación, billete, VENTA**. Al abrir se trae el actual; arriba muestra valor + fecha/hora de publicación.
- **Manual temporal**: no se guarda en Firebase, dura hasta "Obtener cotización" o recargar; se ve en amarillo "MANUAL".
- El dólar del Excel importado se ignora.
- bna.com.ar no tiene CORS. Historial por fecha: `GET /Cotizador/HistoricoPrincipales?id=billetes&fecha=dd/mm/aaaa&idMoneda=22`
  (tabla HTML Compra/Venta/Fecha). Para usarlo hace falta intermediario (Cloudflare Worker sugerido; o Cloud Functions/Blaze).
  **ArgentinaDatos NO sirve**: difería del BNA (1/10/2026: 1540 vs 1545 BNA). Diego vio 1535 para el 1/10 (pendiente aclarar).
- Idea pendiente: calendario + botón "primer día hábil del mes" (feriados en api.argentinadatos.com/v1/feriados/AAAA).

## Celular (≤ 900 px, mismo código)
- Barra fija arriba con buscador a todo el ancho; "+ Nuevo producto" pasa al menú ⋯.
- Categorías en `<select>` con el mismo orden que la columna de PC.
- Cotización: barra fija abajo (ítems, venta, costo); al tocarla se abre a pantalla completa
  (`body.cot-abierta`, `history.pushState` para que "atrás" la cierre). La tabla se vuelve tarjetas.
- Firefox headless no avanza transiciones: `control.js` las desactiva en el paso `movil-cot-abierta`.

## Cotizaciones (decisiones de Diego)
- Cliente: **código** (campo `nombre`; referencia propia, ARCA trae la razón social del CUIT), **CUIT/DNI** (se copia
  sin guiones), **condición frente al IVA** (guardada, no se muestra), **domicilio** (Nº 1–5 de la lista de domicilios
  que ARCA trae para el CUIT; default 1; para clientes que comparten CUIT). Colección `clientes`.
- En la cotización se **escribe el código exacto + Enter** (sin desplegable; compara sin mayúsculas/tildes). Si no existe:
  "Crear cliente" con el código ya puesto. A la vista solo código y CUIT. Carga masiva de clientes: más adelante.
- "+ Agregar ítem" = ítem provisorio (descripción, unidad, cantidad, precio unitario final $), solo para esa cotización.
- Unidades: solo `unidades` (7), `otras unidades` (98), `kilogramos` (1), `litros` (5). Diego elige a mano por producto.
- **Guardar cotización** = "pantallazo": colección `cotizaciones` con `numero` (máx+1), `fecha`, `estado`
  (`pendiente`|`facturada`), `facturadaEn`, `cliente` (copia), `dolar` {valor, fuente, fecha}, `items`
  [{productoId, codigo, descripcion, unidad, precio, costo, cantidad}] y `totales`. Precios congelados; NO hay
  "actualizar a hoy" (Diego lo pidió así: si quiere cambiar algo lo edita él).
- Al abrir una guardada, sus líneas son "fijas" (`fija: true`); se pueden editar cantidades, quitar, agregar
  productos (precio de hoy) o provisorios, y "Guardar cambios" conserva número, fecha y dólar originales.
- Lista "Cotizaciones" (línea de ensamblaje): Pendientes/Facturadas/Todas; por fila: copiar CUIT, 📋 Copiar
  (para el marcador), ✓ Facturada / deshacer, Abrir, borrar.
- La cotización abierta (líneas, cliente, edición) se recuerda en localStorage `precios.cotizador.v2`.
- **Fecha de factura** (`fechaFactura` AAAA-MM-DD, local): por defecto hoy; rango hoy−5 … hoy+5 (RCEL, Productos).
  Fuera de rango: en rojo en la lista y aviso al copiar. El marcador la pone en la pantalla de emisión.
- **Cambiar el cliente de una cotización guardada abierta = cotización nueva** con mismos ítems/precios/fecha
  (la guardada no se toca). Casilla "Corregir el cliente de la Nº…" en el diálogo para editar la existente.
  Pensado para facturar el mismo mantenimiento a varias clínicas: cambiar cliente → Guardar → repetir.

## PDF de cotización
- Botón 📄 PDF en la lista de cotizaciones y en la cotización guardada abierta (usa lo GUARDADO; avisa si hay cambios).
- Estilo de la orden de servicio (form3): azul (0,74,146), fondo (245,248,251), recuadros redondeados, logo.
  Dibujado con jsPDF (no imagen de fondo) → la tabla pagina sola, repite encabezado y numera páginas.
- Contenido: Nº, fecha de factura, cliente (código + CUIT + condición IVA), Cant. (kg/l si corresponde),
  Descripción, Precio unit., Total por ítem y TOTAL. "Precios finales en pesos argentinos."
- Prueba: paso `pdf` / `pdf-largo` en `_prueba/control.js` (intercepta `jsPDF.API.save` y manda el PDF al
  servidor de prueba → `_prueba/salida.pdf`; ver con `pdftoppm -r 70 -png`).

## Puente con ARCA (marcador "Pegar en ARCA")
- "📋 Copiar" (panel o lista) pone en el portapapeles `ARCA-COT1{"c":{cuit,iva},"f":"DD/MM/AAAA","i":[[desc,cant,unidad,precio]]}`.
  El marcador acepta también el formato viejo `ARCA-ITEMS1` (solo ítems).
- **Un toque por pantalla** (cada carga de página corta el script). Reconoce la pantalla y completa + "Continuar"
  (`validarCampos()` de la página):
  menú (`#btn_gen_cmp`) → punto de venta (el único; si hay varios pide elegir) + "Factura C" (lista por ajax) →
  emisión: `#fc` = fecha, `#idconcepto` = 1 Productos → receptor: `#idivareceptor` (texto de la condición del cliente),
  `#idtipodocreceptor` 80 CUIT / 96 DNI, `#nrodocreceptor` (change → ajax razón social; espera hasta 12 s),
  domicilio Nº `dom` (si ARCA trae menos, se frena y avisa), checkbox `formaDePago` value 96 = Cuenta Corriente → ítems (filas con `insertarFilaDetalle()`).
  **En ítems NO continúa solo** (pedido de Diego: si ARCA da error y se vuelve atrás, borra los ítems): carga y avisa.
  En el resumen final (paso 4) NO hace nada: confirma Diego.
- La pantalla de ítems tiene `#idivareceptor`, `#nrodocreceptor`, etc. como **inputs ocultos**: detectar ítems antes que receptor.
- Fecha (concepto Productos): RCEL acepta hoy −5 … hoy +5.
- Probado contra copias guardadas de cada pantalla (11/11/2026) con un servidor que simula `ajax.do`
  (`tiposcomp`, `datosreceptor2`) y `form.submit` interceptado. **Falta probar en el ARCA real.**
- Campos de ítems: `textarea[name=detalleDescripcion]`, `detalleCantidad`, `detalleMedida` ("seleccionar..." y
  "unidades" valen 7), `detallePrecio`; punto decimal, 2 decimales (`#numdecimalescantidad` admite 4/6). Por fila, no por id.

## Planilla original (PRECIOS.xlsx)
Hoja "Tabla Original": CAEGORIA(sic), CODIGO, PRODUCTO, PRECIO U$S (=COSTO×%), IVA, FINAL, PROVEEDOR,
COSTO, %, PRECIO (=U$S×cotización, o fijo en $ si U$S=0), IVA, FINAL. Cotización en " Busqueda"!D2.
Importador: descarta filas "caca*", unifica proveedores por mayúsculas/espacios, avisa sin precio/descr./categoría.

## Pruebas
`python3 -I _prueba/servidor.py &` y `firefox --headless --window-size=1600,900 --screenshot ~/carpeta/x.png
"http://127.0.0.1:8765/_prueba/index.html?paso=lista|importar|buscar|buscar2|ficha|ficha-editar|cotizar|cotizar-cat|dolar|dolar-manual|dolar-falla|movil-cot-lista|movil-cot-abierta|arca|cliente|flujo|flujo-guardado|cots|cots-mov|serie|serie-lista|serie-reuso|cliente-no|cliente-form|vacio"`
(Firefox es snap: guardar capturas en el home, no en /tmp). `_prueba/index.html` se genera desde `index.html`
(import map + base href): regenerarlo si cambia el HTML. Para frenar el servidor: `kill` por PID
(no `pkill -f` con la ruta: mata al propio shell).
