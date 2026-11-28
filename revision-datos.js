// Cifras de la revisión semanal y mensual. Lo usan la web app (modo demo) y
// scripts/revision.mjs, que deja el resultado en datos/revisiones/metricas/. El
// análisis (el texto) lo escribe Claude Code a partir de estas cifras: aquí no hay
// texto ni valoraciones, solo cuentas, siempre iguales.
//
// Reglas de cálculo:
// - Peso del día: la captura de la báscula manda sobre `fuente: salud`; si hay varias,
//   la más temprana (la más parecida a «en ayunas»).
// - Media móvil de 7 días: media de los pesos de ese día y los 6 anteriores (con 3 o más).
// - Ritmo real: pendiente de la recta de regresión de los pesos de los últimos 14 días
//   (con 5 o más pesos que abarquen 7 días o más), en kg/semana.
// - Día de comidas completo: tiene comida y cena, o 3 comidas o más. El déficit solo se
//   calcula en días completos, con el gasto de ese día y el peso de ese día.
// - Pasos: el día de hoy, si entra en el periodo, no cuenta en la media (está a medias).
// - Hábitos: se cuentan desde su primer registro (o su `desde`), no antes.
// - Alcohol: 1 copa = 10 g de alcohol puro (unidad de bebida estándar en España); 7 kcal/g.
// - Planeado frente a hecho: eventos deportivos de datos/agenda/ (con `tipo`). Uno está
//   hecho si su `estado` es `hecho` o si hay una sesión con su `agenda_id` o del mismo
//   tipo ese mismo día.

import { calcular, nivelDe, parsearCSV, sumarDias } from "./estado.js?v=7100ce2";
import { calcularNutricion } from "./nutricion.js?v=7100ce2";
import { calcularActividad, gastoDia, parsearPasos } from "./gasto.js?v=7100ce2";
import { basalDe } from "./salud.js?v=7100ce2";

const esNum = v => typeof v === "number" && isFinite(v);
const r0 = v => esNum(v) ? Math.round(v) : null;
const r1 = v => esNum(v) ? Math.round(v * 10) / 10 : null;
const r2 = v => esNum(v) ? Math.round(v * 100) / 100 : null;
const media = vs => { const x = vs.filter(esNum); return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null; };
const suma = vs => vs.filter(esNum).reduce((s, v) => s + v, 0);
const fechaValida = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
export const diasEntre = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const rango = (a, b) => { const out = []; for (let f = a; f <= b; f = sumarDias(f, 1)) out.push(f); return out; };
const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const diaSemana = f => (new Date(f + "T00:00:00Z").getUTCDay() + 6) % 7;      // 0 = lunes
const aMin = h => { const m = /^(\d{1,2}):(\d{2})/.exec(h ?? ""); return m ? +m[1] * 60 + +m[2] : null; };
const aHora = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

// ---- Periodos

/** Semana ISO de una fecha: "AAAA-Www" (la semana va de lunes a domingo). */
export function semanaISO(f) {
  const d = new Date(f + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - diaSemana(f) + 3);                // el jueves de esa semana
  const año = d.getUTCFullYear(), jueves1 = new Date(Date.UTC(año, 0, 4));
  jueves1.setUTCDate(4 - ((jueves1.getUTCDay() + 6) % 7) + 3);
  return año + "-W" + String(1 + Math.round((d - jueves1) / (7 * 864e5))).padStart(2, "0");
}

/** {tipo, desde, hasta} de "AAAA-Www" o "AAAA-MM"; null si no es un periodo. */
export function periodo(id) {
  let m = /^(\d{4})-W(\d{2})$/.exec(id ?? "");
  if (m) {
    const e4 = new Date(Date.UTC(+m[1], 0, 4));
    e4.setUTCDate(4 - ((e4.getUTCDay() + 6) % 7) + (+m[2] - 1) * 7);
    const desde = e4.toISOString().slice(0, 10);
    return semanaISO(desde) === id ? { id, tipo: "semana", desde, hasta: sumarDias(desde, 6) } : null;
  }
  m = /^(\d{4})-(\d{2})$/.exec(id ?? "");
  if (m && +m[2] >= 1 && +m[2] <= 12) {
    const desde = id + "-01", sig = new Date(Date.UTC(+m[1], +m[2], 1)).toISOString().slice(0, 10);
    return { id, tipo: "mes", desde, hasta: sumarDias(sig, -1) };
  }
  return null;
}
export const semanaAnterior = id => semanaISO(sumarDias(periodo(id).desde, -7));
export const semanaSiguiente = id => semanaISO(sumarDias(periodo(id).desde, 7));
export const mesAnterior = id => sumarDias(periodo(id).desde, -1).slice(0, 7);
export const sumarMes = (id, n) => { const d = new Date(Date.UTC(+id.slice(0, 4), +id.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };

// ---- Agenda

/**
 * Eventos de datos/agenda/AAAA-MM.json, con la cobertura de datos/agenda/consultada.json
 * ({desde, hasta}: días de los que Instinct ha copiado el calendario entero). Si falta un
 * día, se completa con la agenda del informe diario (hoy y los dos días siguientes).
 * Devuelve { eventos: [...], cubiertos: Set de fechas }.
 */
export function unirAgenda(eventos = [], consultada = null, informes = []) {
  const lista = (Array.isArray(eventos) ? eventos : []).filter(e => e && fechaValida(e.fecha));
  const cubiertos = new Set();
  if (fechaValida(consultada?.desde) && fechaValida(consultada?.hasta))
    for (const f of rango(consultada.desde, consultada.hasta)) cubiertos.add(f);
  for (const f of lista.map(e => e.fecha)) cubiertos.add(f);
  for (const inf of informes) {
    if (!fechaValida(inf?.fecha) || !inf.agenda) continue;
    const dias = [{ fecha: inf.fecha, eventos: inf.agenda.hoy ?? [] }];
    for (const p of Array.isArray(inf.agenda.proximos) ? inf.agenda.proximos : []) {
      const n = +(/(\d{1,2})/.exec(p?.dia ?? "")?.[1]);
      const f = [1, 2, 3, 4, 5, 6, 7].map(i => sumarDias(inf.fecha, i)).find(x => +x.slice(8) === n);
      if (f) dias.push({ fecha: f, eventos: p.eventos ?? [] });
    }
    for (const d of dias) {
      if (cubiertos.has(d.fecha)) continue;
      cubiertos.add(d.fecha);
      (Array.isArray(d.eventos) ? d.eventos : []).forEach((e, i) => lista.push({ id: `informe:${d.fecha}:${i}`, fecha: d.fecha,
        inicio: e.inicio ?? "", fin: e.fin ?? "", titulo: e.titulo ?? "", lugar: e.lugar ?? "",
        todo_el_dia: !e.inicio, tipo: null, estado: "planeado", origen: "informe" }));
    }
  }
  lista.sort((a, b) => (a.fecha + (a.inicio || "00:00")).localeCompare(b.fecha + (b.inicio || "00:00")));
  return { eventos: lista, cubiertos };
}

/**
 * Huecos libres de un día entre 07:00 y 22:00 (09:00 en fin de semana), con 30 min de
 * margen alrededor de cada evento. Si la víspera acaba tarde (un evento que termina a las
 * 22:00 o después, o un viaje que llega después de las 21:30), la mañana empieza a las 09:30.
 */
export function huecosDia(fecha, eventos) {
  const del = f => eventos.filter(e => e.fecha === f && e.estado !== "cancelado");
  const viaje = /tren|vuelo|avi[oó]n|ave\b|alvia|intercity|autob[uú]s|aeropuerto/i;
  const vispera = del(sumarDias(fecha, -1)).filter(e => !e.todo_el_dia && aMin(e.fin) != null);
  const tarde = vispera.find(e => aMin(e.fin) >= 22 * 60 || (viaje.test(e.titulo ?? "") && aMin(e.fin) >= 21 * 60 + 30));
  let ini = diaSemana(fecha) >= 5 ? 9 * 60 : 7 * 60;
  if (tarde) ini = Math.max(ini, 9 * 60 + 30);
  const fin = 22 * 60, ocupado = [];
  for (const e of del(fecha)) {
    const a = aMin(e.inicio), b = aMin(e.fin);
    if (e.todo_el_dia || a == null) continue;
    ocupado.push([a - 30, (b ?? a + 60) + 30]);
  }
  ocupado.sort((x, y) => x[0] - y[0]);
  const huecos = []; let t = ini;
  for (const [a, b] of ocupado) { if (a - t >= 60) huecos.push([t, a]); t = Math.max(t, b); }
  if (fin - t >= 60) huecos.push([t, fin]);
  return {
    huecos: huecos.map(([a, b]) => ({ inicio: aHora(a), fin: aHora(b), min: b - a })),
    todo_el_dia: del(fecha).filter(e => e.todo_el_dia || !e.inicio).map(e => e.titulo),
    vispera_tarde: tarde ? `${tarde.titulo} (hasta las ${tarde.fin})` : null,
  };
}

// ---- Preparar los datos una sola vez

/**
 * entrada: { config, objetivos, catalogo, registro (texto CSV), cuerpo (lista), comidas, alimentos,
 *            productos, sesiones, pasos (texto CSV), agenda: {eventos, cubiertos}, propuestas, hoy }
 */
export function preparar(entrada) {
  const { config, objetivos = {}, catalogo = [], hoy } = entrada;
  const perfil = config?.perfil;

  // Peso de cada día
  const porDia = {};
  for (const m of Array.isArray(entrada.cuerpo) ? entrada.cuerpo : []) {
    if (!m || !fechaValida(m.fecha) || !esNum(m.medidas?.peso_kg)) continue;
    const captura = m.fuente !== "salud", a = porDia[m.fecha];
    if (!a || (captura && !a.captura) || (captura === a.captura && (m.hora ?? "99") < (a.hora ?? "99")))
      porDia[m.fecha] = { kg: m.medidas.peso_kg, hora: m.hora ?? "", captura, medidas: m.medidas, fuente: m.fuente ?? "captura" };
  }
  const fechasPeso = Object.keys(porDia).sort();
  const pesoExacto = f => porDia[f]?.kg ?? null;
  const medicionEn = f => {           // la del día, o la anterior más cercana, o la primera posterior
    if (porDia[f]) return porDia[f];
    let ant = null; for (const x of fechasPeso) { if (x > f) return porDia[ant ?? x]; ant = x; }
    return ant ? porDia[ant] : null;
  };
  const media7 = f => { const vs = rango(sumarDias(f, -6), f).map(pesoExacto).filter(esNum); return vs.length >= 3 ? media(vs) : null; };

  // Objetivo de peso
  const op = objetivos.peso ?? {};
  const porDiaIdeal = esNum(op.ritmo_kg_semana) ? op.ritmo_kg_semana / 7 : null;
  const ideal = f => !fechaValida(op.inicio_fecha) || !esNum(op.inicio_kg) || porDiaIdeal == null || f < op.inicio_fecha ? null
    : Math.max(op.meta_kg ?? -Infinity, op.inicio_kg + porDiaIdeal * diasEntre(f, op.inicio_fecha));
  const llegadaIdeal = esNum(op.meta_kg) && porDiaIdeal < 0 && fechaValida(op.inicio_fecha)
    ? sumarDias(op.inicio_fecha, Math.ceil((op.meta_kg - op.inicio_kg) / porDiaIdeal)) : null;

  // Comidas
  const { dias: nutri } = calcularNutricion(entrada.comidas ?? [], entrada.alimentos ?? [], entrada.productos ?? []);
  const comidaDe = f => {
    const d = nutri[f]; if (!d) return null;
    const momentos = d.comidas.map(c => c.momento);
    return { n: d.comidas.length, momentos, kcal: d.total.kcal, proteina_g: d.total.proteina_g, alcohol_g: d.total.alcohol_g,
      completo: (momentos.includes("comida") && momentos.includes("cena")) || d.comidas.length >= 3 };
  };

  // Actividad y gasto, con el peso de cada día
  const pasos = parsearPasos(entrada.pasos ?? "");
  const sesionesDe = {};
  for (const s of Array.isArray(entrada.sesiones) ? entrada.sesiones : []) if (fechaValida(s?.fecha)) (sesionesDe[s.fecha] ??= []).push(s);
  const cacheAct = {};
  const actividadDe = f => cacheAct[f] ??= (() => {
    const m = medicionEn(f), kg = m?.kg ?? null;
    const { dias } = calcularActividad(sesionesDe[f] ?? [], pasos[f] ? { [f]: pasos[f] } : {}, catalogo, kg);
    const g = gastoDia(dias[f], m ? basalDe({ ...m.medidas, peso_kg: kg }, perfil, f) : null, kg);
    return { dia: dias[f] ?? null, gasto: g?.total ?? null, peso_usado: kg };
  })();

  // Hábitos
  const filas = parsearCSV(entrada.registro ?? "");
  const { hechos } = calcular(config, filas, hoy);

  return { ...entrada, perfil, op, ideal, llegadaIdeal, porDia, fechasPeso, pesoExacto, medicionEn, media7,
    comidaDe, pasos, sesionesDe, actividadDe, filas, hechos,
    agenda: entrada.agenda ?? { eventos: [], cubiertos: new Set() }, propuestas: Array.isArray(entrada.propuestas) ? entrada.propuestas : [] };
}

// ---- Bloques de cifras

function ritmo(ctx, corte) {
  const pts = rango(sumarDias(corte, -13), corte).map(f => [diasEntre(f, corte), ctx.pesoExacto(f)]).filter(p => esNum(p[1]));
  if (pts.length < 5 || pts.at(-1)[0] - pts[0][0] < 7) return { kg_semana: null, puntos: pts.length };
  const mx = media(pts.map(p => p[0])), my = media(pts.map(p => p[1]));
  const b = suma(pts.map(p => (p[0] - mx) * (p[1] - my))) / suma(pts.map(p => (p[0] - mx) ** 2));
  return { kg_semana: b * 7, tendencia_hoy: my - b * mx, puntos: pts.length };
}

const tiposGimnasio = ctx => new Set(ctx.objetivos?.deporte?.tipos_gimnasio ?? ["gimnasio"]);
const esDeporte = e => e && e.tipo && e.tipo !== "descanso";

/** Cifras básicas de un tramo de días (hasta `corte` como mucho). Sirve para la semana, el mes y las comparaciones. */
export function nucleo(ctx, desde, hasta) {
  const fin = hasta < ctx.hoy ? hasta : ctx.hoy, dias = fin >= desde ? rango(desde, fin) : [];
  const gym = tiposGimnasio(ctx);
  const ses = dias.flatMap(f => (ctx.sesionesDe[f] ?? []).filter(s => s.tipo !== "descanso").map(s => ({ ...s, fecha: f })));
  // Hoy no ha acabado: sus pasos (parciales) no cuentan en la media.
  const conPasos = dias.filter(f => ctx.pasos[f] && f !== ctx.hoy).map(f => ctx.pasos[f].pasos);
  const comidas = dias.map(f => [f, ctx.comidaDe(f)]).filter(([, c]) => c);
  const completos = comidas.filter(([, c]) => c.completo).map(([f, c]) => ({ f, c, g: ctx.actividadDe(f).gasto }));
  const conGasto = completos.filter(x => esNum(x.g));
  const alcohol = suma(comidas.map(([, c]) => c.alcohol_g));
  const pesoFin = dias.length ? ctx.medicionEn(fin)?.kg ?? null : null;
  const protDia = media(completos.map(x => x.c.proteina_g));
  const planeados = ctx.agenda.eventos.filter(e => esDeporte(e) && e.fecha >= desde && e.fecha <= fin);
  const hecho = e => e.estado === "hecho" || ses.some(s => (s.agenda_id && s.agenda_id === e.id) || (s.fecha === e.fecha && s.tipo === e.tipo));
  const cumplidos = planeados.filter(e => e.estado !== "cancelado" && hecho(e));
  const conPlan = s => planeados.some(e => (s.agenda_id && s.agenda_id === e.id) || (s.fecha === e.fecha && s.tipo === e.tipo));
  return {
    desde, hasta, corte: fin, dias: dias.length,
    peso_media7: r2(dias.length ? ctx.media7(fin) : null),
    deporte: {
      sesiones: ses.length, minutos: r0(suma(ses.map(s => s.duracion_min))),
      gimnasio: ses.filter(s => gym.has(s.tipo)).length, padel: ses.filter(s => s.tipo === "padel").length,
      por_tipo: ses.reduce((o, s) => (o[s.tipo] = (o[s.tipo] ?? 0) + 1, o), {}),
      planeadas: planeados.length, cumplidas: cumplidos.length,
      canceladas: planeados.filter(e => e.estado === "cancelado").length, sin_plan: ses.filter(s => !conPlan(s)).length,
      dias_descanso: dias.filter(f => (ctx.sesionesDe[f] ?? []).some(s => s.tipo === "descanso")).length,
    },
    pasos: { media: r0(media(conPasos)), dias: conPasos.length, total: r0(suma(conPasos)),
      max: conPasos.length ? Math.max(...conPasos) : null, min: conPasos.length ? Math.min(...conPasos) : null },
    energia: {
      dias_completos: completos.length, kcal_media: r0(media(completos.map(x => x.c.kcal))),
      gasto_medio: r0(media(conGasto.map(x => x.g))),
      deficit_medio: r0(media(conGasto.map(x => x.g - x.c.kcal))), deficit_total: r0(suma(conGasto.map(x => x.g - x.c.kcal))),
    },
    proteina: { g_dia: r0(protDia), g_kg: r2(esNum(protDia) && esNum(pesoFin) ? protDia / pesoFin : null), dias: completos.length },
    alcohol: { gramos: r1(alcohol), copas: r1(alcohol / (ctx.objetivos?.alcohol?.gramos_copa ?? 10)), kcal: r0(alcohol * 7),
      dias: comidas.filter(([, c]) => c.alcohol_g > 0).length },
    cobertura: { dias: dias.length, peso: dias.filter(f => ctx.porDia[f]).length, pasos: conPasos.length,
      comidas: comidas.length, comidas_completas: completos.length,
      actividad: dias.filter(f => ctx.sesionesDe[f]?.length).length },
  };
}

/** Los indicadores con flecha: el valor de este tramo, el del anterior y la media de los `previos`. */
function indicadores(actual, anterior, previos) {
  const defs = [
    ["peso_media7", n => n.peso_media7, "baja"], ["deporte_sesiones", n => n.deporte.sesiones, "sube"],
    ["deporte_minutos", n => n.deporte.minutos, "sube"], ["gimnasio", n => n.deporte.gimnasio, "sube"],
    ["pasos_media", n => n.pasos.media, "sube"], ["deficit_medio", n => n.energia.deficit_medio, "sube"],
    ["kcal_media", n => n.energia.kcal_media, null], ["proteina_g_kg", n => n.proteina.g_kg, "sube"],
    ["alcohol_copas", n => n.cobertura.comidas ? n.alcohol.copas : null, null],   // sin comidas apuntadas no hay dato
  ];
  const out = {};
  for (const [k, f, mejor] of defs) {
    const a = f(actual), b = anterior ? f(anterior) : null, m = media(previos.map(f));
    out[k] = { actual: a, anterior: b, media4: r2(m), dif_anterior: esNum(a) && esNum(b) ? r2(a - b) : null,
      dif_media4: esNum(a) && esNum(m) ? r2(a - m) : null, mejor };
  }
  return out;
}

function bloquePeso(ctx, desde, hasta, inicioSerie) {
  const corte = hasta < ctx.hoy ? hasta : ctx.hoy;
  const rt = ritmo(ctx, corte), m7 = ctx.media7(corte), base = rt.tendencia_hoy ?? m7, op = ctx.op;
  const llegada = esNum(op.meta_kg) && esNum(rt.kg_semana) && rt.kg_semana < 0 && esNum(base)
    ? (base <= op.meta_kg ? corte : sumarDias(corte, Math.round((base - op.meta_kg) / (-rt.kg_semana / 7)))) : null;
  const m7ant = ctx.media7(sumarDias(desde, -1)), pesos = rango(desde, corte).map(ctx.pesoExacto).filter(esNum);
  return {
    objetivo: { inicio_fecha: op.inicio_fecha, inicio_kg: op.inicio_kg, meta_kg: op.meta_kg, ritmo_kg_semana: op.ritmo_kg_semana,
      llegada_ideal: ctx.llegadaIdeal },
    media7_fin: r2(m7), media7_antes: r2(m7ant), cambio: r2(esNum(m7) && esNum(m7ant) ? m7 - m7ant : null),
    ideal_fin: r2(ctx.ideal(corte)), diferencia_ideal: r2(esNum(m7) && esNum(ctx.ideal(corte)) ? m7 - ctx.ideal(corte) : null),
    ritmo_kg_semana: r2(rt.kg_semana), ritmo_puntos: rt.puntos, tendencia_kg: r2(rt.tendencia_hoy ?? null),
    llegada_proyectada: llegada, falta_kg: r2(esNum(m7) && esNum(op.meta_kg) ? m7 - op.meta_kg : null),
    dias_con_peso: pesos.length, minimo: pesos.length ? Math.min(...pesos) : null, maximo: pesos.length ? Math.max(...pesos) : null,
    horas: rango(desde, corte).filter(f => ctx.porDia[f]).map(f => ({ fecha: f, hora: ctx.porDia[f].hora, fuente: ctx.porDia[f].fuente })),
    serie: rango(inicioSerie, hasta).map(f => ({ fecha: f, kg: f <= corte ? ctx.pesoExacto(f) : null,
      media7: f <= corte ? r2(ctx.media7(f)) : null, ideal: r2(ctx.ideal(f)) })),
  };
}

function bloqueHabitos(ctx, desde, hasta) {
  const corte = hasta < ctx.hoy ? hasta : ctx.hoy;
  const { estado } = calcular(ctx.config, ctx.filas, corte);
  const enEstado = Object.fromEntries(estado.habitos.map(h => [h.id, h]));
  const umbral = ctx.config.juego?.umbral_consolidado ?? 0.8;
  return ctx.config.habitos.filter(h => (h.estado === "activo" || h.estado === "consolidado") && (!h.desde || h.desde <= hasta)).map(h => {
    // Cuenta desde el inicio del periodo, o desde `desde` o el primer registro si son posteriores.
    const primero = Object.keys(ctx.hechos[h.id] ?? {}).sort()[0] ?? h.desde ?? hasta;
    const ini = [desde, h.desde ?? desde, primero].sort().at(-1);
    // Hoy, como en el juego, solo cuenta si ya está hecho.
    const dias = rango(desde, hasta).map(f => { const si = ctx.hechos[h.id]?.[f] != null;
      return f < ini || f > corte || (f === ctx.hoy && !si) ? null : si; });
    const exigibles = dias.filter(v => v !== null).length, hechos = dias.filter(v => v === true).length;
    const e = enEstado[h.id];
    return { id: h.id, nombre: h.nombre, area: h.area, desde: h.desde ?? null, minimo: h.minimo, ancla: h.ancla ?? null,
      hechos, exigibles, pct: exigibles ? r2(hechos / exigibles) : null, dias,
      pct_21: e?.pct_ventana ?? null, consolidado: !!e?.consolidado, votos: e?.votos ?? 0,
      listo_para_subir: !!(h.niveles?.length && (h.nivel ?? 1) < h.niveles.length && e?.consolidado && e.pct_ventana >= umbral),
      ...nivelDe(h) };
  });
}

function diasDetalle(ctx, desde, hasta) {
  const corte = hasta < ctx.hoy ? hasta : ctx.hoy;
  return (corte >= desde ? rango(desde, corte) : []).map(f => {
    const c = ctx.comidaDe(f), a = ctx.actividadDe(f);
    return {
      fecha: f, dia: DIAS[diaSemana(f)], peso: ctx.pesoExacto(f), hora_peso: ctx.porDia[f]?.hora ?? null, media7: r2(ctx.media7(f)),
      pasos: ctx.pasos[f]?.pasos ?? null,
      comidas: c?.n ?? 0, momentos: c?.momentos ?? [], completo: !!c?.completo, kcal: r0(c?.kcal), proteina_g: r0(c?.proteina_g),
      alcohol_g: r1(c?.alcohol_g ?? 0), gasto: r0(a.gasto), deficit: c?.completo && esNum(a.gasto) ? r0(a.gasto - c.kcal) : null,
      sesiones: (ctx.sesionesDe[f] ?? []).map(s => ({ tipo: s.tipo, min: s.duracion_min ?? null, hora: s.hora ?? "", agenda_id: s.agenda_id ?? null })),
      habitos: Object.keys(ctx.hechos).filter(h => ctx.hechos[h][f] != null),
      eventos: ctx.agenda.eventos.filter(e => e.fecha === f).map(e => ({ inicio: e.inicio || null, fin: e.fin || null, titulo: e.titulo,
        lugar: e.lugar || null, tipo: e.tipo ?? null, estado: e.estado ?? null })),
      agenda_conocida: ctx.agenda.cubiertos.has(f),
    };
  });
}

function bloqueAlcohol(ctx, desde, hasta) {
  const corte = hasta < ctx.hoy ? hasta : ctx.hoy, gc = ctx.objetivos?.alcohol?.gramos_copa ?? 10;
  return (corte >= desde ? rango(desde, corte) : []).map(f => [f, ctx.comidaDe(f)]).filter(([, c]) => c?.alcohol_g > 0).map(([f, c]) => {
    const p = ctx.pesoExacto(f), s = ctx.pesoExacto(sumarDias(f, 1));
    return { fecha: f, gramos: r1(c.alcohol_g), copas: r1(c.alcohol_g / gc), kcal: r0(c.alcohol_g * 7), kcal_dia: r0(c.kcal),
      peso_dia: p, peso_siguiente: s, cambio: esNum(p) && esNum(s) ? r2(s - p) : null };
  });
}

function bloquePropuestas(ctx, id) {
  const ps = ctx.propuestas.filter(p => typeof p?.id === "string" && p.id.startsWith(id + "-"));
  const hecha = p => ctx.sesionesDe[p.fecha]?.some(s => s.tipo === p.tipo || (s.agenda_id && s.agenda_id === p.agenda_id))
    || ctx.agenda.eventos.some(e => e.id && e.id === p.agenda_id && e.estado === "hecho");
  return { total: ps.length, aceptadas: ps.filter(p => p.estado === "aceptado" || p.estado === "en_calendario").length,
    en_calendario: ps.filter(p => p.estado === "en_calendario").length, descartadas: ps.filter(p => p.estado === "descartado").length,
    hechas: ps.filter(p => p.fecha <= ctx.hoy && hecha(p)).length,
    detalle: ps.map(p => ({ id: p.id, fecha: p.fecha, tipo: p.tipo, estado: p.estado, hecha: p.fecha <= ctx.hoy ? hecha(p) : null })) };
}

// ---- Revisión semanal

export function metricasSemana(ctx, id) {
  const p = periodo(id); if (!p || p.tipo !== "semana") throw new Error("Semana no válida: " + id);
  const corte = p.hasta < ctx.hoy ? p.hasta : ctx.hoy;
  const n = nucleo(ctx, p.desde, p.hasta);
  const previos = [1, 2, 3, 4].map(i => nucleo(ctx, sumarDias(p.desde, -7 * i), sumarDias(p.hasta, -7 * i)));
  const sig = periodo(semanaSiguiente(id)), meta = ctx.objetivos?.deporte?.gimnasio_semana ?? null;
  const semanasMeta = [0, 1, 2].map(i => i === 0 ? n : previos[i - 1]).map(x => x.deporte.gimnasio);
  return {
    periodo: id, tipo: "semana", desde: p.desde, hasta: p.hasta, corte, provisional: corte < p.hasta, calculado: ctx.hoy,
    cobertura: n.cobertura,
    peso: bloquePeso(ctx, p.desde, p.hasta, sumarDias(p.desde, -28)),
    deporte: { ...n.deporte, meta_gimnasio: meta, cumple_meta: esNum(meta) ? n.deporte.gimnasio >= meta : null,
      gimnasio_ultimas3: semanasMeta, subir_meta: esNum(meta) && semanasMeta.every(g => g >= meta) },
    pasos: { ...n.pasos, serie: rango(p.desde, p.hasta).map(f => ({ fecha: f, pasos: f <= corte ? ctx.pasos[f]?.pasos ?? null : null })),
      semanas: [...previos].reverse().concat([n]).map(x => ({ desde: x.desde, media: x.pasos.media, dias: x.pasos.dias })) },
    energia: n.energia, proteina: n.proteina,
    alcohol: { ...n.alcohol, detalle: bloqueAlcohol(ctx, p.desde, p.hasta) },
    indicadores: indicadores(n, previos[0], previos),
    semanas_previas: previos.map(x => ({ desde: x.desde, hasta: x.hasta, peso_media7: x.peso_media7, deporte: x.deporte, pasos: x.pasos,
      energia: x.energia, proteina: x.proteina, alcohol: x.alcohol, cobertura: x.cobertura })),
    habitos: bloqueHabitos(ctx, p.desde, p.hasta),
    propuestas: bloquePropuestas(ctx, id),
    dias: diasDetalle(ctx, p.desde, p.hasta),
    siguiente: { periodo: sig.id, desde: sig.desde, hasta: sig.hasta, dias: rango(sig.desde, sig.hasta).map(f => ({
      fecha: f, dia: DIAS[diaSemana(f)], agenda_conocida: ctx.agenda.cubiertos.has(f),
      eventos: ctx.agenda.eventos.filter(e => e.fecha === f).map(e => ({ inicio: e.inicio || null, fin: e.fin || null, titulo: e.titulo,
        lugar: e.lugar || null, tipo: e.tipo ?? null, estado: e.estado ?? null })),
      ...(ctx.agenda.cubiertos.has(f) ? huecosDia(f, ctx.agenda.eventos) : { huecos: null }) })) },
  };
}

// ---- Revisión mensual

export function metricasMes(ctx, id) {
  const p = periodo(id); if (!p || p.tipo !== "mes") throw new Error("Mes no válido: " + id);
  const corte = p.hasta < ctx.hoy ? p.hasta : ctx.hoy;
  const n = nucleo(ctx, p.desde, p.hasta);
  const pa = periodo(mesAnterior(id)), ant = nucleo(ctx, pa.desde, pa.hasta);
  const añoAntes = periodo(String(+id.slice(0, 4) - 1) + id.slice(4)), mismo = nucleo(ctx, añoAntes.desde, añoAntes.hasta);
  // Semanas que tocan el mes (solo sus días dentro del mes)
  const semanas = [];
  for (let f = p.desde; f <= p.hasta; f = sumarDias(periodo(semanaISO(f)).hasta, 1)) {
    const s = periodo(semanaISO(f)), a = s.desde < p.desde ? p.desde : s.desde, b = s.hasta > p.hasta ? p.hasta : s.hasta;
    const x = nucleo(ctx, a, b);
    semanas.push({ semana: s.id, desde: a, hasta: b, dias: x.dias, sesiones: x.deporte.sesiones, minutos: x.deporte.minutos,
      gimnasio: x.deporte.gimnasio, padel: x.deporte.padel, planeadas: x.deporte.planeadas, cumplidas: x.deporte.cumplidas,
      pasos_media: x.pasos.media });
  }
  // Pasos: media de cada uno de los últimos 13 meses
  const meses = [];
  for (let k = id, i = 0; i < 13; i++, k = mesAnterior(k)) {
    const q = periodo(k), vs = rango(q.desde, q.hasta < corte ? q.hasta : corte).filter(f => f !== ctx.hoy).map(f => ctx.pasos[f]?.pasos).filter(esNum);
    meses.unshift({ mes: k, media: r0(media(vs)), dias: vs.length });
  }
  const composicion = (ctx.cuerpo ?? []).filter(m => m?.fecha >= pa.desde && m.fecha <= corte && esNum(m.medidas?.peso_kg))
    .sort((a, b) => (a.fecha + (a.hora ?? "")).localeCompare(b.fecha + (b.hora ?? "")))
    .map(m => ({ fecha: m.fecha, hora: m.hora ?? "", fuente: m.fuente ?? "captura", peso_kg: m.medidas.peso_kg,
      grasa_pct: m.medidas.grasa_pct ?? null, grasa_kg: m.medidas.grasa_kg ?? null, musculo_kg: m.medidas.musculo_kg ?? null,
      musculo_esqueletico_kg: m.medidas.musculo_esqueletico_kg ?? null, peso_sin_grasa_kg: m.medidas.peso_sin_grasa_kg ?? null }));
  const delMes = composicion.filter(m => m.fecha >= p.desde);
  const cambio = k => { const xs = delMes.filter(m => esNum(m[k])); return xs.length >= 2 ? r2(xs.at(-1)[k] - xs[0][k]) : null; };
  const habitos = bloqueHabitos(ctx, p.desde, p.hasta);
  return {
    periodo: id, tipo: "mes", desde: p.desde, hasta: p.hasta, corte, provisional: corte < p.hasta, calculado: ctx.hoy,
    cobertura: n.cobertura,
    peso: bloquePeso(ctx, p.desde, p.hasta, sumarDias(p.desde, -14)),
    composicion: { mediciones: composicion, cambio: { peso_kg: cambio("peso_kg"), grasa_pct: cambio("grasa_pct"), grasa_kg: cambio("grasa_kg"),
      musculo_kg: cambio("musculo_kg"), musculo_esqueletico_kg: cambio("musculo_esqueletico_kg") } },
    deporte: { ...n.deporte, semanas, meta_gimnasio_semana: ctx.objetivos?.deporte?.gimnasio_semana ?? null },
    pasos: { ...n.pasos, mismo_mes_año_anterior: { mes: añoAntes.id, media: mismo.pasos.media, dias: mismo.pasos.dias }, meses },
    comida: { dias_apuntados: n.cobertura.comidas, dias_completos: n.cobertura.comidas_completas, kcal_media: n.energia.kcal_media,
      proteina_g_dia: n.proteina.g_dia, proteina_g_kg: n.proteina.g_kg },
    energia: n.energia, proteina: n.proteina,
    alcohol: { ...n.alcohol, detalle: bloqueAlcohol(ctx, p.desde, p.hasta) },
    indicadores: indicadores(n, ant, [ant]),
    mes_anterior: { periodo: pa.id, peso_media7: ant.peso_media7, deporte: ant.deporte, pasos: ant.pasos, energia: ant.energia,
      proteina: ant.proteina, alcohol: ant.alcohol, cobertura: ant.cobertura },
    habitos, consolidados: habitos.filter(h => h.consolidado).map(h => h.id),
    en_construccion: habitos.filter(h => !h.consolidado).map(h => h.id),
    dias: diasDetalle(ctx, p.desde, p.hasta),
  };
}

export const metricas = (ctx, id) => periodo(id)?.tipo === "mes" ? metricasMes(ctx, id) : metricasSemana(ctx, id);
