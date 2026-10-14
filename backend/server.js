require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();

// Solo el frontend local puede llamar a la API
app.use(cors({ origin: ['http://localhost:8080', 'http://127.0.0.1:8080'] }));
app.use(express.json());

// requestChecksumCalculation: evita que el SDK firme un checksum de un cuerpo vacio,
// lo que haria fallar el PUT desde el navegador
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  requestChecksumCalculation: 'WHEN_REQUIRED'
});
const BUCKET = process.env.S3_BUCKET;
const PREFIX = 'originales/';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const UPLOAD_EXPIRES = 300; // 5 minutos
const VIEW_EXPIRES = 900;   // 15 minutos

if (!BUCKET || !process.env.AWS_REGION) {
  console.error('Falta configurar S3_BUCKET o AWS_REGION en el archivo .env');
  process.exit(1);
}

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ ok: true, mensaje: 'API Lab 09 S3 funcionando', bucket: BUCKET });
});

// 1) Generar presigned URL para subir (valida 5 minutos)
app.post('/api/upload-url', async (req, res) => {
  try {
    const { filename, contentType, sizeBytes } = req.body || {};

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Nombre de archivo requerido' });
    }
    if (!ALLOWED_TYPES.includes(contentType)) {
      return res.status(400).json({ error: 'Tipo de archivo no permitido (solo JPG, PNG o WEBP)' });
    }
    if (typeof sizeBytes !== 'number' || sizeBytes <= 0) {
      return res.status(400).json({ error: 'Tamaño de archivo inválido' });
    }
    if (sizeBytes > MAX_SIZE_BYTES) {
      return res.status(400).json({ error: `Archivo demasiado grande (máximo ${MAX_SIZE_MB} MB)` });
    }

    // Nombre seguro y unico: elimina ../, espacios y caracteres raros
    const safeName = filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(-100);
    const key = `${PREFIX}${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeName}`;

    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: 'AES256'
    });

    // El cifrado va dentro de la URL, asi el navegador no tiene que enviar ese header
    const url = await getSignedUrl(s3, cmd, {
      expiresIn: UPLOAD_EXPIRES,
      hoistableHeaders: new Set(['x-amz-server-side-encryption'])
    });
    res.json({ uploadUrl: url, key, expiresIn: UPLOAD_EXPIRES });
  } catch (err) {
    console.error('Error en upload-url:', err.message);
    res.status(500).json({ error: 'No se pudo generar la URL de subida' });
  }
});

// 2) Listar imagenes con presigned URLs de visualizacion (validas 15 minutos)
app.get('/api/images', async (req, res) => {
  try {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: PREFIX
    }));

    // Se omite la "carpeta" de 0 bytes creada desde la consola
    const objetos = (list.Contents || []).filter(obj => !obj.Key.endsWith('/'));

    const items = await Promise.all(objetos.map(async obj => {
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }),
        { expiresIn: VIEW_EXPIRES }
      );
      return { key: obj.Key, size: obj.Size, lastModified: obj.LastModified, url };
    }));

    items.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    res.json(items);
  } catch (err) {
    console.error('Error al listar:', err.message);
    res.status(500).json({ error: 'No se pudieron listar las imágenes' });
  }
});

// 3) Eliminar imagen
app.delete('/api/images/:key(*)', async (req, res) => {
  try {
    const key = req.params.key;

    // Solo se permite borrar dentro de originales/ y sin rutas raras
    if (!key || !key.startsWith(PREFIX) || key.includes('..')) {
      return res.status(400).json({ error: 'Clave no válida' });
    }

    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    res.json({ deleted: true, key });
  } catch (err) {
    console.error('Error al eliminar:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar la imagen' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}`));
