import { analizar } from './analisis'
import type { Posicion } from './mesa'
import type { Reglas } from './reglas'
import type { Escenario } from './simulacion'

export interface PeticionAnalisis {
  id: number
  escenario: Escenario
  heroe: Posicion
  reglas: Reglas
  n: number
  /** Tiempo máximo de cálculo en milisegundos. */
  limiteMs?: number
}

// El proyecto se compila con la librería DOM; tipamos el ámbito del worker a mano.
const ambito = self as unknown as {
  onmessage: ((e: MessageEvent<PeticionAnalisis>) => void) | null
  postMessage: (mensaje: unknown) => void
}

ambito.onmessage = (e) => {
  const { id, escenario, heroe, reglas, n, limiteMs } = e.data
  try {
    ambito.postMessage({ id, resultado: analizar(escenario, heroe, reglas, n, undefined, limiteMs) })
  } catch (error) {
    ambito.postMessage({ id, resultado: null, error: String(error) })
  }
}
