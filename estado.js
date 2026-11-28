// Reglas del juego. Lo usan la web app y scripts/estado.mjs (GitHub), así que
// los números que ve Pablo y los que lee Instinct salen del mismo código.
//
// - Cada hábito hecho suma xp_check. Si el día anterior no se hizo, suma xp_rescate.
// - Un día con todos los hábitos activos hechos suma xp_dia_completo (los que tienen
//   `desde` solo se exigen a partir de esa fecha).
// - La XP y los votos nunca bajan. No hay rachas.
// - Un hábito está consolidado cuando lleva al menos ventana_dias desde su primer
//   registro y se ha hecho en umbral_consolidado o más de los últimos ventana_dias.
// - Un hábito con `desde` posterior a hoy todavía no sale (empieza ese día).
// - Un hábito puede tener `niveles` (escalera) y `nivel` (el actual): la versión
//   mínima cuenta igual; el nivel es lo que pide hoy. Lo sube la revisión semanal.

export const umbralNivel = n => 50 * n * (n - 1);   // XP total para llegar al nivel n

export const hoyEn = zona =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: zona }).format(new Date());

export const horaEn = zona =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: zona, hour: "2-digit", minute: "2-digit" }).format(new Date());

export const CABECERA = "fecha,habito,valor,nota,hora";

export function sumarDias(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diasEntre = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);

const fechaValida = s =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && sumarDias(s, 0) === s;

/** Filas del registro: [{linea, fecha, habito, valor, nota, hora}] (sin la cabecera). */
export function parsearCSV(texto) {
  const filas = [];
  texto.split(/\r?\n/).forEach((l, i) => {
    if (i === 0 || !l.trim()) return;
    const [fecha = "", habito = "", valor = "", nota = "", hora = ""] = l.split(",");
    const limpio = s => s.trim().replace(/^"|"$/g, "");
    filas.push({ linea: i + 1, fecha: limpio(fecha), habito: limpio(habito),
      valor: limpio(valor), nota: limpio(nota), hora: limpio(hora) });
  });
  return filas;
}

/** Texto del registro con la marca de ese día y hábito puesta (o quitada si valor es null). */
export function conMarca(texto, fecha, habito, valor, nota = "app", hora = "") {
  const lineas = texto.split(/\r?\n/).filter((l, i) =>
    i > 0 && l.trim() && !l.startsWith(`${fecha},${habito},`));
  if (valor != null) lineas.push(`${fecha},${habito},${valor},${nota},${hora}`);
  return [CABECERA, ...lineas].join("\n") + "\n";
}

/** Nivel actual de un hábito con escalera: {nivel, niveles, pide}; {} si no tiene. */
export function nivelDe(h) {
  const ns = Array.isArray(h?.niveles) ? h.niveles : [];
  if (!ns.length) return {};
  const n = Number.isInteger(h.nivel) ? Math.min(Math.max(h.nivel, 1), ns.length) : 1;
  return { nivel: n, niveles: ns.length, pide: ns.find(x => x.nivel === n)?.pide ?? ns[n - 1]?.pide ?? "" };
}

/** Devuelve {estado, hechos}; hechos es {habito: {fecha: valor}}. */
export function calcular(config, filas, hoy) {
  const juego = config.juego;
  const activos = config.habitos.filter(h => (h.estado === "activo" || h.estado === "consolidado")
    && !(fechaValida(h.desde ?? "") && h.desde > hoy));
  const conocidos = new Set(config.habitos.map(h => h.id));
  const hechos = Object.fromEntries(config.habitos.map(h => [h.id, {}]));
  const descartadas = [];
  for (const f of filas) {
    const motivo = !fechaValida(f.fecha) ? `fecha no válida: '${f.fecha}'`
      : !conocidos.has(f.habito) ? `hábito desconocido: '${f.habito}'`
      : !f.valor ? "valor vacío" : null;
    if (motivo) descartadas.push({ linea: f.linea, motivo });
    else hechos[f.habito][f.fecha] = f.valor;
  }

  const ayer = sumarDias(hoy, -1);
  let xp = 0;
  const habitos = activos.map(h => {
    const dias = Object.keys(hechos[h.id]).filter(d => d <= hoy).sort();
    const tiene = new Set(dias);
    const info = { id: h.id, nombre: h.nombre, area: h.area, votos: dias.length,
      hecho_hoy: tiene.has(hoy), rescate_hoy: false, pct_ventana: null,
      consolidado: false, ultimo_valor: null, ...nivelDe(h) };
    if (!dias.length) return info;

    const inicio = dias[0];
    for (const d of dias)
      xp += d > inicio && !tiene.has(sumarDias(d, -1)) ? juego.xp_rescate : juego.xp_check;
    info.rescate_hoy = !tiene.has(hoy) && ayer >= inicio && !tiene.has(ayer);

    // Ventana: últimos N días; hoy solo cuenta si ya está hecho.
    const fin = tiene.has(hoy) ? hoy : ayer;
    const corte = sumarDias(fin, -(juego.ventana_dias - 1));
    const ini = inicio > corte ? inicio : corte;
    const total = diasEntre(fin, ini) + 1;
    if (total > 0) {
      const enVentana = dias.filter(d => d >= ini && d <= fin).length;
      info.pct_ventana = Math.round(100 * enVentana / total) / 100;
      info.consolidado = diasEntre(fin, inicio) + 1 >= juego.ventana_dias
        && enVentana / total >= juego.umbral_consolidado;
    }
    info.primer_dia = inicio;
    if (h.tipo === "numero") {
      const ultimo = dias.at(-1);
      info.ultimo_valor = { fecha: ultimo, valor: hechos[h.id][ultimo] };
    }
    return info;
  });

  // Bonus de día completo: todos los hábitos activos ese día hechos. Un hábito con
  // `desde` no cuenta antes de esa fecha, así que añadirlo no quita bonus pasados.
  const exigidos = d => activos.filter(h => !h.desde || h.desde <= d);
  const diasCompletos = [...new Set(activos.flatMap(h => Object.keys(hechos[h.id])))]
    .filter(d => d <= hoy && exigidos(d).length && exigidos(d).every(h => d in hechos[h.id])).length;
  xp += diasCompletos * juego.xp_dia_completo;

  let nivel = 1;
  while (umbralNivel(nivel + 1) <= xp) nivel++;
  return {
    hechos,
    estado: { hoy, xp, nivel, xp_para_siguiente_nivel: umbralNivel(nivel + 1) - xp,
      dias_completos: diasCompletos, votos_totales: habitos.reduce((s, h) => s + h.votos, 0),
      habitos, filas_descartadas: descartadas },
  };
}
