import type { AnalisisSituacion } from './analisis'
import type { Jugada } from './evaluacion'
import type { Posicion } from './mesa'

export interface Conclusion {
  tono: 'bueno' | 'malo' | 'info'
  texto: string
}

const p = (x: number) => `${Math.round(x * 100)}%`
/** "el 95% de las veces", o 'siempre' / 'nunca' en los extremos. */
const veces = (x: number) => (x >= 0.995 ? 'siempre' : x <= 0.005 ? 'nunca' : `el ${p(x)} de las veces`)

/**
 * Traduce los números del análisis a lecturas útiles para decidir.
 * Son orientativas: el contexto (marcador, carácter del rival) manda.
 */
export function conclusiones(a: AnalisisSituacion, jugada: Jugada, heroe: Posicion): Conclusion[] {
  const out: Conclusion[] = []
  const { pareja, rivales, companero } = a

  // Grandes y chicas
  if (pareja.grandes >= 0.75) out.push({ tono: 'bueno', texto: `Las grandes son vuestras ${veces(pareja.grandes)}: puedes envidar para que te quieran, o pasar para revocar.` })
  else if (pareja.grandes <= 0.3) out.push({ tono: 'malo', texto: `A grandes vais por detrás (${p(pareja.grandes)}). Un envite aquí sería un farol: hazlo sólo si quieres aparentar reyes.` })

  if (pareja.chicas >= 0.75) out.push({ tono: 'bueno', texto: `La pequeña es vuestra ${veces(pareja.chicas)}. Ojo: envidarla delata pares bajos; a menudo es mejor ganarla en paso.` })

  // Pares
  if (jugada.pares.tipo !== 'ninguno') {
    if (a.individual.pares >= 0.75) out.push({ tono: 'bueno', texto: `Tus ${jugada.pares.tipo === 'pareja' ? 'pares' : jugada.pares.tipo} son los mejores de la mesa ${veces(a.individual.pares)}.` })
    else if (a.individual.pares <= 0.4) out.push({ tono: 'malo', texto: a.individual.pares <= 0.005 ? 'Con lo que sabes, tus pares pierden seguro: no los defiendas.' : `Tus pares sólo son los mejores ${veces(a.individual.pares)}: no te enganches a un envite fuerte sin más información.` })
  }
  if (rivales.mediasOMas >= 0.3) out.push({ tono: 'malo', texto: rivales.mediasOMas >= 0.995 ? 'Algún rival lleva seguro medias o duples.' : `Hay un ${p(rivales.mediasOMas)} de que algún rival lleve medias o duples.` })

  // Juego
  if (jugada.juego.tiene && jugada.juego.puntos === 31 && heroe === 0)
    out.push({ tono: 'bueno', texto: 'Tienes la 31 de mano: no te gana ningún juego (salvo la Real si se juega con ella).' })
  if (jugada.juego.tiene && jugada.juego.puntos === 31 && heroe === 3)
    out.push({ tono: 'info', texto: 'La 31 de postre pierde todos los empates. Si el mano revoca fuerte a juego, desconfía.' })
  if (rivales.la31 >= 0.3) out.push({ tono: 'malo', texto: rivales.la31 >= 0.995 ? 'Algún rival lleva seguro la 31.' : `Hay un ${p(rivales.la31)} de que algún rival lleve la 31.` })
  if (rivales.juego <= 0.35) out.push({ tono: 'bueno', texto: `Sólo un ${p(rivales.juego)} de que algún rival tenga juego.` })

  // Punto
  if (pareja.juego.ninguna >= 0.35)
    out.push({ tono: 'info', texto: `Un ${p(pareja.juego.ninguna)} de que nadie tenga juego y se juegue al punto; ahí ganaríais el ${p(pareja.punto)}.` })

  // Compañero
  if (companero.juego >= 0.8 && companero.pares >= 0.8) out.push({ tono: 'bueno', texto: 'Tu compañero lleva casi seguro pares y juego.' })

  // Valor en paso
  const neto = a.enPaso.nosotros - a.enPaso.ellos
  out.push({
    tono: neto >= 1 ? 'bueno' : neto <= -1 ? 'malo' : 'info',
    texto: `Si todo quedara en paso, sacaríais de media ${a.enPaso.nosotros.toFixed(1)} piedras por ${a.enPaso.ellos.toFixed(1)} de ellos (${neto >= 0 ? '+' : ''}${neto.toFixed(1)}).`,
  })

  return out
}
