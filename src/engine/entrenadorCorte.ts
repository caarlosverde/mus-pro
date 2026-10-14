import type { Rng } from './azar'
import { PERSONALIDAD_POR_ID, decidir, valorCorte } from './bots'
import type { Jugada } from './evaluacion'
import { SENAS } from './informacion'
import { aplicar, nuevaMano, senasConocidas, type EstadoMano } from './mano'
import { NOMBRE_POSICION, companeroDe, parejaDe, rival, type Posicion } from './mesa'
import type { Reglas } from './reglas'

/**
 * Generador de situaciones para el entrenador de corte: una mano recién
 * repartida en la que te toca decidir si pides mus o cortas, después de que
 * los que hablan antes que tú hayan pedido mus.
 */

export interface SituacionCorte {
  estado: EstadoMano
  heroe: Posicion
}

const CONFIG = { probSenas: [0.9, 0.9, 0.9, 0.9] as [number, number, number, number], probPillar: 0.25 }

function marcadorAleatorio(reglas: Reglas, rng: Rng) {
  const max = reglas.piedras - 1
  const r = rng()
  const tramo = r < 0.45 ? [0, 0.4] : r < 0.75 ? [0.35, 0.75] : [0.7, 0.98]
  const valor = () => Math.round((tramo[0] + rng() * (tramo[1] - tramo[0])) * max)
  return { mano: valor(), postre: valor() }
}

export function generarSituacionCorte(reglas: Reglas, rng: Rng): SituacionCorte {
  const eq = PERSONALIDAD_POR_ID.equilibrado
  for (let intento = 0; intento < 500; intento++) {
    const heroe = Math.floor(rng() * 4) as Posicion
    const config = { ...CONFIG, probSenas: CONFIG.probSenas.map((p, i) => (i === heroe ? 0 : p)) as typeof CONFIG.probSenas }
    let e = nuevaMano(reglas, marcadorAleatorio(reglas, rng), rng, config)
    let cortaron = false
    for (let p = 0; p < heroe; p++) {
      const accion = decidir(e, p as Posicion, eq, rng)
      if (accion.tipo === 'corto') {
        cortaron = true
        break
      }
      e = aplicar(e, accion, rng)
    }
    if (cortaron) continue
    // Preferimos decisiones con miga: las evidentes (nada o un cañón) salen menos.
    const senasComp = senasConocidas(e, heroe)
      .filter((s) => s.de === companeroDe(heroe))
      .map((s) => s.sena)
    const v = valorCorte(e.jugadas[heroe], heroe, senasComp)
    const evidente = v < 0.8 || v > 6.5
    if (evidente && rng() > 0.2) continue
    return { estado: e, heroe }
  }
  throw new Error('No se pudo generar una situación')
}

/** Descripción breve de una jugada: "pareja de reyes, juego de 36". */
export function describirJugada(j: Jugada): string {
  const nombres: Record<number, string> = { 1: 'pitos', 4: 'cuatros', 5: 'cincos', 6: 'seises', 7: 'sietes', 10: 'sotas', 11: 'caballos', 12: 'reyes' }
  let pares = 'sin pares'
  if (j.pares.tipo === 'pareja') pares = `pareja de ${nombres[j.pares.alto]}`
  else if (j.pares.tipo === 'medias') pares = `medias de ${nombres[j.pares.alto]}`
  else if (j.pares.tipo === 'duples')
    pares = j.pares.alto === j.pares.bajo ? `duples de ${nombres[j.pares.alto]}` : `duples de ${nombres[j.pares.alto]} y ${nombres[j.pares.bajo]}`
  const juego = j.juego.real ? 'la Real' : j.juego.tiene ? (j.juego.puntos === 31 ? 'la 31' : `juego de ${j.juego.puntos}`) : `${j.juego.puntos} al punto`
  return `${pares}, ${juego}`
}

/** Claves de la situación para explicar la decisión (criterios de mesa, no el cálculo). */
export function clavesCorte(s: SituacionCorte, veredicto?: { mejor: 'mus' | 'corto' | null; diferencia: number }): string[] {
  const { estado: e, heroe } = s
  const j = e.jugadas[heroe]
  const nos = parejaDe(heroe)
  const objetivo = e.reglas.piedras
  const faltanNos = objetivo - e.marcador[nos]
  const faltanEllos = objetivo - e.marcador[rival(nos)]
  const out: string[] = []

  out.push(`Llevas ${describirJugada(j)}.`)

  const senasComp = senasConocidas(e, heroe).filter((x) => x.de === companeroDe(heroe))
  if (senasComp.length) out.push(`Tu compañero te ha pasado: ${senasComp.map((x) => SENAS[x.sena].nombre.toLowerCase()).join(', ')}.`)
  else out.push('Tu compañero no te ha pasado señas.')

  switch (heroe) {
    case 0:
      out.push('De mano no tienes prisa: ganas todos los empates y hablas el primero en cada lance. Cortar con una jugada mediana avisa a los rivales y no te quieren nada.')
      break
    case 2:
      out.push('Tu compañero, el mano, ha pedido mus. Cortar con una jugada mediana es un "autoquitamano": renuncias a su ventaja de posición.')
      break
    case 1:
    case 3:
      out.push(
        e.ronda === 0
          ? 'Sois pareja postre de primeras: con pares y juego defendibles conviene cortar para que la pareja mano no se cargue ("quitar mano").'
          : 'Ya ha habido descartes: los rivales se han ido cargando y conviene más prudencia al cortar.',
      )
      if (heroe === 3) out.push('De postre pierdes todos los empates: sé algo más exigente que el contramano.')
      break
  }

  if (faltanEllos <= 5 && faltanNos > 10) out.push('Ellos están dentro y vosotros lejos: hay que cortar con lo que permita echar órdagos.')
  else if (faltanNos <= 5 && faltanEllos > 10) out.push('Estáis dentro con ventaja: no hace falta arriesgar, basta con no dejarles remontar.')
  else if (faltanNos <= 8 && faltanEllos <= 8) out.push('Final apretado: mandan las grandes y los pares, porque el juego se cobra el último.')

  if (veredicto) {
    const pts = (Math.abs(veredicto.diferencia) * 100).toFixed(1)
    out.push(
      veredicto.mejor === null
        ? 'En esta mano concreta las dos opciones salen igual: los criterios de arriba se compensan.'
        : `En esta mano concreta sale mejor ${veredicto.mejor === 'corto' ? 'cortar' : 'pedir mus'} (${pts} puntos de probabilidad de ganar el juego). Los criterios generales orientan, pero el cálculo con tus cartas y las señas manda.`,
    )
  }

  out.push(`Antes que tú: ${[0, 1, 2, 3]
    .slice(0, heroe)
    .map((p) => `${NOMBRE_POSICION[p as Posicion]}, mus`)
    .join('; ') || 'eres el primero en hablar'}.`)
  return out
}
