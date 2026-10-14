# Laboratorio 9 - Galería de imágenes en Amazon S3

Aplicación web para subir, listar, previsualizar y eliminar imágenes en un bucket privado de Amazon S3 usando **presigned URLs**. El navegador nunca recibe credenciales de AWS: el backend solo genera URLs firmadas de corta duración y el archivo viaja directamente del navegador a S3.

**Curso:** Desarrollo en la Nube - TECSUP
**Autor:** Pablo Arone

## Arquitectura

```
Navegador ──1) POST /api/upload-url──► Backend (Express + AWS SDK v3)
Navegador ◄──2) presigned URL (PUT)─── Backend
Navegador ──3) PUT imagen directo────► Amazon S3 (bucket privado, SSE-S3, solo HTTPS)
```

## Estructura

```
backend/
  .env.example    plantilla de variables de entorno (el .env real NO se sube)
  package.json
  server.js       API con los 3 endpoints
frontend/
  index.html      formulario drag and drop + galería
  app.js          lógica de subida, listado y eliminación
  styles.css
cors-bucket.json  configuración CORS que se pega en el bucket
```

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/upload-url` | Recibe `filename`, `contentType` y `sizeBytes`; valida tipo y tamaño y devuelve una presigned URL de subida válida 5 minutos |
| GET | `/api/images` | Lista las imágenes de `originales/` con presigned URLs de visualización válidas 15 minutos |
| DELETE | `/api/images/:key` | Elimina la imagen indicada (solo dentro de `originales/`) |

## Requisitos

- Node.js 18 o superior
- Bucket S3 con *Block all public access* activado
- Usuario IAM `app-imagenes-user` con permisos mínimos (`GetObject`, `PutObject`, `DeleteObject`, `ListBucket`) sobre el bucket
- CORS del bucket configurado con el contenido de `cors-bucket.json` (Permissions > Cross-origin resource sharing)

## Cómo ejecutar (Windows / PowerShell)

```powershell
git clone https://github.com/pabloislaarone/lab09-nube.git
cd lab09-nube\backend
copy .env.example .env      # luego edita .env con tus claves
npm install
npm start
```

En otra terminal, desde la raíz del proyecto:

```powershell
npx http-server .\frontend -p 8080 -c-1
```

Abrir `http://localhost:8080`.

## Seguridad aplicada

- Credenciales solo en el `.env` del backend (ignorado por Git), nunca en el frontend.
- Presigned URLs de corta duración: 5 min para subir, 15 min para ver.
- Validación de tipo (JPG, PNG, WEBP) y tamaño (< 5 MB) en el frontend **y** en el backend.
- Nombres de archivo sanitizados y únicos (evita `../` y caracteres raros).
- El DELETE solo acepta claves dentro de `originales/`.
- CORS restringido a `localhost:8080` tanto en el backend como en el bucket.
- Objetos cifrados en reposo con SSE-S3 (`AES256`) y bucket que rechaza conexiones sin HTTPS.
