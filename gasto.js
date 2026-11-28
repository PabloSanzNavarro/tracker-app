// Gasto de energía del día: ejercicio, pasos y metabolismo basal. Lo usan la web
// app y scripts/gasto.mjs (GitHub), así que las cifras de la app y las que lee
// Instinct salen del mismo código. Instinct no calcula nada: apunta sesiones.
//
// Gasto del día = basal × 1,2            (día sedentario: incluye digerir y moverse poco)
//               + ejercicio neto          (por encima del reposo, que ya va en el basal)
//               + pasos de más            (los que pasan de 5.000, sin contar los de las sesiones a pie)
// Es una estimación: el error razonable es de un 10-20 %.

export const INTENSIDADES = ["suave", "media", "alta"];
export const FACTOR_BASE = 1.2;
export const PASOS_BASE = 5000;            // pasos que ya incluye un día sedentario
export const KCAL_PASO_KG = 0.00038;       // kcal netas por paso y kg (unos 0,5 kcal/kg/km a 1.300 pasos/km)

// MET según el ritmo (km/h), del Compendio de Actividades Físicas.
const RITMO = {
  correr: [[6.4, 6.0], [8, 8.3], [9.7, 9.8], [11.3, 11.0], [12.9, 11.8], [14.5, 12.8], [16, 14.5]],
  caminar: [[3.2, 2.8], [4, 3.0], [4.8, 3.5], [5.6, 4.3], [6.4, 5.0], [7.2, 7.0]],
};
function interpolar(tabla, v) {
  if (v <= tabla[0][0]) return tabla[0][1];
  for (let i = 1; i < tabla.length; i++) {
    const [x0, y0] = tabla[i - 1], [x1, y1] = tabla[i];
    if (v <= x1) return y0 + (y1 - y0) * (v - x0) / (x1 - x0);
  }
  return tabla.at(-1)[1];
}

const fechaValida = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const esNum = v => typeof v === "number" && isFinite(v);

/** Filas de datos/pasos.csv: fecha,pasos,distancia_km,fuente,hora,energia_activa_kcal,pisos,velocidad_kmh. Si hay varias del mismo día, manda la última. */
export function parsearPasos(texto) {
  const filas = {};
  (texto ?? "").split(/\r?\n/).forEach((l, i) => {
    if (i === 0 || !l.trim()) return;
    const [fecha = "", pasos = "", distancia = "", fuente = "", hora = "", energia = "", pisos = "", vel = ""] = l.split(",").map(s => s.trim());
    const p = parseInt(pasos.replace(/\D/g, ""), 10);
    if (!fechaValida(fecha) || isNaN(p)) return;
    const n = s => { const v = parseFloat(s.replace(",", ".")); return isNaN(v) ? null : v; };
    filas[fecha] = { pasos: p, distancia_km: n(distancia), fuente, hora, energia_activa_kcal: n(energia), pisos: n(pisos), velocidad_kmh: n(vel) };
  });
  return filas;
}

/**
 * sesiones: lista de datos/actividad/AAAA-MM.json · pasos: salida de parsearPasos
 * catalogo: config/actividades.json (.actividades) · peso: kg de la última medición
 * Devuelve { dias: {fecha: {sesiones, descanso, pasos, minutos, kcal, neto, pasos_sesiones}}, revisar }.
 */
export function calcularActividad(sesiones, pasos = {}, catalogo = [], peso = null) {
  const cat = new Map(catalogo.map(a => [a.id, a])), dias = {}, revisar = [];
  const dia = f => dias[f] ??= { sesiones: [], descanso: false, pasos: null, minutos: 0, kcal: 0, neto: 0, pasos_sesiones: 0 };
  if (!esNum(peso)) revisar.push({ motivo: "no hay peso en datos/cuerpo.json: las kcal del ejercicio no se pueden calcular" });

  for (const s of sesiones) {
    const donde = { fecha: s?.fecha, hora: s?.hora ?? "", tipo: s?.tipo ?? "" }, mal = motivo => revisar.push({ ...donde, motivo });
    if (!s || !fechaValida(s.fecha)) { mal("sesión sin fecha válida"); continue; }
    const d = dia(s.fecha);
    if (s.tipo === "descanso") { d.descanso = true; continue; }
    const a = cat.get(s.tipo);
    if (!a) mal(`tipo '${s.tipo}' no está en config/actividades.json: usa 'otro'`);
    if (!esNum(s.duracion_min) || s.duracion_min <= 0) { mal("sin duracion_min"); continue; }
    const intensidad = INTENSIDADES.includes(s.intensidad) ? s.intensidad : "media";
    if (s.intensidad != null && !INTENSIDADES.includes(s.intensidad)) mal(`intensidad desconocida: '${s.intensidad}'`);
    const h = s.duracion_min / 60, base = a ?? cat.get("otro");

    let met = base?.met?.[intensidad] ?? 5, ritmo = null;
    if (base?.por_velocidad && esNum(s.distancia_km) && s.distancia_km > 0) {
      ritmo = s.distancia_km / h;
      met = interpolar(RITMO[base.por_velocidad], ritmo);
    }
    let kcal = null, neto = null, fuente = "estimado";
    if (esNum(s.kcal_activas) && s.kcal_activas > 0) {
      neto = s.kcal_activas; fuente = "reloj";
      kcal = esNum(peso) ? neto + peso * h : neto;
    } else if (esNum(peso)) {
      kcal = met * peso * h; neto = (met - 1) * peso * h;
    }
    const pasosSesion = (base?.pasos_min ?? 0) * s.duracion_min;
    d.sesiones.push({ hora: s.hora ?? "", tipo: s.tipo, nombre: a?.nombre ?? s.tipo, duracion_min: s.duracion_min, intensidad,
      distancia_km: esNum(s.distancia_km) ? s.distancia_km : null, ritmo_kmh: ritmo, met: fuente === "reloj" ? null : met,
      kcal, neto, fuente, nota: s.nota ?? "" });
    d.minutos += s.duracion_min; d.kcal += kcal ?? 0; d.neto += neto ?? 0; d.pasos_sesiones += pasosSesion;
  }
  for (const [f, p] of Object.entries(pasos)) dia(f).pasos = p;
  for (const d of Object.values(dias)) d.sesiones.sort((a, b) => (a.hora || "99") < (b.hora || "99") ? -1 : 1);
  return { dias, revisar };
}

/** Gasto estimado de un día (o null sin basal). `dia` puede faltar: entonces es el de un día sedentario. */
export function gastoDia(dia, basal, peso) {
  if (!esNum(basal)) return null;
  const base = basal * FACTOR_BASE, ejercicio = dia?.neto ?? 0;
  const extra = dia?.pasos && esNum(peso)
    ? Math.max(0, dia.pasos.pasos - dia.pasos_sesiones - PASOS_BASE) * KCAL_PASO_KG * peso : 0;
  return { base, ejercicio, pasos: extra, total: base + ejercicio + extra,
    con_datos: !!(dia && (dia.sesiones.length || dia.pasos || dia.descanso)) };
}

/** Resumen por día para datos/gasto.json (cifras redondeadas). */
export function resumenGasto(dias, basal, peso) {
  const out = {};
  for (const f of Object.keys(dias).sort()) {
    const d = dias[f], g = gastoDia(d, basal, peso);
    out[f] = {
      sesiones: d.sesiones.map(s => ({ hora: s.hora, tipo: s.tipo, duracion_min: s.duracion_min, intensidad: s.intensidad,
        kcal: s.kcal == null ? null : Math.round(s.kcal), fuente: s.fuente })),
      descanso: d.descanso, minutos: d.minutos, kcal_ejercicio: Math.round(d.kcal),
      pasos: d.pasos?.pasos ?? null,
      kcal_activas_iphone: d.pasos?.energia_activa_kcal ?? null,
      gasto_estimado: g ? Math.round(g.total) : null,
    };
  }
  return out;
}
