// Pestaña Salud: pinta datos/cuerpo.json, la lista de mediciones de la báscula que
// Instinct rellena a partir de cada captura. Los datos de OCULTAS se siguen guardando,
// pero no se enseñan; cualquier clave nueva que no esté ahí sí se muestra.

const NS = "http://www.w3.org/2000/svg";
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, atr, txt) => { const e = document.createElementNS(NS, tag); for (const k in atr) e.setAttribute(k, atr[k]); if (txt != null) e.textContent = txt; return e; };

// clave -> [nombre, grupo]
const MEDIDAS = {
  peso_kg: ["Peso", "Composición"], grasa_pct: ["Grasa corporal", "Indicadores"], grasa_kg: ["Grasa", "Composición"],
  musculo_kg: ["Masa muscular", "Composición"], musculo_pct: ["Músculo", "Composición"],
  musculo_esqueletico_kg: ["Músculo esquelético", "Composición"], agua_pct: ["Agua corporal", "Composición"],
  agua_kg: ["Agua", "Composición"], proteina_pct: ["Proteínas", "Composición"], proteina_kg: ["Masa proteica", "Composición"],
  mineral_oseo_kg: ["Mineral óseo", "Composición"], mineral_oseo_pct: ["Mineral óseo", "Composición"],
  peso_sin_grasa_kg: ["Peso sin grasa", "Composición"],
  puntuacion: ["Puntuación", "Indicadores"], imc: ["IMC", "Indicadores"], grasa_visceral: ["Grasa visceral", "Indicadores"],
  metabolismo_basal_kcal: ["Metabolismo basal", "Indicadores"], cintura_cadera: ["Cintura-cadera", "Indicadores"],
  edad_corporal: ["Edad corporal", "Indicadores"], frecuencia_cardiaca_lpm: ["Frecuencia cardíaca", "Indicadores"],
};
const OCULTAS = new Set(["grasa_kg", "musculo_kg", "musculo_pct", "musculo_esqueletico_kg", "agua_pct", "agua_kg",
  "proteina_pct", "proteina_kg", "mineral_oseo_kg", "mineral_oseo_pct", "peso_sin_grasa_kg", "grasa_visceral",
  "cintura_cadera", "edad_corporal"]);

// Gasto diario = metabolismo basal × factor de actividad (factores clásicos de Harris-Benedict).
const ACTIVIDAD = [
  ["Sedentario", 1.2, "Poco o nada de ejercicio"],
  ["Moderado", 1.55, "Ejercicio 3-5 días por semana"],
  ["Muy activo", 1.725, "Ejercicio intenso 6-7 días"],
];

/** Metabolismo basal (kcal/día) con cada fórmula que se pueda aplicar a esa medición. */
function basales(d, perfil, fecha) {
  const f = [], W = d.peso_kg;
  const magra = typeof d.peso_sin_grasa_kg === "number" ? d.peso_sin_grasa_kg
    : typeof W === "number" && typeof d.grasa_pct === "number" ? W * (1 - d.grasa_pct / 100) : null;
  if (magra) f.push(["Katch-McArdle (1975)", 370 + 21.6 * magra, "370 + 21,6 × masa sin grasa"]);
  const H = perfil?.altura_cm, nac = Date.parse(perfil?.nacimiento), sexo = perfil?.sexo;
  if (typeof W === "number" && typeof H === "number" && !isNaN(nac) && (sexo === "hombre" || sexo === "mujer")) {
    const A = Math.floor((Date.parse(fecha) - nac) / (365.25 * 864e5)), h = sexo === "hombre";
    f.push(["Mifflin-St Jeor (1990)", 10 * W + 6.25 * H - 5 * A + (h ? 5 : -161),
      "10 × peso + 6,25 × altura − 5 × edad " + (h ? "+ 5" : "− 161")]);
    f.push(["Harris-Benedict rev. (1984)", h ? 88.362 + 13.397 * W + 4.799 * H - 5.677 * A : 447.593 + 9.247 * W + 3.098 * H - 4.330 * A,
      h ? "88,4 + 13,4 × peso + 4,8 × altura − 5,7 × edad" : "447,6 + 9,2 × peso + 3,1 × altura − 4,3 × edad"]);
  }
  return f;
}

const OBJETIVOS = { peso_estandar_kg: "Peso estándar", control_peso_kg: "Control del peso",
  control_grasa_kg: "Control de la grasa", control_musculo_kg: "Control del músculo", control_musculo: "Control del músculo" };
const UNIDADES = { kg: " kg", pct: " %", kcal: " kcal", cm: " cm", lpm: " lpm" };
const unidadDe = k => UNIDADES[k.split("_").at(-1)] ?? "";
const nombreDe = k => MEDIDAS[k]?.[0]
  ?? (k[0].toUpperCase() + k.slice(1)).replace(/_(kg|pct|kcal|cm|lpm)$/, "").replace(/_/g, " ");
const cifra = v => v.toLocaleString("es-ES", { maximumFractionDigits: 1 });
const fechaCorta = f => isNaN(Date.parse(f)) ? f
  : new Date(f + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
const tono = v => /est[aá]ndar|normal|saludable|buen/i.test(v) ? "bien" : "ojo";

let elegida = "peso_kg";    // dato que se ve en el gráfico

function grafico(pts, unidad, W = 340) {
  const H = Math.round(Math.min(260, Math.max(180, W * 0.42))), m = { i: 46, d: 14, a: 14, b: 24 };
  const t0 = Date.parse(pts[0][0]), t1 = Date.parse(pts.at(-1)[0]);
  const vs = pts.map(p => p[1]), margen = (Math.max(...vs) - Math.min(...vs)) * 0.15 || 0.5;
  const lo = Math.min(...vs) - margen, hi = Math.max(...vs) + margen;
  const x = f => m.i + (W - m.i - m.d) * (Date.parse(f) - t0) / (t1 - t0 || 1);
  const y = v => m.a + (H - m.a - m.b) * (hi - v) / (hi - lo);
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  for (const v of [lo + margen, (lo + hi) / 2, hi - margen]) svg.append(
    sv("line", { x1: m.i, x2: W - m.d, y1: y(v), y2: y(v), stroke: "#d9cfbd", "stroke-width": 1 }),
    sv("text", { x: m.i - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 12, fill: "#8a7a6c" }, cifra(v)));
  svg.append(sv("polyline", { fill: "none", stroke: "#d97757", "stroke-width": 2.5, points: pts.map(p => x(p[0]) + "," + y(p[1])).join(" ") }));
  for (const p of pts) {
    const r = sv("rect", { x: x(p[0]) - 3, y: y(p[1]) - 3, width: 6, height: 6, fill: "#2a1d18" });
    r.append(sv("title", {}, `${p[0]}: ${cifra(p[1])}${unidad}`)); svg.append(r);
  }
  svg.append(sv("text", { x: m.i, y: H - 6, "font-size": 12, fill: "#8a7a6c" }, fechaCorta(pts[0][0])),
    sv("text", { x: W - m.d, y: H - 6, "text-anchor": "end", "font-size": 12, fill: "#8a7a6c" }, fechaCorta(pts.at(-1)[0])));
  return svg;
}

export function pintarSalud(caja, texto, perfil) {
  caja.replaceChildren();
  let todas;
  try { todas = JSON.parse(texto || "[]"); }
  catch { caja.append(el("p", "vacio", "datos/cuerpo.json no es un JSON válido. Díselo a Instinct.")); return; }
  const medidas = (Array.isArray(todas) ? todas : [])
    .filter(m => m && typeof m.fecha === "string" && m.medidas && typeof m.medidas === "object")
    .sort((a, b) => a.fecha + (a.hora ?? "") < b.fecha + (b.hora ?? "") ? -1 : 1);
  if (!medidas.length) {
    caja.append(el("p", "vacio", "Aún no hay mediciones. Mándale a Instinct la captura de la báscula y aparecerán aquí."));
    return;
  }
  const ultima = medidas.at(-1), datos = ultima.medidas;
  const previaDe = k => medidas.slice(0, -1).reverse().find(m => typeof m.medidas[k] === "number");
  const cambio = k => {
    const p = previaDe(k); if (!p) return "";
    const d = Math.round((datos[k] - p.medidas[k]) * 10) / 10;
    return d ? (d > 0 ? "↑ " : "↓ ") + cifra(Math.abs(d)) : "sin cambio";
  };
  const etiqueta = k => {
    const v = ultima.valoraciones?.[k];
    return typeof v === "string" && v ? el("em", "val " + tono(v), v) : null;
  };

  // Cabecera: el peso, en grande
  const portada = el("section", "salud-portada"), izq = el("div"), der = el("div", "puntos");
  izq.append(el("small", "", "Peso"));
  if (typeof datos.peso_kg === "number") {
    const p = el("strong"); p.append(cifra(datos.peso_kg), el("span", "", " kg")); izq.append(p);
    const prev = previaDe("peso_kg");
    if (prev) { const c = cambio("peso_kg"); izq.append(el("p", "", (c === "sin cambio" ? "Sin cambio" : c + " kg") + " desde el " + fechaCorta(prev.fecha))); }
  }
  const marcas = el("div", "marcas"), ep = etiqueta("peso_kg");
  if (ep) marcas.append(ep);
  if (ultima.tipo_cuerpo) marcas.append(el("em", "val", "Tipo: " + ultima.tipo_cuerpo));
  if (marcas.childNodes.length) izq.append(marcas);
  portada.append(izq);
  if (typeof datos.puntuacion === "number") { der.append(el("strong", "", cifra(datos.puntuacion)), el("small", "", "puntos")); portada.append(der); }
  caja.append(portada, el("p", "nota", "Medición del " + fechaCorta(ultima.fecha) + (ultima.hora ? " · " + ultima.hora : "")
    + " · " + medidas.length + (medidas.length === 1 ? " medición" : " mediciones")));

  // Evolución: un dato a elegir
  const conSerie = k => medidas.filter(m => typeof m.medidas[k] === "number").map(m => [m.fecha, m.medidas[k]]);
  const claves = [...new Set(medidas.flatMap(m => Object.keys(m.medidas)))].filter(k => !OCULTAS.has(k) && conSerie(k).length >= 2);
  caja.append(el("h2", "", "EVOLUCIÓN"));
  if (!claves.length) caja.append(el("p", "vacio", "El gráfico aparece con la segunda medición."));
  else {
    if (!claves.includes(elegida)) elegida = claves.includes("peso_kg") ? "peso_kg" : claves[0];
    const chips = el("div", "chips"), marco = el("div", "grafico");
    const dibujar = () => {
      // El gráfico se dibuja al ancho real de su caja: así el texto de los ejes no se deforma ni se encoge.
      marco.replaceChildren(grafico(conSerie(elegida), unidadDe(elegida), Math.max(260, marco.clientWidth - 24)));
      for (const b of chips.children) b.classList.toggle("activa", b.dataset.k === elegida);
    };
    const orden = Object.keys(MEDIDAS);
    claves.sort((a, b) => (orden.indexOf(a) + 1 || 99) - (orden.indexOf(b) + 1 || 99));
    for (const k of claves) {
      const b = el("button", "", nombreDe(k) + (unidadDe(k) ? " (" + unidadDe(k).trim() + ")" : "")); b.type = "button"; b.dataset.k = k;
      b.onclick = () => { elegida = k; dibujar(); b.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); }; chips.append(b);
    }
    caja.append(chips, marco); dibujar();
  }

  // Fichas por grupo
  const grupos = { "Composición": [], "Indicadores": [], "Otros datos": [] };
  for (const [k, v] of Object.entries(datos)) {
    if (typeof v !== "number" || k === "puntuacion" || k === "peso_kg" || OCULTAS.has(k)) continue;   // peso y puntos van en la cabecera
    grupos[MEDIDAS[k]?.[1] ?? "Otros datos"].push(k);
  }
  for (const [nombre, ks] of Object.entries(grupos)) {
    if (!ks.length) continue;
    caja.append(el("h2", "", nombre.toUpperCase()));
    const fichas = el("div", "fichas");
    const orden = Object.keys(MEDIDAS);
    ks.sort((a, b) => (orden.indexOf(a) + 1 || 99) - (orden.indexOf(b) + 1 || 99));
    for (const k of ks) {
      const c = el("div"), v = el("strong"); v.append(cifra(datos[k]), el("span", "", unidadDe(k)));
      c.append(el("small", "", nombreDe(k)), v);
      const pie = el("div", "pie-ficha"), e = etiqueta(k), d = cambio(k);
      if (e) pie.append(e); if (d) pie.append(el("span", "", d));
      c.append(pie); fichas.append(c);
    }
    caja.append(fichas);
  }

  // Gasto diario según la actividad
  const formulas = basales(datos, perfil, ultima.fecha);
  if (formulas.length) {
    const media = formulas.reduce((s, f) => s + f[1], 0) / formulas.length;
    const kcal = v => Math.round(v).toLocaleString("es-ES");
    caja.append(el("h2", "", "GASTO DIARIO SEGÚN ACTIVIDAD"));
    const fichas = el("div", "fichas");
    for (const [nombre, factor, detalle] of ACTIVIDAD) {
      const c = el("div"), v = el("strong"); v.append(kcal(media * factor), el("span", "", " kcal"));
      c.append(el("small", "", nombre + " · ×" + factor.toLocaleString("es-ES")), v, el("div", "pie-ficha", detalle));
      fichas.append(c);
    }
    const det = el("details", "plegable"), ul = el("ul", "objetivos");
    det.append(el("summary", "", "Cómo se calcula"));
    for (const [nombre, valor, formula] of formulas) {
      const li = el("li"), izq2 = el("span"); izq2.append(nombre, el("br"), el("small", "", formula));
      li.append(izq2, el("strong", "", kcal(valor) + " kcal")); ul.append(li);
    }
    const lm = el("li"); lm.append(el("span", "", formulas.length > 1 ? "Media de las " + formulas.length + " fórmulas" : "Metabolismo basal usado"),
      el("strong", "", kcal(media) + " kcal")); ul.append(lm);
    det.append(ul, el("p", "nota", "Cada tarjeta multiplica ese metabolismo basal por su factor de actividad."
      + (formulas.length === 1 ? " Con la altura, la fecha de nacimiento y el sexo se añadirían Mifflin-St Jeor y Harris-Benedict a la media." : "")
      + " Es una estimación: el gasto real varía de una persona a otra."));
    caja.append(fichas, det);
  }

  // Lo que sugiere la báscula
  const obj = ultima.objetivos && typeof ultima.objetivos === "object" ? Object.entries(ultima.objetivos) : [];
  if (obj.length) {
    caja.append(el("h2", "", "SUGERENCIAS DE LA BÁSCULA"));
    const ul = el("ul", "objetivos");
    for (const [k, v] of obj) {
      const li = el("li");
      li.append(el("span", "", OBJETIVOS[k] ?? nombreDe(k)),
        el("strong", "", typeof v === "number" ? (v > 0 && k.startsWith("control") ? "+" : "") + cifra(v) + unidadDe(k) : String(v)));
      ul.append(li);
    }
    caja.append(ul, el("p", "nota", "Son las referencias que da la app de la báscula, no un consejo médico."));
  }
}
