/**
 * Cliente de la API del servidor (Cloudflare Worker).
 *
 * La dirección se configura con VITE_API_URL al compilar. En desarrollo, por
 * defecto, se usa el servidor local de `wrangler dev`. Si no hay servidor
 * configurado, las funciones online se muestran como no disponibles y el
 * resto de la app funciona igual.
 */
export const URL_API: string = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '')
export const hayServidor = URL_API !== ''

const CLAVE_TOKEN = 'mus.sesion.v1'

export function leerToken(): string | null {
  try {
    return localStorage.getItem(CLAVE_TOKEN)
  } catch {
    return null
  }
}

export function guardarToken(token: string | null) {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token)
    else localStorage.removeItem(CLAVE_TOKEN)
  } catch {
    // Sin almacenamiento: la sesión dura lo que la pestaña.
  }
}

export class ErrorApi extends Error {
  estado: number
  constructor(estado: number, mensaje: string) {
    super(mensaje)
    this.estado = estado
  }
}

export async function api<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; token?: string | null } = {}): Promise<T> {
  if (!hayServidor) throw new ErrorApi(0, 'El modo online no está disponible en esta versión')
  const token = opciones.token === undefined ? leerToken() : opciones.token
  let r: Response
  try {
    r = await fetch(URL_API + ruta, {
      method: opciones.metodo ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    })
  } catch {
    throw new ErrorApi(0, 'No hay conexión con el servidor. Comprueba tu conexión a internet')
  }
  const datos = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErrorApi(r.status, (datos as { error?: string }).error ?? `Error ${r.status}`)
  return datos as T
}

export function urlWebSocket(ruta: string): string {
  return URL_API.replace(/^http/, 'ws') + ruta
}
