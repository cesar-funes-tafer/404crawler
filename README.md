# Crawler hecho con código de vibras
### ¿Qué hace?
- Escanea de forma recursiva partiendo de una URL.
- Utiliza un **pool de páginas en paralelo** para ir a toda velocidad.
- Detecta errores 404 reales y por heurística (texto en pantalla).
- Exporta automáticamente los hallazgos a un `errores_404.csv`.

### Instalación y Uso

1. **Clona y prepara:**
   ```bash
   npm install
   ```

2. **Configura:**
   Abre `crawl404.js` y cambia la constante `START_URL` por la web que quieras auditar.

3. **Ejecuta:**
   ```bash
   node crawl404.js
   ```

### Dependencias
- `puppeteer` para la magia del navegador.
- `axios` & `cheerio` (preparado para peticiones ligeras).

---

