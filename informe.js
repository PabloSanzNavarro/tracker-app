// Informe diario: pinta el JSON que Instinct publica en datos/informes/AAAA-MM-DD.json.
// Todas las secciones son opcionales. El contenido se inserta siempre como texto
// (nunca como HTML) y solo se enlazan direcciones https.
// Acepta también los informes con el formato anterior (campos `nota`, `titulo`/`detalle`…).

const NS = "http://www.w3.org/2000/svg";
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, atr, txt) => { const e = document.createElementNS(NS, tag); for (const k in atr) e.setAttribute(k, atr[k]); if (txt != null) e.textContent = txt; return e; };
const lista = v => Array.isArray(v) ? v : [];
const parrafos = v => lista(typeof v === "string" ? [v] : v).filter(p => typeof p === "string" && p.trim());
const esNum = v => typeof v === "number" && isFinite(v);
const num = (v, d = 1) => esNum(v)
  ? v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }) : (v ?? "");
const pct = v => esNum(v) ? (v > 0 ? "+" : "") + num(v) + " %" : (v ?? "");
// En tablas estrechas: sin símbolo (va en la cabecera) y sin decimales a partir de 10.
const pctCorto = v => esNum(v) ? (v > 0 ? "+" : "") + num(v, Math.abs(v) >= 9.95 ? 0 : 1) : "";
// «4,98 T$» → «4,98 T»: la moneda va en la cabecera.
const capCorta = c => String(c ?? "").replace(/\s*(?:US)?\$\s*$/, "").replace(/\s+(?=[TBM]$)/, "");
// Cifras de una serie: sin decimales a partir de mil.
// (el español no agrupa los números de cuatro cifras por defecto: aquí sí, para que «6.369» se lea igual que «23.133»)
const cifra = v => Math.abs(v) >= 1000
  ? (v < 0 ? "−" : "") + Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  : num(v, Math.abs(v) >= 100 ? 1 : 2);
// Quita la coletilla societaria («Inc.», «S.A.», «Class A»…) para que el nombre quepa en el móvil.
const COLETILLA = /[,.]?\s+(?:Inc|Corp|Corporation|Company|Co|Ltd|Limited|plc|S\.?A|SME|SE|AG|NV|N\.V|Class [A-C]|Holdings?|Group)\.?,?$/i;
const nombreCorto = n => { let t = String(n ?? ""); for (let i = 0; i < 4 && COLETILLA.test(t); i++) t = t.replace(COLETILLA, ""); return t.replace(/\s+(?:and|&)$/i, "") || String(n ?? ""); };
const sentido = v => !esNum(v) || v === 0 ? "" : v > 0 ? "sube" : "baja";
const ICONOS = { sol: "☀", nubes: "☁", lluvia: "☂", tormenta: "⚡", nieve: "❄", niebla: "≋" };

// Tiempo desde el máximo: en semanas y, a partir de dos años, en años.
const haceSemanas = (s, corto = false) => !esNum(s) ? ""
  : s < 1 ? (corto ? "esta sem." : "esta semana")
  : s >= 104 ? (corto ? Math.floor(s / 52) + " años" : "hace " + Math.floor(s / 52) + " años")
  : (corto ? Math.round(s) + " sem." : "hace " + Math.round(s) + " sem.");
// «−12,3 % del máx. · hace 8 sem.» (o «En máximos») a partir de max_dif y max_semanas.
function textoMaximo(dif, semanas, corto = false) {
  if (!esNum(dif)) return "";
  if (dif > -0.05) return corto ? "En máximos" : "En máximos históricos";
  let t = pct(dif) + (corto ? " del máx." : " del máximo histórico");
  if (esNum(semanas)) t += " · " + haceSemanas(semanas);
  return t;
}

function fuentes(fs) {
  if (!lista(fs).length) return null;
  const caja = el("p", "fuentes"); caja.append(el("b", "", "Fuentes"));
  for (const f of fs) {
    const nombre = typeof f === "string" ? f : f?.nombre;
    if (!nombre) continue;
    if (/^https:\/\//.test(f?.url ?? "")) {
      const a = el("a", "", nombre); a.href = f.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      caja.append(a);
    } else caja.append(el("span", "", nombre));
  }
  return caja;
}

// Línea de una serie con su máximo y su mínimo marcados.
function chispa(serie, { color = "#2a1d18", marcas = false } = {}) {
  const vs = lista(serie).filter(esNum);
  if (vs.length < 2) return null;
  const W = 300, H = 64, arriba = marcas ? 8 : 4, abajo = marcas ? 8 : 4;
  const lo = Math.min(...vs), hi = Math.max(...vs), r = hi - lo || 1;
  const pts = vs.map((v, i) => [(W * i) / (vs.length - 1), arriba + (H - arriba - abajo) * (hi - v) / r]);
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "chispa", "aria-hidden": "true" });
  const linea = pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  svg.append(sv("polygon", { points: `0,${H} ${linea} ${W},${H}`, fill: color, opacity: ".08" }));
  svg.append(sv("polyline", { points: linea, fill: "none", stroke: color, "stroke-width": "1.8", "stroke-linejoin": "round" }));
  if (marcas) {
    const iHi = vs.indexOf(hi), iLo = vs.indexOf(lo);
    svg.append(sv("circle", { cx: pts[iHi][0], cy: pts[iHi][1], r: 3, fill: "#4d7040" }));
    svg.append(sv("circle", { cx: pts[iLo][0], cy: pts[iLo][1], r: 3, fill: "#b5594a" }));
    svg.append(sv("circle", { cx: pts.at(-1)[0], cy: pts.at(-1)[1], r: 3.2, fill: color, stroke: "#fbf8f0", "stroke-width": "1.5" }));
  }
  return svg;
}

// Horas «HH:MM» → horas decimales, crecientes aunque la serie pase de medianoche.
const aHora = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? "")); return m ? +m[1] + m[2] / 60 : null; };
const llueve = h => (esNum(h?.lluvia_mm) && h.lluvia_mm >= 0.1) || (esNum(h?.lluvia_pct) && h.lluvia_pct >= 50);

// Gráfica de un día: curva de temperatura, noche sombreada según la salida y la puesta
// del sol, horas de lluvia a rayas azules, y la máxima y la mínima marcadas (sin cifras:
// las cifras van en la cabecera del día y las horas, debajo).
function curvaTiempo(horas, { amanecer, atardecer } = {}) {
  const hs = lista(horas).filter(h => esNum(h?.temp) && aHora(h.hora) != null);
  if (hs.length < 2) return null;
  const hv = []; for (const h of hs) { let v = aHora(h.hora); while (hv.length && v <= hv.at(-1)) v += 24; hv.push(v); }
  const W = 320, H = 112, iz = 4, de = 4, arriba = 10, abajo = 18, base = H - abajo;
  const h0 = hv[0], h1 = hv.at(-1);
  const x = v => iz + (W - iz - de) * (v - h0) / (h1 - h0);
  const ts = hs.map(h => h.temp), lo = Math.min(...ts), hi = Math.max(...ts), r = hi - lo || 1;
  const y = t => arriba + (base - arriba - 6) * (hi - t) / r;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "curva-tiempo", role: "img",
    "aria-label": `Temperatura: mínima ${num(lo)}°, máxima ${num(hi)}°` });
  const defs = sv("defs"), pat = sv("pattern", { id: "rayas-lluvia", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(35)" });
  pat.append(sv("rect", { width: 6, height: 6, fill: "#4e7fb3", opacity: ".08" }), sv("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "#4e7fb3", "stroke-width": "2.2", opacity: ".45" }));
  defs.append(pat); svg.append(defs);
  // Noche: antes de amanecer y después de anochecer (por defecto, 08:00 y 18:00).
  const sa = aHora(amanecer) ?? 8, sp = aHora(atardecer) ?? 18;
  for (let d = Math.floor(h0 / 24) * 24; d <= h1; d += 24) {
    for (const [a, b] of [[d - 24 + sp, d + sa], [d + sp, d + 24 + sa]]) {
      const x0 = Math.max(iz, x(Math.max(a, h0))), x1 = Math.min(W - de, x(Math.min(b, h1)));
      if (x1 > x0) svg.append(sv("rect", { x: x0, y: 0, width: x1 - x0, height: base, fill: "#2a1d18", opacity: ".055" }));
    }
  }
  // Lluvia: una franja a rayas por cada tramo de horas con lluvia.
  const paso = (W - iz - de) / (h1 - h0);
  for (let i = 0; i < hs.length; i++) if (llueve(hs[i]) && (i === 0 || !llueve(hs[i - 1]))) {
    let j = i; while (j + 1 < hs.length && llueve(hs[j + 1])) j++;
    const x0 = Math.max(iz, x(hv[i]) - paso / 2), x1 = Math.min(W - de, x(hv[j]) + paso / 2);
    svg.append(sv("rect", { x: x0, y: 0, width: x1 - x0, height: base, fill: "url(#rayas-lluvia)" }));
  }
  const pts = hs.map((h, i) => [x(hv[i]), y(h.temp)]);
  const linea = pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  svg.append(sv("polygon", { points: `${pts[0][0]},${base} ${linea} ${pts.at(-1)[0]},${base}`, fill: "#d97757", opacity: ".14" }));
  svg.append(sv("line", { x1: 0, x2: W, y1: base, y2: base, stroke: "#d9cfbd", "stroke-width": "1" }));
  svg.append(sv("polyline", { points: linea, fill: "none", stroke: "#b5594a", "stroke-width": "2.2", "stroke-linejoin": "round", "stroke-linecap": "round" }));
  // Eje: cada tres horas, solo la hora.
  for (let v = Math.ceil(h0 / 3) * 3; v <= h1; v += 3) {
    const px = x(v), anc = px < 12 ? "start" : px > W - 12 ? "end" : "middle";
    svg.append(sv("line", { x1: px, x2: px, y1: base, y2: base + 3, stroke: "#6f6155", "stroke-width": "1" }));
    svg.append(sv("text", { x: px, y: H - 3, "text-anchor": anc }, String(v % 24).padStart(2, "0")));
  }
  // Máxima y mínima: solo el punto.
  const iHi = ts.indexOf(hi), iLo = ts.lastIndexOf(lo);
  svg.append(sv("circle", { cx: pts[iHi][0], cy: pts[iHi][1], r: 4, fill: "#b5594a", stroke: "#fbf8f0", "stroke-width": "1.8" }));
  if (iLo !== iHi) svg.append(sv("circle", { cx: pts[iLo][0], cy: pts[iLo][1], r: 4, fill: "#4e6a8a", stroke: "#fbf8f0", "stroke-width": "1.8" }));
  return { svg, horaMax: hs[iHi].hora, horaMin: hs[iLo].hora, inicio: h0 % 24,
    lluvia: hs.filter(llueve).map(h => String(h.hora).slice(0, 5)) };
}

// Tramos de lluvia legibles: «14:00–17:00 · 20:00».
function tramosLluvia(horas) {
  const v = horas.map(aHora), out = [];
  for (let i = 0; i < v.length; i++) {
    let j = i; while (j + 1 < v.length && Math.abs(v[j + 1] - v[j] - 1) < 0.01) j++;
    out.push(i === j ? horas[i] : horas[i] + "–" + String((Math.round(v[j]) + 1) % 24).padStart(2, "0") + ":00"); i = j;
  }
  return out.join(" · ");
}

// Un día del carrusel del tiempo: cabecera con sus cifras, gráfica y momentos del día.
function diaTiempo(x, { horas, amanecer, atardecer } = {}) {
  const c = el("article", "dia-tiempo");
  const cab = el("div", "cab-dia");
  const nombre = el("div"); nombre.append(el("strong", "", x.dia ?? "")); if (x.fecha) nombre.append(el("small", "", x.fecha));
  const temps = el("div", "temps");
  temps.append(el("span", "icono", ICONOS[x.icono] ?? ""), el("b", "min", num(x.min) + "°"), el("i", "", "/"), el("b", "max", num(x.max) + "°"));
  cab.append(nombre, temps); c.append(cab);
  const extra = [x.resumen, esNum(x.lluvia_pct) ? "lluvia " + num(x.lluvia_pct, 0) + " %" + (esNum(x.lluvia_mm) && x.lluvia_mm > 0 ? " · " + num(x.lluvia_mm) + " mm" : "") : ""].filter(Boolean).join(" · ");
  if (extra) c.append(el("p", "resumen-dia", extra));
  const g = curvaTiempo(horas, { amanecer, atardecer });
  if (g) {
    c.append(g.svg);
    const momentos = [
      ["sol", "Amanece", amanecer], ["max", "Máxima", g.horaMax], ["sol pone", "Anochece", atardecer], ["min", "Mínima", g.horaMin],
    ].filter(m => aHora(m[2]) != null);
    // En orden cronológico dentro de la gráfica (que puede pasar de medianoche).
    const orden = v => { const h = aHora(v); return h < g.inicio ? h + 24 : h; };
    momentos.sort((a, b) => orden(a[2]) - orden(b[2]));
    const ul = el("ul", "momentos");
    for (const [cls, k, v] of momentos) { const li = el("li", cls); li.append(el("i"), el("small", "", k), el("b", "", String(v).slice(0, 5))); ul.append(li); }
    c.append(ul);
    if (g.lluvia.length) { const p = el("p", "lluvia-horas"); p.append(el("i"), "Lluvia: " + tramosLluvia(g.lluvia)); c.append(p); }
  } else c.classList.add("sin-curva");
  return c;
}

function noticia(n) {
  const d = el("details", "noticia" + (n.destacada ? " destacada" : ""));
  const s = el("summary");
  if (n.etiqueta) s.append(el("span", "etiqueta", n.etiqueta));
  s.append(el("h3", "", n.titular ?? ""));
  if (n.entradilla && n.destacada) s.append(el("p", "entradilla", n.entradilla));
  d.append(s);
  const cuerpo = el("div", "cuerpo");
  if (n.entradilla && !n.destacada) cuerpo.append(el("p", "entradilla", n.entradilla));
  for (const p of parrafos(n.texto)) cuerpo.append(el("p", "", p));
  if (n.lectura) { const l = el("p", "lectura"); l.append(el("b", "", n.destacada ? "Por qué importa" : "Lectura"), " " + n.lectura); cuerpo.append(l); }
  const f = fuentes(n.fuentes); if (f) cuerpo.append(f);
  if (cuerpo.childNodes.length) d.append(cuerpo); else d.classList.add("sin-cuerpo");
  return d;
}

function eventos(evs) {
  const ul = el("ul", "eventos");
  for (const e of lista(evs)) {
    const li = el("li");
    const h = el("time", "", e.inicio ?? ""); if (e.fin) h.append(el("small", "", e.fin));
    li.append(h);
    const t = el("div"); t.append(el("strong", "", e.titulo ?? ""));
    if (e.lugar) t.append(el("span", "", e.lugar));
    li.append(t); ul.append(li);
  }
  return ul;
}

// Indicador de mercado: valor, variación del día y de la semana, y distancia al máximo histórico.
function indicador(i) {
  const c = el("div");
  c.append(el("small", "", i.nombre ?? ""), el("strong", "", i.valor ?? ""));
  if (esNum(i.dia) || esNum(i.semana)) {
    const v = el("p", "variaciones");
    if (esNum(i.dia)) { const s = el("span"); s.append(el("i", "", "Día "), el("b", sentido(i.dia), pct(i.dia))); v.append(s); }
    if (esNum(i.semana)) { const s = el("span"); s.append(el("i", "", "Sem. "), el("b", sentido(i.semana), pct(i.semana))); v.append(s); }
    c.append(v);
  } else if (i.nota) {
    // Formato anterior: la nota empezaba por la variación. Se quita la coletilla del cierre.
    const nota = String(i.nota).replace(/\s*·\s*cierre.*$/i, "").replace(/^cierre.*$/i, "");
    if (nota) c.append(el("span", /^[-−]\s?\d/.test(nota) ? "baja" : /^\+\s?\d/.test(nota) ? "sube" : "", nota));
  }
  const m = textoMaximo(i.max_dif, i.max_semanas, true);
  if (m) c.append(el("span", "maximo", m));
  return c;
}

function tablaBolsa(empresas) {
  const conMax = empresas.some(e => esNum(e.max_dif));
  const caja = el("div", "tabla-scroll"), t = el("table", "bolsa" + (conMax ? " con-max" : ""));
  const cab = el("thead"), fila = el("tr");
  for (const c of ["", "Empresa", "Cap. $", "Día", "Sem.", "Año", "12 m", ...(conMax ? ["Máx."] : [])]) fila.append(el("th", "", c));
  cab.append(fila); t.append(cab);
  const cuerpo = el("tbody");
  for (const e of empresas) {
    const tr = el("tr"), nombre = el("td", "nombre", nombreCorto(e.nombre));
    if (e.ticker) nombre.append(el("small", "", " " + e.ticker));
    nombre.title = e.nombre ?? "";
    tr.append(el("td", "puesto", e.puesto ?? ""), nombre, el("td", "cap", capCorta(e.cap)));
    for (const k of ["dia", "semana", "ytd", "anual"]) tr.append(el("td", sentido(e[k]), pctCorto(e[k])));
    if (conMax) {
      const td = el("td", "max", esNum(e.max_dif) && e.max_dif > -0.05 ? "máx" : pctCorto(e.max_dif));
      if (esNum(e.max_semanas) && !(e.max_dif > -0.05)) td.append(el("small", "", e.max_semanas >= 104 ? Math.floor(e.max_semanas / 52) + " a" : e.max_semanas < 1 ? "<1 s" : Math.round(e.max_semanas) + " s"));
      tr.append(td);
    }
    cuerpo.append(tr);
  }
  t.append(cuerpo); caja.append(t); return caja;
}

// Ficha de evolución a doce meses: curva con máximo y mínimo, y las cifras que la explican.
function fichaEvolucion(x) {
  const vs = lista(x.serie).filter(esNum);
  const c = el("div"), sube = (x.anual ?? 0) >= 0;
  const cab = el("div", "cab-evo"); cab.append(el("strong", "", x.nombre ?? ""), el("b", "", x.ultimo ?? ""));
  c.append(cab);
  const g = chispa(vs, { color: sube ? "#4d7040" : "#b5594a", marcas: true }); if (g) c.append(g);
  const hi = esNum(x.max_12m) ? x.max_12m : vs.length ? Math.max(...vs) : null;
  const lo = esNum(x.min_12m) ? x.min_12m : vs.length ? Math.min(...vs) : null;
  const datos = el("dl", "datos-evo");
  const par = (k, v, cls = "", ancho = false) => { if (v === "" || v == null) return; const d = el("div", ancho ? "ancho" : ""); d.append(el("dt", "", k), el("dd", cls, v)); datos.append(d); };
  par("12 meses", pct(x.anual), sentido(x.anual));
  if (esNum(x.max_dif)) par("Máx. histórico", x.max_dif > -0.05 ? "en máximos" : pct(x.max_dif) + (esNum(x.max_semanas) ? " · " + haceSemanas(x.max_semanas, true) : ""), sentido(x.max_dif));
  if (esNum(hi) && esNum(lo)) par("Rango 12 meses", cifra(lo) + " – " + cifra(hi), "", true);
  if (datos.childElementCount) c.append(datos);
  return c;
}

export function pintarInforme(caja, d, acciones = {}) {
  // Al repintar el mismo informe (por ejemplo, tras marcar el Evangelio) se conserva la posición de lectura.
  const mismo = caja.dataset.fecha === String(d.fecha ?? ""), dondeEstaba = window.scrollY;
  caja.dataset.fecha = String(d.fecha ?? "");
  caja.replaceChildren();
  const indice = el("nav", "indice"), marcas = []; let n = 0;
  indice.setAttribute("aria-label", "Secciones del informe");
  const seccion = (titulo, nota) => {
    const s = el("section", "bloque"), h = el("h2", "", titulo); n++;
    if (nota) h.append(el("small", "", nota));
    s.append(h); caja.append(s);
    const b = el("button", "", titulo); b.type = "button";
    b.onclick = () => s.scrollIntoView({ behavior: "smooth", block: "start" });
    indice.append(b); marcas.push([s, b]);
    return s;
  };

  // Cabecera
  const cab = el("header", "portada");
  const fecha = d.fecha && !isNaN(Date.parse(d.fecha))
    ? new Date(d.fecha + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : "";
  const nav = el("div", "dias-nav");
  const ant = el("button", "", "‹"); ant.type = "button"; ant.disabled = !acciones.anterior; ant.onclick = acciones.anterior; ant.setAttribute("aria-label", "Informe anterior");
  const sig = el("button", "", "›"); sig.type = "button"; sig.disabled = !acciones.siguiente; sig.onclick = acciones.siguiente; sig.setAttribute("aria-label", "Informe siguiente");
  const titulo = el("div"); titulo.append(el("div", "mascota"), el("h1", "", "Informe diario"));
  if (fecha) titulo.append(el("p", "fecha-portada", fecha));
  if (d.generado) titulo.append(el("p", "generado", "publicado a las " + d.generado));
  nav.append(ant, titulo, sig); cab.append(nav); caja.append(cab, indice);

  // Lo esencial
  if (lista(d.esencial).length) {
    const s = seccion("Lo esencial"); s.classList.add("esencial");
    const ul = el("ul");
    for (const e of d.esencial) { const li = el("li"); li.append(el("strong", "", e.titular ?? "")); if (e.texto) li.append(el("span", "", e.texto)); ul.append(li); }
    s.append(ul);
  }

  // Agenda: solo lo que hay en el calendario.
  if (d.agenda) {
    const s = seccion("Agenda", d.agenda.consultada ? "consultada a las " + d.agenda.consultada : "");
    if (lista(d.agenda.hoy).length) s.append(eventos(d.agenda.hoy)); else s.append(el("p", "vacio", "Sin citas hoy."));
    for (const p of lista(d.agenda.proximos)) {
      const det = el("details", "plegable"); det.append(el("summary", "", p.dia ?? ""), eventos(p.eventos)); s.append(det);
    }
  }

  // Evangelio y santo
  if (d.evangelio) {
    const e = d.evangelio, s = seccion("Evangelio"), c = el("div", "evangelio");
    const cabe = el("div", "cab-evangelio");
    if (e.liturgia) cabe.append(el("p", "liturgia", e.liturgia));
    cabe.append(el("h3", "", e.cita ?? ""));
    c.append(cabe);
    const texto = el("div", "texto-evangelio");
    for (const p of parrafos(e.texto)) texto.append(el("p", "versiculo", p.replace(/^\s*»\s*/, "")));
    c.append(texto);
    if (acciones.evangelio) {
      const b = el("button", "leido", acciones.evangelio.hecho ? "Leído hoy ✓" : "Leído · sumar mi voto"); b.type = "button";
      b.disabled = acciones.evangelio.hecho; b.onclick = () => { b.disabled = true; acciones.evangelio.marcar(); };
      c.append(b);
    }
    if (e.santo) {
      const p = el("div", "santo");
      p.append(el("b", "", "Santo del día"), el("strong", "", e.santo.nombre ?? ""));
      if (e.santo.texto) p.append(el("p", "", e.santo.texto));
      c.append(p);
    }
    const f = fuentes(e.fuentes); if (f) c.append(f);
    s.append(c);
  }

  // El tiempo (de la ciudad donde está Pablo ese día): un día por pantalla, deslizando.
  if (d.tiempo) {
    const t = d.tiempo, s = seccion("El tiempo", t.ciudad);
    if (t.resumen) s.append(el("p", "resumen-tiempo", t.resumen));
    if (t.motivo) s.append(el("p", "nota", t.motivo));
    // Días: los de `dias`; si el informe es del formato anterior, hoy usa `horas` y las cifras generales.
    let dias = lista(t.dias).filter(Boolean);
    if (!dias.length) dias = [{ dia: "Hoy", min: t.min, max: t.max, lluvia_pct: t.lluvia_pct, lluvia_mm: t.lluvia_mm }];
    const pestanas = el("div", "pestanas-dias"), carrusel = el("div", "dias-carrusel");
    pestanas.setAttribute("role", "tablist");
    dias.forEach((x, i) => {
      const horas = lista(x.horas).length ? x.horas : i === 0 ? t.horas : null;
      const slide = diaTiempo(x, { horas, amanecer: x.amanecer ?? (i === 0 ? t.amanecer : null), atardecer: x.atardecer ?? (i === 0 ? t.atardecer : null) });
      carrusel.append(slide);
      const b = el("button"); b.type = "button"; b.setAttribute("role", "tab");
      b.append(el("small", "", x.dia ?? ""), el("span", "", ICONOS[x.icono] ?? ""), el("b", "", esNum(x.max) ? num(x.max, 0) + "°" : ""));
      b.onclick = () => carrusel.scrollTo({ left: slide.offsetLeft - carrusel.offsetLeft, behavior: "smooth" });
      pestanas.append(b);
    });
    const marcarDia = () => {
      const i = Math.round(carrusel.scrollLeft / (carrusel.clientWidth || 1));
      [...pestanas.children].forEach((b, j) => { b.classList.toggle("activa", j === i); b.setAttribute("aria-selected", j === i); });
      const b = pestanas.children[i]; if (b) pestanas.scrollTo({ left: b.offsetLeft - pestanas.offsetLeft - (pestanas.clientWidth - b.offsetWidth) / 2, behavior: "smooth" });
    };
    let pend = false; carrusel.addEventListener("scroll", () => { if (!pend) { pend = true; requestAnimationFrame(() => { pend = false; marcarDia(); }); } }, { passive: true });
    if (dias.length > 1) s.append(pestanas);
    s.append(carrusel);
    if (dias.length > 1) s.append(el("p", "leyenda desliza", "Desliza para ver los demás días"));
    requestAnimationFrame(marcarDia);
  }

  // Secciones de noticias
  for (const sec of lista(d.secciones)) {
    const s = seccion(sec.titulo ?? "Noticias");
    if (lista(sec.indicadores).length) {
      const fila = el("div", "indicadores");
      for (const i of sec.indicadores) fila.append(indicador(i));
      s.append(fila);
    }
    const rejilla = el("div", "noticias");
    for (const nt of lista(sec.noticias)) rejilla.append(noticia(nt));
    s.append(rejilla);
  }

  // Mercados de predicción: el resultado favorito de cada mercado y, debajo, los siguientes.
  if (d.prediccion && lista(d.prediccion.contratos).length) {
    const p = d.prediccion, s = seccion("Predicción");
    const resumen = parrafos(p.resumen);
    if (resumen.length) { const r = el("div", "trending"); r.append(el("b", "", "Lo que se mueve hoy")); for (const x of resumen) r.append(el("p", "", x)); s.append(r); }
    for (const c of p.contratos) {
      const f = el("div", "contrato"), t = el("div");
      if (c.tema) t.append(el("em", "", c.tema));
      t.append(el("strong", "", c.mercado ?? c.titulo ?? ""));
      if (c.favorito) t.append(el("span", "favorito", c.favorito));
      else if (c.detalle) t.append(el("span", "", c.detalle));
      const prob = el("b", "", num(c.prob, c.prob >= 10 || c.prob === Math.round(c.prob) ? 0 : 1) + " %");
      const barra = el("div", "barra-prob"), i = el("i"); i.style.width = Math.max(0, Math.min(100, c.prob ?? 0)) + "%"; barra.append(i);
      f.append(t, prob, barra);
      // En mercados de sí/no, «No 5 %» bajo «Sí 95 %» no aporta nada: se omite.
      const otras = lista(c.otras).filter(o => o?.nombre && !/^(s[ií]|no)$/i.test(String(o.nombre).trim()));
      if (otras.length) {
        const ul = el("ul", "otras");
        for (const o of otras) { const li = el("li"); li.append(el("span", "", o.nombre), el("b", "", esNum(o.prob) ? num(o.prob, o.prob >= 10 || Number.isInteger(o.prob) ? 0 : 1) + " %" : "")); ul.append(li); }
        f.append(ul);
      }
      s.append(f);
    }
    for (const x of parrafos(p.comentario)) s.append(el("p", "prosa", x));
  }

  // Bolsa
  if (lista(d.bolsa).length) {
    const s = seccion("Bolsa");
    for (const m of d.bolsa) {
      const emp = lista(m.empresas);
      s.append(el("h3", "sub", m.titulo ?? ""));
      if (m.subtitulo) s.append(el("p", "nota", m.subtitulo));
      const mapa = el("div", "mapa-bolsa"), cuantas = Math.min(20, emp.length);
      emp.slice(0, cuantas).forEach(e => {
        const c = el("div"), v = esNum(e.semana) ? e.semana : 0;
        const fuerza = (Math.min(Math.abs(v), 12) / 12 * 0.42 + 0.06).toFixed(2);
        c.style.background = v < 0 ? `rgba(181,89,74,${fuerza})` : `rgba(107,143,94,${fuerza})`;
        c.append(el("strong", "", nombreCorto(e.nombre)), el("b", sentido(e.semana), pct(e.semana)), el("span", "", "hoy " + pctCorto(e.dia) + " %"));
        mapa.append(c);
      });
      if (emp.length) s.append(mapa);
      if (emp.length) {
        const det = el("details", "plegable");
        det.append(el("summary", "", `Ver las ${emp.length} empresas`),
          el("p", "leyenda", "Variaciones en %" + (emp.some(e => esNum(e.max_dif)) ? " · Máx.: distancia al máximo histórico y semanas (s) o años (a) desde él" : "")), tablaBolsa(emp));
        s.append(det);
      }
    }
  }

  // Evolución anual
  if (lista(d.evolucion).length) {
    const s = seccion("Evolución anual"), rej = el("div", "evolucion");
    for (const x of d.evolucion) rej.append(fichaEvolucion(x));
    s.append(rej);
  }

  // Para sonreír: cierre amable del informe.
  const so = d.sonrisa;
  if (so && (so.chiste || lista(so.curiosidades).length || so.buena_noticia)) {
    const s = seccion("Para sonreír"); s.classList.add("sonrisa");
    const bn = so.buena_noticia;
    if (bn?.titular) {
      const c = el("div", "buena"); c.append(el("b", "", "Buena noticia"), el("h3", "", bn.titular));
      for (const p of parrafos(bn.texto)) c.append(el("p", "", p));
      const f = fuentes(bn.fuentes); if (f) c.append(f);
      s.append(c);
    }
    const chiste = parrafos(so.chiste);
    if (chiste.length) {
      const c = el("div", "chiste"); c.append(el("b", "", "El chiste del día"));
      for (const p of chiste) c.append(el("p", "", p));
      if (so.chiste_autor) c.append(el("small", "", so.chiste_autor));
      s.append(c);
    }
    const cur = lista(so.curiosidades).filter(x => x?.texto || x?.titulo);
    if (cur.length) {
      const c = el("div", "curiosidades"); c.append(el("b", "", "¿Sabías que…?"));
      const ul = el("ul");
      for (const x of cur) { const li = el("li"); if (x.titulo) li.append(el("strong", "", x.titulo)); if (x.texto) li.append(el("span", "", x.texto)); ul.append(li); }
      c.append(ul); s.append(c);
    }
  }

  if (!n) caja.append(el("p", "vacio", "El informe está vacío."));

  // El índice marca la sección que se está leyendo y la mantiene a la vista.
  removeEventListener("scroll", caja._alDesplazar);
  let activa = null, pendiente = false;
  const marcar = () => {
    pendiente = false;
    if (caja.hidden || !marcas.length) return;
    const borde = indice.getBoundingClientRect().bottom + 24;
    let actual = null;
    for (const m of marcas) if (m[0].getBoundingClientRect().top <= borde) actual = m;
    if (actual === activa) return;
    activa?.[1].classList.remove("activa"); activa = actual;
    if (!actual) { indice.scrollTo({ left: 0, behavior: "smooth" }); return; }
    actual[1].classList.add("activa");
    indice.scrollTo({ left: actual[1].offsetLeft - indice.offsetLeft - (indice.clientWidth - actual[1].offsetWidth) / 2, behavior: "smooth" });
  };
  caja._alDesplazar = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(marcar); } };
  addEventListener("scroll", caja._alDesplazar, { passive: true });

  window.scrollTo({ top: mismo ? dondeEstaba : 0 });
  marcar();
}
