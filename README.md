# 🌸 HentaiLA Addon para Nuvio y Stremio

Addon completo y de alto rendimiento para **Nuvio** y **Stremio**, desarrollado en **Node.js** con web scraping en tiempo real sobre [HentaiLA](https://hentaila.tv/). Diseñado y optimizado para ser alojado gratuitamente en **Vercel** directamente desde un repositorio de **GitHub**.

---

## 🚀 Características Principales

- **Scraping en Tiempo Real:** Extrae títulos, portadas, metadatos, géneros y lista completa de episodios directamente de `hentaila.tv` utilizando Cheerio.
- **Reproducción HLS Nativa:** Descifra dinámicamente los tokens protegidos de PlayerLogic (algoritmo multicapa ROT13 + Base64) para obtener streams directos `.m3u8` con calidad adaptativa.
- **ProxyHeaders Configurados:** Incluye cabeceras `Referer: https://hentaila.tv/` y `User-Agent` para evitar bloqueos por hotlinking y garantizar reproducción fluida.
- **Soporte Multicatálogo:**
  - 🕒 **HentaiLA - Últimos Episodios** (`hla-latest`)
  - 🔥 **HentaiLA - En Tendencia / Populares** (`hla-trending`)
  - 🔞 **HentaiLA - Sin Censura** (`hla-uncensored`)
- **Búsqueda Integrada:** Permite buscar cualquier título del catálogo mediante la barra de búsqueda de Nuvio o Stremio.
- **Manejo Robusto de Errores:** Respuestas seguras con `{ streams: [] }` y timeouts controlados ante fallos de conexión o servidores caídos.
- **Página de Bienvenida (Landing Page):** Interfaz web moderna con botón de instalación en 1 clic (`stremio://...`).
- **Despliegue Serverless en Vercel:** Configurado con `vercel.json` y compatible con Node.js 18+.

---

## 📋 Especificación del Manifest (`/manifest.json`)

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
      "id": "hla-latest",
      "name": "HentaiLA - Últimos Episodios",
      "type": "anime",
      "extra": [
        { "name": "search", "isRequired": false },
        { "name": "skip", "isRequired": false }
      ]
    },
    {
      "id": "hla-trending",
      "name": "HentaiLA - En Tendencia / Populares",
      "type": "anime",
      "extra": [
        { "name": "skip", "isRequired": false }
      ]
    },
    {
      "id": "hla-uncensored",
      "name": "HentaiLA - Sin Censura",
      "type": "anime",
      "extra": [
        { "name": "search", "isRequired": false },
        { "name": "skip", "isRequired": false }
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
│   └── test.js        # Suite de pruebas automatizadas locales
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
| `GET` | `/manifest.json` | Metadatos y definición de catálogos según la API de Nuvio / Stremio |
| `GET` | `/catalog/anime/:id.json` | Lista de contenidos del catálogo indicado (`hla-latest`, `hla-trending`, `hla-uncensored`) |
| `GET` | `/catalog/anime/:id/search=:query.json` | Resultados de búsqueda para el término `:query` |
| `GET` | `/catalog/anime/:id/skip=:skip.json` | Paginación de catálogos mediante desplazamiento (`skip`) |
| `GET` | `/meta/anime/:id.json` | Ficha técnica completa de la serie (título, póster, sinopsis, géneros y lista de episodios) |
| `GET` | `/stream/anime/:id.json` | Enlaces de streaming `.m3u8` y servidores de reproducción para el episodio seleccionado |

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
Ejecutará una serie de 45 comprobaciones automatizadas validando:
- Disponibilidad del Landing Page
- Esquema del Manifest
- Extracción de los 3 catálogos
- Sistema de búsqueda
- Extracción de metadatos y lista de episodios
- Extracción de streams de video HLS con proxyHeaders
- Manejo seguro de errores en slugs no existentes

---

## ☁️ Guía de Despliegue en Vercel desde GitHub

Para alojar el addon de forma gratuita las 24 horas del día en Vercel:

### Paso 1: Subir el proyecto a GitHub
1. Crea un nuevo repositorio en tu cuenta de GitHub (puede ser público o privado), por ejemplo `addon-hentaila`.
2. En la terminal de tu máquina local:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: HentaiLA Nuvio Addon"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/addon-hentaila.git
   git push -u origin main
   ```

### Paso 2: Importar en Vercel
1. Ingresa a [Vercel](https://vercel.com/) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **"Add New..."** ➔ **"Project"**.
3. Selecciona el repositorio `addon-hentaila` y haz clic en **"Import"**.
4. Deja la configuración por defecto (Vercel detectará automáticamente el archivo `vercel.json` y la carpeta `api/`).
5. Haz clic en **"Deploy"**.

En cuestión de segundos, Vercel te proporcionará una URL pública similar a:
```text
https://addon-hentaila-tu-usuario.vercel.app
```

---

## 📱 Cómo Instalar en Nuvio y Stremio

### Opción A: Desde la página web del Addon
1. Abre tu navegador y accede a la URL de Vercel (ejemplo: `https://tu-addon.vercel.app/`).
2. Haz clic en el botón violeta **"🚀 Instalar Addon"**.
3. Se abrirá automáticamente la aplicación de **Nuvio** o **Stremio** solicitando confirmación para instalar.

### Opción B: Copiando la URL del Manifest manualmente
1. Copia el enlace del manifest de tu addon:
   ```text
   https://tu-addon.vercel.app/manifest.json
   ```
2. Abre **Nuvio** o **Stremio**.
3. Ve a la sección **Addons** (o Complementos).
4. En el campo de búsqueda de la parte superior, pega la URL del manifest (`https://tu-addon.vercel.app/manifest.json`).
5. Presiona **Enter** o haz clic en **"Instalar"**.

¡Listo! Ya podrás navegar por los catálogos de HentaiLA, buscar títulos por nombre y reproducir directamente en tu reproductor favorito.

---

## ⚖️ Descargo de Responsabilidad (Disclaimer)

Este proyecto ha sido creado exclusivamente con fines educativos y de investigación sobre arquitecturas de addons para Nuvio y Stremio. El código fuente no almacena, descarga ni redistribuye ningún contenido multimedia con derechos de autor; únicamente interpreta y reenvía enlaces públicos provistos por terceros.
