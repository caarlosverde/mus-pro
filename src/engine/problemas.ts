import { crearRng } from './azar'
import { parejaDe, rival, type Posicion } from './mesa'
import { resolverMano, type Apuestas, type Marcador } from './recuento'
import { REGLAS_POR_DEFECTO, type Reglas } from './reglas'
import { simular, type Escenario } from './simulacion'

export interface OpcionProblema {
  id: string
  texto: string
  /** Cómo quedan todos los lances de la mano si eliges esta opción. */
  apuestas: Apuestas
}

export interface Problema {
  id: string
  titulo: string
  tema: string
  nivel: 1 | 2 | 3
  reglas?: Partial<Reglas>
  /** Tu posición en la mesa. */
  heroe: Posicion
  /** Marcador al empezar la mano. */
  marcador: Marcador
  escenario: Escenario
  /** Lo que ha pasado en la mano hasta la decisión. */
  historia: string[]
  /** Supuestos que hace el problema sobre lo que no se ve. */
  supuestos: string[]
  pregunta: string
  opciones: OpcionProblema[]
  correcta: string
  explicacion: string[]
  leccion: string
}

export interface ResultadoOpcion {
  id: string
  /** Ganáis el juego en esta mano. */
  ganar: number
  /** Lo ganan ellos en esta mano. */
  perder: number
  /** Nadie llega: se sigue jugando. */
  sigue: number
  /** Probabilidad estimada de ganar el juego (incluye una estimación cuando sigue). */
  total: number
}

export function reglasDe(p: Problema): Reglas {
  return { ...REGLAS_POR_DEFECTO, ...p.reglas }
}

/**
 * Estimación de ganar un juego a partir de las piedras que faltan a cada pareja
 * (modelo logístico). La escala depende de lo que queda: al principio una piedra
 * pesa poco (quedan muchas manos y mucha varianza) y al final pesa muchísimo.
 */
export function estimarDesdeMarcador(faltanNosotros: number, faltanEllos: number): number {
  if (faltanNosotros <= 0) return 1
  if (faltanEllos <= 0) return 0
  const escala = 2 + 0.3 * ((faltanNosotros + faltanEllos) / 2)
  return 1 / (1 + Math.exp((faltanNosotros - faltanEllos) / escala))
}

/**
 * Evalúa todas las opciones de un problema sobre los mismos repartos
 * (números aleatorios comunes), lo que hace la comparación más precisa.
 */
export function resolverProblema(p: Problema, n = 6000, semilla = 12345): ResultadoOpcion[] {
  const reglas = reglasDe(p)
  const nuestra = parejaDe(p.heroe)
  const ellos = rival(nuestra)
  const acum = p.opciones.map((o) => ({ id: o.id, ganar: 0, perder: 0, sigue: 0, total: 0 }))

  const m = simular(p.escenario, reglas, crearRng(semilla), n, ({ jugadas }) => {
    p.opciones.forEach((o, i) => {
      const r = resolverMano(jugadas, o.apuestas, p.marcador, reglas)
      const a = acum[i]
      if (r.ganadorJuego === nuestra) {
        a.ganar++
        a.total++
      } else if (r.ganadorJuego === ellos) {
        a.perder++
      } else {
        a.sigue++
        a.total += estimarDesdeMarcador(reglas.piedras - r.marcador[nuestra], reglas.piedras - r.marcador[ellos])
      }
    })
  })

  if (m === 0) throw new Error(`El problema "${p.id}" no admite ningún reparto`)
  return acum.map((a) => ({
    id: a.id,
    ganar: a.ganar / m,
    perder: a.perder / m,
    sigue: a.sigue / m,
    total: a.total / m,
  }))
}
