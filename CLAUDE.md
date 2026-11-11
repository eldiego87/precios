# precios — Lista de precios + facturación (Casas TDA)

Sistema web propio de Diego (monotributista, Factura C, <15 facturas/mes, ~110 ítems).
Reemplaza su Google Sheets "PRECIOS". Interfaz en español con voseo. Diego no es programador:
explicar simple y guiarlo paso a paso (ver `../form3/CLAUDE.md`, mismo esquema y forma de trabajo).

## Etapas
1. **Lista de precios web** ← actual
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
| `excel.js` | Importa la planilla de Diego / exporta copia. SheetJS 0.18.5 de cdnjs, carga diferida. |
| `firestore.rules` | Diego las pega a mano en la consola. Lista de emails permitidos dentro. |
| `firebase-config.js` | Config pública; `null` = muestra "falta configurar". |
| `_prueba/` | **No se sube** (.gitignore). Stubs de Firebase en memoria + `control.js` que importa `PRECIOS.xlsx` y conduce la app por `?paso=`; `servidor.py` (puerto 8765, `/demora` retrasa el load para las capturas). |

## Firebase
Proyecto `casastda-precios` (cuenta eldiego87@gmail.com), plan Spark gratis, Firestore `southamerica-east1`,
Auth Google, dominios `localhost` + `eldiego87.github.io`. Nunca pasar a Blaze sin que Diego lo pida.

## Modelo de datos (Firestore)
- `usuarios/{uid}`: `cotizacion` (dólar, carga manual), `cotizacionFecha` (ISO).
- `usuarios/{uid}/productos/{id}`: `codigo`, `descripcion`, `categoria` (MAYÚSCULAS, conserva Ñ), `proveedor`,
  `moneda` (`USD`|`ARS`), `precioUSD` o `precioARS` (**sin IVA**), `costoUSD`, `margen` (informativos;
  costo × margen = precioUSD), `favorito`, `actualizado`.
- Final = sin IVA × 1,21. **Decisión de Diego**: aunque es monotributista sigue sumando 21% (costumbre de
  cuando era RI y proveedores con "precio + IVA"); ese final es lo que factura. No re-discutir.
- Datos de negocio (costos, márgenes, proveedores) **nunca** en el repo (es público para Pages).

## Planilla original (PRECIOS.xlsx)
Hoja "Tabla Original": CAEGORIA(sic), CODIGO, PRODUCTO, PRECIO U$S (=COSTO×%), IVA, FINAL, PROVEEDOR,
COSTO, %, PRECIO (=U$S×cotización, o fijo en $ si U$S=0), IVA, FINAL. Cotización en " Busqueda"!D2.
Importador: descarta filas "caca*", unifica proveedores por mayúsculas/espacios, avisa sin precio/descr./categoría.

## Pruebas
`python3 -I _prueba/servidor.py &` y `firefox --headless --window-size=390,844 --screenshot ~/carpeta/x.png
"http://127.0.0.1:8765/_prueba/index.html?paso=lista|importar|buscar|buscar2|editar|editar-ars|cotizacion|vacio"`
(Firefox es snap: guardar capturas en el home, no en /tmp). `_prueba/index.html` se genera desde `index.html`
(import map + base href): regenerarlo si cambia el HTML. Para frenar el servidor: `kill` por PID
(no `pkill -f` con la ruta: mata al propio shell).
