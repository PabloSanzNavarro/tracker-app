// Pestaña Comida: calorías y macros de lo que Instinct apunta en datos/comidas/.
// Solo enseña datos; no valora lo que se come.
import { sumarDias } from "./estado.js?v=7100ce2";
import { calcularNutricion } from "./nutricion.js?v=7100ce2";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, atr, txt) => { const e = document.createElementNS(NS, tag); for (const k in atr) e.setAttribute(k, atr[k]); if (txt != null) e.textContent = txt; return e; };
const n0 = v => Math.round(v).toLocaleString("es-ES");
const n1 = v => v.toLocaleString("es-ES", { maximumFractionDigits: 1 });

// Energía de cada macro (la fibra cuenta con los carbohidratos).
const MACROS = [
  { k: "proteina_g", nombre: "Proteína", color: "#b5594a", kcal: t => 4 * t.proteina_g },
  { k: "carbohidratos_g", nombre: "Carbohidratos", color: "#d9a441", kcal: t => 4 * t.carbohidratos_g + 2 * t.fibra_g },
  { k: "grasa_g", nombre: "Grasa", color: "#6b8f5e", kcal: t => 9 * t.grasa_g },
  { k: "alcohol_g", nombre: "Alcohol", color: "#8a7a6c", kcal: t => 7 * t.alcohol_g },
];
const MOMENTO = { desayuno: "Desayuno", media_manana: "Media mañana", comida: "Comida", merienda: "Merienda", cena: "Cena", picoteo: "Picoteo" };
const FUENTE = { etiqueta: "etiqueta", tabla: "tabla", estimacion: "estimado" };

/** Reparto de las kcal del total entre macros, escalado para que sume exactamente total.kcal. */
function reparto(t) {
  const partes = MACROS.map(m => Math.max(0, m.kcal(t))), suma = partes.reduce((a, b) => a + b, 0);
  return MACROS.map((m, i) => ({ ...m, gramos: t[m.k], kcal: suma ? t.kcal * partes[i] / suma : 0, pct: suma ? partes[i] / suma : 0 }));
}

const fechaLarga = f => new Date(f + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const diaCorto = f => new Date(f + "T12:00:00").toLocaleDateString("es-ES", { weekday: "narrow" });

let dia = null;   // día que se está viendo

function barraMacros(rep) {
  const b = el("div", "macro-barra");
  for (const m of rep) if (m.pct > 0) { const i = el("i"); i.style.width = 100 * m.pct + "%"; i.style.background = m.color; i.title = m.nombre; b.append(i); }
  return b;
}

function grafico(dias, hoy, gasto, gastoDe, alElegir, W) {
  const N = 14, H = Math.round(Math.min(240, Math.max(170, W * 0.45))), m = { i: 44, d: 6, a: 12, b: 26 };
  const fechas = Array.from({ length: N }, (_, i) => sumarDias(hoy, i - N + 1));
  const real = Object.fromEntries(fechas.map(f => [f, gastoDe?.(f)]).filter(([, g]) => g?.con_datos).map(([f, g]) => [f, g.total]));
  const tope = Math.max(1000, ...fechas.map(f => dias[f]?.total.kcal ?? 0), gasto ? gasto[1] : 0, ...Object.values(real)) * 1.08;
  const y = v => m.a + (H - m.a - m.b) * (1 - v / tope), paso = (W - m.i - m.d) / N, ancho = Math.max(6, paso * 0.62);
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Calorías de los últimos 14 días" });
  if (gasto) {
    svg.append(sv("rect", { x: m.i, width: W - m.i - m.d, y: y(gasto[1]), height: y(gasto[0]) - y(gasto[1]), fill: "#d9cfbd", opacity: .45 }));
  }
  const marcas = [0, 1000, 2000, 3000, 4000].filter(v => v <= tope);
  for (const v of marcas) svg.append(
    sv("line", { x1: m.i, x2: W - m.d, y1: y(v), y2: y(v), stroke: "#d9cfbd", "stroke-width": 1 }),
    sv("text", { x: m.i - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, fill: "#6f6155" }, n0(v)));
  fechas.forEach((f, i) => {
    const x = m.i + paso * i + (paso - ancho) / 2, d = dias[f], g = sv("g", { cursor: "pointer" });
    g.append(sv("rect", { x: m.i + paso * i, y: m.a, width: paso, height: H - m.a - m.b, fill: "transparent" }));
    if (d && d.total.kcal > 0) {
      let base = 0;
      for (const p of reparto(d.total)) {
        if (!p.kcal) continue;
        g.append(sv("rect", { x, width: ancho, y: y(base + p.kcal), height: y(base) - y(base + p.kcal), fill: p.color }));
        base += p.kcal;
      }
      g.append(sv("title", {}, `${f}: ${n0(d.total.kcal)} kcal`));
    } else {
      g.append(sv("rect", { x, width: ancho, y: y(0) - 3, height: 3, fill: "#d9cfbd" }), sv("title", {}, `${f}: sin registro`));
    }
    if (real[f]) g.append(sv("line", { x1: x - 3, x2: x + ancho + 3, y1: y(real[f]), y2: y(real[f]), stroke: "#2a1d18", "stroke-width": 3 }),
      sv("title", {}, `${f}: gasto estimado ${n0(real[f])} kcal`));
    if (f === dia) g.append(sv("rect", { x: x - 2.5, y: m.a - 2, width: ancho + 5, height: H - m.a - m.b + 4, fill: "none", stroke: "#2a1d18", "stroke-width": 2 }));
    g.append(sv("text", { x: x + ancho / 2, y: H - 8, "text-anchor": "middle", "font-size": 11, fill: f === dia ? "#2a1d18" : "#6f6155",
      "font-weight": f === dia ? 700 : 400 }, diaCorto(f)));
    g.addEventListener("click", () => alElegir(f));
    svg.append(g);
  });
  return svg;
}

/**
 * datos: { comidas, alimentos, productos } · null mientras carga · { error } si falla.
 * ctx: { hoy, cuerpo: {peso, basal, actividad} | null, repintar }
 */
export function pintarComida(caja, datos, ctx) {
  caja.replaceChildren();
  if (!datos) { caja.append(el("p", "vacio", "Cargando comidas…")); return; }
  if (datos.error) { caja.append(el("p", "vacio", datos.error)); return; }
  const { dias, revisar } = calcularNutricion(datos.comidas, datos.alimentos, datos.productos);
  const { hoy } = ctx, fechas = Object.keys(dias).sort();
  if (!fechas.length) {
    caja.append(el("p", "vacio", "Aún no hay comidas. Cuéntale a Instinct lo que comes (o mándale la foto de la etiqueta si es un producto envasado) y aparecerá aquí."));
    return;
  }
  const primero = fechas[0] < hoy ? fechas[0] : hoy;
  if (!dia || dia > hoy || dia < primero) dia = hoy;
  const ir = f => { dia = f; pintarComida(caja, datos, ctx); };
  const d = dias[dia], peso = ctx.cuerpo?.peso, basal = ctx.cuerpo?.basal;
  const gasto = basal ? [basal * 1.2, basal * 1.55] : null;

  // ---- Portada del día
  const portada = el("section", "comida-portada"), nav = el("div", "dias-nav");
  const atras = el("button", "", "‹"), alante = el("button", "", "›");
  atras.type = alante.type = "button"; atras.setAttribute("aria-label", "Día anterior"); alante.setAttribute("aria-label", "Día siguiente");
  atras.disabled = dia <= primero; alante.disabled = dia >= hoy;
  atras.onclick = () => ir(sumarDias(dia, -1)); alante.onclick = () => ir(sumarDias(dia, 1));
  const centro = el("div"), cifra = el("strong");
  centro.append(el("small", "", (dia === hoy ? "Hoy · " : "") + fechaLarga(dia)));
  if (d) cifra.append(n0(d.total.kcal), el("span", "", " kcal")); else cifra.append(el("span", "", "Sin comidas apuntadas"));
  centro.append(cifra); nav.append(atras, centro, alante); portada.append(nav);
  if (d && d.total.kcal > 0) {
    const rep = reparto(d.total);
    portada.append(barraMacros(rep));
    const ley = el("div", "leyenda-macros");
    for (const m of rep) if (m.gramos > 0 || m.k !== "alcohol_g") {
      const s = el("span"), c = el("i"); c.style.background = m.color;
      s.append(c, `${m.nombre} ${n0(m.pct * 100)} %`); ley.append(s);
    }
    portada.append(ley);
    const pf = Math.round(100 * d.fiable / d.total.kcal);
    portada.append(el("p", "", `${d.comidas.length} ${d.comidas.length === 1 ? "comida" : "comidas"} · ${pf} % de las kcal con datos de etiqueta o tabla`));
  }
  caja.append(portada);

  if (d) {
    const t = d.total, fichas = el("div", "fichas");
    const ficha = (nombre, valor, unidad, pie) => {
      const c = el("div"), v = el("strong"); v.append(valor, el("span", "", unidad));
      c.append(el("small", "", nombre), v, el("div", "pie-ficha", pie ?? "")); fichas.append(c);
    };
    ficha("Proteína", n0(t.proteina_g), " g", peso ? n1(t.proteina_g / peso) + " g por kg de peso" : "");
    ficha("Carbohidratos", n0(t.carbohidratos_g), " g", t.azucares_g ? "de etiqueta: " + n0(t.azucares_g) + " g de azúcares" : "");
    ficha("Grasa", n0(t.grasa_g), " g", t.saturadas_g ? "de etiqueta: " + n0(t.saturadas_g) + " g saturada" : "");
    ficha("Fibra", n0(t.fibra_g), " g");
    if (t.alcohol_g > 0) ficha("Alcohol", n0(t.alcohol_g), " g", n0(7 * t.alcohol_g) + " kcal");
    caja.append(el("h2", "", "MACROS DEL DÍA"), fichas);
    const gd = ctx.gastoDe?.(dia);
    if (gd?.con_datos) caja.append(el("p", "nota", `Gasto estimado de este día, con su actividad: ≈ ${n0(gd.total)} kcal (pestaña Actividad).`));
    else if (gasto) caja.append(el("p", "nota", `Gasto estimado: ${n0(gasto[0])} kcal en un día sedentario y ${n0(gasto[1])} kcal en uno con ejercicio moderado (pestaña Salud).`));

    // ---- Comidas
    caja.append(el("h2", "", "LO QUE HAS COMIDO"));
    const lista = el("ul", "comidas");
    for (const c of d.comidas) {
      const li = el("li"), cab = el("div", "cab-comida");
      cab.append(el("time", "", c.hora || "–"), el("strong", "", MOMENTO[c.momento] ?? c.momento ?? "Comida"), el("b", "", n0(c.total.kcal) + " kcal"));
      li.append(cab);
      if (c.descripcion) li.append(el("p", "desc", c.descripcion));
      const ul = el("ul", "alimentos");
      for (const a of c.alimentos) {
        const fila = el("li"), izq = el("div");
        izq.append(el("span", "", a.nombre + (a.gramos != null ? " · " + n0(a.gramos) + " g" : "")));
        izq.append(el("small", "", a.valores
          ? `P ${n1(a.valores.proteina_g ?? 0)} · HC ${n1(a.valores.carbohidratos_g ?? 0)} · G ${n1(a.valores.grasa_g ?? 0)}`
          : "sin datos: no suma"));
        const der = el("div"); der.append(el("b", "", a.valores ? n0(a.valores.kcal) : "–"));
        if (a.fuente) der.append(el("em", "fuente " + a.fuente, FUENTE[a.fuente]));
        fila.append(izq, der); ul.append(fila);
      }
      li.append(ul); lista.append(li);
    }
    caja.append(lista);
  }

  // ---- Últimos 14 días
  caja.append(el("h2", "", "ÚLTIMOS 14 DÍAS"));
  const marco = el("div", "grafico grafico-comida");
  caja.append(marco);
  const leyenda = el("div", "leyenda-macros");
  for (const m of MACROS.slice(0, 3)) { const s = el("span"), c = el("i"); c.style.background = m.color; s.append(c, m.nombre); leyenda.append(s); }
  if (gasto) { const s = el("span"), c = el("i", "banda"); s.append(c, "Gasto sedentario–moderado"); leyenda.append(s); }
  if (ctx.gastoDe) { const s = el("span"), c = el("i", "linea"); s.append(c, "Gasto del día"); leyenda.append(s); }
  caja.append(leyenda);
  marco.append(grafico(dias, hoy, gasto, ctx.gastoDe, ir, Math.max(280, caja.clientWidth - 28 || 320)));

  // ---- Media de la semana (días con registro)
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(dia, -i)).filter(f => dias[f] && dias[f].total.kcal > 0);
  if (semana.length) {
    const media = k => semana.reduce((s, f) => s + dias[f].total[k], 0) / semana.length;
    caja.append(el("h2", "", "MEDIA DE 7 DÍAS"));
    const fichas = el("div", "fichas");
    const ficha = (nombre, valor, unidad, pie) => {
      const c = el("div"), v = el("strong"); v.append(valor, el("span", "", unidad));
      c.append(el("small", "", nombre), v, el("div", "pie-ficha", pie ?? "")); fichas.append(c);
    };
    // Con actividad apuntada, el gasto medio de esos mismos días; si no, la franja sedentario–moderado.
    const reales = semana.map(f => ctx.gastoDe?.(f)).filter(g => g?.con_datos);
    ficha("Calorías", n0(media("kcal")), " kcal", reales.length === semana.length
      ? "gasto estimado ≈ " + n0(reales.reduce((s, g) => s + g.total, 0) / reales.length)
      : gasto ? "gasto estimado " + n0(gasto[0]) + "–" + n0(gasto[1]) : "");
    ficha("Proteína", n0(media("proteina_g")), " g", peso ? n1(media("proteina_g") / peso) + " g/kg" : "");
    ficha("Carbohidratos", n0(media("carbohidratos_g")), " g");
    ficha("Grasa", n0(media("grasa_g")), " g");
    caja.append(fichas, el("p", "nota", `Media de los ${semana.length} ${semana.length === 1 ? "día" : "días"} con comidas apuntadas de la semana que acaba el ${fechaLarga(dia)}. Los días sin apuntar no cuentan.`));
  }

  // ---- Avisos de datos
  const desde = sumarDias(hoy, -13), avisos = revisar.filter(r => !r.fecha || r.fecha >= desde);
  if (avisos.length) {
    const det = el("details", "plegable"), ul = el("ul", "objetivos");
    det.append(el("summary", "", `Datos a revisar (${avisos.length})`));
    for (const r of avisos) {
      const li = el("li"); li.append(el("span", "", r.motivo), el("small", "", [r.fecha, r.hora, r.alimento].filter(Boolean).join(" · ")));
      ul.append(li);
    }
    det.append(ul, el("p", "nota", "Díselo a Instinct para que lo corrija. Lo que no tiene datos no suma."));
    caja.append(det);
  }

  const como = el("details", "plegable");
  como.append(el("summary", "", "Cómo se calcula"),
    el("p", "nota", "Instinct apunta cada alimento con sus gramos y de dónde salen sus valores: la etiqueta del producto (lo más fiable), la tabla de referencia del Tracker o, si no está en ninguna, su estimación. La app hace las cuentas."),
    el("p", "nota", "El error grande suele estar en las cantidades, no en los valores por 100 g: pesar de vez en cuando lo que más comes, o decir «plato grande» o «pequeño», afina mucho. El aceite de cocinar y aliñar se apunta aparte."),
    el("p", "nota", "La energía de cada macro usa la regla de las etiquetas europeas: 4 kcal por gramo de proteína o carbohidrato, 9 de grasa, 7 de alcohol y 2 de fibra."));
  caja.append(como);
}

/** kcal y comidas de un día, para la tarjeta del hábito. */
export function resumenDia(datos, fecha) {
  if (!datos || datos.error) return null;
  const d = calcularNutricion(datos.comidas.filter(c => c?.fecha === fecha), datos.alimentos, datos.productos).dias[fecha];
  return d ? { kcal: d.total.kcal, comidas: d.comidas.length } : null;
}
