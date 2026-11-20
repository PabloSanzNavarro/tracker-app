// Informe diario: pinta el JSON que Instinct publica en datos/informes/AAAA-MM-DD.json.
// Todas las secciones son opcionales. El contenido se inserta siempre como texto
// (nunca como HTML) y solo se enlazan direcciones https.

const NS = "http://www.w3.org/2000/svg";
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, atr) => { const e = document.createElementNS(NS, tag); for (const k in atr) e.setAttribute(k, atr[k]); return e; };
const lista = v => Array.isArray(v) ? v : [];
const num = (v, d = 1) => typeof v === "number"
  ? v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }) : (v ?? "");
const pct = v => typeof v === "number" ? (v > 0 ? "+" : "") + num(v) + " %" : (v ?? "");
// En tablas estrechas: sin símbolo (va en la cabecera) y sin decimales a partir de 100.
const pctCorto = v => typeof v === "number" ? (v > 0 ? "+" : "") + num(v, Math.abs(v) >= 100 ? 0 : 1) : (v ?? "");
// Quita la coletilla societaria («Inc.», «S.A.», «Class A»…) para que el nombre quepa en el móvil.
const COLETILLA = /[,.]?\s+(?:Inc|Corp|Corporation|Company|Co|Ltd|Limited|plc|S\.?A|SME|SE|AG|NV|N\.V|Class [A-C]|Holdings?|Group)\.?,?$/i;
const nombreCorto = n => { let t = String(n ?? ""); for (let i = 0; i < 4 && COLETILLA.test(t); i++) t = t.replace(COLETILLA, ""); return t.replace(/\s+(?:and|&)$/i, "") || String(n ?? ""); };
const sentido = v => typeof v !== "number" || v === 0 ? "" : v > 0 ? "sube" : "baja";
const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];
const ICONOS = { sol: "☀", nubes: "☁", lluvia: "☂", tormenta: "⚡", nieve: "❄", niebla: "≋" };

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

function chispa(serie, { alto = 56, color = "#2a1d18", relleno = true } = {}) {
  const vs = lista(serie).filter(v => typeof v === "number");
  if (vs.length < 2) return null;
  const W = 300, lo = Math.min(...vs), hi = Math.max(...vs), r = hi - lo || 1;
  const pts = vs.map((v, i) => [(W * i) / (vs.length - 1), 4 + (alto - 8) * (hi - v) / r]);
  const svg = sv("svg", { viewBox: `0 0 ${W} ${alto}`, preserveAspectRatio: "none", class: "chispa", "aria-hidden": "true" });
  const linea = pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  if (relleno) svg.append(sv("polygon", { points: `0,${alto} ${linea} ${W},${alto}`, fill: color, opacity: ".1" }));
  svg.append(sv("polyline", { points: linea, fill: "none", stroke: color, "stroke-width": "2", "vector-effect": "non-scaling-stroke" }));
  return svg;
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
  for (const p of lista(typeof n.texto === "string" ? [n.texto] : n.texto)) cuerpo.append(el("p", "", p));
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

function tablaBolsa(empresas) {
  const caja = el("div", "tabla-scroll"), t = el("table", "bolsa");
  const cabecera = () => { const cab = el("tr", "cab"); for (const c of ["", "Empresa", "Cap.", "Día", "Sem.", "Año", "12 m"]) cab.append(el("th", "", c)); return cab; };
  empresas.forEach((e, i) => {
    if (i % 10 === 0) t.append(cabecera());      // la cabecera se repite: la tabla es larga
    const tr = el("tr"), nombre = el("td", "nombre", nombreCorto(e.nombre));
    if (e.ticker) nombre.append(el("small", "", " " + e.ticker));
    nombre.title = e.nombre ?? "";
    tr.append(el("td", "puesto", e.puesto ?? ""), nombre, el("td", "", e.cap ?? ""));
    for (const k of ["dia", "semana", "ytd", "anual"]) tr.append(el("td", sentido(e[k]), pctCorto(e[k])));
    t.append(tr);
  });
  caja.append(t); return caja;
}

export function pintarInforme(caja, d, acciones = {}) {
  // Al repintar el mismo informe (por ejemplo, tras marcar el Evangelio) se conserva la posición de lectura.
  const mismo = caja.dataset.fecha === String(d.fecha ?? ""), dondeEstaba = window.scrollY;
  caja.dataset.fecha = String(d.fecha ?? "");
  caja.replaceChildren();
  const indice = el("nav", "indice"), marcas = []; let n = 0;
  indice.setAttribute("aria-label", "Secciones del informe");
  const seccion = (titulo, nota) => {
    const s = el("section", "bloque"), h = el("h2");
    h.append(el("i", "", ROMANOS[n++] ?? ""), titulo); if (nota) h.append(el("small", "", nota));
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
  const titulo = el("div"); titulo.append(el("div", "mascota"), el("h1", "", "Informe diario"), el("p", "", fecha + (d.generado ? " · " + d.generado : "")));
  nav.append(ant, titulo, sig); cab.append(nav); caja.append(cab, indice);

  // Lo esencial
  if (lista(d.esencial).length) {
    const s = seccion("Lo esencial"); s.classList.add("esencial");
    const ol = el("ol");
    for (const e of d.esencial) { const li = el("li"); li.append(el("strong", "", e.titular ?? ""), " " + (e.texto ?? "")); ol.append(li); }
    s.append(ol);
  }

  // Agenda
  if (d.agenda) {
    const s = seccion("Agenda", d.agenda.consultada ? "consultada a las " + d.agenda.consultada : "");
    if (lista(d.agenda.hoy).length) s.append(eventos(d.agenda.hoy)); else s.append(el("p", "vacio", "Sin citas hoy."));
    if (d.agenda.resumen) s.append(el("p", "nota", d.agenda.resumen));
    for (const p of lista(d.agenda.proximos)) {
      const det = el("details", "plegable"); det.append(el("summary", "", p.dia ?? ""), eventos(p.eventos)); s.append(det);
    }
  }

  // Evangelio y santo
  if (d.evangelio) {
    const e = d.evangelio, s = seccion("Evangelio"), c = el("div", "evangelio");
    c.append(el("h3", "", e.cita ?? ""));
    if (e.liturgia) c.append(el("p", "liturgia", e.liturgia));
    for (const p of lista(typeof e.texto === "string" ? [e.texto] : e.texto)) c.append(el("p", "versiculo", p));
    if (acciones.evangelio) {
      const b = el("button", "leido", acciones.evangelio.hecho ? "Leído hoy ✓" : "Leído · sumar mi voto"); b.type = "button";
      b.disabled = acciones.evangelio.hecho; b.onclick = () => { b.disabled = true; acciones.evangelio.marcar(); };
      c.append(b);
    }
    if (e.santo) { const p = el("p", "santo"); p.append(el("b", "", "Santo del día"), el("strong", "", " " + (e.santo.nombre ?? "") + ". "), e.santo.texto ?? ""); c.append(p); }
    const f = fuentes(e.fuentes); if (f) c.append(f);
    s.append(c);
  }

  // El tiempo
  if (d.tiempo) {
    const t = d.tiempo, s = seccion("El tiempo", t.ciudad);
    if (t.resumen) s.append(el("p", "nota", t.resumen));
    const cifras = el("div", "cifras");
    for (const [k, v, u] of [["Mínima", t.min, "°"], ["Máxima", t.max, "°"], ["Lluvia", t.lluvia_pct, " %"]]) {
      if (v == null) continue;
      const c = el("div"); c.append(el("small", "", k), el("strong", "", num(v, k === "Lluvia" ? 0 : 1) + u));
      if (k === "Lluvia" && t.lluvia_mm != null) c.append(el("span", "", num(t.lluvia_mm) + " mm"));
      cifras.append(c);
    }
    s.append(cifras);
    const horas = lista(t.horas);
    const g = chispa(horas.map(h => h.temp), { alto: 70, color: "#b5594a" });
    if (g) {
      const caja2 = el("div", "curva"), eje = el("div", "eje");
      for (const h of [horas[0], horas[Math.floor(horas.length / 2)], horas.at(-1)]) eje.append(el("span", "", `${h.hora} · ${num(h.temp)}°`));
      caja2.append(g, eje); s.append(caja2);
    }
    if (lista(t.dias).length) {
      const tabla = el("table", "dias-tiempo");
      for (const x of t.dias) {
        const tr = el("tr");
        tr.append(el("td", "", (x.dia ?? "") + (x.fecha ? " " + x.fecha : "")), el("td", "icono", ICONOS[x.icono] ?? ""),
          el("td", "", num(x.min) + "°"), el("td", "max", num(x.max) + "°"), el("td", "", num(x.lluvia_pct, 0) + " %"), el("td", "", num(x.lluvia_mm) + " mm"));
        tabla.append(tr);
      }
      s.append(tabla);
    }
    for (const o of lista(t.otras)) { const p = el("p", "nota"); p.append(el("b", "", (o.ciudad ?? "") + " · "), o.texto ?? ""); s.append(p); }
  }

  // Secciones de noticias
  for (const sec of lista(d.secciones)) {
    const s = seccion(sec.titulo ?? "Noticias", [lista(sec.noticias).length > 1 ? lista(sec.noticias).length + " noticias" : "", sec.cierre ? "cierre " + sec.cierre : ""].filter(Boolean).join(" · "));
    if (lista(sec.indicadores).length) {
      const fila = el("div", "indicadores");
      for (const i of sec.indicadores) { const c = el("div"); c.append(el("small", "", i.nombre ?? ""), el("strong", "", i.valor ?? ""), el("span", /^[-−]\s?\d/.test(i.nota ?? "") ? "baja" : /^\+\s?\d/.test(i.nota ?? "") ? "sube" : "", i.nota ?? "")); fila.append(c); }
      s.append(fila);
    }
    const rejilla = el("div", "noticias");
    for (const nt of lista(sec.noticias)) rejilla.append(noticia(nt));
    s.append(rejilla);
  }

  // Mercados de predicción
  if (d.prediccion && lista(d.prediccion.contratos).length) {
    const p = d.prediccion, s = seccion("Predicción");
    if (p.nota) s.append(el("p", "nota", p.nota));
    for (const c of p.contratos) {
      const f = el("div", "contrato"), t = el("div");
      t.append(el("strong", "", c.titulo ?? "")); if (c.detalle) t.append(el("span", "", c.detalle));
      const barra = el("div", "barra-prob"), i = el("i"); i.style.width = Math.max(0, Math.min(100, c.prob ?? 0)) + "%"; barra.append(i);
      f.append(t, el("b", "", num(c.prob, 1) + " %"), barra); s.append(f);
    }
    for (const x of lista(typeof p.comentario === "string" ? [p.comentario] : p.comentario)) s.append(el("p", "prosa", x));
  }

  // Bolsa
  if (lista(d.bolsa).length) {
    const s = seccion("Bolsa");
    for (const m of d.bolsa) {
      const emp = lista(m.empresas);
      s.append(el("h3", "sub", m.titulo ?? ""));
      if (m.subtitulo) s.append(el("p", "nota", m.subtitulo));
      const mapa = el("div", "mapa-bolsa");
      emp.slice(0, 12).forEach(e => {
        const c = el("div"), v = typeof e.semana === "number" ? e.semana : 0;
        const fuerza = (Math.min(Math.abs(v), 12) / 12 * 0.42 + 0.06).toFixed(2);
        c.style.background = v < 0 ? `rgba(181,89,74,${fuerza})` : `rgba(107,143,94,${fuerza})`;
        c.append(el("strong", "", nombreCorto(e.nombre)), el("b", sentido(e.semana), pct(e.semana)), el("span", "", "día " + pct(e.dia)));
        mapa.append(c);
      });
      if (emp.length) s.append(mapa, el("p", "leyenda", "Las " + Math.min(12, emp.length) + " mayores · cifra grande: variación de la semana"));
      if (emp.length) { const det = el("details", "plegable"); det.append(el("summary", "", `Ver las ${emp.length} empresas`), el("p", "leyenda", "Variaciones en %"), tablaBolsa(emp)); s.append(det); }
    }
  }

  // Evolución anual
  if (lista(d.evolucion).length) {
    const s = seccion("Evolución anual"), rej = el("div", "evolucion");
    for (const x of d.evolucion) {
      const c = el("div"), sube = (x.anual ?? x.ytd ?? 0) >= 0;
      const cabx = el("div", "cab-evo"); cabx.append(el("strong", "", x.nombre ?? ""), el("b", "", x.ultimo ?? ""));
      const g = chispa(x.serie, { color: sube ? "#4d7040" : "#b5594a" });
      const pie = el("div", "pie-evo");
      pie.append(el("span", sentido(x.ytd), "Año " + pct(x.ytd)), el("span", sentido(x.anual), "12 m " + pct(x.anual)));
      c.append(cabx); if (g) c.append(g); c.append(pie);
      if (x.detalle) c.append(el("small", "", x.detalle));
      rej.append(c);
    }
    s.append(rej);
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
