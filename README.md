# 🌸 HentaiLA Addon para Nuvio y Stremio

Addon completo y de alto rendimiento para **Nuvio** y **Stremio**, desarrollado en **Node.js** con web scraping en tiempo real sobre [HentaiLA](https://hentaila.tv/). Diseñado y optimizado para ser alojado gratuitamente en **Vercel** directamente desde un repositorio de **GitHub**.

---

## 🚀 Características Principales

- **Compatibilidad Estricta para Nuvio y Stremio:**
  - Encabezados HTTP obligatorios en todas las respuestas:
    * `Content-Type: application/json; charset=utf-8`
    * `Access-Control-Allow-Origin: *`
    * `Access-Control-Allow-Methods: GET, POST, OPTIONS`
    * `Access-Control-Allow-Headers: *`
  - Manejo explícito de preflight `OPTIONS` con respuesta status 200 y `Content-Type: application/json`.
- **Manifest Simplificado y Estandarizado:**
  - `id`: `"org.hentaila.nuvio"`
  - `name`: `"HentaiLA"`
  - Soporte de catálogo con `extraSupported: ["search"]` y `extra: [{ name: "search", isRequired: false }]`.
- **Extractor Multi-Servidor y Multi-Calidad:**
  - Descifra dinámicamente el reproductor PlayerLogic (ROT13 + Base64 multicapa).
  - Parsea la playlist maestra HLS `.m3u8` para generar streams directos por resolución:
    * `HentaiLA - Auto (HLS)` (Adaptativo)
    * `HentaiLA - 1080p (FHD)`
    * `HentaiLA - 720p (HD)`
    * `HentaiLA - 480p / 360p (SD)`
  - Extrae y procesa iframes y servidores externos (YourUpload, Mega, Mp4Upload, Fembed, Streamtape, VOE, etc.).
- **ProxyHeaders Configurados:** Cada servidor incluye cabeceras en `behaviorHints.proxyHeaders.request`:
  * `"Referer": "https://hentaila.tv/"`
  * `"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"`
- **Despliegue Serverless en Vercel:** Configuración exacta en `vercel.json` con `@vercel/node`.

---

## 📋 Especificación del Manifest (`/manifest.json`)

```json
{
  "id": "org.hentaila.nuvio",
  "name": "HentaiLA",
  "version": "1.0.0",
  "description": "Catalogo y reproductor de HentaiLA",
  "resources": ["catalog", "meta", "stream"],
  "types": ["anime"],
  "idPrefixes": ["hla-"],
  "catalogs": [
    {
      "type": "anime",
      "id": "hla-catalog",
      "name": "HentaiLA",
      "extraSupported": ["search"],
      "extra": [
        {
          "name": "search",
          "isRequired": false
        }
      ]
    }
  ]
}
```

---

## 🛠️ Estructura del Proyecto

```text
addon-hentaila/
├── api/
│   └── index.js       # Servidor Express & Funciones Serverless para Vercel
├── src/
│   └── scraper.js     # Motor de scraping, decodificador PlayerLogic y extractor multi-servidor
├── test/
│   └── test.js        # Suite de pruebas automatizadas locales (67 pruebas)
├── vercel.json        # Configuración exacta de builds y rutas para Vercel
├── package.json       # Dependencias y scripts de ejecución
├── .gitignore         # Archivos ignorados por Git
└── README.md          # Documentación detallada
```

---

## 🔌 Rutas y Endpoints de la API

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/` | Interfaz web interactiva de bienvenida y botón de instalación en 1 clic |
| `GET` | `/manifest.json` | Definición del Addon y del catálogo `hla-catalog` |
| `GET` | `/catalog/anime/hla-catalog.json` | Catálogo principal con los últimos lanzamientos de HentaiLA |
| `GET` | `/catalog/anime/hla-catalog/search=:query.json` | Búsqueda directa por título con decodificación de caracteres |
| `GET` | `/meta/anime/:id.json` | Ficha técnica completa de la serie (título, póster, sinopsis, géneros y episodios) |
| `GET` | `/stream/anime/:id.json` | Lista completa de servidores y calidades de video (.m3u8, YourUpload, Mega, etc.) |

---

## 💻 Instalación y Pruebas Locales

```bash
# Instalar dependencias
npm install

# Iniciar servidor local (http://localhost:7000)
npm start

# Ejecutar suite de pruebas automatizadas
npm test
```
