import type { Rng } from './azar'
import { rangoEfectivo, type Carta } from './cartas'
import { accionesLegales, type AccionEnvite } from './envites'
import type { Jugada } from './evaluacion'
import { ganarA, percentil, tablasFuerza } from './fuerza'
import type { Sena } from './informacion'
import { senasConocidas, type AccionMano, type EstadoMano } from './mano'
import { companeroDe, parejaDe, participa, rival, type Lance, type Posicion } from './mesa'
import { estimarDesdeMarcador } from './problemas'

/**
 * Bots de mus con personalidad.
 *
 * Cada decisión se expresa como una distribución de probabilidad sobre las
 * acciones posibles (`Politica`). El bot muestrea de ella para jugar, y el
 * evaluador la usa para calcular la verosimilitud de lo que ha hecho un rival
 * dadas unas cartas hipotéticas (inferencia de sus manos).
 *
 * Los bots sólo usan información que tendría un jugador real: sus cartas,
 * las señas de su compañero, lo dicho en la mano y el marcador.
 */

export interface Personalidad {
  id: string
  nombre: string
  descripcion: string
  /** Desplaza el umbral para cortar: negativo corta antes. */
  umbralCorte: number
  /** 0-1: tendencia a envidar con jugadas medias y a revocar. */
  agresividad: number
  /** 0-1: frecuencia de faroles. */
  farol: number
  /** Margen extra que exige para querer (positivo = más prudente). */
  prudencia: number
  /** 0-1: tendencia al órdago. */
  ordago: number
  /** Probabilidad de pasar señas al compañero. */
  senas: number
  /** Si se viene abajo cuando va perdiendo por mucho (pasa a jugar a la desesperada). */
  fragil?: boolean
}

export const PERSONALIDADES: Personalidad[] = [
  {
    id: 'equilibrado',
    nombre: 'El equilibrado',
    descripcion: 'Juega con criterio: corta con jugadas defendibles, farolea a veces y respeta la posición.',
    umbralCorte: 0,
    agresividad: 0.5,
    farol: 0.12,
    prudencia: 0,
    ordago: 0.4,
    senas: 0.9,
  },
  {
    id: 'bravo',
    nombre: 'El bravo',
    descripcion: 'La mejor defensa es un buen ataque: corta con poco, envida fuerte y el órdago le sale solo.',
    umbralCorte: -1.3,
    agresividad: 0.85,
    farol: 0.32,
    prudencia: -0.07,
    ordago: 0.9,
    senas: 0.8,
  },
  {
    id: 'conservador',
    nombre: 'El conservador',
    descripcion: 'Sólo corta con un cañón y sólo quiere lo que gana. Pierde poco, pero gana poco.',
    umbralCorte: 1.4,
    agresividad: 0.2,
    farol: 0.03,
    prudencia: 0.1,
    ordago: 0.12,
    senas: 0.95,
  },
  {
    id: 'farolero',
    nombre: 'El farolero',
    descripcion: 'Cara de póker: envida igual con cartas que sin ellas. Difícil de leer.',
    umbralCorte: -0.4,
    agresividad: 0.65,
    farol: 0.45,
    prudencia: -0.02,
    ordago: 0.5,
    senas: 0.7,
  },
  {
    id: 'cristal',
    nombre: 'Mandíbula de cristal',
    descripcion: 'Juega bien mientras va ganando; si se queda muy atrás, se viene abajo y ordaguea a lo loco.',
    umbralCorte: 0.2,
    agresividad: 0.45,
    farol: 0.1,
    prudencia: 0.02,
    ordago: 0.35,
    senas: 0.9,
    fragil: true,
  },
]

export const PERSONALIDAD_POR_ID = Object.fromEntries(PERSONALIDADES.map((p) => [p.id, p])) as Record<string, Personalidad>

export interface Politica<A> {
  opciones: A[]
  probs: number[]
}

function softmax(utilidades: number[], temperatura: number): number[] {
  const m = Math.max(...utilidades)
  const ex = utilidades.map((u) => Math.exp((u - m) / temperatura))
  const s = ex.reduce((a, b) => a + b, 0)
  return ex.map((x) => x / s)
}

const sigma = (x: number) => 1 / (1 + Math.exp(-x))

export function muestrear<A>(p: Politica<A>, rng: Rng): A {
  let r = rng()
  for (let i = 0; i < p.opciones.length; i++) {
    r -= p.probs[i]
    if (r <= 0) return p.opciones[i]
  }
  return p.opciones[p.opciones.length - 1]
}

/** Personalidad efectiva: la "mandíbula de cristal" se descompone si va muy atrás. */
function efectiva(p: Personalidad, e: EstadoMano, pos: Posicion): Personalidad {
  if (!p.fragil) return p
  const nos = parejaDe(pos)
  const diferencia = e.marcador[rival(nos)] - e.marcador[nos]
  if (diferencia < 12) return p
  return { ...p, umbralCorte: -1.5, agresividad: 0.9, farol: 0.4, prudencia: -0.12, ordago: 1 }
}

// ---------------------------------------------------------------------------
// Estimación de fuerza
// ---------------------------------------------------------------------------

/**
 * Percentil aproximado del compañero en cada lance según sus señas (0.5 si no se sabe nada).
 * Con `informa`, el compañero pasa todas sus señas y se ven: lo que no ha
 * señalado también cuenta (sin seña de reyes no lleva dos reyes, etc.).
 */
function fuerzaCompanero(senas: Sena[], lance: Lance, informa = false): number {
  const tiene = (s: Sena) => senas.includes(s)
  if (informa) {
    switch (lance) {
      case 'grandes':
        if (!tiene('tresReyes') && !tiene('dosReyes')) return 0.35
        break
      case 'chicas':
        if (!tiene('tresPitos') && !tiene('dosPitos')) return 0.35
        break
      case 'pares':
        if (!tiene('duples') && !tiene('medias')) return tiene('dosReyes') ? 0.55 : 0.25
        break
      case 'punto':
        if (!tiene('treinta')) return 0.4
        break
    }
  }
  switch (lance) {
    case 'grandes':
      return tiene('tresReyes') ? 0.97 : tiene('dosReyes') || tiene('duples') ? 0.85 : 0.5
    case 'chicas':
      return tiene('tresPitos') ? 0.97 : tiene('dosPitos') ? 0.85 : 0.5
    case 'pares':
      return tiene('duples') ? 0.9 : tiene('medias') ? 0.68 : tiene('dosReyes') ? 0.55 : 0.4
    case 'juego':
      return tiene('la31') ? 0.85 : tiene('juego') ? 0.35 : 0.5
    case 'punto':
      return tiene('treinta') ? 0.95 : 0.5
  }
}

/**
 * Probabilidad aproximada de que la pareja de `pos` gane el lance, combinando
 * el percentil de su mano frente a cada rival (con el desempate por posición)
 * y lo que sabe de su compañero por las señas.
 */
export function probGanarLance(e: EstadoMano, pos: Posicion, lance: Lance): number {
  const t = tablasFuerza(e.reglas)
  const j = e.jugadas[pos]
  const nos = parejaDe(pos)
  const comp = companeroDe(pos)
  const rivales = ([0, 1, 2, 3] as Posicion[]).filter((p) => parejaDe(p) !== nos)
  const declara = lance === 'pares' || lance === 'juego'
  // En pares y juego, las declaraciones ya se conocen cuando se juega el lance.
  const rivalesActivos = declara ? rivales.filter((r) => participa(e.jugadas[r], lance)) : rivales
  if (rivalesActivos.length === 0) return 1

  let pYo = 0
  if (participa(j, lance)) {
    const p = percentil(j, lance, t)
    pYo = rivalesActivos.reduce<number>((acc, r) => acc * ganarA(p, pos < r), 1)
  }
  const companeroJuega = !declara || participa(e.jugadas[comp], lance)
  const senasComp = e.senas.filter((s) => s.de === comp)
  const senas = senasConocidas(e, pos)
    .filter((s) => s.de === comp)
    .map((s) => s.sena)
  // Si no hace señas casi nunca, o alguna no se vio, su silencio no dice nada.
  const informa = e.config.probSenas[comp] >= 0.5 && !senasComp.some((s) => s.noVista) && senas.length > 0
  const q = companeroJuega ? fuerzaCompanero(senas, lance, informa) : 0
  const pComp = q ** rivalesActivos.length
  return 1 - (1 - pYo) * (1 - pComp)
}

// ---------------------------------------------------------------------------
// Mus o corto
// ---------------------------------------------------------------------------

/** Puntuación de "ganas de cortar" de una mano (escala aproximada en piedras de ventaja). */
export function valorCorte(j: Jugada, pos: Posicion, senasComp: Sena[]): number {
  let s = 0
  if (j.juego.tiene) {
    s += j.juego.puntos === 31 ? (pos === 0 ? 3 : pos === 3 ? 2 : 2.5) : j.juego.puntos === 32 ? 1.7 : j.juego.puntos === 40 ? 1.3 : 0.9
  } else if (j.juego.puntos >= 27) {
    s += j.juego.puntos === 30 ? 1 : 0.5
  }
  switch (j.pares.tipo) {
    case 'duples':
      s += 2.5 + (j.pares.alto === 12 ? 0.5 : 0)
      break
    case 'medias':
      s += 1.6 + (j.pares.alto === 12 ? 0.6 : j.pares.alto === 1 ? 0.2 : 0)
      break
    case 'pareja':
      s += j.pares.alto === 12 ? 0.9 : 0.4
      break
  }
  s += j.reyes * 0.35
  if (j.ases >= 2) s += 0.3
  const c = (x: Sena) => senasComp.includes(x)
  if (c('duples')) s += 1.4
  else if (c('medias')) s += 1.1
  if (c('la31')) s += 1.5
  else if (c('juego')) s += 0.8
  if (c('tresReyes')) s += 0.8
  else if (c('dosReyes')) s += 0.5
  if (c('ciego')) s -= 1
  return s
}

function umbralPosicion(pos: Posicion, ronda: number): number {
  // La pareja postre corta antes de primeras ("quitar mano") y se vuelve prudente con los descartes.
  switch (pos) {
    case 0:
      return 4.2
    case 1:
      return 2.6 + 0.8 * ronda
    case 2:
      return 4.6
    case 3:
      return 2.9 + 0.8 * ronda
  }
}

export function politicaMus(e: EstadoMano, pos: Posicion, per: Personalidad): Politica<AccionMano> {
  const p = efectiva(per, e, pos)
  const nos = parejaDe(pos)
  const comp = companeroDe(pos)
  const senasComp = senasConocidas(e, pos)
    .filter((s) => s.de === comp)
    .map((s) => s.sena)
  let umbral = umbralPosicion(pos, e.ronda) + p.umbralCorte

  // Marcador: quien va muy por detrás con el rival dentro corta con lo que venga.
  const objetivo = e.reglas.piedras
  const faltanNos = objetivo - e.marcador[nos]
  const faltanEllos = objetivo - e.marcador[rival(nos)]
  if (faltanEllos <= 5 && faltanNos > 10) umbral -= 1.5
  else if (faltanEllos <= 10 && faltanNos > faltanEllos + 8) umbral -= 0.8
  // Si el mazo se agota, tarde o temprano hay que jugar.
  if (e.ronda >= 3) umbral -= 0.6 * (e.ronda - 2)

  const valor = valorCorte(e.jugadas[pos], pos, senasComp)
  const pCorto = sigma((valor - umbral) / 0.5)
  return { opciones: [{ tipo: 'corto' }, { tipo: 'mus' }], probs: [pCorto, 1 - pCorto] }
}

// ---------------------------------------------------------------------------
// Descarte
// ---------------------------------------------------------------------------

/** Qué cartas suelta: conserva reyes y cartas emparejadas; con un solo rey, también el caballo. */
export function elegirDescarte(mano: readonly Carta[], e: EstadoMano): Carta[] {
  const r = mano.map((c) => rangoEfectivo(c, e.reglas))
  const cuenta = new Map<number, number>()
  for (const x of r) cuenta.set(x, (cuenta.get(x) ?? 0) + 1)
  const reyes = r.filter((x) => x === 12).length
  const conservar = mano.filter((_, i) => r[i] === 12 || (cuenta.get(r[i]) ?? 0) >= 2)
  if (reyes === 1 && conservar.length === 1) {
    const caballo = mano.find((_, i) => r[i] === 11)
    if (caballo !== undefined) conservar.push(caballo)
  }
  if (conservar.length === 4) {
    // Hay que soltar una: la más baja que no sea rey.
    const peor = [...conservar].sort((a, b) => rangoEfectivo(a, e.reglas) - rangoEfectivo(b, e.reglas))[0]
    conservar.splice(conservar.indexOf(peor), 1)
  }
  return mano.filter((c) => !conservar.includes(c))
}

// ---------------------------------------------------------------------------
// Envites
// ---------------------------------------------------------------------------

const PASO: AccionEnvite = { tipo: 'paso' }
const QUIERO: AccionEnvite = { tipo: 'quiero' }
const ORDAGO: AccionEnvite = { tipo: 'ordago' }
const envido = (piedras: number): AccionEnvite => ({ tipo: 'envido', piedras })

/** Valor relativo de cada lance (los pares y el juego arrastran sus tantos). */
const PESO_LANCE: Record<Lance, number> = { grandes: 1, chicas: 0.7, pares: 1.3, juego: 1.5, punto: 1 }

/** Reparo a abrir el lance: envidar grandes o chicas delata la jugada de pares y juego. */
const REPARO_APERTURA: Record<Lance, number> = { grandes: 0.6, chicas: 0.6, pares: 0, juego: 0, punto: 0.1 }

export function politicaEnvite(e: EstadoMano, pos: Posicion, per: Personalidad): Politica<AccionEnvite> {
  const env = e.envite!
  const lance = env.lance
  const p = efectiva(per, e, pos)
  const nos = parejaDe(pos)
  const objetivo = e.reglas.piedras
  const faltanNos = objetivo - e.marcador[nos] - e.cobrado[nos]
  const faltanEllos = objetivo - e.marcador[rival(nos)] - e.cobrado[rival(nos)]
  const P = probGanarLance(e, pos, lance)
  const peso = PESO_LANCE[lance]
  const legales = accionesLegales(env)

  // Los órdagos se valoran en probabilidad de ganar el juego y se pasan a
  // "piedras equivalentes" con el valor que tiene una piedra con este marcador.
  const U0 = estimarDesdeMarcador(faltanNos, faltanEllos)
  const valorPiedra = Math.max(0.01, estimarDesdeMarcador(faltanNos - 1, faltanEllos) - U0)
  const enPiedras = (u: number) => (u - U0) / valorPiedra
  /** Valor de echar un órdago que, si no se quiere, nos da `siNo` piedras. */
  const valorOrdago = (Pmia: number, siNo: number) => {
    // El rival sólo lo ve si cree que lo gana: lo ve poco y, cuando lo ve, va fuerte.
    const veo = 0.05 + 0.6 * (1 - Pmia)
    const ganoSiVe = Pmia ** 5
    const u = (1 - veo) * estimarDesdeMarcador(faltanNos - siNo, faltanEllos) + veo * ganoSiVe
    // Con las chicas no se va nadie.
    // Lejos del final casi nadie ordaguea: se reserva para cuando decide.
    const queda = Math.min(faltanNos, faltanEllos)
    const lejos = queda > 25 ? 3.5 : queda > 15 ? 1.5 : 0
    return enPiedras(u) + (p.ordago - 0.5) * 1.2 - (lance === 'chicas' ? 1.5 : 0) - lejos
  }

  if (env.fase === 'apertura') {
    // Valor esperado aproximado (en piedras) de envidar `b`: el rival se retira con
    // probabilidad `f` (dos piedras las quiere cualquiera; a partir de cuatro, se piensa);
    // si quiere, se supone que va más fuerte (P^2).
    const PsiQuiere = P ** 2
    const ev = (b: number, f: number) => f + (1 - f) * (2 * PsiQuiere - 1) * b * peso
    const farol = (lance === 'chicas' ? 0.5 : 1) * p.farol
    const debil = P < 0.4 ? 1 : 0
    const opciones: AccionEnvite[] = [PASO, envido(2), envido(4)]
    const u = [
      0,
      ev(2, 0.25) + (p.agresividad - 0.5) * 0.6 - 0.3 - REPARO_APERTURA[lance],
      ev(4, 0.5) + (p.agresividad - 0.5) * 0.4 + debil * farol * 3 - 0.3 - REPARO_APERTURA[lance],
    ]
    // Con cartas muy buenas y el compañero por hablar, a veces se pasa para revocar.
    const companeroHablaDespues = env.pendientes.some((x) => parejaDe(x) === nos)
    if (P > 0.85 && companeroHablaDespues) u[0] += 0.8
    if (legales.includes('ordago')) {
      opciones.push(ORDAGO)
      u.push(valorOrdago(P, 1))
    }
    return { opciones, probs: softmax(u, 0.25) }
  }

  // Respuesta a un envite.
  // Una apuesta del rival es información: cuanto más alta, más fuerte suele ir.
  const revoques = env.historial.filter((h) => h.accion.tipo === 'envido').length - 1
  const credibilidad = env.ordago ? 1.6 : 1 + env.apostado / 8 + revoques * 0.3
  const Padj = Math.max(0, Math.min(1, P ** credibilidad - p.prudencia))
  const A = env.porqueNo
  const B = env.apostado

  if (env.ordago) {
    // Querer un órdago: se gana o se pierde el juego. No quererlo da `A` al rival.
    const noQuiero = estimarDesdeMarcador(faltanNos, Math.max(0, faltanEllos - A))
    return { opciones: [PASO, QUIERO], probs: softmax([enPiedras(noQuiero), enPiedras(Padj)], 0.35) }
  }

  const opciones: AccionEnvite[] = [PASO, QUIERO]
  const u = [-A, (2 * Padj - 1) * B * peso]
  // Nadie sube indefinidamente: a partir de cierto punto se quiere, se rechaza o se ordaguea.
  if (revoques < 3 && B < 12) {
    opciones.push(envido(2))
    // Si revocamos, el rival se retira a veces; si no, quiere con lo mejor de su rango.
    u.push(0.3 * B + 0.7 * (2 * Padj ** 1.5 - 1) * (B + 2) * peso + (p.agresividad - 0.5) * 0.6 - 0.7 - revoques * 0.8)
  }
  if (legales.includes('ordago')) {
    opciones.push(ORDAGO)
    u.push(valorOrdago(Padj, B))
  }
  return { opciones, probs: softmax(u, 0.35) }
}

// ---------------------------------------------------------------------------
// Agente
// ---------------------------------------------------------------------------

export function politica(e: EstadoMano, pos: Posicion, per: Personalidad): Politica<AccionMano> {
  if (e.fase === 'mus') return politicaMus(e, pos, per)
  if (e.fase === 'descarte') return { opciones: [{ tipo: 'descarte', cartas: elegirDescarte(e.manos[pos], e) }], probs: [1] }
  if (e.fase === 'envites') {
    const pe = politicaEnvite(e, pos, per)
    return { opciones: pe.opciones.map((accion) => ({ tipo: 'envite', accion }) as AccionMano), probs: pe.probs }
  }
  throw new Error('No hay decisión en esta fase')
}

export function decidir(e: EstadoMano, pos: Posicion, per: Personalidad, rng: Rng): AccionMano {
  return muestrear(politica(e, pos, per), rng)
}

/** Si dos acciones son la misma decisión (para calcular verosimilitudes). */
export function mismaAccion(a: AccionMano, b: AccionMano): boolean {
  if (a.tipo !== b.tipo) return false
  if (a.tipo === 'envite' && b.tipo === 'envite') {
    if (a.accion.tipo !== b.accion.tipo) return false
    if (a.accion.tipo === 'envido' && b.accion.tipo === 'envido') return a.accion.piedras === b.accion.piedras
  }
  return true
}

/** Probabilidad de que el bot elija `accion` (para inferencia). Acerca envites de otra cuantía. */
export function probAccion(pol: Politica<AccionMano>, accion: AccionMano): number {
  let p = 0
  for (let i = 0; i < pol.opciones.length; i++) if (mismaAccion(pol.opciones[i], accion)) p += pol.probs[i]
  if (p > 0) return p
  // Envites de cuantías que el bot no contempla: se asimilan a la más parecida.
  if (accion.tipo === 'envite' && accion.accion.tipo === 'envido') {
    const objetivo = accion.accion.piedras
    let mejor = -1
    let dist = Infinity
    pol.opciones.forEach((o, i) => {
      if (o.tipo === 'envite' && o.accion.tipo === 'envido' && Math.abs(o.accion.piedras - objetivo) < dist) {
        dist = Math.abs(o.accion.piedras - objetivo)
        mejor = i
      }
    })
    if (mejor >= 0) return pol.probs[mejor]
  }
  return 1e-3
}
