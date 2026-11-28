// Pestaña Actividad: deporte que apunta Instinct, pasos del móvil y gasto estimado del día.
import { sumarDias } from "./estado.js?v=7100ce2";
import { calcularActividad, gastoDia, parsearPasos, PASOS_BASE } from "./gasto.js?v=7100ce2";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, atr, txt) => { const e = document.createElementNS(NS, tag); for (const k in atr) e.setAttribute(k, atr[k]); if (txt != null) e.textContent = txt; return e; };
const n0 = v => Math.round(v).toLocaleString("es-ES", { useGrouping: true });
const n1 = v => v.toLocaleString("es-ES", { maximumFractionDigits: 1 });
const fechaLarga = f => new Date(f + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const diaCorto = f => new Date(f + "T12:00:00").toLocaleDateString("es-ES", { weekday: "narrow" });
const duracion = m => m >= 60 ? Math.floor(m / 60) + " h" + (m % 60 ? " " + Math.round(m % 60) + " min" : "") : Math.round(m) + " min";

let dia = null;

/** Días calculados a partir de los ficheros cargados. */
export function diasActividad(datos, peso) {
  if (!datos || datos.error) return { dias: {}, revisar: [] };
  return calcularActividad(datos.sesiones, parsearPasos(datos.pasos), datos.catalogo, peso);
}

function grafico(dias, hoy, alElegir, W) {
  const N = 14, H = Math.round(Math.min(220, Math.max(160, W * 0.42))), m = { i: 46, d: 6, a: 16, b: 26 };
  const fechas = Array.from({ length: N }, (_, i) => sumarDias(hoy, i - N + 1));
  const tope = Math.max(10000, ...fechas.map(f => dias[f]?.pasos?.pasos ?? 0)) * 1.08;
  const y = v => m.a + (H - m.a - m.b) * (1 - v / tope), paso = (W - m.i - m.d) / N, ancho = Math.max(6, paso * 0.62);
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Pasos de los últimos 14 días" });
  for (const v of [0, 5000, 10000, 15000, 20000].filter(v => v <= tope)) svg.append(
    sv("line", { x1: m.i, x2: W - m.d, y1: y(v), y2: y(v), stroke: "#d9cfbd", "stroke-width": 1, "stroke-dasharray": v === PASOS_BASE ? "4 3" : "" }),
    sv("text", { x: m.i - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, fill: "#6f6155" }, v ? n0(v / 1000) + " mil" : "0"));
  fechas.forEach((f, i) => {
    const x = m.i + paso * i + (paso - ancho) / 2, d = dias[f], g = sv("g", { cursor: "pointer" });
    g.append(sv("rect", { x: m.i + paso * i, y: 0, width: paso, height: H - m.b, fill: "transparent" }));
    const p = d?.pasos?.pasos;
    if (p) g.append(sv("rect", { x, width: ancho, y: y(p), height: y(0) - y(p), fill: "#d97757" }));
    else g.append(sv("rect", { x, width: ancho, y: y(0) - 3, height: 3, fill: "#d9cfbd" }));
    if (d?.sesiones.length) g.append(sv("rect", { x: x + ancho / 2 - 4, y: 2, width: 8, height: 8, fill: "#6b8f5e" }));
    g.append(sv("title", {}, `${f}: ${p ? n0(p) + " pasos" : "sin pasos"}${d?.minutos ? " · " + duracion(d.minutos) + " de ejercicio" : ""}`));
    if (f === dia) g.append(sv("rect", { x: x - 2.5, y: m.a - 4, width: ancho + 5, height: H - m.a - m.b + 6, fill: "none", stroke: "#2a1d18", "stroke-width": 2 }));
    g.append(sv("text", { x: x + ancho / 2, y: H - 8, "text-anchor": "middle", "font-size": 11, fill: f === dia ? "#2a1d18" : "#6f6155",
      "font-weight": f === dia ? 700 : 400 }, diaCorto(f)));
    g.addEventListener("click", () => alElegir(f));
    svg.append(g);
  });
  return svg;
}

function barrasMes(serie, W, { color, formato, linea }) {
  const H = 170, mg = { i: 46, d: 6, a: 12, b: 24 };
  const meses = []; let [a, mm] = serie[0].mes.split("-").map(Number);
  const fin = serie.at(-1).mes;
  for (;;) { const k = a + "-" + String(mm).padStart(2, "0"); meses.push(k); if (k >= fin) break; if (++mm > 12) { mm = 1; a++; } }
  const val = Object.fromEntries(serie.map(s => [s.mes, s]));
  const vs = serie.map(s => s.media), lo = linea ? Math.min(...vs) * 0.95 : 0, hi = Math.max(...vs) * 1.08;
  const y = v => mg.a + (H - mg.a - mg.b) * (1 - (v - lo) / (hi - lo || 1)), paso = (W - mg.i - mg.d) / meses.length;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  for (const v of [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1]) svg.append(
    sv("line", { x1: mg.i, x2: W - mg.d, y1: y(v), y2: y(v), stroke: "#d9cfbd", "stroke-width": 1 }),
    sv("text", { x: mg.i - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, fill: "#6f6155" }, formato(v)));
  const pts = [];
  meses.forEach((k, i) => {
    const s = val[k], x = mg.i + paso * i;
    if (k.endsWith("-01") || i === 0) svg.append(sv("text", { x: x + 1, y: H - 6, "font-size": 11, fill: "#6f6155" }, k.slice(0, 4)),
      sv("line", { x1: x, x2: x, y1: mg.a, y2: H - mg.b, stroke: "#d9cfbd", "stroke-width": 1 }));
    if (!s) return;
    if (linea) pts.push([x + paso / 2, y(s.media)]);
    else {
      const r = sv("rect", { x: x + paso * 0.12, width: Math.max(1, paso * 0.76), y: y(s.media), height: y(lo) - y(s.media), fill: color });
      r.append(sv("title", {}, `${k}: ${formato(s.media)} (${s.n} días)`)); svg.append(r);
    }
  });
  if (linea) svg.append(sv("polyline", { fill: "none", stroke: color, "stroke-width": 2, points: pts.map(p => p.join(",")).join(" ") }));
  const marco = el("div", "grafico grafico-comida"); marco.append(svg);
  return marco;
}

// Todas las métricas diarias que se pueden enseñar. `de`: de dónde salen (pasos.csv o salud_diaria.csv).
// `barras`: se suman en el día (se dibujan en barras); el resto son medias (se dibujan en línea).
const METRICAS = [
  { k: "pasos", nombre: "Pasos", u: "", d: 0, grupo: "Movimiento", de: "pasos", barras: true },
  { k: "distancia_km", nombre: "Distancia a pie", u: " km", d: 1, grupo: "Movimiento", de: "pasos", barras: true },
  { k: "pisos", nombre: "Pisos subidos", u: "", d: 0, grupo: "Movimiento", de: "pasos", barras: true, dia: true },
  { k: "energia_activa_kcal", nombre: "Kcal activas (Apple)", u: " kcal", d: 0, grupo: "Movimiento", de: "pasos", barras: true },
  { k: "minutos_ejercicio", nombre: "Minutos de ejercicio (Apple)", u: " min", d: 0, grupo: "Movimiento", barras: true, dia: true },
  { k: "minutos_de_pie", nombre: "Minutos de pie (Apple)", u: " min", d: 0, grupo: "Movimiento", barras: true, dia: true },
  { k: "energia_basal_kcal", nombre: "Energía en reposo (Apple)", u: " kcal", d: 0, grupo: "Movimiento", barras: true, dia: true },
  { k: "velocidad_kmh", nombre: "Velocidad", u: " km/h", d: 1, grupo: "Cómo caminas", dia: true },
  { k: "longitud_paso_cm", nombre: "Longitud de paso", u: " cm", d: 0, grupo: "Cómo caminas", dia: true },
  { k: "asimetria_pct", nombre: "Asimetría", u: " %", d: 1, grupo: "Cómo caminas", dia: true },
  { k: "doble_apoyo_pct", nombre: "Doble apoyo", u: " %", d: 1, grupo: "Cómo caminas", dia: true },
  { k: "estabilidad_pct", nombre: "Estabilidad", u: " %", d: 0, grupo: "Cómo caminas", dia: true },
  { k: "ruido_auriculares_db", nombre: "Nivel medio", u: " dB", d: 0, grupo: "Auriculares", dia: true },
  { k: "minutos_ruido_80db", nombre: "Minutos a 80 dB o más", u: " min", d: 0, grupo: "Auriculares", barras: true, dia: true },
  { k: "fc_media", nombre: "Frecuencia media", u: " lpm", d: 0, grupo: "Corazón", dia: true },
  { k: "fc_min", nombre: "Frecuencia mínima", u: " lpm", d: 0, grupo: "Corazón", dia: true },
  { k: "fc_max", nombre: "Frecuencia máxima", u: " lpm", d: 0, grupo: "Corazón", dia: true },
  { k: "fc_reposo", nombre: "En reposo", u: " lpm", d: 0, grupo: "Corazón", dia: true },
  { k: "fc_caminando", nombre: "Caminando", u: " lpm", d: 0, grupo: "Corazón", dia: true },
  { k: "vfc_ms", nombre: "Variabilidad (VFC)", u: " ms", d: 0, grupo: "Corazón", dia: true },
  { k: "vo2max", nombre: "VO₂ máx", u: " ml/kg/min", d: 1, grupo: "Corazón", dia: true },
];
const EXPLICA = {
  "Cómo caminas": "Lo mide el iPhone en el bolsillo al caminar. Asimetría: diferencia entre el paso de cada pierna (cuanto más baja, más regular). Doble apoyo: parte del paso con los dos pies en el suelo; Apple lo considera habitual entre el 20 y el 40 %. Estabilidad: el índice de Apple sobre el riesgo de caídas (más alto, mejor).",
  "Auriculares": "Nivel equivalente del día con auriculares (media energética, como un sonómetro). La OMS sitúa el límite seguro en unas 40 horas a la semana a 80 dB.",
  "Corazón": "Del Apple Watch, cuando se lleva puesto. La variabilidad (VFC) es la del ritmo entre latidos; el VO₂ máx, la capacidad aeróbica estimada.",
};
const cifraM = (m, v) => v == null ? "–" : m.d === 0 ? n0(v) : v.toLocaleString("es-ES", { minimumFractionDigits: m.d, maximumFractionDigits: m.d });

/** salud_diaria.csv -> {fecha: {columna: número}} */
function parsearDiaria(texto) {
  const lineas = (texto ?? "").split(/\r?\n/).filter(l => l.trim()), out = {};
  if (!lineas.length) return out;
  const cab = lineas[0].split(",");
  for (const l of lineas.slice(1)) {
    const c = l.split(","), r = {};
    cab.forEach((k, i) => { if (i && c[i] !== undefined && c[i] !== "") { const v = parseFloat(c[i]); if (!isNaN(v)) r[k] = v; } });
    out[c[0]] = r;
  }
  return out;
}
const valorDe = (m, dias, diaria, f) => m.de === "pasos" ? dias[f]?.pasos?.[m.k] ?? null : diaria[f]?.[m.k] ?? null;

let hElegida = "pasos";
function historial(dias, diaria, hoy, W) {
  const fechas = [...new Set([...Object.keys(dias), ...Object.keys(diaria)])];
  const series = METRICAS.map(m => {
    const p = {};
    for (const f of fechas) { const v = valorDe(m, dias, diaria, f); if (v == null) continue; const x = p[f.slice(0, 7)] ??= { s: 0, n: 0 }; x.s += v; x.n++; }
    return { m, serie: Object.keys(p).sort().map(k => ({ mes: k, media: p[k].s / p[k].n, n: p[k].n })) };
  }).filter(x => x.serie.length >= 3);
  if (!series.length) return null;
  if (!series.some(x => x.m.k === hElegida)) hElegida = series[0].m.k;
  const chips = el("div", "chips"), cuerpo = el("div");
  const dibujar = () => {
    const { m, serie } = series.find(x => x.m.k === hElegida);
    const año = hoy.slice(0, 4), media = a => { const l = serie.filter(p => p.mes.startsWith(a)); const n = l.reduce((s, p) => s + p.n, 0); return n ? l.reduce((s, p) => s + p.media * p.n, 0) / n : null; };
    const este = media(año), antes = media(String(+año - 1));
    cuerpo.replaceChildren(el("p", "nota", m.nombre + (m.u ? " (" + m.u.trim() + ")" : "") + ": media diaria de cada mes, " + serie.length + " meses con datos."),
      barrasMes(serie, W, { color: m.barras ? "#d97757" : "#2a1d18", linea: !m.barras, formato: v => cifraM(m, v) }),
      el("p", "nota", [este != null ? `Media de ${año}: ${cifraM(m, este)}${m.u}.` : "", antes != null ? `En ${+año - 1}: ${cifraM(m, antes)}${m.u}.` : ""].filter(Boolean).join(" ")));
    for (const b of chips.children) b.classList.toggle("activa", b.dataset.k === hElegida);
  };
  for (const { m } of series) {
    const b = el("button", "", m.nombre); b.type = "button"; b.dataset.k = m.k;
    b.onclick = () => { hElegida = m.k; dibujar(); b.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); };
    chips.append(b);
  }
  dibujar();
  return [chips, cuerpo];
}

/** Fichas de un grupo para el día, comparadas con la media de los 30 días anteriores. */
function fichasGrupo(grupo, dias, diaria, f) {
  const ms = METRICAS.filter(m => m.grupo === grupo && m.dia && valorDe(m, dias, diaria, f) != null);
  if (!ms.length) return null;
  const fichas = el("div", "fichas");
  for (const m of ms) {
    const v = valorDe(m, dias, diaria, f), prev = [];
    for (let i = 1; i <= 30; i++) { const x = valorDe(m, dias, diaria, sumarDias(f, -i)); if (x != null) prev.push(x); }
    const c = el("div"), s = el("strong"); s.append(cifraM(m, v), el("span", "", m.u));
    c.append(el("small", "", m.nombre), s, el("div", "pie-ficha", prev.length >= 3 ? "media 30 días: " + cifraM(m, prev.reduce((a, b) => a + b, 0) / prev.length) + m.u : ""));
    fichas.append(c);
  }
  return fichas;
}

/**
 * datos: { sesiones, pasos (texto CSV), catalogo } · null mientras carga · { error }.
 * ctx: { hoy, cuerpo: {peso, basal} | null }
 */
export function pintarActividad(caja, datos, ctx) {
  caja.replaceChildren();
  if (!datos) { caja.append(el("p", "vacio", "Cargando actividad…")); return; }
  if (datos.error) { caja.append(el("p", "vacio", datos.error)); return; }
  const peso = ctx.cuerpo?.peso, basal = ctx.cuerpo?.basal, { hoy } = ctx;
  const { dias, revisar } = diasActividad(datos, peso), fechas = Object.keys(dias).sort(), diaria = parsearDiaria(datos.diaria);
  if (!fechas.length) {
    caja.append(el("p", "vacio", "Aún no hay actividad. Cuéntale a Instinct el deporte que hagas (o mándale la captura del reloj o de la app) y aparecerá aquí."));
    return;
  }
  const primero = fechas[0] < hoy ? fechas[0] : hoy;
  if (!dia || dia > hoy || dia < primero) dia = hoy;
  const ir = f => { dia = f; pintarActividad(caja, datos, ctx); };
  const d = dias[dia], g = gastoDia(d, basal, peso);

  // ---- Portada del día
  const portada = el("section", "comida-portada"), nav = el("div", "dias-nav");
  const atras = el("button", "", "‹"), alante = el("button", "", "›");
  atras.type = alante.type = "button"; atras.setAttribute("aria-label", "Día anterior"); alante.setAttribute("aria-label", "Día siguiente");
  atras.disabled = dia <= primero; alante.disabled = dia >= hoy;
  atras.onclick = () => ir(sumarDias(dia, -1)); alante.onclick = () => ir(sumarDias(dia, 1));
  const centro = el("div"), cifra = el("strong");
  centro.append(el("small", "", (dia === hoy ? "Hoy · " : "") + fechaLarga(dia)));
  if (d?.pasos) cifra.append(n0(d.pasos.pasos), el("span", "", " pasos")); else cifra.append(el("span", "", "Sin pasos apuntados"));
  centro.append(cifra); nav.append(atras, centro, alante); portada.append(nav);
  const linea = [];
  if (d?.minutos) linea.push(duracion(d.minutos) + " de ejercicio");
  else if (d?.descanso) linea.push("Día de descanso");
  if (g?.con_datos) linea.push("gasto estimado ≈ " + n0(g.total) + " kcal");
  if (linea.length) portada.append(el("p", "", linea.join(" · ")));
  caja.append(portada);

  // ---- Sesiones
  if (d?.sesiones.length) {
    caja.append(el("h2", "", "LO QUE HAS HECHO"));
    const lista = el("ul", "comidas");
    for (const s of d.sesiones) {
      const li = el("li"), cab = el("div", "cab-comida");
      cab.append(el("time", "", s.hora || "–"), el("strong", "", s.nombre), el("b", "", s.kcal == null ? "–" : n0(s.kcal) + " kcal"));
      const det = [duracion(s.duracion_min), "intensidad " + s.intensidad];
      if (s.distancia_km) det.push(n1(s.distancia_km) + " km" + (s.ritmo_kmh ? " a " + n1(s.ritmo_kmh) + " km/h" : ""));
      const pie = el("p", "desc", det.join(" · ") + " ");
      pie.append(el("em", "fuente " + (s.fuente === "reloj" ? "etiqueta" : "estimacion"), s.fuente === "reloj" ? "reloj o app" : "estimado"));
      li.append(cab, pie);
      if (s.nota) li.append(el("p", "desc", s.nota));
      lista.append(li);
    }
    caja.append(lista);
  }

  // ---- Cifras y desglose del gasto
  if (d) {
    const fichas = el("div", "fichas");
    const ficha = (nombre, valor, unidad, pie) => {
      const c = el("div"), v = el("strong"); v.append(valor, el("span", "", unidad));
      c.append(el("small", "", nombre), v, el("div", "pie-ficha", pie ?? "")); fichas.append(c);
    };
    ficha("Pasos", d.pasos ? n0(d.pasos.pasos) : "–", "", d.pasos ? [d.pasos.distancia_km ? n1(d.pasos.distancia_km) + " km" : "", d.pasos.hora ? "hasta las " + d.pasos.hora : ""].filter(Boolean).join(" · ") : "");
    ficha("Ejercicio", d.minutos ? duracion(d.minutos) : "–", "", d.sesiones.length ? d.sesiones.length + (d.sesiones.length === 1 ? " sesión" : " sesiones") : "");
    ficha("Kcal del ejercicio", d.kcal ? n0(d.kcal) : "–", d.kcal ? " kcal" : "");
    if (g) ficha("Gasto del día", "≈ " + n0(g.total), " kcal", "estimación");
    // Lo que mide el anillo «Moverse», junto a lo que estima el Tracker para lo mismo (ejercicio + pasos).
    const ea = d.pasos?.energia_activa_kcal;
    if (ea != null) ficha("Kcal activas (iPhone)", n0(ea), " kcal", g ? "el Tracker estima " + n0(g.ejercicio + g.pasos) : "");
    caja.append(el("h2", "", "EL DÍA EN CIFRAS"), fichas);
    if (g) {
      const det = el("details", "plegable"), ul = el("ul", "objetivos");
      det.append(el("summary", "", "Desglose del gasto"));
      const fila = (a, b, c) => { const li = el("li"), i = el("span"); i.append(a); if (c) i.append(el("br"), el("small", "", c)); li.append(i, el("strong", "", b)); ul.append(li); };
      fila("Base: metabolismo basal × 1,2", n0(g.base) + " kcal", "basal " + n0(basal) + " kcal (pestaña Salud), más digerir y moverse poco");
      fila("Ejercicio", "+ " + n0(g.ejercicio) + " kcal", "lo que pasa del reposo, que ya va en la base");
      fila("Pasos de más", "+ " + n0(g.pasos) + " kcal", d.pasos ? "los que pasan de " + n0(PASOS_BASE) + ", sin los de correr o caminar ya apuntados" : "sin pasos apuntados ese día");
      fila("Total estimado", n0(g.total) + " kcal");
      det.append(ul); caja.append(det);
    }
  }

  // ---- Últimos 14 días
  caja.append(el("h2", "", "PASOS · ÚLTIMOS 14 DÍAS"));
  const marco = el("div", "grafico grafico-comida"); caja.append(marco);
  const ley = el("div", "leyenda-macros");
  for (const [c, t] of [["#d97757", "Pasos"], ["#6b8f5e", "Día con deporte"]]) { const s = el("span"), i = el("i"); i.style.background = c; s.append(i, t); ley.append(s); }
  caja.append(ley);
  marco.append(grafico(dias, hoy, ir, Math.max(280, caja.clientWidth - 28 || 320)));

  // ---- Semana
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(dia, -i));
  const porTipo = {};
  for (const f of semana) for (const s of dias[f]?.sesiones ?? []) {
    const t = porTipo[s.nombre] ??= { n: 0, min: 0, kcal: 0 }; t.n++; t.min += s.duracion_min; t.kcal += s.kcal ?? 0;
  }
  const conPasos = semana.filter(f => dias[f]?.pasos);
  if (Object.keys(porTipo).length || conPasos.length) {
    caja.append(el("h2", "", "ÚLTIMOS 7 DÍAS"));
    const ul = el("ul", "objetivos");
    for (const [nombre, t] of Object.entries(porTipo).sort((a, b) => b[1].min - a[1].min)) {
      const li = el("li"), i = el("span"); i.append(nombre, el("br"), el("small", "", t.n + (t.n === 1 ? " sesión" : " sesiones") + " · " + n0(t.kcal) + " kcal"));
      li.append(i, el("strong", "", duracion(t.min))); ul.append(li);
    }
    if (conPasos.length) {
      const li = el("li"), i = el("span");
      i.append("Pasos al día", el("br"), el("small", "", "media de " + conPasos.length + (conPasos.length === 1 ? " día" : " días") + " con dato"));
      li.append(i, el("strong", "", n0(conPasos.reduce((s, f) => s + dias[f].pasos.pasos, 0) / conPasos.length))); ul.append(li);
    }
    caja.append(ul, el("p", "nota", "Semana que acaba el " + fechaLarga(dia) + "."));
  }

  // ---- Resto de métricas de Salud del día, por grupos
  for (const grupo of ["Movimiento", "Cómo caminas", "Auriculares", "Corazón"]) {
    const fs = fichasGrupo(grupo, dias, diaria, dia);
    if (!fs) continue;
    caja.append(el("h2", "", grupo.toUpperCase()), fs);
    if (EXPLICA[grupo]) caja.append(el("p", "nota", EXPLICA[grupo]));
  }

  // ---- Historial: medias mensuales desde el primer dato
  const hist = historial(dias, diaria, hoy, Math.max(280, caja.clientWidth - 28 || 320));
  if (hist) caja.append(el("h2", "", "HISTORIAL"), ...hist);

  // ---- Avisos
  const desde = sumarDias(hoy, -13), avisos = revisar.filter(r => !r.fecha || r.fecha >= desde);
  if (avisos.length) {
    const det = el("details", "plegable"), ul = el("ul", "objetivos");
    det.append(el("summary", "", `Datos a revisar (${avisos.length})`));
    for (const r of avisos) { const li = el("li"); li.append(el("span", "", r.motivo), el("small", "", [r.fecha, r.hora, r.tipo].filter(Boolean).join(" · "))); ul.append(li); }
    det.append(ul, el("p", "nota", "Díselo a Instinct para que lo corrija."));
    caja.append(det);
  }

  const como = el("details", "plegable");
  como.append(el("summary", "", "Cómo se calcula"),
    el("p", "nota", "Cada deporte tiene un gasto típico por hora según su intensidad (METs del Compendio de Actividades Físicas). Las kcal de una sesión son METs × tu peso × horas. Al correr o caminar con distancia, sale del ritmo. Si el reloj o la app dan las calorías activas, se usan esas."),
    el("p", "nota", "El gasto del día suma tu metabolismo basal × 1,2 (un día sin moverte), lo que el ejercicio añade sobre el reposo y los pasos que pasan de 5.000. Es una estimación: cuenta con un margen de un 10-20 %. Los pasos son el dato más fiable, siempre que lleves el móvil encima."));
  caja.append(como);
}
