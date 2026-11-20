import { calcular, conMarca, horaEn, hoyEn, parsearCSV, sumarDias, umbralNivel } from "./estado.js?v=63cbbc6";
import { cliente } from "./github.js?v=63cbbc6";
import { pintarInforme } from "./informe.js?v=63cbbc6";
import { pintarSalud } from "./salud.js?v=63cbbc6";

const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const lista = hs => hs.map(h => h.nombre).join(", ");
const DEMO = new URLSearchParams(location.search).has("demo");
const CLAVE = "tracker.ajustes";
const VERSION = "63cbbc6";                  // la pone la publicación

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
  if (!vistaLista) mostrarVista(vista);
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
    if (c.ancla) ident.append(el("br"), "↳ " + c.ancla);
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
}

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
const VISTAS = ["habitos", "salud", "informe"];
let vista = VISTAS.includes(localStorage.getItem("tracker.vista")) ? localStorage.getItem("tracker.vista") : "habitos";
let vistaLista = false;
let informes = null, verInforme = null;   // ficheros disponibles en datos/informes y el que se muestra

function mostrarVista(v) {
  vista = v; localStorage.setItem("tracker.vista", v);
  vistaLista = true;
  for (const x of VISTAS) $("vista-" + x).hidden = x !== v;
  if (v === "salud") pintarSalud($("vista-salud"), cuerpo, config?.perfil);
  for (const b of document.querySelectorAll("#pestanas button")) b.classList.toggle("activa", b.dataset.vista === v);
  if (v === "informe") abrirInforme();
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
  } catch { /* sin conexión */ }
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
