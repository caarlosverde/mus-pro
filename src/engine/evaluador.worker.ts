import { PERSONALIDAD_POR_ID } from './bots'
import { evaluarDecision } from './evaluador'
import type { AccionMano, EstadoMano } from './mano'
import type { Posicion } from './mesa'

export interface PeticionEvaluacion {
  id: number
  estado: EstadoMano
  heroe: Posicion
  opciones: AccionMano[]
  /** Identificadores de personalidad por posición. */
  personalidades: string[]
  muestras: number
}

const ambito = self as unknown as {
  onmessage: ((e: MessageEvent<PeticionEvaluacion>) => void) | null
  postMessage: (mensaje: unknown) => void
}

ambito.onmessage = (e) => {
  const { id, estado, heroe, opciones, personalidades, muestras } = e.data
  try {
    const resultado = evaluarDecision(estado, heroe, opciones, {
      personalidades: personalidades.map((p) => PERSONALIDAD_POR_ID[p] ?? PERSONALIDAD_POR_ID.equilibrado),
      muestras,
      semilla: id * 7919 + 13,
    })
    ambito.postMessage({ id, resultado })
  } catch (error) {
    ambito.postMessage({ id, resultado: null, error: String(error) })
  }
}
