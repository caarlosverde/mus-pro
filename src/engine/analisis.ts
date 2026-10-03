import { crearRng } from './azar'
import { ganadorLance, parejaDe, quienDeclara, rival, companeroDe, type Lance, type Pareja, type Posicion } from './mesa'
import { resolverMano, TODO_EN_PASO } from './recuento'
import type { Reglas } from './reglas'
import { simular, type Escenario, type Reparto } from './simulacion'

/** Etiquetas del mejor juego posible, de mejor a peor. */
export const CATEGORIAS_JUEGO = ['31', '32', '40', '37', '36', '35', '34', '33', 'sin juego'] as const
export type CategoriaJuego = (typeof CATEGORIAS_JUEGO)[number]

export interface ProbJugadas {
  pares: number
  mediasOMas: number
  duples: number
  juego: number
  la31: number
}

export interface AnalisisSituacion {
  muestras: number
  /** Probabilidad de que tu pareja gane cada lance (si se juega). */
  pareja: {
    grandes: number
    chicas: number
    /** Probabilidades de quién tiene pares. */
    pares: { ambas: number; nosotros: number; ellos: number; ninguna: number; ganamos: number }
    juego: { ambas: number; nosotros: number; ellos: number; ninguna: number; ganamos: number }
    /** Probabilidad de ganar el punto, condicionada a que se juegue. */
    punto: number
  }
  /** Probabilidad de que tu mano sea la mejor de la mesa en cada lance. */
  individual: { grandes: number; chicas: number; pares: number; juego: number }
  rivales: ProbJugadas
  companero: ProbJugadas
  /** Mejor juego entre los dos rivales. */
  mejorJuegoRival: Record<CategoriaJuego, number>
  /** Piedras esperadas si todos los lances quedan en paso (valor "de cartas" de la mano). */
  enPaso: { nosotros: number; ellos: number; porLance: Record<Lance, { nosotros: number; ellos: number }> }
}

export function analizar(
  escenario: Escenario,
  heroe: Posicion,
  reglas: Reglas,
  n = 20000,
  semilla?: number,
  /** Tiempo máximo de cálculo: si se agota, se usan los repartos ya hechos. */
  limiteMs = Infinity,
): AnalisisSituacion | null {
  const rng = crearRng(semilla)
  const nuestra: Pareja = parejaDe(heroe)
  const ellos = rival(nuestra)
  const comp = companeroDe(heroe)
  const rivalesPos = ([0, 1, 2, 3] as Posicion[]).filter((p) => parejaDe(p) === ellos)

  const c = {
    grandes: 0,
    chicas: 0,
    pares: { ambas: 0, nosotros: 0, ellos: 0, ninguna: 0, ganamos: 0 },
    juego: { ambas: 0, nosotros: 0, ellos: 0, ninguna: 0, ganamos: 0 },
    puntoJugado: 0,
    puntoGanado: 0,
    ind: { grandes: 0, chicas: 0, pares: 0, paresTiene: 0, juego: 0, juegoTiene: 0 },
    rivales: vacio(),
    companero: vacio(),
    mejorJuego: Object.fromEntries(CATEGORIAS_JUEGO.map((k) => [k, 0])) as Record<CategoriaJuego, number>,
    enPaso: {
      nosotros: 0,
      ellos: 0,
      porLance: {
        grandes: { nosotros: 0, ellos: 0 },
        chicas: { nosotros: 0, ellos: 0 },
        pares: { nosotros: 0, ellos: 0 },
        juego: { nosotros: 0, ellos: 0 },
        punto: { nosotros: 0, ellos: 0 },
      } as Record<Lance, { nosotros: number; ellos: number }>,
    },
  }

  const visitar = ({ jugadas }: Reparto) => {
    const gana = (l: Lance) => {
      const p = ganadorLance(jugadas, l)
      return p !== null && parejaDe(p) === nuestra
    }
    if (gana('grandes')) c.grandes++
    if (gana('chicas')) c.chicas++

    for (const l of ['pares', 'juego'] as const) {
      const q = quienDeclara(jugadas, l)
      const cont = c[l]
      if (q === 'ambas') cont.ambas++
      else if (q === 'ninguna') cont.ninguna++
      else if (q === nuestra) cont.nosotros++
      else cont.ellos++
      if (q !== 'ninguna' && gana(l)) cont.ganamos++
    }
    if (jugadas.every((j) => !j.juego.tiene)) {
      c.puntoJugado++
      if (gana('punto')) c.puntoGanado++
    }

    // Individual
    const h = ganadorLance
    if (h(jugadas, 'grandes') === heroe) c.ind.grandes++
    if (h(jugadas, 'chicas') === heroe) c.ind.chicas++
    if (jugadas[heroe].clavePares > 0) {
      c.ind.paresTiene++
      if (h(jugadas, 'pares') === heroe) c.ind.pares++
    }
    if (jugadas[heroe].juego.tiene) {
      c.ind.juegoTiene++
      if (h(jugadas, 'juego') === heroe) c.ind.juego++
    }

    // Jugadas de rivales y compañero
    const rj = rivalesPos.map((p) => jugadas[p])
    sumarJugadas(c.rivales, rj)
    sumarJugadas(c.companero, [jugadas[comp]])
    const mejor = rj.reduce((m, j) => Math.max(m, j.claveJuego), 0)
    const mejorJ = rj.find((j) => j.claveJuego === mejor)
    c.mejorJuego[mejor === 0 || !mejorJ ? 'sin juego' : (String(mejorJ.juego.puntos) as CategoriaJuego)]++

    // Valor en paso
    const r = resolverMano(jugadas, TODO_EN_PASO, { mano: 0, postre: 0 }, reglas, Infinity)
    for (const e of r.eventos) {
      const lado = e.pareja === nuestra ? 'nosotros' : 'ellos'
      c.enPaso[lado] += e.piedras
      c.enPaso.porLance[e.lance][lado] += e.piedras
    }
  }

  const m = simular(escenario, reglas, rng, n, visitar, limiteMs)
  if (m === 0) return null

  const div = (x: number, d = m) => (d === 0 ? 0 : x / d)
  const prob = (o: ReturnType<typeof vacio>): ProbJugadas => ({
    pares: div(o.pares),
    mediasOMas: div(o.mediasOMas),
    duples: div(o.duples),
    juego: div(o.juego),
    la31: div(o.la31),
  })
  const reparto = (o: typeof c.pares) => ({
    ambas: div(o.ambas),
    nosotros: div(o.nosotros),
    ellos: div(o.ellos),
    ninguna: div(o.ninguna),
    ganamos: div(o.ganamos, m - o.ninguna),
  })

  return {
    muestras: m,
    pareja: {
      grandes: div(c.grandes),
      chicas: div(c.chicas),
      pares: reparto(c.pares),
      juego: reparto(c.juego),
      punto: div(c.puntoGanado, c.puntoJugado),
    },
    individual: {
      grandes: div(c.ind.grandes),
      chicas: div(c.ind.chicas),
      pares: div(c.ind.pares, c.ind.paresTiene),
      juego: div(c.ind.juego, c.ind.juegoTiene),
    },
    rivales: prob(c.rivales),
    companero: prob(c.companero),
    mejorJuegoRival: Object.fromEntries(
      CATEGORIAS_JUEGO.map((k) => [k, div(c.mejorJuego[k])]),
    ) as Record<CategoriaJuego, number>,
    enPaso: {
      nosotros: div(c.enPaso.nosotros),
      ellos: div(c.enPaso.ellos),
      porLance: Object.fromEntries(
        Object.entries(c.enPaso.porLance).map(([l, v]) => [l, { nosotros: div(v.nosotros), ellos: div(v.ellos) }]),
      ) as Record<Lance, { nosotros: number; ellos: number }>,
    },
  }
}

function vacio() {
  return { pares: 0, mediasOMas: 0, duples: 0, juego: 0, la31: 0 }
}

/** Cuenta si al menos uno de los jugadores tiene cada tipo de jugada. */
function sumarJugadas(o: ReturnType<typeof vacio>, js: { pares: { tipo: string }; juego: { tiene: boolean; puntos: number } }[]) {
  if (js.some((j) => j.pares.tipo !== 'ninguno')) o.pares++
  if (js.some((j) => j.pares.tipo === 'medias' || j.pares.tipo === 'duples')) o.mediasOMas++
  if (js.some((j) => j.pares.tipo === 'duples')) o.duples++
  if (js.some((j) => j.juego.tiene)) o.juego++
  if (js.some((j) => j.juego.puntos === 31)) o.la31++
}
