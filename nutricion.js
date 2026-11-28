// Calorías y macros a partir de lo que apunta Instinct. Lo usan la web app y
// scripts/nutricion.mjs (GitHub), así que las cifras de la app y las que lee
// Instinct salen del mismo código.
//
// Cada alimento de una comida lleva su cantidad (`gramos`, o `unidades` si su
// referencia tiene `unidad_g`) y de dónde salen sus valores por 100 g:
//   - `producto`: id de datos/productos.json, copiado de la etiqueta  -> fuente "etiqueta"
//   - `ref`:      id de config/alimentos.json, tabla de referencia      -> fuente "tabla"
//   - `por_100g`: valores que estima Instinct para ese alimento         -> fuente "estimacion"
// Las cuentas las hace este código: Instinct no multiplica nada.

export const NUTRIENTES = ["kcal", "proteina_g", "carbohidratos_g", "azucares_g", "grasa_g", "saturadas_g",
  "fibra_g", "alcohol_g", "sal_g"];
export const MOMENTOS = ["desayuno", "media_manana", "comida", "merienda", "cena", "picoteo"];

const num = v => typeof v === "number" && isFinite(v) ? v : 0;
/** kcal según la regla de las etiquetas europeas. */
export const atwater = v => 4 * num(v.proteina_g) + 4 * num(v.carbohidratos_g) + 9 * num(v.grasa_g)
  + 2 * num(v.fibra_g) + 7 * num(v.alcohol_g);
const fechaValida = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

const cero = () => Object.fromEntries(NUTRIENTES.map(k => [k, 0]));
function sumar(a, b) { for (const k of NUTRIENTES) a[k] += b[k] ?? 0; return a; }

/** Etiqueta que no cuadra: las kcal declaradas se alejan mucho de las de sus macros (dato mal copiado). */
export function etiquetaIncoherente(v) {
  if (typeof v?.kcal !== "number") return false;
  const c = atwater(v);
  return Math.abs(v.kcal - c) > Math.max(20, 0.15 * Math.max(v.kcal, c));
}

/**
 * comidas: lista de comidas (de todos los ficheros del mes que se quieran).
 * Devuelve { dias: {fecha: {total, fiable, comidas: [...] }}, revisar: [...] }.
 * `fiable` son las kcal que vienen de etiqueta o tabla.
 */
export function calcularNutricion(comidas, alimentos = [], productos = []) {
  const tabla = new Map(alimentos.map(a => [a.id, a])), prods = new Map(productos.map(p => [p.id, p]));
  const dias = {}, revisar = [];
  for (const p of productos)
    if (etiquetaIncoherente(p.por_100g))
      revisar.push({ producto: p.id, motivo: `etiqueta de «${p.nombre ?? p.id}»: las kcal no cuadran con sus macros` });

  for (const c of comidas) {
    const donde = { fecha: c?.fecha, hora: c?.hora ?? "", momento: c?.momento ?? "" };
    if (!c || !fechaValida(c.fecha)) { revisar.push({ ...donde, motivo: "comida sin fecha válida" }); continue; }
    if (!MOMENTOS.includes(c.momento)) revisar.push({ ...donde, motivo: `momento desconocido: '${c.momento}'` });
    const dia = dias[c.fecha] ??= { total: cero(), fiable: 0, comidas: [] };
    const comida = { fecha: c.fecha, hora: c.hora ?? "", momento: c.momento, descripcion: c.descripcion ?? "",
      total: cero(), alimentos: [] };

    for (const a of Array.isArray(c.alimentos) ? c.alimentos : []) {
      const mal = motivo => revisar.push({ ...donde, alimento: a?.nombre ?? "?", motivo });
      let base = null, fuente = null;
      if (a?.producto != null) { base = prods.get(a.producto); fuente = "etiqueta"; if (!base) mal(`producto '${a.producto}' no está en datos/productos.json`); }
      else if (a?.ref != null) { base = tabla.get(a.ref); fuente = "tabla"; if (!base) mal(`'${a.ref}' no está en config/alimentos.json`); }
      else if (a?.por_100g) { base = { por_100g: a.por_100g, unidad_g: a.unidad_g }; fuente = "estimacion"; }
      else mal("sin ref, producto ni por_100g");

      let gramos = typeof a?.gramos === "number" ? a.gramos : null;
      if (gramos == null && typeof a?.unidades === "number") {
        if (typeof base?.unidad_g === "number") gramos = a.unidades * base.unidad_g;
        else if (base) mal("lleva unidades pero su referencia no tiene unidad_g: pon gramos");
      }
      if (gramos == null && base && typeof a?.unidades !== "number") mal("sin cantidad (gramos o unidades)");
      if (!(gramos >= 0) || !base?.por_100g) { comida.alimentos.push({ nombre: a?.nombre ?? "?", fuente, gramos, valores: null }); continue; }

      const p = base.por_100g, valores = {};
      for (const k of NUTRIENTES) if (typeof p[k] === "number") valores[k] = p[k] * gramos / 100;
      if (typeof p.kcal !== "number") valores.kcal = atwater(p) * gramos / 100;
      if (fuente === "estimacion" && etiquetaIncoherente(p)) mal("sus kcal por 100 g no cuadran con sus macros");
      sumar(comida.total, valores);
      if (fuente !== "estimacion") dia.fiable += valores.kcal;
      comida.alimentos.push({ nombre: a.nombre ?? base.nombre ?? a.ref ?? a.producto, fuente, gramos, valores });
    }
    if (!comida.alimentos.length) revisar.push({ ...donde, motivo: "comida sin alimentos" });
    sumar(dia.total, comida.total);
    dia.comidas.push(comida);
  }
  // Por hora cuando las dos la tienen; si no, por el orden natural de los momentos.
  const antes = (a, b) => a.hora && b.hora ? a.hora.localeCompare(b.hora)
    : MOMENTOS.indexOf(a.momento) - MOMENTOS.indexOf(b.momento);
  for (const d of Object.values(dias)) d.comidas.sort(antes);
  return { dias, revisar };
}

/** Resumen por día para datos/nutricion.json (cifras redondeadas). */
export function resumenDias(dias) {
  const r = v => Math.round(v * 10) / 10, out = {};
  for (const f of Object.keys(dias).sort()) {
    const d = dias[f], t = {};
    for (const k of NUTRIENTES) t[k] = k === "kcal" ? Math.round(d.total.kcal) : r(d.total[k]);
    out[f] = { comidas: d.comidas.length, ...t,
      pct_fiable: d.total.kcal ? Math.round(100 * d.fiable / d.total.kcal) : null };
  }
  return out;
}
