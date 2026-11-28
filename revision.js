// Pestaña Revisión: pinta la revisión semanal o mensual. Las cifras salen de
// datos/revisiones/metricas/<periodo>.json (scripts/revision.mjs) y el texto de
// datos/revisiones/<periodo>.json (lo escribe Claude Code, formato en REVISION.md).
// Todo el texto se inserta como texto, nunca como HTML; solo se enlazan direcciones https.

const NS = "http://www.w3.org/2000/svg";
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, atr, txt) => { const e = document.createElementNS(NS, tag); for (const k in atr) if (atr[k] != null) e.setAttribute(k, atr[k]); if (txt != null) e.textContent = txt; return e; };
const esNum = v => typeof v === "number" && isFinite(v);
const lista = v => Array.isArray(v) ? v : [];
const texto = v => typeof v === "string" && v.trim() ? v : null;
// Cifras a la española, con punto de miles también en las de cuatro cifras.
const num = (v, d = 0) => {
  if (!esNum(v)) return "–";
  const s = Math.abs(v).toFixed(d), [e, f] = s.split(".");
  return (v < 0 && +s ? "−" : "") + e.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (f ? "," + f : "");
};
const conSigno = (v, d = 0) => esNum(v) ? (v > 0 ? "+" : "") + num(v, d) : "–";
const fecha = (f, o = { day: "numeric", month: "short" }) => new Date(f + "T12:00:00").toLocaleDateString("es-ES", o);
const diaLetra = f => fecha(f, { weekday: "short" }).replace(".", "");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = id => MESES[+id.slice(5, 7) - 1] + " " + id.slice(0, 4);
const mayus = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const C = { a: "var(--serie-a)", b: "var(--serie-b)", tinta: "var(--tinta)", suave: "var(--suave)", linea: "var(--linea)", papel: "var(--papel)" };

// ---- Gráficos: SVG propio, marcas finas, una lectura bajo el gráfico al tocar.

function marco(titulo, svg, mira, lectura, leyenda) {
  const f = el("figure", "rv-grafico");
  if (titulo) f.append(el("figcaption", "", titulo));
  if (leyenda) {
    const l = el("div", "rv-leyenda");
    for (const [txt, cls] of leyenda) { const s = el("span"); s.append(el("i", cls), txt); l.append(s); }
    f.append(l);
  }
  f.append(svg, lectura);
  if (mira) { const p = el("p", "rv-mira"); p.append(el("b", "", "Qué mirar aquí · "), mira); f.append(p); }
  return f;
}

/** Barras por categoría. barras: [{k, etiqueta, v, v2?, tenue?, info}] · ref: [{v, txt}] líneas horizontales. */
function barras(datos, { W = 340, H = 170, formato = v => num(v), ref = [], apilada = false, colores = [C.a, C.b], resumen = "" } = {}) {
  const m = { i: 40, d: 8, a: 14, b: 24 };
  const vals = datos.flatMap(d => [apilada ? (d.v ?? 0) + (d.v2 ?? 0) : d.v, apilada ? null : d.v2, d.marca]).filter(esNum);
  const hi = Math.max(1, ...vals, ...ref.map(r => r.v).filter(esNum)) * 1.12;
  const y = v => m.a + (H - m.a - m.b) * (1 - v / hi), paso = (W - m.i - m.d) / datos.length;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "rv-svg" });
  const lectura = el("p", "rv-lectura", resumen);
  for (const t of [0, hi / 2.24, hi / 1.12]) svg.append(
    sv("line", { x1: m.i, x2: W - m.d, y1: y(t), y2: y(t), stroke: C.linea, "stroke-width": 1 }),
    sv("text", { x: m.i - 6, y: y(t) + 4, "text-anchor": "end", class: "rv-eje" }, formato(t)));
  const dos = !apilada && datos.some(d => esNum(d.v2)), ancho = Math.min(28, paso * (dos ? 0.36 : 0.62));
  datos.forEach((d, i) => {
    const x0 = m.i + paso * i, g = sv("g", { class: "rv-marca" });
    g.append(sv("rect", { x: x0, y: 0, width: paso, height: H, fill: "transparent" }));
    const barra = (v, x, base, color, tenue) => {
      if (!esNum(v) || v <= 0) return;
      const h = y(base) - y(base + v), r = Math.min(3, ancho / 2, h);
      g.append(sv("path", { d: `M${x},${y(base)} v${-(h - r)} q0,${-r} ${r},${-r} h${ancho - 2 * r} q${r},0 ${r},${r} v${h - r} z`,
        fill: color, opacity: tenue ? 0.38 : 1 }));
    };
    if (apilada) { barra(d.v, x0 + (paso - ancho) / 2, 0, colores[0], d.tenue); barra(d.v2, x0 + (paso - ancho) / 2, (d.v ?? 0) + 0.0001, colores[1], d.tenue); }
    else if (dos) { barra(d.v, x0 + paso / 2 - ancho - 1, 0, colores[0], d.tenue); barra(d.v2, x0 + paso / 2 + 1, 0, colores[1], d.tenue); }
    else barra(d.v, x0 + (paso - ancho) / 2, 0, d.color ?? colores[0], d.tenue);
    if (!esNum(d.v) && !esNum(d.v2)) g.append(sv("rect", { x: x0 + (paso - ancho) / 2, y: y(0) - 2, width: ancho, height: 2, fill: C.linea }));
    if (d.marca) g.append(sv("line", { x1: x0 + paso * 0.15, x2: x0 + paso * 0.85, y1: y(d.marca), y2: y(d.marca), stroke: C.tinta, "stroke-width": 2 }));
    g.append(sv("text", { x: x0 + paso / 2, y: H - 7, "text-anchor": "middle", class: "rv-eje" + (d.destaca ? " fuerte" : "") }, d.etiqueta));
    g.addEventListener("click", () => {
      for (const o of svg.querySelectorAll(".rv-marca.activa")) o.classList.remove("activa");
      g.classList.add("activa"); lectura.textContent = d.info ?? "";
    });
    svg.append(g);
  });
  for (const r of ref) if (esNum(r.v)) svg.append(
    sv("line", { x1: m.i, x2: W - m.d, y1: y(r.v), y2: y(r.v), stroke: C.tinta, "stroke-width": 1.5, "stroke-dasharray": "5 4" }),
    sv("text", { x: W - m.d, y: y(r.v) - 5, "text-anchor": "end", class: "rv-ref" }, r.txt));
  return { svg, lectura };
}

/** Curva del peso: pesos del día (puntos), media de 7 días (línea) e ideal (discontinua). */
function curvaPeso(serie, objetivo, { W = 340 } = {}) {
  const H = Math.round(Math.min(240, Math.max(190, W * 0.5))), m = { i: 40, d: 10, a: 14, b: 26 };
  const vs = serie.flatMap(p => [p.kg, p.media7, p.ideal]).filter(esNum);
  const lectura = el("p", "rv-lectura", "Toca un día para ver su peso.");
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "rv-svg", "aria-label": "Peso, media de 7 días y línea ideal" });
  if (!vs.length) { lectura.textContent = "Sin pesos en este periodo."; return { svg, lectura }; }
  const lo = Math.floor(Math.min(...vs) - 0.4), hi = Math.ceil(Math.max(...vs) + 0.4), n = serie.length;
  const x = i => m.i + (W - m.i - m.d) * (n > 1 ? i / (n - 1) : 0.5), y = v => m.a + (H - m.a - m.b) * (hi - v) / (hi - lo || 1);
  const pasoY = hi - lo > 6 ? 2 : 1;
  for (let v = lo; v <= hi; v += pasoY) svg.append(
    sv("line", { x1: m.i, x2: W - m.d, y1: y(v), y2: y(v), stroke: C.linea, "stroke-width": 1 }),
    sv("text", { x: m.i - 6, y: y(v) + 4, "text-anchor": "end", class: "rv-eje" }, num(v)));
  const linea = (k, atr) => {
    let d = "", sigue = false;
    serie.forEach((p, i) => { if (esNum(p[k])) { d += (sigue ? "L" : "M") + x(i).toFixed(1) + "," + y(p[k]).toFixed(1); sigue = true; } else sigue = false; });
    if (d) svg.append(sv("path", { d, fill: "none", ...atr }));
  };
  linea("ideal", { stroke: C.b, "stroke-width": 2, "stroke-dasharray": "6 4" });
  linea("media7", { stroke: C.a, "stroke-width": 2.5, "stroke-linejoin": "round" });
  // Fechas: primera, lunes intermedios y última
  serie.forEach((p, i) => {
    if (i === 0 || i === n - 1 || (n > 20 && new Date(p.fecha + "T12:00:00").getDay() === 1 && x(i) > m.i + 48 && x(i) < W - m.d - 52))
      svg.append(sv("text", { x: x(i), y: H - 8, "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle", class: "rv-eje" }, fecha(p.fecha)));
  });
  serie.forEach((p, i) => {
    const g = sv("g", { class: "rv-marca" });
    g.append(sv("rect", { x: x(i) - (W / n) / 2, y: 0, width: W / n, height: H, fill: "transparent" }));
    if (esNum(p.kg)) g.append(sv("circle", { cx: x(i), cy: y(p.kg), r: 4, fill: C.tinta, stroke: C.papel, "stroke-width": 2 }));
    g.addEventListener("click", () => {
      for (const o of svg.querySelectorAll(".rv-marca.activa")) o.classList.remove("activa");
      g.classList.add("activa");
      lectura.textContent = `${mayus(fecha(p.fecha, { weekday: "short", day: "numeric", month: "short" }))}: ` +
        (esNum(p.kg) ? num(p.kg, 1) + " kg" : "sin pesar") + (esNum(p.media7) ? " · media 7 d " + num(p.media7, 1) : "") +
        (esNum(p.ideal) ? " · ideal " + num(p.ideal, 1) : "");
    });
    svg.append(g);
  });
  if (esNum(objetivo?.meta_kg) && objetivo.meta_kg >= lo) svg.append(
    sv("line", { x1: m.i, x2: W - m.d, y1: y(objetivo.meta_kg), y2: y(objetivo.meta_kg), stroke: C.tinta, "stroke-width": 1.5, "stroke-dasharray": "2 3" }),
    sv("text", { x: W - m.d, y: y(objetivo.meta_kg) - 5, "text-anchor": "end", class: "rv-ref" }, "meta " + num(objetivo.meta_kg) + " kg"));
  return { svg, lectura };
}

/** Línea simple de una medida (composición corporal). */
function lineaSimple(pts, unidad, { W = 340, d = 1 } = {}) {
  const H = 150, m = { i: 40, d: 10, a: 14, b: 24 };
  const lectura = el("p", "rv-lectura", pts.length ? "Toca un punto para ver la medición." : "Sin mediciones.");
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "rv-svg" });
  if (!pts.length) return { svg, lectura };
  const vs = pts.map(p => p.v), mg = Math.max(1, (Math.max(...vs) - Math.min(...vs)) * 0.25);
  const lo = Math.min(...vs) - mg, hi = Math.max(...vs) + mg, t0 = Date.parse(pts[0].f), t1 = Date.parse(pts.at(-1).f);
  const x = f => m.i + (W - m.i - m.d) * (t1 > t0 ? (Date.parse(f) - t0) / (t1 - t0) : 0.5), y = v => m.a + (H - m.a - m.b) * (hi - v) / (hi - lo);
  for (const v of [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15]) svg.append(
    sv("line", { x1: m.i, x2: W - m.d, y1: y(v), y2: y(v), stroke: C.linea, "stroke-width": 1 }),
    sv("text", { x: m.i - 6, y: y(v) + 4, "text-anchor": "end", class: "rv-eje" }, num(v, d)));
  svg.append(sv("polyline", { fill: "none", stroke: C.a, "stroke-width": 2, points: pts.map(p => x(p.f) + "," + y(p.v)).join(" ") }));
  for (const p of pts) {
    const g = sv("g", { class: "rv-marca" });
    g.append(sv("circle", { cx: x(p.f), cy: y(p.v), r: 12, fill: "transparent" }),
      sv("circle", { cx: x(p.f), cy: y(p.v), r: 4, fill: p.captura ? C.tinta : C.papel, stroke: C.tinta, "stroke-width": 2 }));
    g.addEventListener("click", () => lectura.textContent = `${mayus(fecha(p.f, { weekday: "short", day: "numeric", month: "short" }))}${p.h ? " " + p.h : ""}: ${num(p.v, d)}${unidad}${p.captura ? "" : " (Salud)"}`);
    svg.append(g);
  }
  svg.append(sv("text", { x: m.i, y: H - 7, class: "rv-eje" }, fecha(pts[0].f)),
    sv("text", { x: W - m.d, y: H - 7, "text-anchor": "end", class: "rv-eje" }, fecha(pts.at(-1).f)));
  return { svg, lectura };
}

// ---- Piezas

function seccion(caja, titulo, sub) {
  const s = el("section", "bloque rv-bloque"), h = el("h2", "", titulo);
  if (sub) h.append(el("small", "", sub));
  s.append(h); caja.append(s); return s;
}

function fuentes(fs) {
  const p = el("p", "fuentes"); p.append(el("b", "", "Fuentes"));
  for (const f of lista(fs)) {
    if (!texto(f?.nombre)) continue;
    if (/^https:\/\//.test(f.url ?? "")) { const a = el("a", "", f.nombre); a.href = f.url; a.target = "_blank"; a.rel = "noopener"; p.append(a); }
    else p.append(el("span", "", f.nombre));
  }
  return p.childElementCount > 1 ? p : null;
}

/** Flecha frente a una referencia. `mejor`: "sube", "baja" o null (sin valoración, como el alcohol). */
function flecha(dif, mejor, unidad, d, etiqueta) {
  const s = el("span", "rv-flecha");
  if (!esNum(dif)) { s.append(el("i", "", etiqueta), " –"); return s; }
  const cero = Math.abs(dif) < 10 ** -d / 2, dir = cero ? "=" : dif > 0 ? "↑" : "↓";
  s.className += cero || !mejor ? "" : (dif > 0) === (mejor === "sube") ? " va-bien" : " va-mal";
  s.append(el("i", "", etiqueta), ` ${dir} ${cero ? "igual" : num(Math.abs(dif), d) + unidad}`);
  return s;
}

// ---- Vista

/**
 * caja: el contenedor. o: { tipo, id, ids: {semana:[], mes:[]}, metricas, revision, propuestas,
 *   ir(tipo, id), aceptar(ids) -> Promise, demo, error }
 */
export function pintarRevision(caja, o) {
  caja.replaceChildren();
  const M = o.metricas, R = o.revision ?? {}, W = Math.max(300, Math.min(760, (caja.clientWidth || 360) - 28));

  // Selector Semana / Mes y navegación entre periodos
  const chips = el("div", "chips rv-tipos");
  for (const [t, nombre] of [["semana", "Semana"], ["mes", "Mes"]]) {
    const b = el("button", o.tipo === t ? "activa" : "", nombre); b.type = "button";
    b.disabled = !o.ids[t]?.length; b.onclick = () => o.ir(t, o.ids[t].at(-1));
    chips.append(b);
  }
  caja.append(chips);
  const ids = o.ids[o.tipo] ?? [], i = ids.indexOf(o.id);
  const port = el("div", "portada"), nav = el("div", "dias-nav");
  const flechaNav = (txt, destino, etq) => { const b = el("button", "", txt); b.type = "button"; b.setAttribute("aria-label", etq);
    b.disabled = !destino; if (destino) b.onclick = () => o.ir(o.tipo, destino); return b; };
  const centro = el("div");
  if (o.id) {
    const p = M ?? { desde: null, hasta: null };
    centro.append(el("h1", "", o.tipo === "semana" ? "Semana " + +o.id.slice(6) : mayus(nombreMes(o.id))));
    if (o.tipo === "semana" && p.desde) centro.append(el("p", "fecha-portada", `${fecha(p.desde, { day: "numeric" })} – ${fecha(p.hasta, { day: "numeric", month: "long", year: "numeric" })}`));
    const estado = [];
    if (M?.provisional || R.provisional) estado.push("provisional · datos hasta el " + fecha(M?.corte ?? R.escrita));
    if (texto(R.escrita)) estado.push("escrita el " + fecha(R.escrita));
    if (o.demo) estado.push("demo");
    if (estado.length) centro.append(el("p", "generado", estado.join(" · ")));
  } else centro.append(el("h1", "", "Revisión"));
  nav.append(flechaNav("‹", ids[i - 1], "Anterior"), centro, flechaNav("›", ids[i + 1], "Siguiente"));
  port.append(nav); caja.append(port);

  if (o.error) { caja.append(el("p", "vacio", o.error)); return; }
  if (!o.id) { caja.append(el("p", "vacio", "Todavía no hay ninguna revisión. Dile a Claude Code «revisión semanal» en el Mac.")); return; }
  if (!M) caja.append(el("p", "vacio", "Faltan las cifras de este periodo (datos/revisiones/metricas/" + o.id + ".json)."));
  if (!o.revision) caja.append(el("p", "vacio rv-sin", "Aún no hay análisis de este periodo: abajo están solo las cifras."));

  // 1. Tres frases
  const fr = R.frases ?? {};
  if (texto(fr.bien) || texto(fr.falla) || texto(fr.paso)) {
    const s = el("section", "esencial rv-frases"); s.append(el("h2", "", "En tres frases"));
    const ul = el("ul");
    for (const [k, etq] of [["bien", "Fue bien"], ["falla", "Falla"], ["paso", "La semana que viene"]]) {
      if (!texto(fr[k])) continue;
      const li = el("li", "rv-" + k); li.append(el("strong", "", o.tipo === "mes" && k === "paso" ? "El mes que viene" : etq), el("span", "", fr[k]));
      ul.append(li);
    }
    s.append(ul); caja.append(s);
  }
  if (!M) { pintarTexto(caja, R, o); return; }
  const cob = M.cobertura ?? {};

  // 2. Marcador
  const mar = seccion(caja, "Marcador", `datos: peso ${cob.peso}/${cob.dias} · comidas completas ${cob.comidas_completas}/${cob.dias} · pasos ${cob.pasos}/${cob.dias} días`);
  pintarPeso(mar, M, R, W);
  pintarIndicadores(mar, M, R, W, o.tipo);
  if (o.tipo === "mes") pintarMes(caja, M, R, W);

  // Causas
  if (lista(R.causas).length) {
    const s = seccion(caja, "Por qué");
    for (const c of R.causas) {
      if (!texto(c?.titulo) && !texto(c?.texto)) continue;
      const d = el("div", "rv-causa"); d.append(el("strong", "", c.titulo ?? ""), el("p", "", c.texto ?? "")); s.append(d);
    }
  }

  // 3. Hábitos
  pintarHabitos(caja, M, R, o.tipo);
  // 4 y 5. Idea, experimento y plan
  pintarTexto(caja, R, o);
  if (o.tipo === "semana") pintarPlan(caja, M, R, o, W);
}

function pintarPeso(s, M, R, W) {
  const P = M.peso ?? {}, ob = P.objetivo ?? {};
  const t = el("div", "rv-peso");
  const izq = el("div"); izq.append(el("small", "", "Peso · media de 7 días"));
  const g = el("strong", "", num(P.media7_fin, 1)); g.append(el("span", "", " kg")); izq.append(g);
  const linea = [];
  if (esNum(P.cambio)) linea.push(`${conSigno(P.cambio, 1)} kg en ${M.tipo === "mes" ? "el mes" : "la semana"}`);
  if (esNum(P.diferencia_ideal)) linea.push(`${num(Math.abs(P.diferencia_ideal), 1)} kg ${P.diferencia_ideal > 0 ? "por encima" : "por debajo"} de la línea ideal`);
  izq.append(el("p", "", linea.join(" · ") || "Faltan pesos para la media de 7 días."));
  const der = el("dl", "rv-datos");
  const dato = (dt, dd, cls) => { der.append(el("dt", "", dt), el("dd", cls ?? "", dd)); };
  dato("Ritmo real", esNum(P.ritmo_kg_semana) ? conSigno(P.ritmo_kg_semana, 2) + " kg/sem" : "faltan pesos",
    esNum(P.ritmo_kg_semana) && esNum(ob.ritmo_kg_semana) ? (P.ritmo_kg_semana <= ob.ritmo_kg_semana ? "va-bien" : "va-mal") : "");
  dato("Ritmo ideal", esNum(ob.ritmo_kg_semana) ? conSigno(ob.ritmo_kg_semana, 1) + " kg/sem" : "–");
  dato("Llegada a " + num(ob.meta_kg) + " kg", P.llegada_proyectada ? fecha(P.llegada_proyectada, { day: "numeric", month: "short", year: "numeric" })
    : esNum(P.ritmo_kg_semana) ? "sin proyección: no baja" : "faltan pesos");
  dato("Plan", ob.llegada_ideal ? fecha(ob.llegada_ideal, { day: "numeric", month: "short", year: "numeric" }) : "–");
  t.append(izq, der); s.append(t);
  const c = curvaPeso(lista(P.serie), ob, { W });
  s.append(marco(null, c.svg,
    `la línea naranja es la media de 7 días; la azul discontinua, el camino a ${num(ob.ritmo_kg_semana, 1)} kg por semana. Si la naranja va por encima de la azul, vas por detrás del plan. Los puntos sueltos bailan 1-2 kg con el agua, la sal y la hora de la pesada: no los mires uno a uno.`,
    c.lectura, [["Peso del día", "punto"], ["Media 7 días", "a"], ["Ideal", "b discontinua"]]));
  if (texto(R.notas?.peso)) s.append(el("p", "rv-nota", R.notas.peso));
  const hs = lista(P.horas).filter(h => h.hora);
  if (hs.length >= 3) {
    const mins = hs.map(h => +h.hora.slice(0, 2) * 60 + +h.hora.slice(3, 5)), rango = Math.max(...mins) - Math.min(...mins);
    if (rango >= 180) s.append(el("p", "rv-aviso", `Ojo: ${M.tipo === "mes" ? "este mes" : "esta semana"} te has pesado entre las ${hs.reduce((a, h) => h.hora < a ? h.hora : a, "99")} y las ${hs.reduce((a, h) => h.hora > a ? h.hora : a, "")}. Pesarte siempre al levantarte hace comparables los días.`));
  }
}

const INDICADORES = [
  { k: "deporte", nombre: "Deporte", ind: "deporte_sesiones", u: "", d: 0,
    valor: M => num(M.deporte?.sesiones), unidad: M => M.deporte?.sesiones === 1 ? " sesión" : " sesiones",
    sub: M => `${num(M.deporte?.minutos)} min · gimnasio ${num(M.deporte?.gimnasio)}${esNum(M.deporte?.meta_gimnasio) ? "/" + M.deporte.meta_gimnasio : ""}` +
      (M.deporte?.planeadas ? ` · ${M.deporte.cumplidas} de ${M.deporte.planeadas} planeadas` : ""),
    mira: "cada barra es una semana: en naranja el gimnasio (la meta va en la línea discontinua) y en azul el resto. El pádel suma, pero no cuenta para la meta." },
  { k: "pasos", nombre: "Pasos al día", ind: "pasos_media", u: "", d: 0,
    valor: M => num(M.pasos?.media), unidad: () => "", sub: M => `${M.pasos?.dias ?? 0} días con datos`,
    mira: "la altura de cada día frente a la línea de tu media de las 4 semanas anteriores. Los días de oficina o de ciudad suelen subir solos; los de casa son los que tiran la media abajo." },
  { k: "energia", nombre: "Déficit", ind: "deficit_medio", u: " kcal", d: 0,
    valor: M => conSigno(M.energia?.deficit_medio), unidad: () => " kcal/día",
    sub: M => `${num(M.energia?.kcal_media)} comidas · ${num(M.energia?.gasto_medio)} gasto · ${M.energia?.dias_completos ?? 0} días completos`,
    mira: "la barra naranja es lo que comiste y la raya, lo que gastaste (estimado). Para bajar 0,7 kg/semana hace falta un déficit de unas 700-800 kcal al día. Solo cuentan los días con comida y cena apuntadas." },
  { k: "proteina", nombre: "Proteína", ind: "proteina_g_kg", u: " g/kg", d: 2,
    valor: M => num(M.proteina?.g_kg, 2), unidad: () => " g/kg", sub: M => `${num(M.proteina?.g_dia)} g/día en ${M.proteina?.dias ?? 0} días completos`,
    mira: "gramos por kilo de peso cada día. Entrenando fuerza, a partir de unos 1,6 g/kg ya no se gana más músculo (metaanálisis de Morton y otros, 2018): es la referencia de la línea." },
  { k: "alcohol", nombre: "Alcohol", ind: "alcohol_copas", u: " copas", d: 1,
    valor: M => num(M.alcohol?.copas, 1), unidad: () => " copas", sub: M => `${num(M.alcohol?.gramos)} g · ${num(M.alcohol?.kcal)} kcal · ${M.alcohol?.dias ?? 0} días`,
    mira: "copas de cada día (1 copa = 10 g de alcohol) y, al tocar, el peso del día siguiente. Es un dato para entender la báscula, sin más." },
];

function pintarIndicadores(s, M, R, W, tipo) {
  const rej = el("div", "rv-indicadores"), detalle = el("div", "rv-detalle");
  let abierto = null;
  const abrir = (def, b) => {
    for (const x of rej.children) x.classList.toggle("activa", x === b && abierto !== def.k);
    if (abierto === def.k) { abierto = null; detalle.replaceChildren(); return; }
    abierto = def.k; detalle.replaceChildren(graficoIndicador(def, M, W, tipo));
    if (texto(R.notas?.[def.k])) detalle.append(el("p", "rv-nota", R.notas[def.k]));
  };
  for (const def of INDICADORES) {
    const I = M.indicadores?.[def.ind] ?? {}, b = el("button", "rv-ind"); b.type = "button";
    const v = el("strong", "", def.valor(M)); v.append(el("span", "", def.unidad(M)));
    b.append(el("small", "", def.nombre), v, el("span", "rv-sub", def.sub(M)));
    const fl = el("span", "rv-flechas");
    fl.append(flecha(I.dif_anterior, I.mejor, def.u, def.d, tipo === "mes" ? "mes ant." : "sem. ant."));
    if (tipo === "semana") fl.append(flecha(I.dif_media4, I.mejor, def.u, def.d, "media 4"));
    b.append(fl);
    b.onclick = () => abrir(def, b);
    rej.append(b);
  }
  s.append(rej, el("p", "leyenda", "Toca un indicador para ver su gráfico."), detalle);
}

function graficoIndicador(def, M, W, tipo) {
  const dias = lista(M.dias), d1 = f => mayus(fecha(f, { weekday: "short", day: "numeric" }));
  const porDia = tipo === "semana" ? dias : null;
  if (def.k === "deporte") {
    const semanas = tipo === "semana"
      ? [...lista(M.semanas_previas)].reverse().map(x => ({ desde: x.desde, d: x.deporte })).concat([{ desde: M.desde, d: M.deporte }])
      : lista(M.deporte?.semanas).map(x => ({ desde: x.desde, d: x }));
    const b = barras(semanas.map((x, i) => ({ etiqueta: fecha(x.desde, { day: "numeric", month: "numeric" }), v: x.d.gimnasio ?? 0,
      v2: (x.d.sesiones ?? 0) - (x.d.gimnasio ?? 0), destaca: i === semanas.length - 1 && tipo === "semana",
      info: `Semana del ${fecha(x.desde)}: ${x.d.sesiones ?? 0} sesiones (${x.d.gimnasio ?? 0} de gimnasio), ${num(x.d.minutos)} min` +
        (x.d.planeadas ? ` · ${x.d.cumplidas} de ${x.d.planeadas} planeadas` : "") })),
      { W, apilada: true, ref: [{ v: M.deporte?.meta_gimnasio ?? M.deporte?.meta_gimnasio_semana, txt: "meta gimnasio" }],
        resumen: "Toca una semana para ver el detalle." });
    return marco("Sesiones por semana", b.svg, def.mira, b.lectura, [["Gimnasio", "a"], ["Otras", "b"]]);
  }
  if (def.k === "pasos") {
    if (porDia) {
      const serie = lista(M.pasos?.serie), m4 = M.indicadores?.pasos_media?.media4;
      const b = barras(serie.map(p => ({ etiqueta: diaLetra(p.fecha), v: p.pasos,
        info: `${d1(p.fecha)}: ${esNum(p.pasos) ? num(p.pasos) + " pasos" : "sin datos"}` +
          (lista(dias.find(x => x.fecha === p.fecha)?.eventos).length ? " · " + dias.find(x => x.fecha === p.fecha).eventos.slice(0, 3).map(e => e.titulo).join(", ") : "") })),
        { W, formato: v => v >= 1000 ? num(v / 1000, v % 1000 ? 1 : 0) + "k" : num(v), ref: [{ v: m4, txt: "media 4 sem." }], resumen: "Toca un día para ver sus pasos y su agenda." });
      return marco("Pasos de cada día", b.svg, def.mira, b.lectura);
    }
    const ms = lista(M.pasos?.meses), mismo = M.pasos?.mismo_mes_año_anterior?.mes;
    const b = barras(ms.map((x, i) => ({ etiqueta: MESES[+x.mes.slice(5) - 1].slice(0, 1).toUpperCase(), v: x.media,
      color: i === ms.length - 1 ? C.a : x.mes === mismo ? C.b : "var(--linea-fuerte)", destaca: i === ms.length - 1 || x.mes === mismo,
      info: `${mayus(nombreMes(x.mes))}: ${num(x.media)} pasos/día (${x.dias} días)` })),
      { W, formato: v => num(v / 1000, 1) + "k", resumen: "Toca un mes para ver su media." });
    return marco("Pasos al día, últimos 13 meses", b.svg,
      "la barra naranja es este mes; la azul, el mismo mes del año pasado. Compararlos quita el efecto de la estación (frío, luz, vacaciones).", b.lectura,
      [["Este mes", "a"], ["Hace un año", "b"]]);
  }
  if (def.k === "energia") {
    const xs = porDia ?? dias;
    const b = barras(xs.map(x => ({ etiqueta: porDia ? diaLetra(x.fecha) : String(+x.fecha.slice(8)), v: x.kcal, tenue: !x.completo, marca: x.gasto,
      info: `${d1(x.fecha)}: ${x.kcal ? num(x.kcal) + " kcal comidas" : "sin comidas"} · gasto ${num(x.gasto)} kcal` +
        (esNum(x.deficit) ? ` · déficit ${conSigno(x.deficit)}` : x.kcal ? " · día incompleto, no cuenta" : "") +
        (x.alcohol_g ? ` · alcohol ${num(x.alcohol_g)} g` : "") })),
      { W, formato: v => v ? num(v / 1000, 1) + "k" : "0", resumen: "Toca un día. Las barras claras son días con comidas sin completar." });
    return marco("Comido frente a gastado", b.svg, def.mira, b.lectura, [["Comido", "a"], ["Gastado (estimado)", "raya"], ["Día incompleto", "a tenue"]]);
  }
  if (def.k === "proteina") {
    const xs = porDia ?? dias;
    const b = barras(xs.map(x => {
      const kg = x.media7 ?? x.peso ?? M.peso?.media7_fin, v = x.completo && esNum(x.proteina_g) && esNum(kg) ? x.proteina_g / kg : null;
      return { etiqueta: porDia ? diaLetra(x.fecha) : String(+x.fecha.slice(8)), v,
        info: `${d1(x.fecha)}: ${esNum(v) ? num(x.proteina_g) + " g · " + num(v, 2) + " g/kg" : "día sin completar"}` };
    }), { W, formato: v => num(v, 1), ref: [{ v: 1.6, txt: "1,6 g/kg" }], resumen: "Toca un día para ver sus gramos." });
    return marco("Proteína por kilo", b.svg, def.mira, b.lectura);
  }
  const xs = porDia ?? dias, al = Object.fromEntries(lista(M.alcohol?.detalle).map(a => [a.fecha, a]));
  const b = barras(xs.map(x => { const a = al[x.fecha]; return { etiqueta: porDia ? diaLetra(x.fecha) : String(+x.fecha.slice(8)),
    v: a?.copas ?? 0, color: "var(--suave)",
    info: a ? `${d1(x.fecha)}: ${num(a.copas, 1)} copas (${num(a.gramos)} g, ${num(a.kcal)} kcal)` +
      (esNum(a.cambio) ? ` · al día siguiente ${conSigno(a.cambio, 1)} kg en la báscula` : " · sin peso al día siguiente") : `${d1(x.fecha)}: sin alcohol` }; }),
    { W, formato: v => num(v, 1), resumen: "Toca un día para ver el detalle." });
  return marco("Copas por día", b.svg, def.mira, b.lectura);
}

function pintarMes(caja, M, R, W) {
  // Composición corporal
  const meds = lista(M.composicion?.mediciones), s = seccion(caja, "Composición corporal", "báscula");
  const ch = M.composicion?.cambio ?? {};
  const fichas = el("div", "cifras");
  for (const [k, nombre, u, d] of [["grasa_pct", "Grasa", " %", 1], ["grasa_kg", "Grasa", " kg", 1], ["musculo_kg", "Músculo", " kg", 1]]) {
    const f = el("div"), v = meds.filter(m => esNum(m[k])).at(-1)?.[k];
    f.append(el("small", "", nombre), el("strong", "", esNum(v) ? num(v, d) + u : "–"), el("span", "", esNum(ch[k]) ? conSigno(ch[k], d) + u + " en el mes" : "sin cambio medible"));
    fichas.append(f);
  }
  s.append(fichas);
  const g = lineaSimple(meds.filter(m => esNum(m.grasa_pct)).map(m => ({ f: m.fecha, h: m.hora, v: m.grasa_pct, captura: m.fuente !== "salud" })), " %", { W });
  s.append(marco("Grasa corporal (%)", g.svg, "la tendencia, no cada punto: la báscula de bioimpedancia varía ±1-2 % con el agua del cuerpo. Los puntos rellenos son capturas de la báscula; los huecos, datos de Salud.", g.lectura));
  const mu = lineaSimple(meds.filter(m => esNum(m.musculo_kg)).map(m => ({ f: m.fecha, h: m.hora, v: m.musculo_kg, captura: m.fuente !== "salud" })), " kg", { W });
  s.append(marco("Masa muscular (kg)", mu.svg, "con déficit, el objetivo es que esta línea se quede plana mientras baja la grasa: eso es perder grasa y no músculo.", mu.lectura));
  if (texto(R.notas?.composicion)) s.append(el("p", "rv-nota", R.notas.composicion));

  // Deporte por semanas: planeado frente a hecho
  const sd = seccion(caja, "Deporte por semanas", "planeado y hecho");
  const sem = lista(M.deporte?.semanas).filter(x => x.dias);
  const b = barras(sem.map(x => ({ etiqueta: fecha(x.desde, { day: "numeric", month: "numeric" }), v: x.planeadas, v2: x.cumplidas + ((x.sesiones ?? 0) - (x.cumplidas ?? 0)),
    info: `Semana del ${fecha(x.desde)}: ${x.planeadas} planeadas, ${x.cumplidas} cumplidas · ${x.sesiones} sesiones en total (${x.gimnasio} de gimnasio)` })),
    { W, ref: [{ v: M.deporte?.meta_gimnasio_semana, txt: "meta gimnasio" }], colores: [C.b, C.a], resumen: "Toca una semana para ver el detalle." });
  sd.append(marco(null, b.svg, "la barra azul es lo que estaba en el calendario y la naranja lo que hiciste. Si la naranja es más baja, lo que falla es cumplir el plan; si las dos están en cero, lo que falta es planear.", b.lectura,
    [["Planeadas", "b"], ["Hechas", "a"]]));
  // Comida
  const sc = seccion(caja, "Comida", "lo apuntado");
  const cf = el("div", "cifras"), co = M.comida ?? {};
  for (const [nombre, v, sub] of [["Días apuntados", `${co.dias_apuntados ?? 0}/${M.cobertura?.dias ?? 0}`, `${co.dias_completos ?? 0} completos`],
    ["Kcal/día", num(co.kcal_media), "en días completos"], ["Proteína", num(co.proteina_g_kg, 1) + " g/kg", num(co.proteina_g_dia) + " g/día"],
    ["Alcohol", num(M.alcohol?.copas, 1) + " copas", `${num(M.alcohol?.kcal)} kcal`]]) {
    const f = el("div"); f.append(el("small", "", nombre), el("strong", "", v), el("span", "", sub)); cf.append(f);
  }
  sc.append(cf);
  if (texto(R.notas?.comida)) sc.append(el("p", "rv-nota", R.notas.comida));
  // Cambios frente al mes anterior y metas
  if (lista(R.cambios).length) {
    const s2 = seccion(caja, "Qué ha cambiado", "frente al mes anterior"), ul = el("ul", "rv-lista");
    for (const c of R.cambios) if (texto(c)) ul.append(el("li", "", c));
    s2.append(ul);
  }
  if (R.metas && Object.values(R.metas).some(texto)) {
    const s3 = seccion(caja, "Metas del mes que viene"), dl = el("dl", "rv-metas");
    for (const [k, n] of [["peso", "Peso"], ["deporte", "Deporte"], ["habitos", "Hábitos"]]) if (texto(R.metas[k])) dl.append(el("dt", "", n), el("dd", "", R.metas[k]));
    s3.append(dl);
  }
}

function pintarHabitos(caja, M, R, tipo) {
  const hs = lista(M.habitos); if (!hs.length && !R.habitos) return;
  const s = seccion(caja, "Hábitos", tipo === "semana" ? "esta semana" : "este mes");
  const t = el("div", "rv-habitos");
  for (const h of hs) {
    const f = el("div", "rv-habito"), cab = el("div", "rv-cab-habito");
    const n = el("strong", "", h.nombre);
    if (h.nivel) n.append(el("em", "", " nivel " + h.nivel + "/" + h.niveles));
    cab.append(n, el("b", "", h.exigibles ? `${h.hechos} de ${h.exigibles}` : h.desde ? "empieza el " + fecha(h.desde, { weekday: "short", day: "numeric" }) : "–"));
    const cel = el("div", "rv-celdas" + (tipo === "mes" ? " mes" : ""));
    cel.style.setProperty("--n", h.dias.length);
    lista(h.dias).forEach((v, i) => {
      const c = el("i", v === true ? "si" : v === false ? "no" : "na");
      c.title = fecha(sumar(M.desde, i), { weekday: "short", day: "numeric" }) + (v === true ? ": hecho" : v === false ? ": no" : "");
      cel.append(c);
    });
    const pie = el("div", "rv-pie-habito");
    pie.append(h.consolidado ? "Consolidado" : esNum(h.pct_21) ? `${Math.round(h.pct_21 * 100)} % en 21 días` : "Sin datos aún");
    if (h.nivel && h.pide) pie.append(" · pide: " + h.pide);
    f.append(cab, cel, pie); t.append(f);
  }
  if (tipo === "semana") {
    const l = el("div", "rv-dias-letra");
    for (let i = 0; i < 7; i++) l.append(el("span", "", "LMXJVSD"[i]));
    t.prepend(l);
  }
  s.append(t);
  const H = R.habitos ?? {};
  if (texto(H.texto)) s.append(el("p", "rv-nota", H.texto));
  const p = H.propuesta;
  if (p && p.tipo) {
    const c = el("div", "rv-propuesta");
    const titulo = p.tipo === "nuevo" ? "Hábito nuevo" : p.tipo === "subir_nivel" ? "Subir de nivel" : "Esta semana, sin cambios";
    c.append(el("small", "", titulo));
    if (p.tipo !== "mantener") c.append(el("strong", "", (p.nombre ?? p.habito ?? "") + (p.nivel ? " · nivel " + p.nivel : "")));
    const dl = el("dl");
    for (const [k, n] of [["pide", "Pide"], ["minimo", "Versión mínima"], ["ancla", "Cuándo"], ["porque", "Por qué"]])
      if (texto(p[k])) dl.append(el("dt", "", n), el("dd", "", p[k]));
    if (texto(p.desde)) dl.append(el("dt", "", "Desde"), el("dd", "", mayus(fecha(p.desde, { weekday: "long", day: "numeric", month: "long" }))));
    c.append(dl); s.append(c);
  }
}
const sumar = (f, n) => { const d = new Date(f + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function pintarTexto(caja, R, o) {
  const I = R.idea, E = R.experimento, A = R.experimento_anterior;
  if (!I && !E && !A) return;
  const s = seccion(caja, "Aprender", "idea y experimento");
  if (A && (texto(A.que) || texto(A.texto))) {
    const d = el("div", "rv-tarjeta rv-anterior");
    const est = { si: "Hecho", parcial: "A medias", no: "No se hizo" }[A.hecho] ?? "", fun = { si: "funcionó", no: "no funcionó", no_se: "aún no se sabe" }[A.funciono] ?? "";
    d.append(el("small", "", "El experimento anterior" + (est ? " · " + est : "") + (fun ? " · " + fun : "")));
    if (texto(A.que)) d.append(el("strong", "", A.que));
    if (texto(A.texto)) d.append(el("p", "", A.texto));
    s.append(d);
  }
  if (I && (texto(I.titulo) || texto(I.texto))) {
    const d = el("div", "rv-tarjeta rv-idea");
    d.append(el("small", "", "La idea"), el("strong", "", I.titulo ?? ""), el("p", "", I.texto ?? ""));
    const f = fuentes(I.fuentes); if (f) d.append(f);
    s.append(d);
  }
  if (E && texto(E.que)) {
    const d = el("div", "rv-tarjeta rv-experimento");
    d.append(el("small", "", o.tipo === "mes" ? "El experimento del mes" : "El experimento de la semana"), el("strong", "", E.que));
    if (texto(E.como_se_mide)) d.append(el("p", "", "Cómo sabremos si funciona: " + E.como_se_mide));
    s.append(d);
  }
}

// ---- Plan de la semana que viene: agenda real y huecos propuestos

const TIPOS = { gimnasio: "Gimnasio", padel: "Pádel", correr: "Correr", caminar: "Paseo rápido", funcional: "Fuerza en casa", descanso: "Descanso" };
const aMin = h => { const m = /^(\d{1,2}):(\d{2})/.exec(h ?? ""); return m ? +m[1] * 60 + +m[2] : null; };

function pintarPlan(caja, M, R, o, W) {
  const sig = M.siguiente; if (!sig) return;
  const s = seccion(caja, "Plan de la semana que viene", `${fecha(sig.desde, { day: "numeric" })} – ${fecha(sig.hasta, { day: "numeric", month: "short" })}`);
  if (texto(R.plan?.texto)) s.append(el("p", "rv-nota", R.plan.texto));
  const ids = new Set(lista(R.plan?.huecos)), props = lista(o.propuestas).filter(p => ids.has(p.id) || (p.id ?? "").startsWith(sig.periodo + "-"));
  const pendientes = props.filter(p => p.estado === "propuesto" && p.tipo !== "descanso");
  if (pendientes.length > 1) {
    const b = el("button", "rv-aceptar todos", `Aceptar los ${pendientes.length} huecos`); b.type = "button";
    b.onclick = () => aceptar(b, pendientes.map(p => p.id), o);
    s.append(b);
  }
  const I0 = 7 * 60, I1 = 23 * 60, pos = m => (100 * (Math.min(Math.max(m, I0), I1) - I0) / (I1 - I0)).toFixed(2) + "%";
  const cal = el("div", "rv-calendario");
  const reg = el("div", "rv-regla"); reg.append(el("span"));
  const r = el("div"); for (const h of [7, 11, 15, 19, 23]) { const x = el("span", "", h + "h"); x.style.left = pos(h * 60); r.append(x); }
  reg.append(r); cal.append(reg);
  for (const d of lista(sig.dias)) {
    const fila = el("div", "rv-dia" + (d.agenda_conocida ? "" : " sin-agenda"));
    const nom = el("div", "rv-nom"); nom.append(el("b", "", mayus(d.dia)), el("span", "", String(+d.fecha.slice(8))));
    const barra = el("div", "rv-barra");
    for (const e of lista(d.eventos)) {
      const a = aMin(e.inicio), b = aMin(e.fin);
      if (a == null) continue;
      const blq = el("i", "ocupado" + (e.tipo ? " deporte" : "")); blq.style.left = pos(a); blq.style.width = `calc(${pos(b ?? a + 60)} - ${pos(a)})`;
      blq.title = `${e.inicio}${e.fin ? "–" + e.fin : ""} ${e.titulo}`; barra.append(blq);
    }
    const delDia = props.filter(p => p.fecha === d.fecha);
    for (const p of delDia) {
      const a = aMin(p.inicio), b = aMin(p.fin); if (a == null) continue;
      const blq = el("i", "propuesta " + (p.estado ?? "")); blq.style.left = pos(a); blq.style.width = `calc(${pos(b ?? a + 60)} - ${pos(a)})`;
      barra.append(blq);
    }
    if (!d.agenda_conocida) barra.append(el("em", "", "agenda aún no disponible"));
    fila.append(nom, barra);
    const det = el("div", "rv-det");
    const todo = lista(d.todo_el_dia);
    if (todo.length) det.append(el("p", "rv-todo", "Todo el día: " + todo.join(", ")));
    if (d.vispera_tarde) det.append(el("p", "rv-todo", "La víspera acaba tarde: " + d.vispera_tarde));
    for (const p of delDia) {
      const q = el("div", "rv-hueco " + (p.tipo === "descanso" ? "descanso" : p.estado ?? ""));
      const txt = el("div");
      txt.append(el("strong", "", `${p.inicio ? p.inicio + "–" + p.fin + " · " : ""}${p.titulo || TIPOS[p.tipo] || p.tipo}`));
      if (texto(p.motivo)) txt.append(el("span", "", p.motivo));
      q.append(txt);
      if (p.tipo === "descanso") q.append(el("em", "rv-estado", "descanso"));
      else if (p.estado === "propuesto") {
        const b = el("button", "rv-aceptar", "Aceptar"); b.type = "button"; b.onclick = () => aceptar(b, [p.id], o); q.append(b);
      } else q.append(el("em", "rv-estado " + p.estado, { aceptado: "Aceptado · Instinct lo pasará al calendario", en_calendario: "En el calendario", descartado: "Descartado" }[p.estado] ?? p.estado));
      det.append(q);
    }
    if (det.childElementCount) fila.append(det);
    cal.append(fila);
  }
  s.append(cal);
  const ley = el("div", "rv-leyenda");
  for (const [t, c] of [["Ocupado", "ocupado"], ["Deporte en agenda", "ocupado deporte"], ["Hueco propuesto", "propuesta"], ["Aceptado", "propuesta aceptado"]]) { const x = el("span"); x.append(el("i", c), t); ley.append(x); }
  s.append(ley);
  if (!props.length) s.append(el("p", "vacio", "Esta revisión no propone huecos."));
}

async function aceptar(boton, ids, o) {
  for (const b of document.querySelectorAll(".rv-aceptar")) b.disabled = true;
  boton.textContent = "Guardando…";
  try { await o.aceptar(ids); }
  catch (e) {
    boton.textContent = "No se ha guardado: " + (e.status ? e.message : "sin conexión");
    for (const b of document.querySelectorAll(".rv-aceptar")) b.disabled = false;
  }
}

/** Texto nuevo de propuestas.json con esos huecos aceptados (solo los que estaban `propuesto`). */
export function conAceptadas(textoJSON, ids, ahora) {
  const l = JSON.parse(textoJSON || "[]");
  if (!Array.isArray(l)) throw new Error("propuestas.json no es una lista");
  let cambia = false;
  for (const p of l) if (ids.includes(p?.id) && p.estado === "propuesto") { p.estado = "aceptado"; p.aceptado = ahora; cambia = true; }
  return cambia ? JSON.stringify(l, null, 2) + "\n" : textoJSON;
}
