/* NEXUS · lógica del portal */
(function () {
  'use strict';

  const LEGAL = window.NEXUS_LEGAL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reducirMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Almacenamiento seguro (puede fallar en modo privado) ---------- */
  const almacen = {
    leer(k, porDefecto = null) {
      try { const v = localStorage.getItem(k); return v === null ? porDefecto : JSON.parse(v); } catch { return porDefecto; }
    },
    guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    borrar(k) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } }
  };
  const sesionAlmacen = {
    leer(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    guardar(k, v) { try { sessionStorage.setItem(k, v); } catch { /* nada */ } },
    borrar(k) { try { sessionStorage.removeItem(k); } catch { /* nada */ } }
  };

  /* ---------- Utilidades ---------- */
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const urlSegura = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; } };
  const normal = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const capital = (t) => { const s = String(t || 'Otros').trim().toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  async function sha256(texto) {
    const datos = new TextEncoder().encode(texto);
    const h = await crypto.subtle.digest('SHA-256', datos);
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function conTransicion(fn) {
    if (document.startViewTransition && !reducirMovimiento) document.startViewTransition(fn);
    else fn();
  }

  let temporizadorAviso;
  function aviso(msg, tipo = 'ok') {
    const a = $('#aviso');
    a.textContent = msg;
    a.className = 'aviso ver' + (tipo === 'error' ? ' error' : '');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => a.classList.remove('ver'), tipo === 'error' ? 6000 : 3200);
  }

  function confirmar({ titulo, texto, accion }) {
    return new Promise((resolver) => {
      const d = $('#dlgConfirmar');
      $('#t-confirmar').textContent = titulo;
      $('#confirmarTexto').textContent = texto;
      $('#confirmarSi').textContent = accion;
      d.returnValue = '';
      d.addEventListener('close', () => resolver(d.returnValue === 'si'), { once: true });
      d.showModal();
    });
  }

  /* ==========================================================
     CONTRASEÑAS (se guardan como huella SHA-256, no en texto)
     Importante: en un sitio estático esto evita mostrar la clave en
     el código, pero no es una barrera real. Ver CUMPLIMIENTO.md.
     ========================================================== */
  const HUELLA_INICIAL = '37e0f1cbe10546702a69eefe28b31f8598b84bc0e220b69621e715594034db5e';
  let claves = { admin: HUELLA_INICIAL, gerencia: HUELLA_INICIAL };

  async function cargarClaves() {
    const c = almacen.leer('config_nexus');
    if (!c) return;
    // Migración desde la versión anterior, que guardaba la clave en texto
    if (c.passwordAdmin || c.passwordGerencia) {
      if (c.passwordAdmin) claves.admin = await sha256(c.passwordAdmin);
      if (c.passwordGerencia) claves.gerencia = await sha256(c.passwordGerencia);
      almacen.guardar('config_nexus', { hashAdmin: claves.admin, hashGerencia: claves.gerencia });
      return;
    }
    if (c.hashAdmin) claves.admin = c.hashAdmin;
    if (c.hashGerencia) claves.gerencia = c.hashGerencia;
  }

  /* ==========================================================
     REPORTES Y GITHUB (dataset.json)
     ========================================================== */
  const GH = { repo: 'Venejugosserver/NEXUS', branch: 'main', path: 'dataset.json' };
  let ghToken = '';
  let reportes = [];
  let ultimoError = '';

  function cargarGitHubLocal() {
    const d = almacen.leer('github_nexus');
    if (!d) return;
    if (d.repo) GH.repo = d.repo;
    if (d.branch) GH.branch = d.branch;
    if (d.path) GH.path = d.path;
    if (d.token) ghToken = d.token;
  }
  const guardarGitHubLocal = () => almacen.guardar('github_nexus', { ...GH, token: ghToken });
  const guardarReportesLocal = () => almacen.guardar('reportes_nexus', reportes);
  const b64Codificar = (s) => btoa(unescape(encodeURIComponent(s)));
  const b64Decodificar = (s) => decodeURIComponent(escape(atob(s.replace(/\s/g, ''))));
  const aLista = (p) => (Array.isArray(p) ? p : (p && p.reportes) || []);

  function pista(msg) {
    msg = String(msg || '');
    if (/failed to fetch|networkerror|load failed|typeerror/i.test(msg)) {
      return location.protocol === 'file:'
        ? 'Abriste el archivo local (file://). Ábrelo desde la dirección github.io.'
        : 'Revisa tu conexión o desactiva bloqueadores de contenido.';
    }
    if (/\b401\b/.test(msg)) return 'El token no es válido o venció. Genera uno nuevo en GitHub.';
    if (/\b403\b/.test(msg)) return 'El token necesita el permiso Contents: Read and write en este repositorio.';
    if (/\b404\b/.test(msg)) return 'No se encontró el repositorio, la rama o el archivo. Revisa mayúsculas y nombres.';
    if (/\b409\b|\b422\b/.test(msg)) return 'Otro cambio se publicó al mismo tiempo. Intenta de nuevo.';
    return '';
  }

  async function cargarDataset() {
    ultimoError = '';
    try {
      const url = `https://api.github.com/repos/${GH.repo}/contents/${GH.path}?ref=${GH.branch}&t=${Date.now()}`;
      const headers = { Accept: 'application/vnd.github+json' };
      if (ghToken) headers.Authorization = 'Bearer ' + ghToken;
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      reportes = aLista(JSON.parse(b64Decodificar(data.content)));
      guardarReportesLocal();
      return true;
    } catch (e) { ultimoError = e.message; }
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${GH.repo}/${GH.branch}/${GH.path}?t=${Date.now()}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      reportes = aLista(await r.json());
      guardarReportesLocal();
      ultimoError = '';
      return true;
    } catch (e) { ultimoError = e.message; }
    try {
      const r = await fetch('dataset.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      reportes = aLista(await r.json());
      return true;
    } catch (e) { ultimoError = e.message; return false; }
  }

  async function obtenerSha() {
    try {
      const r = await fetch(`https://api.github.com/repos/${GH.repo}/contents/${GH.path}?ref=${GH.branch}&t=${Date.now()}`, {
        headers: { Authorization: 'Bearer ' + ghToken, Accept: 'application/vnd.github+json' }
      });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return (await r.json()).sha;
    } catch { return null; }
  }

  async function publicarDataset() {
    if (!GH.repo || !ghToken) { aviso('Configura el repositorio y el token antes de publicar.', 'error'); return false; }
    try {
      const sha = await obtenerSha();
      const cuerpo = {
        message: 'Actualizar dataset.json desde NEXUS - ' + new Date().toLocaleString('es-VE'),
        content: b64Codificar(JSON.stringify(reportes, null, 2)),
        branch: GH.branch
      };
      if (sha) cuerpo.sha = sha;
      const r = await fetch(`https://api.github.com/repos/${GH.repo}/contents/${GH.path}`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + ghToken, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo)
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error('HTTP ' + r.status + (e.message ? ' - ' + e.message : ''));
      }
      return true;
    } catch (e) {
      const p = pista(e.message);
      aviso('No se pudo publicar: ' + e.message + (p ? '. ' + p : ''), 'error');
      return false;
    }
  }

  async function guardarReportes(mensajeOk) {
    guardarReportesLocal();
    if (GH.repo && ghToken) {
      const ok = await publicarDataset();
      aviso(ok ? mensajeOk + ' Publicado para todo el equipo.' : 'Guardado en este navegador; la publicación en GitHub falló.', ok ? 'ok' : 'error');
    } else {
      aviso(mensajeOk + ' Falta configurar GitHub para que el equipo lo vea.');
    }
  }

  /* ---------- Render de fichas ---------- */
  const filtros = { general: { q: '', cat: '' }, gerencia: { q: '', cat: '' } };
  let primeraCarga = true;

  function visibles(panel) {
    if (panel === 'gerencia') return reportes.filter((r) => r.acceso === 'publico' || r.acceso === 'gerencia');
    return reportes.filter((r) => r.acceso === 'publico');
  }

  function agrupar(lista) {
    const grupos = new Map();
    lista.forEach((r) => {
      const k = normal(r.categoria) || 'otros';
      if (!grupos.has(k)) grupos.set(k, { titulo: capital(r.categoria || 'Otros'), items: [] });
      grupos.get(k).items.push(r);
    });
    return grupos;
  }

  function pintarChips(panel) {
    const caja = $(`[data-chips="${panel}"]`);
    const grupos = agrupar(visibles(panel));
    const actual = filtros[panel].cat;
    let html = `<button type="button" class="chip" data-cat="" aria-pressed="${actual === ''}">Todas</button>`;
    grupos.forEach((g, k) => { html += `<button type="button" class="chip" data-cat="${esc(k)}" aria-pressed="${actual === k}">${esc(g.titulo)}</button>`; });
    caja.innerHTML = grupos.size > 1 ? html : '';
  }

  const flecha = '<svg class="flecha" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

  function pintarLista(panel) {
    const destino = $(`[data-lista="${panel}"]`);
    const { q, cat } = filtros[panel];
    const nq = normal(q);
    const lista = visibles(panel).filter((r) =>
      (!cat || (normal(r.categoria) || 'otros') === cat) &&
      (!nq || normal(r.nombre + ' ' + r.descripcion + ' ' + r.categoria).includes(nq)));

    if (!visibles(panel).length) {
      destino.innerHTML = '<div class="vacio"><strong>Aún no hay reportes aquí.</strong>Cuando el administrador publique uno, aparecerá en esta lista.</div>';
      return;
    }
    if (!lista.length) {
      destino.innerHTML = `<div class="vacio"><strong>Ningún reporte coincide con “${esc(q)}”.</strong>Prueba con otra palabra o elige “Todas”.</div>`;
      return;
    }
    let i = 0;
    let html = '';
    agrupar(lista).forEach((g) => {
      html += `<section class="categoria"><div class="categoria-cab"><h2>${esc(g.titulo)}</h2><span>${g.items.length} ${g.items.length === 1 ? 'reporte' : 'reportes'}</span></div><div class="rejilla">`;
      g.items.forEach((r) => {
        const clase = primeraCarga && i < 12 ? ' aparece' : '';
        const marca = r.acceso === 'gerencia' && panel === 'gerencia' ? '<span class="etiqueta gerencia">Gerencia</span>' : '';
        html += `<a class="ficha${clase}" style="--i:${i++}" href="${esc(urlSegura(r.url))}" target="_blank" rel="noopener noreferrer">
          ${flecha}<h3>${esc(r.nombre)}</h3><p>${esc(r.descripcion || 'Sin descripción')}</p>
          <span class="pie">${marca}<span>Se abre en otra pestaña</span></span></a>`;
      });
      html += '</div></section>';
    });
    destino.innerHTML = html;
  }

  function pintarTodo() {
    ['general', 'gerencia'].forEach((p) => { pintarChips(p); pintarLista(p); });
    pintarTablaReportes();
    const cats = [...new Set(reportes.map((r) => capital(r.categoria)).filter(Boolean))];
    $('#listaCategorias').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
  }

  function pintarTablaReportes() {
    const nombres = { publico: 'Todo el equipo', gerencia: 'Gerencia', admin: 'Solo admin' };
    $('#tablaReportes').innerHTML = reportes.length ? reportes.map((r) => `
      <tr><td><strong>${esc(r.nombre)}</strong></td><td>${esc(capital(r.categoria))}</td>
      <td><span class="etiqueta${r.acceso === 'gerencia' ? ' gerencia' : ''}">${esc(nombres[r.acceso] || r.acceso)}</span></td>
      <td>${esc(r.descripcion)}</td>
      <td><div class="acciones" style="margin:0;flex-wrap:nowrap">
        <button class="btn btn-borde btn-chico" data-editar="${esc(r.id)}">Editar</button>
        <button class="btn btn-texto btn-chico" data-eliminar="${esc(r.id)}">Eliminar</button></div></td></tr>`).join('')
      : '<tr><td colspan="5">No hay reportes. Agrega el primero en la pestaña anterior.</td></tr>';
  }

  /* ==========================================================
     RUTAS Y SESIÓN
     ========================================================== */
  const RUTAS = ['general', 'gerencia', 'admin'];
  let sesion = sesionAlmacen.leer('sesion_nexus'); // 'admin' | 'gerencia' | null
  let rutaPendiente = null;

  const puedeVer = (ruta) => ruta === 'general' || (ruta === 'gerencia' && (sesion === 'gerencia' || sesion === 'admin')) || (ruta === 'admin' && sesion === 'admin');

  function mostrarPanel(nombre) {
    conTransicion(() => {
      $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== nombre; });
      $$('.segmentos a').forEach((a) => {
        if (a.dataset.ruta === nombre) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      $('#btnSalir').hidden = !sesion;
      if (nombre === 'admin') { pintarTablaReportes(); actualizarEstadoGH(); pintarConsentimientos(); }
    });
    const titulos = { general: 'Reportes', gerencia: 'Gerencia', admin: 'Administración', 404: 'Sección no encontrada' };
    document.title = `NEXUS · ${titulos[nombre] || 'Reportes'}`;
  }

  function enrutar() {
    if (document.body.classList.contains('bloqueado')) return;
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')).toLowerCase();
    if (h === 'contenido') return; // enlace "Saltar al contenido"
    const ruta = h || 'general';
    if (!RUTAS.includes(ruta)) {
      $('#ruta404').textContent = location.hash;
      mostrarPanel('404');
      return;
    }
    if (!puedeVer(ruta)) { pedirClave(ruta); return; }
    mostrarPanel(ruta);
  }

  function pedirClave(ruta) {
    rutaPendiente = ruta;
    $('#t-clave').textContent = ruta === 'admin' ? 'Acceso de administración' : 'Acceso de gerencia';
    $('#campoClave').value = '';
    $('#claveFalta').textContent = '';
    $('#dlgClave').showModal();
    $('#campoClave').focus();
  }

  async function validarClave(e) {
    e.preventDefault();
    const valor = $('#campoClave').value;
    if (!valor) { $('#claveFalta').textContent = 'Escribe la contraseña.'; return; }
    const h = await sha256(valor);
    let nivel = null;
    if (h === claves.admin) nivel = 'admin';
    else if (h === claves.gerencia && rutaPendiente === 'gerencia') nivel = 'gerencia';
    if (!nivel) { $('#claveFalta').textContent = 'La contraseña no es correcta.'; $('#campoClave').select(); return; }
    sesion = nivel;
    sesionAlmacen.guardar('sesion_nexus', nivel);
    const destino = rutaPendiente;
    rutaPendiente = null;
    $('#dlgClave').close();
    mostrarPanel(destino);
  }

  function cerrarSesion() {
    sesion = null;
    sesionAlmacen.borrar('sesion_nexus');
    location.hash = '#general';
    aviso('Sesión cerrada.');
  }

  /* ==========================================================
     CONSENTIMIENTO (términos y privacidad por separado)
     ========================================================== */
  const CLAVE_CONSENT = 'consentimiento_nexus';
  const CLAVE_LOG = 'consentimientos_nexus';
  const marcas = { terminos: null, privacidad: null, abrioTerminos: false, abrioPrivacidad: false, abrioCookies: false };

  function dispositivo() {
    let id = almacen.leer('dispositivo_nexus');
    if (!id) { id = uuid(); almacen.guardar('dispositivo_nexus', id); }
    return id;
  }

  function consentimientoVigente() {
    const c = almacen.leer(CLAVE_CONSENT);
    return !!(c && c.terminos_version === LEGAL.version.terminos && c.privacidad_version === LEGAL.version.privacidad);
  }

  function abrirPuerta() {
    document.body.classList.add('bloqueado');
    const previo = almacen.leer(CLAVE_CONSENT);
    if (previo && previo.nombre) $('#consentNombre').value = previo.nombre;
    if (previo) $('#consentFalta').textContent = 'Actualizamos los documentos. Revísalos y acéptalos de nuevo.';
    $('#dlgConsent').showModal();
    revisarPuerta();
  }

  function revisarPuerta() {
    const nombre = $('#consentNombre').value.trim();
    const faltas = [];
    if (nombre.split(/\s+/).filter(Boolean).length < 2) faltas.push('tu nombre y apellido');
    if (!$('#chkTerminos').checked) faltas.push('aceptar los términos');
    if (!$('#chkPrivacidad').checked) faltas.push('aceptar la política de privacidad');
    $('#btnAceptar').disabled = faltas.length > 0;
    return faltas;
  }

  function registro(tipo, extra) {
    const ahora = new Date();
    return {
      id: uuid(),
      tipo,
      registrado_en: ahora.toISOString(),
      hora_local: ahora.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'medium' }),
      zona_horaria: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      dispositivo: dispositivo(),
      pagina: location.origin + location.pathname,
      navegador: navigator.userAgent,
      idioma: navigator.language || '',
      pantalla: `${screen.width}x${screen.height}`,
      modo: matchMedia('(display-mode: standalone)').matches ? 'app instalada' : 'navegador',
      ...extra
    };
  }

  async function enviarRegistro(r) {
    if (!LEGAL.registroUrl) return 'local';
    try {
      const resp = await fetch(LEGAL.registroUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // petición simple, sin preflight CORS
        body: JSON.stringify(r)
      });
      const data = await resp.json().catch(() => ({}));
      return resp.ok && data.ok ? 'enviado' : 'pendiente';
    } catch { return 'pendiente'; }
  }

  async function guardarEnLog(r) {
    const log = almacen.leer(CLAVE_LOG, []);
    r.envio = 'enviando';
    log.push(r);
    almacen.guardar(CLAVE_LOG, log);
    const estado = await enviarRegistro(r);
    const log2 = almacen.leer(CLAVE_LOG, []);
    const item = log2.find((x) => x.id === r.id);
    if (item) { item.envio = estado; almacen.guardar(CLAVE_LOG, log2); }
    return estado;
  }

  async function reenviarPendientes(silencioso) {
    if (!LEGAL.registroUrl) { if (!silencioso) aviso('Primero configura registroUrl en legal.js.', 'error'); return; }
    const log = almacen.leer(CLAVE_LOG, []);
    let enviados = 0;
    for (const item of log) {
      if (item.envio === 'enviado') continue;
      const { envio, ...limpio } = item;
      item.envio = await enviarRegistro(limpio);
      if (item.envio === 'enviado') enviados++;
    }
    almacen.guardar(CLAVE_LOG, log);
    if (!silencioso) aviso(enviados ? `Se enviaron ${enviados} registros.` : 'No había registros pendientes por enviar.');
    pintarConsentimientos();
  }

  async function aceptarPuerta(e) {
    e.preventDefault();
    const faltas = revisarPuerta();
    if (faltas.length) { $('#consentFalta').textContent = 'Falta ' + faltas.join(', ') + '.'; return; }
    const nombre = $('#consentNombre').value.trim().replace(/\s+/g, ' ');
    const r = registro('aceptacion', {
      nombre,
      terminos_version: LEGAL.version.terminos,
      terminos_aceptado: marcas.terminos,
      privacidad_version: LEGAL.version.privacidad,
      privacidad_aceptado: marcas.privacidad,
      cookies_version: LEGAL.version.cookies,
      abrio_terminos: marcas.abrioTerminos ? 'sí' : 'no',
      abrio_privacidad: marcas.abrioPrivacidad ? 'sí' : 'no',
      abrio_cookies: marcas.abrioCookies ? 'sí' : 'no',
      metodo: 'Dos casillas separadas, sin marcar por defecto, con enlace a cada documento, en la ventana "Antes de entrar a NEXUS"; confirmación con el botón "Aceptar y entrar".'
    });
    almacen.guardar(CLAVE_CONSENT, r);
    $('#dlgConsent').close();
    document.body.classList.remove('bloqueado');
    enrutar();
    aviso(`Listo, ${nombre.split(' ')[0]}. Ya puedes usar NEXUS.`);
    const estado = await guardarEnLog(r);
    if (estado === 'pendiente') console.warn('Registro de aceptación pendiente de envío.');
  }

  async function retirarConsentimiento() {
    const ok = await confirmar({
      titulo: '¿Retirar tu consentimiento?',
      texto: 'Dejarás de tener acceso al portal hasta que vuelvas a aceptar. Borraremos de este navegador tus datos de aceptación y la copia de los reportes; guardaremos la fecha en que lo retiraste.',
      accion: 'Retirar consentimiento'
    });
    if (!ok) return;
    const previo = almacen.leer(CLAVE_CONSENT);
    const r = registro('retiro', { nombre: previo ? previo.nombre : '', metodo: 'Enlace "Retirar mi consentimiento" del pie de página.' });
    almacen.borrar(CLAVE_CONSENT);
    almacen.borrar('reportes_nexus');
    sesionAlmacen.borrar('sesion_nexus');
    sesion = null;
    marcas.terminos = marcas.privacidad = null;
    $('#chkTerminos').checked = false;
    $('#chkPrivacidad').checked = false;
    $('#consentNombre').value = '';
    await guardarEnLog(r);
    $('#consentFalta').textContent = '';
    document.body.classList.add('bloqueado');
    $('#dlgConsent').showModal();
    revisarPuerta();
  }

  function pintarConsentimientos() {
    const log = almacen.leer(CLAVE_LOG, []);
    const estado = $('#consentEstado');
    if (LEGAL.registroUrl) {
      const pend = log.filter((x) => x.envio !== 'enviado').length;
      estado.className = 'estado ' + (pend ? 'mal' : 'ok');
      estado.textContent = pend ? `Registro central activo. ${pend} registro(s) de este navegador no se han enviado.` : 'Registro central activo. Todo lo de este navegador está enviado.';
    } else {
      estado.className = 'estado mal';
      estado.textContent = 'Registro central sin configurar: las aceptaciones solo quedan en el navegador de cada persona. Configura registroUrl en legal.js (ver consentimientos.gs).';
    }
    const fmt = (iso) => (iso ? new Date(iso).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
    const nombresEnvio = { enviado: 'Enviado', pendiente: 'Pendiente', enviando: 'Enviando', local: 'Solo local' };
    $('#tablaConsent').innerHTML = log.length ? log.slice().reverse().map((x) => `
      <tr><td><strong>${esc(x.nombre || '—')}</strong><br>${x.tipo === 'retiro' ? 'Retiró el consentimiento' : 'Aceptó'}</td>
      <td>${x.tipo === 'retiro' ? '—' : fmt(x.terminos_aceptado)}</td>
      <td>${x.tipo === 'retiro' ? fmt(x.registrado_en) : fmt(x.privacidad_aceptado)}</td>
      <td>${esc(x.terminos_version || '—')} / ${esc(x.privacidad_version || '—')}</td>
      <td>${esc(x.modo)}, ${esc(x.zona_horaria)}</td>
      <td>${esc(nombresEnvio[x.envio] || x.envio || '—')}</td></tr>`).join('')
      : '<tr><td colspan="6">Todavía no hay aceptaciones en este navegador.</td></tr>';
  }

  function exportarConsentCSV() {
    const log = almacen.leer(CLAVE_LOG, []);
    if (!log.length) { aviso('No hay registros para descargar.', 'error'); return; }
    const cols = [...new Set(log.flatMap(Object.keys))];
    const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + [cols.join(';'), ...log.map((r) => cols.map((c) => celda(r[c])).join(';'))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `aceptaciones-nexus-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ==========================================================
     ADMINISTRACIÓN
     ========================================================== */
  function actualizarEstadoGH() {
    const el = $('#ghEstado');
    $('#ghRepo').value = GH.repo;
    $('#ghBranch').value = GH.branch;
    $('#ghPath').value = GH.path;
    $('#ghToken').value = ghToken;
    if (location.protocol === 'file:') { el.className = 'estado mal'; el.textContent = 'Abriste el archivo local (file://). Ábrelo desde github.io para publicar.'; return; }
    if (!GH.repo) { el.className = 'estado'; el.textContent = 'Sin conexión configurada.'; }
    else if (ghToken) { el.className = 'estado ok'; el.textContent = `Conectado a ${GH.repo} (${GH.branch}/${GH.path}). Puedes leer y publicar.`; }
    else { el.className = 'estado'; el.textContent = `Conectado a ${GH.repo} solo para lectura. Agrega un token para publicar.`; }
  }

  function leerFormGitHub() {
    GH.repo = $('#ghRepo').value.trim();
    GH.branch = $('#ghBranch').value.trim() || 'main';
    GH.path = $('#ghPath').value.trim() || 'dataset.json';
    ghToken = $('#ghToken').value.trim();
    guardarGitHubLocal();
    actualizarEstadoGH();
  }

  function limpiarFormReporte() {
    $('#formReporte').reset();
    $('#repId').value = '';
    $('#tituloForm').textContent = 'Agregar reporte';
    $('#btnGuardarReporte').textContent = 'Agregar reporte';
    $('#btnCancelarEdicion').hidden = true;
  }

  function seleccionarPestana(boton) {
    const lista = boton.closest('[role="tablist"]');
    $$('[role="tab"]', lista).forEach((b) => {
      const activo = b === boton;
      b.setAttribute('aria-selected', activo);
      b.tabIndex = activo ? 0 : -1;
      document.getElementById(b.getAttribute('aria-controls')).hidden = !activo;
    });
    if (boton.id === 'b-a-consent') pintarConsentimientos();
  }

  /* ==========================================================
     ARRANQUE
     ========================================================== */
  function conectarEventos() {
    window.addEventListener('hashchange', enrutar);

    // Buscadores y filtros
    $$('[data-buscar]').forEach((i) => i.addEventListener('input', () => { filtros[i.dataset.buscar].q = i.value; pintarLista(i.dataset.buscar); }));
    $$('[data-chips]').forEach((c) => c.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      filtros[c.dataset.chips].cat = b.dataset.cat;
      pintarChips(c.dataset.chips);
      pintarLista(c.dataset.chips);
    }));

    // Pestañas accesibles (clic y flechas)
    $$('[role="tab"]').forEach((b) => {
      b.addEventListener('click', () => seleccionarPestana(b));
      b.addEventListener('keydown', (e) => {
        if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
        const tabs = $$('[role="tab"]', b.closest('[role="tablist"]'));
        const n = tabs[(tabs.indexOf(b) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        n.focus(); seleccionarPestana(n);
      });
    });

    // Acceso con contraseña
    $('#formClave').addEventListener('submit', validarClave);
    $('#btnCancelarClave').addEventListener('click', () => $('#dlgClave').close());
    $('#dlgClave').addEventListener('close', () => { if (rutaPendiente) { rutaPendiente = null; location.hash = '#general'; } });

    // Puerta de consentimiento
    const dlg = $('#dlgConsent');
    dlg.addEventListener('cancel', (e) => e.preventDefault()); // no se puede cerrar con Escape
    $('#consentNombre').addEventListener('input', revisarPuerta);
    $('#chkTerminos').addEventListener('change', (e) => { marcas.terminos = e.target.checked ? new Date().toISOString() : null; revisarPuerta(); });
    $('#chkPrivacidad').addEventListener('change', (e) => { marcas.privacidad = e.target.checked ? new Date().toISOString() : null; revisarPuerta(); });
    dlg.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      if (a.href.includes('terminos')) marcas.abrioTerminos = true;
      if (a.href.includes('privacidad')) marcas.abrioPrivacidad = true;
      if (a.href.includes('cookies')) marcas.abrioCookies = true;
    });
    $('#formConsent').addEventListener('submit', aceptarPuerta);
    $('#btnRetirar').addEventListener('click', retirarConsentimiento);

    // Botón de cerrar sesión en el encabezado
    const salir = document.createElement('button');
    salir.className = 'btn btn-texto btn-chico';
    salir.id = 'btnSalir';
    salir.type = 'button';
    salir.textContent = 'Cerrar sesión';
    salir.hidden = !sesion;
    salir.addEventListener('click', cerrarSesion);
    $('.masthead').appendChild(salir);

    // Formulario de reporte
    $('#formReporte').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = $('#repId').value;
      const datos = {
        nombre: $('#repNombre').value.trim(),
        categoria: $('#repCategoria').value.trim().toUpperCase(),
        url: $('#repUrl').value.trim(),
        acceso: $('#repAcceso').value,
        descripcion: $('#repDescripcion').value.trim()
      };
      if (urlSegura(datos.url) === '#') { aviso('El enlace debe empezar con http:// o https://.', 'error'); return; }
      if (id) {
        const i = reportes.findIndex((r) => String(r.id) === id);
        if (i > -1) reportes[i] = { ...reportes[i], ...datos };
      } else {
        reportes.push({ id: Date.now(), ...datos });
      }
      limpiarFormReporte();
      pintarTodo();
      await guardarReportes(id ? 'Reporte actualizado.' : 'Reporte agregado.');
    });
    $('#btnCancelarEdicion').addEventListener('click', limpiarFormReporte);

    $('#tablaReportes').addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-editar]');
      const el = e.target.closest('[data-eliminar]');
      if (ed) {
        const r = reportes.find((x) => String(x.id) === ed.dataset.editar);
        if (!r) return;
        $('#repId').value = r.id;
        $('#repNombre').value = r.nombre;
        $('#repCategoria').value = capital(r.categoria);
        $('#repUrl').value = r.url;
        $('#repAcceso').value = r.acceso;
        $('#repDescripcion').value = r.descripcion || '';
        $('#tituloForm').textContent = 'Editar reporte';
        $('#btnGuardarReporte').textContent = 'Guardar cambios';
        $('#btnCancelarEdicion').hidden = false;
        seleccionarPestana($('#b-a-form'));
        $('#repNombre').focus();
      }
      if (el) {
        const r = reportes.find((x) => String(x.id) === el.dataset.eliminar);
        if (!r) return;
        const ok = await confirmar({ titulo: `¿Eliminar “${r.nombre}”?`, texto: 'El reporte dejará de aparecer para todo el equipo cuando se publique el cambio.', accion: 'Eliminar reporte' });
        if (!ok) return;
        reportes = reportes.filter((x) => x !== r);
        pintarTodo();
        await guardarReportes('Reporte eliminado.');
      }
    });

    // GitHub
    $('#formGithub').addEventListener('submit', (e) => { e.preventDefault(); leerFormGitHub(); aviso('Conexión guardada en este navegador.'); });
    $('#btnPublicar').addEventListener('click', async () => { leerFormGitHub(); if (await publicarDataset()) aviso('dataset.json publicado para todo el equipo.'); });
    $('#btnProbar').addEventListener('click', async () => {
      leerFormGitHub();
      if (!GH.repo) { aviso('Escribe el repositorio como usuario/repositorio.', 'error'); return; }
      const ok = await cargarDataset();
      if (ok) { pintarTodo(); aviso(`Conexión correcta. Se cargaron ${reportes.length} reportes.`); }
      else { const p = pista(ultimoError); aviso('No se pudo conectar (' + (ultimoError || 'error desconocido') + ')' + (p ? '. ' + p : ''), 'error'); }
    });
    $('#btnOlvidarToken').addEventListener('click', () => { ghToken = ''; guardarGitHubLocal(); actualizarEstadoGH(); aviso('Token eliminado de este navegador.'); });

    // Contraseñas
    $('#formClaves').addEventListener('submit', async (e) => {
      e.preventDefault();
      const g = $('#nuevaGerencia').value;
      const a = $('#nuevaAdmin').value;
      if (!g && !a) { aviso('Escribe al menos una contraseña nueva.', 'error'); return; }
      if ((g && g.length < 8) || (a && a.length < 8)) { aviso('Usa al menos 8 caracteres.', 'error'); return; }
      if (a && sesion !== 'admin') { aviso('Solo el admin puede cambiar la contraseña de admin.', 'error'); return; }
      if (g) claves.gerencia = await sha256(g);
      if (a) claves.admin = await sha256(a);
      almacen.guardar('config_nexus', { hashAdmin: claves.admin, hashGerencia: claves.gerencia });
      e.target.reset();
      aviso('Contraseñas guardadas en este navegador.');
    });

    // Consentimientos (admin)
    $('#btnExportarConsent').addEventListener('click', exportarConsentCSV);
    $('#btnReenviar').addEventListener('click', () => reenviarPendientes(false));
  }

  async function iniciar() {
    await cargarClaves();
    cargarGitHubLocal();
    conectarEventos();

    reportes = almacen.leer('reportes_nexus', []);
    pintarTodo();
    if (reportes.length) primeraCarga = false; // la entrada animada se ve una sola vez

    if (consentimientoVigente()) {
      document.body.classList.remove('bloqueado');
      enrutar();
    } else {
      abrirPuerta();
    }

    const ok = await cargarDataset();
    if (!ok && !reportes.length) aviso('No se pudieron cargar los reportes. Revisa tu conexión.', 'error');
    pintarTodo();
    primeraCarga = false;
    reenviarPendientes(true);
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
  }
  iniciar();
})();
