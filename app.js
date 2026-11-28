import { calcular, conMarca, horaEn, hoyEn, parsearCSV, sumarDias, umbralNivel } from "./estado.js?v=7100ce2";
import { cliente } from "./github.js?v=7100ce2";
import { pintarInforme } from "./informe.js?v=7100ce2";
import { diasActividad, pintarActividad } from "./actividad.js?v=7100ce2";
import { pintarComida, resumenDia } from "./comida.js?v=7100ce2";
import { gastoDia } from "./gasto.js?v=7100ce2";
import { pintarSalud, ultimoBasal } from "./salud.js?v=7100ce2";
import { conAceptadas, pintarRevision } from "./revision.js?v=7100ce2";
import { metricas, preparar as prepararRevision, semanaISO, sumarMes, unirAgenda } from "./revision-datos.js?v=7100ce2";

const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const lista = hs => hs.map(h => h.nombre).join(", ");
const DEMO = new URLSearchParams(location.search).has("demo");
const CLAVE = "tracker.ajustes";
const VERSION = "7100ce2";                  // la pone la publicación

// Si hay una versión publicada más nueva que la que está abierta, se recarga sola.
async function buscarVersionNueva() {
  if (VERSION === "dev") return;
  try {
    const { v } = await (await fetch("version.json?t=" + Date.now(), { cache: "no-store" })).json();
    if (v && v !== VERSION && sessionStorage.getItem("tracker.recarga") !== v) {
      sessionStorage.setItem("tracker.recarga", v);   // una sola recarga por versión
      location.replace("./?v=" + v + (DEMO ? "&demo" : ""));
    }
  } catch { /* sin conexión: se queda la versión abierta */ }
}

// ---- Datos
let gh = null, config = null, texto = "", cuerpo = "";
let comidas = null;                     // { comidas, alimentos, productos } o { error }
let actividad = null;                   // { sesiones, pasos, catalogo } o { error }
let E, J, hoy, hechos, pendientes, fiesta, frases;
let festejo = 0, aviso = "";            // celebración breve tras marcar un hábito

function leerAjustes() {
  try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; }
}

function demo() {
  // 30 días inventados, sin red: sirve para enseñar la app y para probarla.
  const cfg = {
    zona_horaria: "Europe/Madrid",
    perfil: { altura_cm: 180, nacimiento: "1995-05-10", sexo: "hombre" },
    juego: { xp_check: 10, xp_rescate: 20, xp_dia_completo: 10, ventana_dias: 21, umbral_consolidado: 0.8 },
    habitos: [
      { id: "cama", nombre: "Hacer la cama", area: "entorno", identidad: "Soy alguien que cuida su entorno", tipo: "si_no", minimo: "Estirar el edredón", estado: "activo" },
      { id: "peso", nombre: "Pesarme", area: "cuerpo", identidad: "Soy alguien que cuida su cuerpo", tipo: "si_no", minimo: "Subirme a la báscula", estado: "activo" },
      { id: "lectura", nombre: "Leer una página", area: "mente", identidad: "Soy alguien que lee cada día", tipo: "si_no", minimo: "Leer un párrafo", estado: "activo" },
      { id: "comida", nombre: "Apuntar lo que como", area: "cuerpo", identidad: "Soy alguien que sabe lo que come", tipo: "si_no", minimo: "Contarle a Instinct una comida", ancla: "Al terminar de comer", estado: "activo" },
      { id: "fuerza", nombre: "Sentadillas y flexiones", area: "cuerpo", identidad: "Soy alguien que entrena su cuerpo cada día", tipo: "si_no",
        minimo: "Una serie: 10 sentadillas y 10 flexiones", ancla: "Después de pesarme", estado: "activo", nivel: 2,
        niveles: [1, 2, 3, 4, 5].map(n => ({ nivel: n, pide: n + (n === 1 ? " serie" : " series") + " de 10 sentadillas y 10 flexiones" })) },
    ],
  };
  const h0 = hoyEn(cfg.zona_horaria);
  let semilla = 7, peso = 80.2, csv = "fecha,habito,valor,nota\n";
  const medidas = [];
  const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
  for (let i = 29; i >= 1; i--) {
    peso += azar() * 0.6 - 0.4;
    for (const h of cfg.habitos)
      if (i === 1 ? h.id !== "lectura" : azar() < 0.85) {
        csv += `${sumarDias(h0, -i)},${h.id},1,\n`;
        if (h.id === "peso")
          medidas.push({ fecha: sumarDias(h0, -i), hora: "07:35", tipo_cuerpo: "En forma",
            medidas: {
              peso_kg: +peso.toFixed(1), puntuacion: 84, imc: +(peso / 3.24).toFixed(1), grasa_pct: +(19 + i * 0.04).toFixed(1),
              grasa_kg: +(peso * 0.19).toFixed(1), musculo_kg: +(peso * 0.75).toFixed(1), musculo_pct: 75.1,
              musculo_esqueletico_kg: +(peso * 0.41).toFixed(1), agua_pct: 55.2, agua_kg: +(peso * 0.552).toFixed(1),
              proteina_pct: 17.8, proteina_kg: +(peso * 0.178).toFixed(1), mineral_oseo_kg: 3.4, mineral_oseo_pct: 4.2,
              peso_sin_grasa_kg: +(peso * 0.81).toFixed(1), grasa_visceral: 8, metabolismo_basal_kcal: Math.round(peso * 21),
              cintura_cadera: 0.9, edad_corporal: 29, frecuencia_cardiaca_lpm: 64 },
            valoraciones: { peso_kg: "Estándar", imc: "Estándar", grasa_pct: "Estándar", musculo_kg: "Estándar", grasa_visceral: "Estándar", metabolismo_basal_kcal: "Por encima" },
            objetivos: { peso_estandar_kg: 76.5, control_peso_kg: -3.7, control_grasa_kg: -2.1, control_musculo: "Continuar mantener" } });
      }
  }
  return { cfg, csv, medidas: JSON.stringify(medidas) };
}

function demoComidas(h0) {
  // Unas comidas inventadas con las tres fuentes: tabla, etiqueta y estimación.
  const alimentos = [
    { id: "copos_avena", nombre: "Copos de avena", por_100g: { kcal: 372, proteina_g: 13.5, carbohidratos_g: 58.7, grasa_g: 7, fibra_g: 10 } },
    { id: "leche_semidesnatada", nombre: "Leche semidesnatada", por_100g: { kcal: 46, proteina_g: 3.1, carbohidratos_g: 4.7, grasa_g: 1.6, fibra_g: 0 } },
    { id: "platano", nombre: "Plátano", por_100g: { kcal: 93, proteina_g: 1.1, carbohidratos_g: 20.2, grasa_g: 0.3, fibra_g: 2.6 }, unidad_g: 120 },
    { id: "lentejas_chorizo", nombre: "Lentejas con chorizo", por_100g: { kcal: 154, proteina_g: 7.5, carbohidratos_g: 11, grasa_g: 8, fibra_g: 4 } },
    { id: "pan_barra", nombre: "Pan de barra", por_100g: { kcal: 271, proteina_g: 9, carbohidratos_g: 54, grasa_g: 1.5, fibra_g: 2.5 }, unidad_g: 40 },
    { id: "pechuga_pollo", nombre: "Pechuga de pollo", por_100g: { kcal: 156, proteina_g: 31, carbohidratos_g: 0, grasa_g: 3.6, fibra_g: 0 } },
    { id: "ensalada_verde", nombre: "Ensalada", por_100g: { kcal: 19, proteina_g: 1, carbohidratos_g: 2.5, grasa_g: 0.2, fibra_g: 1.5 } },
    { id: "aceite_oliva", nombre: "Aceite de oliva", por_100g: { kcal: 899, proteina_g: 0, carbohidratos_g: 0, grasa_g: 99.9, fibra_g: 0 } },
    { id: "cerveza", nombre: "Cerveza", por_100g: { kcal: 44, proteina_g: 0.5, carbohidratos_g: 3.6, grasa_g: 0, fibra_g: 0, alcohol_g: 3.9 } },
  ];
  const productos = [{ id: "skyr_demo", nombre: "Skyr natural", marca: "Demo", unidad_g: 150,
    por_100g: { kcal: 63, grasa_g: 0.2, saturadas_g: 0.1, carbohidratos_g: 4, azucares_g: 4, fibra_g: 0, proteina_g: 11, sal_g: 0.1 } }];
  let semilla = 11; const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
  const lista = [];
  for (let i = 13; i >= 0; i--) {
    if (i && azar() < 0.15) continue;   // algún día sin apuntar
    const f = sumarDias(h0, -i), k = 0.8 + azar() * 0.5;
    lista.push({ fecha: f, hora: "08:10", momento: "desayuno", descripcion: "Avena con leche y plátano", alimentos: [
      { nombre: "Copos de avena", ref: "copos_avena", gramos: Math.round(50 * k) },
      { nombre: "Leche semidesnatada", ref: "leche_semidesnatada", gramos: 250 },
      { nombre: "Plátano", ref: "platano", unidades: 1 }] });
    if (i === 0) continue;
    lista.push({ fecha: f, hora: "14:30", momento: "comida", descripcion: "Lentejas con chorizo y pan", alimentos: [
      { nombre: "Lentejas con chorizo", ref: "lentejas_chorizo", gramos: Math.round(350 * k) },
      { nombre: "Pan de barra", ref: "pan_barra", unidades: 1 }] });
    lista.push({ fecha: f, hora: "17:30", momento: "merienda", alimentos: [{ nombre: "Skyr natural", producto: "skyr_demo", unidades: 1 }] });
    lista.push({ fecha: f, hora: "21:15", momento: "cena", descripcion: "Pollo a la plancha con ensalada" + (i % 4 ? "" : " y una caña"), alimentos: [
      { nombre: "Pechuga de pollo", ref: "pechuga_pollo", gramos: Math.round(160 * k) },
      { nombre: "Ensalada", ref: "ensalada_verde", gramos: 150 },
      { nombre: "Aceite de oliva", ref: "aceite_oliva", gramos: 10 },
      { nombre: "Salsa de yogur casera", gramos: 30, por_100g: { kcal: 120, proteina_g: 3, carbohidratos_g: 4, grasa_g: 10 } },
      ...(i % 4 ? [] : [{ nombre: "Cerveza", ref: "cerveza", gramos: 200 }])] });
  }
  return { comidas: lista, alimentos, productos };
}

function demoActividad(h0) {
  const catalogo = [
    { id: "padel", nombre: "Pádel", met: { suave: 4.5, media: 5.5, alta: 7.0 } },
    { id: "correr", nombre: "Correr", met: { suave: 7, media: 9.5, alta: 11.5 }, pasos_min: 160, por_velocidad: "correr" },
    { id: "gimnasio", nombre: "Gimnasio (pesas)", met: { suave: 3.5, media: 5, alta: 6 } },
    { id: "otro", nombre: "Otra actividad", met: { suave: 3.5, media: 5, alta: 7 } },
  ];
  let semilla = 5; const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
  const sesiones = [], pasos = ["fecha,pasos,distancia_km,fuente,hora"];
  for (let i = 13; i >= 0; i--) {
    const f = sumarDias(h0, -i), r = i % 7;
    if (r === 1) sesiones.push({ fecha: f, hora: "12:00", tipo: "padel", duracion_min: 90, intensidad: "alta", nota: "Partido en Húmera" });
    else if (r === 3) sesiones.push({ fecha: f, hora: "07:30", tipo: "correr", duracion_min: 40, distancia_km: 7 });
    else if (r === 5) sesiones.push({ fecha: f, hora: "19:00", tipo: "gimnasio", duracion_min: 60, intensidad: "media", kcal_activas: 310 });
    else if (r === 6) sesiones.push({ fecha: f, tipo: "descanso" });
  }
  for (let i = 420; i >= 0; i--) {   // un año largo de pasos, como los que trae el export de Salud
    const f = sumarDias(h0, -i), est = 1500 * Math.sin(i / 58);
    if (azar() < 0.95) pasos.push(`${f},${Math.round(4500 + est + azar() * 8000 + (i % 7 === 3 ? 6000 : 0))},,salud,${i ? "" : "15:26"},,${Math.round(azar() * 8)}`);
  }
  const diaria = ["fecha,velocidad_kmh,longitud_paso_cm,asimetria_pct,doble_apoyo_pct,ruido_auriculares_db,minutos_ruido_80db"];
  for (let i = 420; i >= 0; i--) diaria.push(`${sumarDias(h0, -i)},${(4.3 + azar() * 0.6).toFixed(2)},${(74 + azar() * 6).toFixed(1)},${(azar() * 2).toFixed(1)},${(27 + azar() * 3).toFixed(1)},${Math.round(62 + azar() * 12)},${Math.round(azar() < 0.2 ? azar() * 30 : 0)}`);
  return { sesiones, pasos: pasos.join("\n"), diaria: diaria.join("\n"), catalogo };
}

// Sesiones de deporte de los últimos 40 días, los pasos y el catálogo de actividades.
async function cargarActividad() {
  if (DEMO) { actividad ??= demoActividad(hoyEn(config.zona_horaria)); return; }
  try {
    const desde = sumarDias(hoyEn(config.zona_horaria), -40).slice(0, 7);
    const meses = (await gh.listar("datos/actividad")).filter(n => /^\d{4}-\d{2}\.json$/.test(n) && n.slice(0, 7) >= desde);
    const sinFichero = v => e => { if (e.status === 404) return v; throw e; };
    const [c, p, sd, ...ms] = await Promise.all([
      gh.leerGrande("config/actividades.json").catch(sinFichero("{}")),
      gh.leerGrande("datos/pasos.csv").catch(sinFichero("")),
      gh.leerGrande("datos/salud_diaria.csv").catch(sinFichero("")),
      ...meses.map(n => gh.leerGrande("datos/actividad/" + n))]);
    let roto = null;
    const json = (t, nombre, v) => { try { return JSON.parse(t); } catch { roto ??= nombre; return v; } };
    actividad = {
      catalogo: json(c, "config/actividades.json", {}).actividades ?? [],
      pasos: p, diaria: sd,
      sesiones: ms.flatMap((t, i) => { const l = json(t, "datos/actividad/" + meses[i], []); return Array.isArray(l) ? l : []; }),
    };
    if (roto) $("aviso").textContent = roto + " no es un JSON válido. Díselo a Instinct.";
  } catch (e) {
    actividad ??= { error: "No se puede cargar la actividad: " + (e.status ? e.message : "sin conexión.") };
  }
}

// Comidas de los meses que tocan los últimos 40 días, la tabla de alimentos y los productos.
async function cargarComidas() {
  if (DEMO) { comidas ??= demoComidas(hoyEn(config.zona_horaria)); return; }
  try {
    const desde = sumarDias(hoyEn(config.zona_horaria), -40).slice(0, 7);
    const meses = (await gh.listar("datos/comidas")).filter(n => /^\d{4}-\d{2}\.json$/.test(n) && n.slice(0, 7) >= desde);
    const sinFichero = v => e => { if (e.status === 404) return v; throw e; };
    const [a, p, ...ms] = await Promise.all([
      gh.leerGrande("config/alimentos.json").catch(sinFichero("{}")),
      gh.leerGrande("datos/productos.json").catch(sinFichero("[]")),
      ...meses.map(n => gh.leerGrande("datos/comidas/" + n))]);
    let roto = null;
    const json = (t, nombre, v) => { try { return JSON.parse(t); } catch { roto ??= nombre; return v; } };
    comidas = {
      alimentos: json(a, "config/alimentos.json", {}).alimentos ?? [],
      productos: json(p, "datos/productos.json", []),
      comidas: ms.flatMap((t, i) => { const l = json(t, "datos/comidas/" + meses[i], []); return Array.isArray(l) ? l : []; }),
    };
    if (roto) $("aviso").textContent = roto + " no es un JSON válido. Díselo a Instinct.";
  } catch (e) {
    comidas ??= { error: "No se pueden cargar las comidas: " + (e.status ? e.message : "sin conexión.") };
  }
}

async function cargar() {
  $("cargando").hidden = !!config;
  if (DEMO) {
    if (!config) ({ cfg: config, csv: texto, medidas: cuerpo } = demo());
  } else {
    const [c, r, m] = await Promise.all([gh.leer("config/habitos.json"), gh.leer("datos/registro.csv"),
      gh.leer("datos/cuerpo.json").catch(e => { if (e.status === 404) return { texto: "[]" }; throw e; })]);
    config = JSON.parse(c.texto); texto = r.texto; cuerpo = m.texto;
  }
  $("cargando").hidden = true; $("ajustes").hidden = true; $("panel").hidden = false;
  pintarTodo();
  Promise.all([cargarComidas(), cargarActividad()]).then(pintarTodo);
  if (!DEMO) { rev.ids = null; rev.datos = {}; rev.propuestas = null; }
  if (!vistaLista) mostrarVista(vista);
  else if (vista === "revision") abrirRevision();
}

function preparar() {
  hoy = hoyEn(config.zona_horaria);
  ({ estado: E, hechos } = calcular(config, parsearCSV(texto), hoy));
  J = config.juego;
  pendientes = E.habitos.filter(h => !h.hecho_hoy);
  const dobles = pendientes.filter(h => h.rescate_hoy);
  fiesta = E.habitos.length > 0 && pendientes.length === 0;
  frases = fiesta ? ["¡Día completo! +" + J.xp_dia_completo + " XP", "Hoy has votado por quien quieres ser."]
    : E.votos_totales === 0 ? ["Empezamos. Lo primero: " + E.habitos[0]?.nombre + ".", "Con la versión mínima ya cuenta."]
    : [dobles.length ? "Hoy vale doble: " + lista(dobles) : "Te queda: " + lista(pendientes),
       "Con la versión mínima ya cuenta.", "Faltan " + E.xp_para_siguiente_nivel + " XP para el nivel " + (E.nivel + 1) + "."];
}

// ---- Pintado
function pintarCabecera() {
  $("fecha").textContent = new Date(hoy + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })
    + " · " + E.votos_totales + " votos" + (DEMO ? " · demo" : "");
  $("nivel").textContent = E.nivel;
  const base = umbralNivel(E.nivel), tope = umbralNivel(E.nivel + 1);
  $("xp").textContent = E.xp + " / " + tope + " XP";
  requestAnimationFrame(() => $("barra").style.width = Math.round(100 * (E.xp - base) / (tope - base)) + "%");
}

function pintarAccion(h, c) {
  const a = el("div", "accion");
  if (c.tipo === "numero") {
    if (h.hecho_hoy) {
      a.append(el("span", "valor", hechos[h.id][hoy] + " " + (c.unidad ?? "")));
      const b = el("button", "menor", "Cambiar"); b.type = "button"; b.onclick = () => marcar(h, c, null); a.append(b);
    } else {
      const i = el("input"); i.type = "text"; i.inputMode = "decimal"; i.autocomplete = "off";
      i.placeholder = c.unidad ?? ""; i.setAttribute("aria-label", h.nombre);
      const b = el("button", "", "Guardar"); b.type = "button";
      const enviar = () => { if (i.value.trim()) marcar(h, c, i.value); else i.focus(); };
      b.onclick = enviar; i.onkeydown = e => { if (e.key === "Enter") enviar(); };
      a.append(i, b);
    }
  } else if (h.hecho_hoy) {
    a.append(el("span", "valor", "Hecho hoy"));
    const b = el("button", "menor", "Deshacer"); b.type = "button"; b.onclick = () => marcar(h, c, null); a.append(b);
  } else {
    const b = el("button", "", h.rescate_hoy ? "Hecho · vale doble" : "Hecho"); b.type = "button";
    b.onclick = () => marcar(h, c, "1"); a.append(b);
  }
  return a;
}

function pintarHabitos() {
  $("habitos").replaceChildren();
  for (const h of E.habitos) {
    const c = config.habitos.find(x => x.id === h.id);
    const t = el("div", "habito" + (h.hecho_hoy ? " hecho" : ""));
    const n = el("div", "nombre"); n.append(el("span", "", h.nombre));
    n.append(h.hecho_hoy ? el("span", "etq hecho", "hecho")
      : h.rescate_hoy ? el("span", "etq doble", "hoy vale doble") : el("span", "etq", "pendiente"));
    const v = el("div", "votos", h.votos + " "); v.append(el("small", "", h.votos === 1 ? "voto" : "votos"));
    const pct = Math.round(100 * (h.pct_ventana ?? 0));
    const m = el("div", "meta"); const mi = el("i"); mi.style.width = pct + "%";
    const mb = el("b"); mb.style.left = (100 * J.umbral_consolidado) + "%"; m.append(mi, mb);
    const pie = h.consolidado ? "Consolidado"
      : h.votos ? pct + " % de los últimos días · se consolida al " + (100 * J.umbral_consolidado) + " % en " + J.ventana_dias + " días"
      : "Mínimo: " + c.minimo;
    const ident = el("div", "ident", c.identidad);
    const r = h.id === "comida" ? resumenDia(comidas, hoy) : null;
    if (r) ident.append(el("br"), `Hoy: ${Math.round(r.kcal).toLocaleString("es-ES")} kcal en ${r.comidas} ${r.comidas === 1 ? "comida" : "comidas"}`);
    if (c.ancla) ident.append(el("br"), "↳ " + c.ancla);
    if (h.nivel) {
      const nv = el("div", "nivel-habito"); nv.append(el("b", "", "Nivel " + h.nivel + "/" + h.niveles), " " + h.pide);
      ident.append(nv);
    }
    t.append(n, ident, v, m, el("div", "pie", pie), pintarAccion(h, c));
    $("habitos").append(t);
  }
}

function pintarMapa() {
  $("mapa").replaceChildren();
  for (const h of E.habitos) {
    const f = el("div", "fila"); f.append(el("span", "", h.nombre));
    const ds = el("div", "dias");
    for (let i = 27; i >= 0; i--) {
      const d = sumarDias(hoy, -i), c = el("i");
      if (hechos[h.id][d] != null) c.classList.add("si");
      else if (!h.primer_dia || d < h.primer_dia) c.classList.add("antes");
      if (i === 0) c.classList.add("hoy");
      c.title = d;
      ds.append(c);
    }
    f.append(ds); $("mapa").append(f);
  }
}

function pintarTodo() {
  preparar(); pintarCabecera(); pintarHabitos(); pintarMapa();
  if (vista === "salud") pintarSalud($("vista-salud"), cuerpo, config?.perfil);
  if (vista === "comida") pintarVistaComida();
  if (vista === "actividad") pintarVistaActividad();
}

const pintarVistaComida = () => {
  const c = ultimoBasal(cuerpo, config?.perfil), { dias } = diasActividad(actividad, c?.peso);
  pintarComida($("vista-comida"), comidas, { hoy, cuerpo: c,
    gastoDe: actividad && !actividad.error ? f => gastoDia(dias[f], c?.basal, c?.peso) : null });
};
const pintarVistaActividad = () => pintarActividad($("vista-actividad"), actividad, { hoy, cuerpo: ultimoBasal(cuerpo, config?.perfil) });

// ---- Marcar un hábito
async function marcar(h, c, valor) {
  if (valor == null && !confirm("¿Quitar el voto de hoy de «" + h.nombre + "»?")) return;
  if (valor != null && c.tipo === "numero") {
    const n = parseFloat(String(valor).replace(",", "."));
    if (!(n >= 20 && n <= 300)) { $("aviso").textContent = "Ese valor no parece un peso en kg."; return; }
    valor = String(n);
  }
  for (const b of document.querySelectorAll(".accion button")) b.disabled = true;
  const antes = E.xp, hora = horaEn(config.zona_horaria), cambio = t => conMarca(t, hoy, h.id, valor, "app", hora);
  $("aviso").textContent = "Guardando…";
  try {
    texto = DEMO ? cambio(texto)
      : await gh.editar("datos/registro.csv", cambio, `Registro ${hoy}: ${valor == null ? "quita" : "marca"} ${h.id} (app)`);
    pintarTodo();
    $("aviso").textContent = DEMO ? "Demo: no se guarda nada." : "Guardado.";
    const ganado = E.xp - antes;
    if (ganado > 0) {
      aviso = "+" + ganado + " XP · " + h.nombre + (fiesta ? " · ¡día completo!" : "");
      festejo = performance.now() + 3200;
    }
  } catch (e) {
    pintarTodo();
    $("aviso").textContent = "No se ha guardado: " + (e.status ? e.message : "sin conexión");
  }
}

// ---- Escena: Pablo y Claude
const ESC = 4, escena = $("escena"), boc = $("bocadillo");
const CUADRO = { quieto: [0], correr: [1, 2], reir: [3, 4], arriba: [5, 0] };
function crear(hoja, cw, ch) {
  const e = el("div", "sprite");
  Object.assign(e.style, { width: cw * ESC + "px", height: ch * ESC + "px",
    backgroundImage: `url(sprites/${hoja}.png)`, backgroundSize: `auto ${ch * ESC}px` });
  escena.append(e);
  const s = { e, cw, w: cw * ESC, rie: 0 };
  e.addEventListener("click", () => s.rie = performance.now() + 1600);
  return s;
}
function pintar(s, anim, x, y, volteo, t) {
  if (s.rie > t) { anim = "reir"; y = 0; }
  const fs = CUADRO[anim], f = fs[Math.floor(t / 250) % fs.length];
  s.e.style.backgroundPositionX = -f * s.cw * ESC + "px";
  s.e.style.transform = `translate(${Math.round(x)}px, ${-Math.round(y)}px) scaleX(${volteo ? -1 : 1})`;
}
const pablo = crear("pablo", 16, 24), claude = crear("claude", 16, 12);
const confeti = Array.from({ length: 7 }, () => crear("cosas", 12, 8));
for (const c of confeti) Object.assign(c.e.style, { bottom: "auto", top: "0", cursor: "default" });

function cuadro(t) {
  requestAnimationFrame(cuadro);
  if (!E || $("panel").hidden || $("vista-habitos").hidden) return;
  const W = escena.clientWidth, s = t / 1000, celebra = festejo > t;
  for (const c of confeti) c.e.style.display = fiesta || celebra ? "" : "none";
  if (fiesta || celebra) {
    const salto = k => Math.abs(Math.sin(s * 4 + k)) * 16;
    pintar(pablo, "arriba", W / 2 - 78, salto(0), false, t);
    pintar(claude, "arriba", W / 2 + 14, salto(1.2), true, t);
    confeti.forEach((c, i) => {
      const y = ((s * 34 + i * 37) % 160);
      c.e.style.backgroundPositionX = -(3 + (Math.floor(t / 250) + i) % 2) * 12 * ESC + "px";
      c.e.style.transform = `translate(${Math.round(W * (i + .5) / confeti.length - 24)}px, ${Math.round(y)}px)`;
    });
    boc.textContent = celebra ? aviso : frases[Math.floor(s / 5) % frases.length]; boc.classList.add("ver");
  } else {
    // Claude entra corriendo con Pablo detrás, se paran a hablar y salen por el otro lado; luego, de vuelta.
    // La app se abre con los dos ya parados en el centro.
    const vel = 170, pausa = 7, rec = W / 2 + 150, medio = 2 * rec / vel + pausa;
    const s2 = s + rec / vel, vuelta = Math.floor(s2 / medio), u = s2 % medio, dir = vuelta % 2 ? -1 : 1;
    const parado = u >= rec / vel && u < rec / vel + pausa;
    const o = u < rec / vel ? -rec + vel * u : parado ? 0 : vel * (u - rec / vel - pausa);
    const pos = (sp, b) => dir === 1 ? b + o : W - (b + o) - sp.w;
    const anim = parado ? "quieto" : "correr";
    pintar(pablo, anim, pos(pablo, W / 2 - 80), 0, dir === -1, t);
    pintar(claude, anim, pos(claude, W / 2 + 16), 0, (dir === -1) !== parado, t);
    boc.textContent = frases[vuelta % frases.length]; boc.classList.toggle("ver", parado);
  }
}

// ---- Pestañas e informe diario
const VISTAS = ["habitos", "comida", "actividad", "salud", "informe", "revision"];
// Se puede abrir una pestaña con la dirección: …/#revision (o #revision/mes)
const [pedida, pedidaTipo] = location.hash.slice(1).split("/");
let vista = VISTAS.includes(pedida) ? pedida : VISTAS.includes(localStorage.getItem("tracker.vista")) ? localStorage.getItem("tracker.vista") : "habitos";
let vistaLista = false;
let informes = null, verInforme = null;   // ficheros disponibles en datos/informes y el que se muestra

function mostrarVista(v) {
  vista = v; localStorage.setItem("tracker.vista", v);
  vistaLista = true;
  for (const x of VISTAS) $("vista-" + x).hidden = x !== v;
  if (v === "salud") pintarSalud($("vista-salud"), cuerpo, config?.perfil);
  if (v === "comida" && E) pintarVistaComida();
  if (v === "actividad" && E) pintarVistaActividad();
  for (const b of document.querySelectorAll("#pestanas button")) b.classList.toggle("activa", b.dataset.vista === v);
  if (v === "informe") abrirInforme();
  if (v === "revision" && config) abrirRevision();
}
for (const b of document.querySelectorAll("#pestanas button")) b.onclick = () => mostrarVista(b.dataset.vista);

const listarInformes = async () =>
  (await gh.listar("datos/informes")).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();

async function abrirInforme(nombre) {
  const caja = $("vista-informe");
  try {
    let datos;
    if (DEMO) {
      datos = await (await fetch("demo-informe.json")).json(); informes = ["demo"]; verInforme = "demo";
    } else {
      informes ??= await listarInformes();
      if (!informes.length) {
        caja.replaceChildren(el("p", "vacio", "Todavía no hay ningún informe. Instinct los publica cada mañana en datos/informes/."));
        return;
      }
      verInforme = informes.includes(nombre) ? nombre : informes.includes(verInforme) ? verInforme : informes.at(-1);
      if (!caja.childElementCount) caja.replaceChildren(el("p", "vacio", "Cargando informe…"));
      datos = JSON.parse(await gh.leerGrande("datos/informes/" + verInforme));
    }
    const i = informes.indexOf(verInforme), ev = E.habitos.find(h => h.id === "evangelio");
    pintarInforme(caja, datos, {
      anterior: i > 0 ? () => abrirInforme(informes[i - 1]) : null,
      siguiente: i < informes.length - 1 ? () => abrirInforme(informes[i + 1]) : null,
      evangelio: ev && datos.fecha === hoy && !DEMO ? {
        hecho: ev.hecho_hoy,
        marcar: async () => { await marcar(ev, config.habitos.find(c => c.id === "evangelio"), "1"); abrirInforme(); },
      } : null,
    });
  } catch (e) {
    caja.replaceChildren(el("p", "vacio", "No se puede abrir el informe: "
      + (e.status ? e.message : e instanceof SyntaxError ? "el fichero no es un JSON válido." : "sin conexión.")));
  }
}

// Al volver a la app, si Instinct ha publicado un informe nuevo se abre ese.
async function buscarInformeNuevo() {
  if (DEMO || !gh || !config) return;
  try {
    const ultimo = informes?.at(-1); informes = await listarInformes();
    if (vista === "informe" && informes.at(-1) !== ultimo) abrirInforme(informes.at(-1));
    if (vista === "revision") { rev.ids = null; rev.propuestas = null; rev.datos = {}; abrirRevision(); }
  } catch { /* sin conexión */ }
}

// ---- Revisión semanal y mensual
const rev = { tipo: (pedidaTipo ?? localStorage.getItem("tracker.revision")) === "mes" ? "mes" : "semana", id: null, ids: null, datos: {}, propuestas: null, demo: null };
const sinFichero = v => e => { if (e.status === 404) return v; throw e; };

async function abrirRevision(tipo = rev.tipo, id = rev.id) {
  const caja = $("vista-revision");
  try {
    if (DEMO) rev.demo ??= demoRevision();
    if (!rev.ids) {
      if (DEMO) rev.ids = rev.demo.ids;
      else {
        const [a, b] = await Promise.all([gh.listar("datos/revisiones"), gh.listar("datos/revisiones/metricas")]);
        const todos = [...new Set([...a, ...b].filter(n => /^\d{4}-(W\d{2}|\d{2})\.json$/.test(n)).map(n => n.slice(0, -5)))].sort();
        rev.ids = { semana: todos.filter(x => x.includes("W")), mes: todos.filter(x => !x.includes("W")), texto: new Set(a), cifras: new Set(b) };
      }
    }
    if (!rev.ids[tipo].length && rev.ids[tipo === "mes" ? "semana" : "mes"].length) tipo = tipo === "mes" ? "semana" : "mes";
    if (tipo !== rev.tipo) id = null;
    rev.tipo = tipo; localStorage.setItem("tracker.revision", tipo);
    // Sin periodo pedido, la última revisión con análisis (o la última con cifras).
    const conTexto = rev.ids[tipo].filter(x => DEMO ? rev.demo.datos[x]?.revision : rev.ids.texto.has(x + ".json"));
    rev.id = rev.ids[tipo].includes(id) ? id : conTexto.at(-1) ?? rev.ids[tipo].at(-1) ?? null;
    if (rev.id && !rev.datos[rev.id]) {
      if (DEMO) rev.datos[rev.id] = rev.demo.datos[rev.id];
      else {
        if (!caja.childElementCount) caja.replaceChildren(el("p", "vacio", "Cargando revisión…"));
        const leerJSON = (ruta, hay) => hay ? gh.leerGrande(ruta).then(JSON.parse) : Promise.resolve(null);
        const [m, r] = await Promise.all([leerJSON(`datos/revisiones/metricas/${rev.id}.json`, rev.ids.cifras.has(rev.id + ".json")),
          leerJSON(`datos/revisiones/${rev.id}.json`, rev.ids.texto.has(rev.id + ".json"))]);
        rev.datos[rev.id] = { metricas: m, revision: r };
      }
    }
    if (rev.propuestas == null)
      rev.propuestas = DEMO ? rev.demo.propuestas : JSON.parse(await gh.leerGrande("datos/agenda/propuestas.json").catch(sinFichero("[]")));
    pintarRevision(caja, { tipo: rev.tipo, id: rev.id, ids: rev.ids, ...(rev.datos[rev.id] ?? {}), propuestas: rev.propuestas, demo: DEMO,
      ir: (t, i) => { abrirRevision(t, i); caja.scrollIntoView?.({ block: "start" }); }, aceptar: aceptarHuecos });
  } catch (e) {
    pintarRevision(caja, { tipo: rev.tipo, id: rev.id, ids: rev.ids ?? { semana: [], mes: [] }, error: "No se puede abrir la revisión: "
      + (e.status ? e.message : e instanceof SyntaxError ? "un fichero no es un JSON válido." : "sin conexión."), ir: abrirRevision });
  }
}

async function aceptarHuecos(ids) {
  const ahora = hoy + "T" + horaEn(config.zona_horaria), cambio = t => conAceptadas(t, ids, ahora);
  if (DEMO) rev.propuestas = JSON.parse(cambio(JSON.stringify(rev.propuestas)));
  else rev.propuestas = JSON.parse(await gh.editar("datos/agenda/propuestas.json", cambio,
    `Revisión: acepta ${ids.length === 1 ? "el hueco " + ids[0] : ids.length + " huecos"} (app)`));
  $("aviso").textContent = DEMO ? "Demo: no se guarda nada." : "Aceptado. Instinct lo pasará a tu calendario esta noche (o díselo y lo hace ya).";
  abrirRevision();
}

// Revisiones de ejemplo: las cifras salen del mismo código que usa scripts/revision.mjs.
function demoRevision() {
  const h0 = hoyEn(config.zona_horaria), act = actividad?.sesiones ? actividad : demoActividad(h0), com = comidas?.comidas ? comidas : demoComidas(h0);
  const eventos = [];
  for (let i = -35; i <= 8; i++) {
    const f = sumarDias(h0, i), dow = (new Date(f + "T12:00:00Z").getUTCDay() + 6) % 7;
    if (dow < 5) eventos.push({ id: "d" + i + "a", fecha: f, inicio: "10:00", fin: "11:00", titulo: "Seguimiento de proyectos", lugar: "Teams", tipo: null, estado: "planeado" },
      { id: "d" + i + "b", fecha: f, inicio: "15:00", fin: "16:30", titulo: "Reunión con cliente", lugar: dow === 2 ? "Oficina" : "Teams", tipo: null, estado: "planeado" });
    if (dow === 4) eventos.push({ id: "d" + i + "t", fecha: f, inicio: "19:30", fin: "22:40", titulo: "Tren Madrid → Logroño", lugar: "Atocha", tipo: null, estado: "planeado" });
    if (dow === 1 && i < 0) eventos.push({ id: "d" + i + "g", fecha: f, inicio: "19:00", fin: "20:00", titulo: "Gimnasio", lugar: "", tipo: "gimnasio", estado: "planeado" });
    for (const s of act.sesiones.filter(s => s.fecha === f && s.tipo !== "descanso"))
      eventos.push({ id: "d" + i + s.tipo, fecha: f, inicio: s.hora || "12:00", fin: s.hora ? String(+s.hora.slice(0, 2) + 1).padStart(2, "0") + s.hora.slice(2) : "13:00",
        titulo: { padel: "Pádel", correr: "Correr", gimnasio: "Gimnasio" }[s.tipo] ?? s.tipo, lugar: "", tipo: s.tipo, estado: "hecho" });
  }
  const ctx = prepararRevision({ config, hoy: h0, catalogo: act.catalogo, registro: texto, cuerpo: JSON.parse(cuerpo || "[]"),
    comidas: com.comidas, alimentos: com.alimentos, productos: com.productos, sesiones: act.sesiones, pasos: act.pasos,
    objetivos: { peso: { inicio_fecha: sumarDias(h0, -28), inicio_kg: 80.5, meta_kg: 75, ritmo_kg_semana: -0.5 },
      deporte: { gimnasio_semana: 2, tipos_gimnasio: ["gimnasio", "funcional"] }, alcohol: { gramos_copa: 10 } },
    agenda: unirAgenda(eventos, { desde: sumarDias(h0, -35), hasta: sumarDias(h0, 8) }), propuestas: [] });
  const semana = semanaISO(sumarDias(h0, -7)), actual = semanaISO(h0), mes = sumarMes(h0.slice(0, 7), -1), mesActual = h0.slice(0, 7);
  const datos = {};
  for (const id of [semanaISO(sumarDias(h0, -14)), semana, actual, mes, mesActual]) datos[id] = { metricas: metricas(ctx, id), revision: null };
  // Huecos de ejemplo para la semana siguiente a la última revisión
  const sig = datos[semana].metricas.siguiente, propuestas = [];
  const elegir = (d, tipo, titulo, dur, motivo, tarde = true) => {
    const h = (tarde && (d.huecos ?? []).find(x => x.min >= dur + 30 && x.fin >= "19:00")) || (d.huecos ?? []).find(x => x.min >= dur);
    if (!h) return;
    const ini = tarde && h.fin >= "20:30" && h.inicio <= "19:00" ? "19:00" : h.inicio, m = +ini.slice(0, 2) * 60 + +ini.slice(3) + dur;
    propuestas.push({ id: `${sig.periodo}-${propuestas.length + 1}`, revision: semana, fecha: d.fecha, inicio: ini,
      fin: String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"), tipo, titulo, lugar: "", motivo,
      estado: propuestas.length === 0 ? "en_calendario" : "propuesto", aceptado: null, agenda_id: null });
  };
  elegir(sig.dias[1], "gimnasio", "Gimnasio: cuerpo completo", 60, "Tarde libre tras la última reunión");
  elegir(sig.dias[3], "gimnasio", "Gimnasio: cuerpo completo", 60, "Dos días después del primero, para recuperar");
  elegir(sig.dias[5], "caminar", "Paseo rápido", 45, "Sábado por la mañana, sin agenda", false);
  propuestas.push({ id: `${sig.periodo}-${propuestas.length + 1}`, revision: semana, fecha: sig.dias[4].fecha, inicio: "", fin: "", tipo: "descanso",
    titulo: "Descanso", motivo: "Llegas tarde en tren: el sábado sin madrugar", estado: "propuesto" });
  datos[semana].revision = {
    periodo: semana, tipo: "semana", escrita: datos[semana].metricas.hasta,
    frases: { bien: "Apuntaste las comidas casi todos los días: sin eso no habría déficit que medir.",
      falla: "El gimnasio planeado del martes no se hizo: la reunión de las 15:00 se alargó y la tarde se llenó.",
      paso: "Dos huecos de gimnasio ya puestos en tu agenda real, a las 19:00, y subir la fuerza a 3 series." },
    causas: [{ titulo: "Los días de casa caminas la mitad", texto: "Ejemplo: los días con la reunión en Teams sumaron menos pasos que el miércoles de oficina. El paseo no hay que buscarlo: está en ir y volver.", cifras: ["pasos.serie"] }],
    notas: { peso: "Ejemplo: la media baja aunque un día suelto subió; es agua, no grasa." },
    habitos: { texto: "Ejemplo: la cama y el peso van solos; el Evangelio se cae los días de viaje.",
      propuesta: { tipo: "subir_nivel", habito: "fuerza", nombre: "Sentadillas y flexiones", nivel: 3, pide: "3 series de 10 sentadillas y 10 flexiones",
        minimo: "Una serie: 10 sentadillas y 10 flexiones", ancla: "Después de pesarme", porque: "Lleva más del 80 % en 21 días: el nivel 2 ya no cuesta.", desde: sig.desde } },
    idea: { titulo: "Moverte fuera del deporte pesa más que el deporte", texto: "Ejemplo de idea: en un estudio se dieron 1.000 kcal de más al día a 16 personas durante 8 semanas. Quienes más aumentaron su movimiento cotidiano (andar, estar de pie: el NEAT) fueron quienes menos grasa ganaron.",
      fuentes: [{ nombre: "Levine y otros, Science 1999", url: "https://pubmed.ncbi.nlm.nih.gov/9880251/" }] },
    experimento: { id: sig.periodo, que: "Las llamadas de Teams, caminando por casa o por la calle.", como_se_mide: "Pasos de los días de teletrabajo frente a esta semana.", cifra: "pasos.media" },
    experimento_anterior: { id: semana, que: "Cenar antes de las 21:30.", hecho: "parcial", funciono: "no_se", texto: "Ejemplo: 4 de 7 cenas antes de las 21:30; con tan pocos días no se ve efecto en el peso." },
    plan: { texto: "Gimnasio en tardes sin reuniones y un paseo el sábado. El viernes llegas tarde: el sábado, sin madrugar.", huecos: propuestas.map(p => p.id) },
  };
  datos[mesActual].revision = {
    periodo: mesActual, tipo: "mes", escrita: h0, provisional: true,
    frases: { bien: "Ejemplo: el mes con más días de comida apuntada desde que empezaste.", falla: "Ejemplo: el deporte planeado se queda a la mitad las semanas con viaje.", paso: "Ejemplo: gimnasio dos días cada semana, también las de viaje." },
    cambios: ["Ejemplo: más pasos que el mes anterior, sobre todo los días de oficina.", "Ejemplo: la grasa bajó medio punto y el músculo se mantuvo."],
    metas: { peso: "Ejemplo: media de 7 días por debajo de 78 kg el último día del mes.", deporte: "8 sesiones de gimnasio (2 por semana).", habitos: "Consolidar la fuerza en nivel 3." },
    idea: { titulo: "La báscula mide agua además de grasa", texto: "Ejemplo: una cena salada o con alcohol puede subir 1 kg al día siguiente que se va en dos días. Por eso se mira la media de 7 días." },
  };
  return { ids: { semana: [semanaISO(sumarDias(h0, -14)), semana, actual], mes: [mes, mesActual] }, datos, propuestas };
}

// ---- Arranque y ajustes
function pedirAjustes(error = "") {
  const a = leerAjustes();
  $("repo").value = a?.repo ?? ""; $("token").value = "";
  $("error-ajustes").textContent = error;
  $("panel").hidden = true; $("cargando").hidden = true; $("ajustes").hidden = false;
}

async function conectar(ajustes, alFallar) {
  gh = cliente(ajustes); config = null;
  try { await cargar(); return true; }
  catch (e) { alFallar(e.status ? e.message : "No hay conexión con GitHub."); return false; }
}

$("ajustes").addEventListener("submit", async ev => {
  ev.preventDefault();
  const ajustes = { repo: $("repo").value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$|\/$/g, ""),
    token: $("token").value.trim() };
  if (!/^[\w.-]+\/[\w.-]+$/.test(ajustes.repo)) return pedirAjustes("El repositorio tiene que ser usuario/nombre.");
  $("error-ajustes").textContent = "Comprobando…";
  if (await conectar(ajustes, pedirAjustes)) localStorage.setItem(CLAVE, JSON.stringify(ajustes));
});
$("salir").onclick = () => {
  if (DEMO) return;
  if (confirm("¿Desconectar la app de este dispositivo? Tus datos siguen en GitHub.")) {
    const a = leerAjustes(); localStorage.setItem(CLAVE, JSON.stringify({ repo: a?.repo ?? "" }));
    pedirAjustes();
  }
};
const recargar = () => cargar().then(() => $("aviso").textContent = "", () => $("aviso").textContent = "Sin conexión: se ve lo último cargado.");
$("recargar").onclick = recargar;
// Al volver a la app (por ejemplo, tras hablar con Instinct) se traen los cambios.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  buscarVersionNueva();
  if (config && !DEMO) recargar();
  buscarInformeNuevo();
});
buscarVersionNueva();

requestAnimationFrame(cuadro);
const guardados = leerAjustes();
if (DEMO) cargar();
else if (guardados?.token) conectar(guardados, m => {
  // Con token guardado, un fallo de red no debe echar al usuario a la pantalla de ajustes.
  if (/token|repositorio|permiso/i.test(m)) pedirAjustes(m);
  else { $("cargando").hidden = false; $("cargando").textContent = m + " Vuelve a abrir la app cuando tengas conexión."; }
});
else pedirAjustes();
