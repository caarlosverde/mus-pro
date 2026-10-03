/**
 * Utilidades criptográficas con Web Crypto (disponible en Workers).
 *
 * - Contraseñas: PBKDF2-SHA256 con 100.000 iteraciones (el máximo que admite
 *   Workers) y sal aleatoria de 16 bytes por usuario.
 * - Tokens de sesión y billetes: 32 bytes aleatorios; en la base de datos sólo
 *   se guarda su SHA-256, así que una filtración de la base no da sesiones válidas.
 */

const ITERACIONES = 100_000
const codificador = new TextEncoder()

export function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function desdeBase64url(t: string): Uint8Array {
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

export function aleatorio(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256(texto: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', codificador.encode(texto))
  return base64url(new Uint8Array(d))
}

export async function hashContrasena(contrasena: string, sal?: string): Promise<{ hash: string; sal: string }> {
  const salBytes = sal ? desdeBase64url(sal) : crypto.getRandomValues(new Uint8Array(16))
  const clave = await crypto.subtle.importKey('raw', codificador.encode(contrasena), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salBytes, iterations: ITERACIONES }, clave, 256)
  return { hash: base64url(new Uint8Array(bits)), sal: base64url(salBytes) }
}

/** Comparación en tiempo constante para no filtrar información por tiempos. */
export function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

/** Código de recuperación legible: 4 grupos de 4 caracteres sin ambigüedades (sin 0/O, 1/I/L). */
export function codigoRecuperacion(): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const c = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('')
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}`
}

export function normalizarCodigo(c: string): string {
  return c.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Código corto de mesa para compartir con amigos: 5 caracteres sin ambigüedades. */
export function codigoMesa(): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => alfabeto[b % alfabeto.length]).join('')
}

/** Generador aleatorio criptográfico con la interfaz `Rng` del motor. */
export function rngSeguro(): () => number {
  const buf = new Uint32Array(64)
  let i = buf.length
  return () => {
    if (i >= buf.length) {
      crypto.getRandomValues(buf)
      i = 0
    }
    return buf[i++] / 4294967296
  }
}
