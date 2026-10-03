/** Generador pseudoaleatorio con semilla (mulberry32): rápido y reproducible en tests. */
export type Rng = () => number

export function crearRng(semilla = Date.now()): Rng {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Extrae `k` elementos al azar sin reemplazo. Desordena parcialmente `arr`
 * in situ: los elegidos quedan en las últimas `k` posiciones.
 */
export function extraer<T>(arr: T[], k: number, rng: Rng): T[] {
  const n = arr.length
  for (let i = 0; i < k; i++) {
    const j = Math.floor(rng() * (n - i))
    const ultimo = n - 1 - i
    const tmp = arr[j]
    arr[j] = arr[ultimo]
    arr[ultimo] = tmp
  }
  return arr.slice(n - k)
}
