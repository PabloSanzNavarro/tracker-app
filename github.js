// Lectura y escritura de ficheros del repositorio privado con la API de GitHub.
// El token se queda en el dispositivo; solo viaja a api.github.com.

const aB64 = texto => {
  let bin = "";
  for (const b of new TextEncoder().encode(texto)) bin += String.fromCharCode(b);
  return btoa(bin);
};
const deB64 = b64 =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));

export class ErrorGitHub extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}

export function cliente({ repo, token, rama }) {
  const url = ruta => `https://api.github.com/repos/${repo}/contents/${ruta}`;
  const cabeceras = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28" };

  async function pedir(ruta, opciones = {}, crudo = false) {
    const r = await fetch(ruta, { ...opciones, cache: "no-store",
      headers: crudo ? { ...cabeceras, Accept: "application/vnd.github.raw+json" } : cabeceras });
    if (r.ok) return crudo ? r.text() : r.json();
    const texto = r.status === 401 ? "El token no es válido o ha caducado"
      : r.status === 403 ? "El token no tiene permiso para esto"
      : r.status === 404 ? "No encuentro el repositorio o el fichero (¿nombre o permisos?)"
      : `GitHub ha respondido ${r.status}`;
    throw new ErrorGitHub(r.status, texto);
  }

  async function leer(ruta) {
    const j = await pedir(url(ruta) + (rama ? `?ref=${encodeURIComponent(rama)}` : ""));
    return { texto: deB64(j.content), sha: j.sha };
  }

  /** Aplica cambio(texto) al fichero y lo guarda. Si alguien escribió a la vez, relee y repite. */
  async function editar(ruta, cambio, mensaje) {
    for (let intento = 0; ; intento++) {
      const { texto, sha } = await leer(ruta);
      const nuevo = cambio(texto);
      if (nuevo === texto) return texto;
      try {
        await pedir(url(ruta), { method: "PUT", body: JSON.stringify(
          { message: mensaje, content: aB64(nuevo), sha, ...(rama ? { branch: rama } : {}) }) });
        return nuevo;
      } catch (e) {
        if (!(e.status === 409 || e.status === 422) || intento >= 2) throw e;
      }
    }
  }

  const conRama = ruta => url(ruta) + (rama ? `?ref=${encodeURIComponent(rama)}` : "");

  /** Nombres de los ficheros de una carpeta ([] si no existe). */
  async function listar(ruta) {
    try {
      const j = await pedir(conRama(ruta));
      return Array.isArray(j) ? j.filter(x => x.type === "file").map(x => x.name) : [];
    } catch (e) { if (e.status === 404) return []; throw e; }
  }

  /** Texto de un fichero de cualquier tamaño (leer() solo admite hasta 1 MB). */
  const leerGrande = ruta => pedir(conRama(ruta), {}, true);

  return { leer, editar, listar, leerGrande };
}
