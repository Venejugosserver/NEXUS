/* NEXUS · datos legales compartidos.
   Edita SOLO este bloque: los documentos legales y el portal leen de aquí.
   Si cambias el texto de un documento, sube su número de versión: el portal
   volverá a pedir la aceptación a todos los usuarios. */
window.NEXUS_LEGAL = {
  version: { terminos: '1.0', privacidad: '1.0', cookies: '1.0' },
  vigencia: '16 de noviembre de 2026',
  empresa: {
    razon: 'DISTRIBUIDORA VENEJUGOS 2015, C.A.',
    rif: 'J-29941545-6',
    direccion: 'Carretera Petare-Santa Lucía, local Parcela N.° B, sector Hacienda La Candelaria, piso S/1, Dolorita',
    ciudad: 'municipio Sucre, estado Miranda, zona postal 1070',
    correo: 'adminventas@venejugos.com',
    telefono: '+58 412-5016394',
    responsable: 'Andrés Martínez',
    tribunales: 'la ciudad de Caracas',
    conservacion: 'cinco (5) años'
  },
  // URL de la aplicación web de Google Apps Script que guarda el registro central
  // de aceptaciones (ver consentimientos.gs). Vacío = solo registro local.
  registroUrl: ''
};

(function () {
  const L = window.NEXUS_LEGAL;
  const valor = (ruta) => ruta.split('.').reduce((o, k) => (o ? o[k] : undefined), L);
  function rellenar() {
    document.querySelectorAll('[data-legal]').forEach((el) => {
      const v = valor(el.dataset.legal);
      if (typeof v !== 'string') return;
      el.textContent = v;
      el.classList.toggle('dato', v.startsWith('['));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rellenar);
  else rellenar();
})();
