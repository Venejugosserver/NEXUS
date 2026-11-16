# NEXUS: informe de cumplimiento y puesta en marcha

Revisión del 16 de noviembre de 2026. Este informe es una guía técnica y no sustituye la revisión de un abogado venezolano, que debe validar los tres documentos legales antes de publicarlos.

## 1. Cómo subir esta versión

Todos los archivos van sueltos en la raíz del repositorio `Venejugosserver/NEXUS`, sin carpetas. Súbelos todos y reemplaza los anteriores; `dataset.json` no cambia. Puedes borrar del repositorio los antiguos `icon-*.png` solo si los reemplazas por los de este paquete. Después:

1. Los datos de DISTRIBUIDORA VENEJUGOS 2015, C.A. ya están cargados en `legal.js`. Si alguno cambia, edítalo solo ahí.
2. Instala el registro central siguiendo las instrucciones al inicio de `consentimientos.gs` y pega la URL `/exec` en `registroUrl` dentro de `legal.js`.
3. Si el repositorio cambia de nombre o usas un dominio propio, ajusta `<base href="/NEXUS/">` en `404.html`.
4. Cuando modifiques el texto de un documento, sube su número en `version` de `legal.js`; el portal pedirá aceptarlo de nuevo a todos.

## 2. Leyes venezolanas revisadas

Venezuela no tiene una ley general de protección de datos personales ni una norma sobre cookies. El portal se ajustó a este marco:

| Norma | Qué exige o permite | Cómo lo cumple NEXUS |
|---|---|---|
| Constitución, art. 28 (habeas data) | Acceso a los datos propios, conocer uso y finalidad, rectificar o destruir | La Política de privacidad explica cada dato, su finalidad y cómo ejercer estos derechos; botón para retirar el consentimiento |
| Constitución, art. 60 | Protección de la vida privada frente a la informática | Sin cookies, sin analítica, sin fuentes de terceros; datos mínimos |
| TSJ, Sala Constitucional, sentencia N.° 1318 del 04/08/2011 | Principios de consentimiento, finalidad, temporalidad, seguridad, etc. | Consentimiento por casilla separada, finalidades cerradas, plazo de conservación, medidas de seguridad descritas |
| Ley sobre Mensajes de Datos y Firmas Electrónicas (2001) | Valor probatorio de la aceptación electrónica | Registro con fecha y hora de cada casilla, versión, método y hora del servidor de Google |
| Ley Especial contra los Delitos Informáticos (2001) | Sanciona acceso indebido, sabotaje y violación de la privacidad de la data | Citada en los Términos como advertencia; acceso y token con reglas de uso |
| Ley sobre el Derecho de Autor (1993) y Ley de Propiedad Industrial | Protección de obras y marcas | Cláusula de propiedad intelectual; revisión de imágenes (punto 3) |

Puntos que debe confirmar el abogado: el plazo de conservación de cinco años, la ciudad de los tribunales, el compromiso de responder en 15 días hábiles y si la relación laboral con los usuarios exige cláusulas adicionales.

## 3. Derechos de uso de las imágenes

El portal solo usa estas imágenes y archivos gráficos:

| Archivo | Origen | Estado |
|---|---|---|
| `logo-venejugos.png` | Logo de Venejugos | Es la marca de la propia empresa, así que su uso en un portal interno es legítimo. Conviene confirmar que la marca está registrada ante el SAPI a nombre de la razón social y que se tienen los archivos originales del diseñador con cesión de derechos. |
| `icon-180.png`, `icon-192.png`, `icon-512.png` | Ícono genérico con la letra N sobre degradado | Sin elementos de terceros; no presenta riesgo. |
| Fuentes Bricolage Grotesque y Hanken Grotesk | Proyectos de código abierto | Licencia SIL Open Font License 1.1, que permite usarlas e incrustarlas; las licencias van en `./`. |
| Cinta azul y roja, íconos de flecha y lupa | Dibujados en código para este portal | Originales, sin derechos de terceros. |

Dos observaciones: la versión anterior imitaba el encabezado del tablero de Nestlé Venezuela (franja roja inclinada), lo cual podía confundirse con la imagen de otra empresa; el nuevo diseño lo elimina. Los nombres de marcas de terceros en los reportes, como Nestlé, se usan solo para identificar el contenido, y los Términos lo aclaran.

## 4. Riesgos que siguen abiertos

Estos no se pueden resolver del todo en un sitio estático y conviene atenderlos:

- **Las contraseñas no son una barrera real.** Ahora se guardan como huella SHA-256 en lugar de texto legible, pero cualquiera que lea el código puede saltarse la validación. Además, `dataset.json` es público, así que los enlaces de gerencia y admin pueden verse en GitHub. Si esos reportes son sensibles, la solución es proteger los propios reportes (por ejemplo, con inicio de sesión de Google) o mover el portal a un servicio con autenticación.
- **Cambiar la contraseña solo afecta un navegador**, igual que antes.
- **El registro central acepta envíos de cualquiera**, porque el portal es público. El script valida el formato, limita el tamaño y evita duplicados, pero alguien podría enviar registros falsos. La columna `recibido_servidor` es la hora confiable.
- **No se registra la dirección IP.** Un sitio estático no puede verla y Apps Script tampoco la entrega. La constancia se apoya en nombre, hora del servidor, dispositivo y navegador.

## 5. Evaluación y cambios del frontend

| Antes | Ahora |
|---|---|
| Encabezado con franja inclinada de otra marca | Cinta azul y roja derivada del logo, que se dibuja al cargar |
| Fuente del sistema | Bricolage Grotesque para títulos y Hanken Grotesk para texto, autoalojadas |
| Tarjetas con sombra y borde lateral | Fichas planas, toda la ficha es clicable, flecha que reacciona al pasar el cursor |
| Sin búsqueda | Buscador sin acentos y filtro por área |
| Paneles sin dirección | Rutas `#general`, `#gerencia`, `#admin` que se pueden compartir |
| Sin página de error | 404 interno para rutas inexistentes y `404.html` para GitHub Pages |
| `confirm()` y `alert()` del navegador | Diálogos propios accesibles y avisos temporales |
| Sin modo oscuro | Modo oscuro automático |
| HTML de reportes sin escapar (riesgo de inyección) | Todo el contenido se escapa y solo se aceptan enlaces `http` y `https` |
| Editar un reporte lo borraba si no se guardaba | La edición conserva el original hasta guardar |

Calidad base: navegación con teclado y foco visible, pestañas con flechas, enlace para saltar al contenido, campos de 16 px para evitar el zoom en iPhone, áreas seguras para el notch y respeto a la preferencia de movimiento reducido.
