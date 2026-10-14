const API = 'http://localhost:3000';
const MAX_SIZE_MB = 5;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const fileInput = document.getElementById('file');
const dropZone = document.getElementById('dropZone');
const fileNameEl = document.getElementById('fileName');
const uploadBtn = document.getElementById('uploadBtn');
const refreshBtn = document.getElementById('refreshBtn');
const statusEl = document.getElementById('status');
const gallery = document.getElementById('gallery');

let selectedFile = null;

function setStatus(msg, type = 'info') {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

// Validacion en el frontend (se repite en el backend)
function validate(file) {
  if (!file) return 'Selecciona un archivo';
  if (!ALLOWED.includes(file.type)) return 'Tipo no permitido: solo JPG, PNG o WEBP';
  if (file.size > MAX_SIZE_MB * 1024 * 1024) return `Archivo demasiado grande (máximo ${MAX_SIZE_MB} MB)`;
  return null;
}

function selectFile(file) {
  const error = validate(file);
  if (error) {
    selectedFile = null;
    fileNameEl.textContent = '';
    uploadBtn.disabled = true;
    setStatus(error, 'error');
    return;
  }
  selectedFile = file;
  fileNameEl.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  uploadBtn.disabled = false;
  setStatus('Archivo listo para subir', 'info');
}

// Drag and drop
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('activo');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('activo'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('activo');
  selectFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => selectFile(fileInput.files[0]));

// Subida: 1) pedir presigned URL al backend, 2) PUT directo a S3
uploadBtn.addEventListener('click', async () => {
  const error = validate(selectedFile);
  if (error) return setStatus(error, 'error');

  uploadBtn.disabled = true;
  try {
    setStatus('Solicitando URL de subida al backend...', 'info');
    const res = await fetch(`${API}/api/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: selectedFile.name,
        contentType: selectedFile.type,
        sizeBytes: selectedFile.size
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error del backend');

    setStatus('Subiendo directamente a S3...', 'info');
    const put = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': selectedFile.type },
      body: selectedFile
    });
    if (!put.ok) throw new Error(`S3 rechazó la subida (código ${put.status})`);

    setStatus('Subida completa ✔', 'ok');
    selectedFile = null;
    fileInput.value = '';
    fileNameEl.textContent = '';
    loadGallery();
  } catch (err) {
    setStatus(err.message, 'error');
    uploadBtn.disabled = false;
  }
});

function nombreLegible(key) {
  // originales/1697300000000-abc123def456-foto.jpg -> foto.jpg
  const nombre = key.replace(/^originales\//, '');
  const partes = nombre.match(/^\d+-[a-f0-9]{12}-(.+)$/);
  return partes ? partes[1] : nombre;
}

async function loadGallery() {
  try {
    const res = await fetch(`${API}/api/images`);
    const items = await res.json();
    if (!res.ok) throw new Error(items.error || 'No se pudo cargar la galería');

    gallery.innerHTML = '';
    if (items.length === 0) {
      gallery.innerHTML = '<p class="vacio">No hay imágenes todavía.</p>';
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';

      const img = document.createElement('img');
      img.src = item.url;
      img.alt = nombreLegible(item.key);
      img.loading = 'lazy';

      const info = document.createElement('div');
      info.className = 'info';
      const nombre = document.createElement('p');
      nombre.className = 'nombre';
      nombre.textContent = nombreLegible(item.key);
      const meta = document.createElement('p');
      meta.className = 'meta';
      meta.textContent = `${(item.size / 1024).toFixed(1)} KB · ${new Date(item.lastModified).toLocaleString('es-PE')}`;
      info.append(nombre, meta);

      const acciones = document.createElement('div');
      acciones.className = 'acciones';
      const ver = document.createElement('a');
      ver.href = item.url;
      ver.target = '_blank';
      ver.rel = 'noopener';
      ver.textContent = 'Abrir';
      const borrar = document.createElement('button');
      borrar.className = 'peligro';
      borrar.textContent = 'Eliminar';
      borrar.addEventListener('click', () => del(item.key));
      acciones.append(ver, borrar);

      card.append(img, info, acciones);
      gallery.appendChild(card);
    });
  } catch (err) {
    gallery.innerHTML = '';
    setStatus(`${err.message}. ¿Está corriendo el backend?`, 'error');
  }
}

async function del(key) {
  if (!confirm(`¿Eliminar ${nombreLegible(key)}?`)) return;
  try {
    const res = await fetch(`${API}/api/images/${encodeURIComponent(key)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
    setStatus('Imagen eliminada', 'ok');
    loadGallery();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

refreshBtn.addEventListener('click', loadGallery);
loadGallery();
