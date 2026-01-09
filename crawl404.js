// crawl404-puppeteer.js
const puppeteer = require("puppeteer");
const fs = require("fs");

const START_URL = "https://qa.garzablancaresort.com/";
const BASE_ORIGIN = new URL(START_URL).origin;
const MAX_CONCURRENT = 10; // Número de páginas en paralelo
const MAX_PAGES_POOL = 15; // Pool de páginas reutilizables

const visited = new Set();
const errors404 = new Map(); // Para guardar { url: foundAt }
const pending = new Set();
const queue = [];

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    protocolTimeout: 60000,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // Pool de páginas reutilizables
  const pagePool = [];
  for (let i = 0; i < MAX_PAGES_POOL; i++) {
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    
    // Evitar descargas de archivos pesados que causan ERR_ABORTED
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url().toLowerCase();
      if (url.endsWith('.pdf') || url.endsWith('.zip') || url.endsWith('.doc')) {
        req.abort();
      } else {
        req.continue();
      }
    });

    pagePool.push(page);
  }

  async function getPage() {
    while (pagePool.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return pagePool.pop();
  }

  function releasePage(page) {
    pagePool.push(page);
  }

  async function crawl(url, foundAt = "Raíz") {
    if (visited.has(url) || pending.has(url)) return;
    pending.add(url);

    const page = await getPage();

    try {
      visited.add(url);
      console.log(`[${visited.size}] Visitando: ${url}`);

      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      if (!response) {
        releasePage(page);
        return;
      }

      const status = response.status();

      // Detecta 404 reales visibles al usuario
      if (status === 404) {
        console.warn(`⚠️  404 Real: ${url} (Viene de: ${foundAt})`);
        errors404.set(url, foundAt);
        releasePage(page);
        return;
      }

      // Heurística SPA: contenido vacío o página de error renderizada
      const isErrorPage = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return (
          text.includes("404") ||
          text.includes("page not found") ||
          text.includes("not found")
        );
      });

      if (isErrorPage) {
        console.warn(`⚠️  404 Heurística: ${url} (Viene de: ${foundAt})`);
        errors404.set(url, foundAt);
        releasePage(page);
        return;
      }

      const links = await page.$$eval("a[href]", (as, origin) =>
        as.map(a => a.href).filter(href => href.startsWith(origin) && !href.includes("#")),
        BASE_ORIGIN
      );

      releasePage(page);

      // Agregar links nuevos a la cola
      for (const link of links) {
        if (!visited.has(link) && !pending.has(link)) {
          queue.push({ url: link, foundAt: url });
        }
      }
    } catch (e) {
      if (!e.message.includes('ERR_ABORTED')) {
        console.error(`❌ Error navegando en ${url}:`, e.message);
      }
      releasePage(page);
    } finally {
      pending.delete(url);
    }
  }

  console.log("Escaneando con navegador real (SPA-safe) en paralelo...");
  
  queue.push({ url: START_URL, foundAt: "Inicio" });

  // Procesamiento concurrente
  while (queue.length > 0 || pending.size > 0) {
    const batch = [];
    
    // Tomar hasta MAX_CONCURRENT URLs de la cola
    while (batch.length < MAX_CONCURRENT && queue.length > 0) {
      const item = queue.shift();
      if (!visited.has(item.url) && !pending.has(item.url)) {
        batch.push(crawl(item.url, item.foundAt));
      }
    }

    if (batch.length > 0) {
      await Promise.all(batch);
    } else {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log("\n❌ Errores 404 encontrados:");
  console.table(Array.from(errors404.entries()).map(([u, origin]) => ({ 
    "URL con Error": u, 
    "Encontrado en": origin 
  })));

  console.log(`\nURLs visitadas: ${visited.size}`);

  // Exportar a CSV
  const csvFileName = "errores_404.csv";
  const csvHeader = "URL con Error,Encontrado en\n";
  const csvRows = Array.from(errors404.entries())
    .map(([url, origin]) => `"${url.replace(/"/g, '""')}","${origin.replace(/"/g, '""')}"`)
    .join("\n");

  fs.writeFileSync(csvFileName, csvHeader + csvRows, "utf8");
  console.log(`\n✅ Resultados exportados correctamente a: ${csvFileName}`);

  await browser.close();
})();
