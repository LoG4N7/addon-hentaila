# 🌸 HentaiLA Addon para Nuvio y Stremio

Addon completo y de alto rendimiento para **Nuvio** y **Stremio**, desarrollado en **Node.js** con web scraping en tiempo real sobre [HentaiLA](https://hentaila.tv/). Diseñado y optimizado para ser alojado gratuitamente en **Vercel** directamente desde un repositorio de **GitHub**.

---

## 🚀 Características Principales

- **Scraping en Tiempo Real:** Extrae títulos, portadas, metadatos, géneros y lista completa de episodios directamente de `hentaila.tv` utilizando Cheerio.
- **Reproducción HLS Nativa:** Descifra dinámicamente los tokens protegidos de PlayerLogic (algoritmo multicapa ROT13 + Base64) para obtener streams directos `.m3u8` con calidad adaptativa.
- **ProxyHeaders Configurados:** Incluye cabeceras `Referer: https://hentaila.tv/` y `User-Agent` para evitar bloqueos por hotlinking y garantizar reproducción fluida.
- **Catálogo y Búsqueda Integrada:**
  - Catálogo principal: **HentaiLA** (`hla-catalog`)
  - Soporte de búsqueda (`search`) en tiempo real para localizar cualquier anime.
- **Encabezados CORS Globales:** Encabezados `Access-Control-Allow-Origin: *` y `Access-Control-Allow-Headers: *` en todas las respuestas para total compatibilidad web y móvil.
- **Manejo Robusto de Errores:** Respuestas seguras con `{ streams: [] }` y timeouts controlados ante fallos de conexión o servidores caídos.
- **Página de Bienvenida (Landing Page):** Interfaz web moderna con botón de instalación en 1 clic (`stremio://...`).
- **Despliegue Serverless en Vercel:** Configurado con `vercel.json` y compatible con Node.js 18+.

---

## 📋 Especificación Estricta del Manifest (`/manifest.json`)

```json
{
  "id": "com.hentaila.addon",
  "name": "HentaiLA Addon",
  "version": "1.0.0",
  "description": "Addon de Nuvio para explorar, buscar y reproducir contenido de HentaiLA",
  "resources": ["catalog", "meta", "stream"],
  "types": ["anime"],
  "idPrefixes": ["hla-"],
  "catalogs": [
    {
      "type": "anime",
      "id": "hla-catalog",
      "name": "HentaiLA",
      "extra": [
        { "name": "search", "isRequired": false }
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
│   └── scraper.js     # Lógica de scraping con Cheerio, decodificador y extractor
├── test/
│   └── test.js        # Suite de pruebas automatizadas locales (55 pruebas)
├── vercel.json        # Configuración de rutas y reescrituras para Vercel
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
| `GET` | `/catalog/anime/hla-catalog/search=:query.json` | Búsqueda directa por título (ejemplo: `/search=kanojo.json`) |
| `GET` | `/meta/anime/:id.json` | Ficha técnica completa de la serie (título, póster, sinopsis, géneros y episodios) |
| `GET` | `/stream/anime/:id.json` | Enlaces de streaming `.m3u8` y servidores de reproducción para el episodio |

---

## 💻 Instalación y Desarrollo Local

### 1. Clonar el repositorio
```bash
git clone https://github.com/TU_USUARIO/addon-hentaila.git
cd addon-hentaila
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Iniciar el servidor local
```bash
npm start
```
El servidor se iniciará en `http://localhost:7000`.

### 4. Modo de desarrollo (Hot Reload)
```bash
npm run dev
```

### 5. Ejecutar pruebas automatizadas
```bash
npm test
```
Ejecutará 55 pruebas automatizadas verificando CORS en todos los endpoints, el catálogo `hla-catalog`, la búsqueda y la extracción de streams HLS.

---

## ☁️ Guía de Despliegue en Vercel desde GitHub

### Paso 1: Subir el proyecto a GitHub
```bash
git init
git add .
git commit -m "feat: HentaiLA Addon para Nuvio y Stremio"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/addon-hentaila.git
git push -u origin main
```

### Paso 2: Importar en Vercel
1. Ingresa a [Vercel](https://vercel.com/) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **"Add New..."** ➔ **"Project"**.
3. Selecciona el repositorio `addon-hentaila` y haz clic en **"Import"**.
4. Haz clic en **"Deploy"** (Vercel detectará automáticamente `vercel.json` y la carpeta `api/`).

---

## 📱 Cómo Instalar en Nuvio y Stremio

### Opción A: Desde la página web del Addon
1. Abre tu navegador y accede a la URL de Vercel (ejemplo: `https://tu-addon.vercel.app/`).
2. Haz clic en el botón violeta **"🚀 Instalar Addon"**.

### Opción B: Copiando la URL del Manifest
1. Copia el enlace del manifest de tu addon:
   ```text
   https://tu-addon.vercel.app/manifest.json
   ```
2. Abre **Nuvio** o **Stremio**.
3. Ve a la sección **Addons**.
4. Pega la URL del manifest en la barra de búsqueda y presiona **Enter** o haz clic en **"Instalar"**.
