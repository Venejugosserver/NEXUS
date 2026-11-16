/**
 * NEXUS · Registro central de aceptaciones (Google Apps Script)
 *
 * Cómo instalarlo (10 minutos):
 * 1. Crea una hoja de Google llamada "NEXUS - Aceptaciones" en la cuenta de la empresa.
 * 2. En la hoja: Extensiones > Apps Script. Borra lo que haya y pega este archivo.
 * 3. Implementar > Nueva implementación > Tipo: Aplicación web.
 *      Ejecutar como: Yo (la cuenta de la empresa)
 *      Quién tiene acceso: Cualquier usuario
 * 4. Copia la URL que termina en /exec y pégala en legal.js, en registroUrl.
 * 5. Comparte la hoja solo con las personas autorizadas (ver Política de privacidad).
 *
 * La columna "recibido_servidor" la pone Google, no el navegador: es la hora
 * confiable para demostrar cuándo se aceptó.
 */

const HOJA = 'Aceptaciones';
const COLUMNAS = [
  'recibido_servidor', 'tipo', 'nombre',
  'terminos_version', 'terminos_aceptado', 'privacidad_version', 'privacidad_aceptado', 'cookies_version',
  'abrio_terminos', 'abrio_privacidad', 'abrio_cookies',
  'registrado_en', 'hora_local', 'zona_horaria', 'metodo', 'modo',
  'pagina', 'navegador', 'idioma', 'pantalla', 'dispositivo', 'id'
];

function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents);
    if (!datos || !['aceptacion', 'retiro'].includes(datos.tipo) || !datos.id) {
      return respuesta({ ok: false, error: 'registro no válido' });
    }
    const hoja = obtenerHoja();
    // Evita duplicados si el navegador reenvía un registro pendiente
    const ids = hoja.getLastRow() > 1
      ? hoja.getRange(2, COLUMNAS.length, hoja.getLastRow() - 1, 1).getValues().flat()
      : [];
    if (ids.includes(datos.id)) return respuesta({ ok: true, duplicado: true });

    const fila = COLUMNAS.map((c) => c === 'recibido_servidor' ? new Date() : String(datos[c] ?? '').slice(0, 500));
    hoja.appendRow(fila);
    return respuesta({ ok: true });
  } catch (err) {
    return respuesta({ ok: false, error: String(err) });
  }
}

function obtenerHoja() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA);
    hoja.appendRow(COLUMNAS);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, COLUMNAS.length).setFontWeight('bold');
  }
  return hoja;
}

function respuesta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
