// Muestra la dirección que no existe y activa "volver" solo si hay historial.
document.getElementById('ruta').textContent = decodeURI(location.pathname + location.search);
const atras = document.getElementById('atras');
if (history.length > 1 && document.referrer) {
  atras.addEventListener('click', (e) => { e.preventDefault(); history.back(); });
} else {
  atras.remove();
}
