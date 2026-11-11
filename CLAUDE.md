# precios — Lista de precios + facturación (Casas TDA)

Sistema web propio de Diego (monotributista, Factura C, <15 facturas/mes, ~110 ítems).
Reemplaza su Google Sheets "PRECIOS". Interfaz en español con voseo. Diego no es programador:
explicar simple y guiarlo paso a paso (ver `../form3/CLAUDE.md`, mismo esquema y forma de trabajo).

## Etapas
1. **Lista de precios web** ← actual. PC: 3 columnas (categorías | productos | cotización rápida). Celular/tablet (≤ 900 px): misma página adaptable.
2. Armado de factura/presupuesto (buscar ítems, cantidades, descuento 10% opcional, totales)
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
| `excel.js` | Importa la planilla de Diego / exporta copia. SheetJS 0.18.5 de cdnjs, carga diferida. |
| `firestore.rules` | Diego las pega a mano en la consola. Lista de emails permitidos dentro. |
| `firebase-config.js` | Config pública; `null` = muestra "falta configurar". |
| `_prueba/` | **No se sube** (.gitignore). Stubs de Firebase en memoria + `control.js` que importa `PRECIOS.xlsx` y conduce la app por `?paso=`; `servidor.py` (puerto 8765, `/demora` retrasa el load para las capturas). |

## Firebase
Proyecto `casastda-precios` (cuenta eldiego87@gmail.com), plan Spark gratis, Firestore `southamerica-east1`,
Auth Google, dominios `localhost` + `eldiego87.github.io`. Nunca pasar a Blaze sin que Diego lo pida.

## Modelo de datos (Firestore)
- `usuarios/{uid}`: última cotización BNA obtenida (`cotizacion`, `cotizacionFecha` = publicación, `cotizacionVia`). Respaldo si falla la consulta.
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

## Planilla original (PRECIOS.xlsx)
Hoja "Tabla Original": CAEGORIA(sic), CODIGO, PRODUCTO, PRECIO U$S (=COSTO×%), IVA, FINAL, PROVEEDOR,
COSTO, %, PRECIO (=U$S×cotización, o fijo en $ si U$S=0), IVA, FINAL. Cotización en " Busqueda"!D2.
Importador: descarta filas "caca*", unifica proveedores por mayúsculas/espacios, avisa sin precio/descr./categoría.

## Pruebas
`python3 -I _prueba/servidor.py &` y `firefox --headless --window-size=1600,900 --screenshot ~/carpeta/x.png
"http://127.0.0.1:8765/_prueba/index.html?paso=lista|importar|buscar|buscar2|ficha|ficha-editar|cotizar|cotizar-cat|dolar|dolar-manual|dolar-falla|movil-cot-lista|movil-cot-abierta|vacio"`
(Firefox es snap: guardar capturas en el home, no en /tmp). `_prueba/index.html` se genera desde `index.html`
(import map + base href): regenerarlo si cambia el HTML. Para frenar el servidor: `kill` por PID
(no `pkill -f` con la ruta: mata al propio shell).
