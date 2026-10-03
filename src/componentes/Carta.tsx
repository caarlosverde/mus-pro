import type { ReactNode } from 'react'
import { numeroDe, paloDe, type Carta as TCarta, type Palo } from '../engine/cartas'
import './Carta.css'

/**
 * Cartas de la baraja española dibujadas en SVG.
 *
 * Detalles de la baraja real que se respetan:
 * - Las "pintas": cortes en el filete del marco que indican el palo
 *   (oros: ninguno; copas: uno; espadas: dos; bastos: tres).
 * - Numeración de la baraja de 40 en las esquinas (sota 10, caballo 11, rey 12).
 * - Distribución tradicional de los símbolos del 1 al 7 y figuras para sota, caballo y rey.
 */

const ANCHO = 60
const ALTO = 92

const COLOR: Record<Palo, { principal: string; oscuro: string }> = {
  oros: { principal: '#d99a1e', oscuro: '#9c6a08' },
  copas: { principal: '#c0392b', oscuro: '#7d1f16' },
  espadas: { principal: '#2f63ad', oscuro: '#1b3d70' },
  bastos: { principal: '#3f7f3a', oscuro: '#23501f' },
}

const ORO = '#e8b23a'
const ORO_OSCURO = '#a8740c'
const PIEL = '#f1c7a0'
const TRAZO = '#3a2a1a'
const PINTAS: Record<Palo, number> = { oros: 0, copas: 1, espadas: 2, bastos: 3 }

// ---------------------------------------------------------------------------
// Símbolos de los palos (dibujados alrededor de 0,0)
// ---------------------------------------------------------------------------

function Oro() {
  const rayos = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4
    return <line key={i} x1={Math.cos(a) * 3.4} y1={Math.sin(a) * 3.4} x2={Math.cos(a) * 5} y2={Math.sin(a) * 5} stroke={ORO_OSCURO} strokeWidth={0.8} />
  })
  return (
    <g>
      <circle r={9.5} fill={ORO_OSCURO} />
      <circle r={8.4} fill="#f3c63c" />
      <circle r={6} fill="none" stroke={ORO_OSCURO} strokeWidth={0.9} />
      {rayos}
      <circle r={2.5} fill="#c0392b" />
    </g>
  )
}

function Copa() {
  return (
    <g>
      <path d="M-8,-8.6 H8 C8,-1 4.2,3 0,3 C-4.2,3 -8,-1 -8,-8.6 Z" fill="#c0392b" stroke="#7d1f16" strokeWidth={0.7} />
      <rect x={-8.8} y={-10.4} width={17.6} height={2.4} rx={1.1} fill={ORO} stroke={ORO_OSCURO} strokeWidth={0.4} />
      <circle cy={-3.4} r={1.6} fill={ORO} />
      <rect x={-1.3} y={2.8} width={2.6} height={4.6} fill={ORO} />
      <ellipse cy={5} rx={2.5} ry={1.2} fill={ORO} stroke={ORO_OSCURO} strokeWidth={0.4} />
      <path d="M-6.4,10.4 Q0,5.6 6.4,10.4 Z" fill={ORO} stroke={ORO_OSCURO} strokeWidth={0.5} />
    </g>
  )
}

function Espada() {
  return (
    <g>
      <path d="M0,-12.5 L1.9,-9.6 L1.9,5 L-1.9,5 L-1.9,-9.6 Z" fill="#4f82c9" stroke="#1b3d70" strokeWidth={0.6} />
      <line x1={0} y1={-10.4} x2={0} y2={4.2} stroke="#bcd3f2" strokeWidth={0.6} />
      <rect x={-5.2} y={5} width={10.4} height={1.9} rx={0.9} fill={ORO} stroke={ORO_OSCURO} strokeWidth={0.4} />
      <rect x={-1.1} y={6.9} width={2.2} height={4.2} fill="#c0392b" />
      <circle cy={11.8} r={1.6} fill={ORO} stroke={ORO_OSCURO} strokeWidth={0.4} />
    </g>
  )
}

function Basto() {
  return (
    <g>
      <path d="M-1.5,12.2 L-3.3,-7.6 C-3.8,-11.8 3.8,-11.8 3.3,-7.6 L1.5,12.2 Z" fill="#b97d3c" stroke="#6e4419" strokeWidth={0.6} />
      <circle cx={-2.1} cy={-4.4} r={0.95} fill="#6e4419" />
      <circle cx={2} cy={-0.4} r={0.85} fill="#6e4419" />
      <circle cx={-1.5} cy={4.6} r={0.75} fill="#6e4419" />
      <path d="M2.6,-6.4 q4.2,-2.4 4.8,1 q-3.2,1.2 -4.8,-1 z" fill="#3f7f3a" />
      <path d="M-2.8,1.6 q-4,-1.6 -4.2,1.6 q3,0.8 4.2,-1.6 z" fill="#3f7f3a" />
    </g>
  )
}

const SIMBOLO: Record<Palo, () => ReactNode> = { oros: Oro, copas: Copa, espadas: Espada, bastos: Basto }

function Pinta({ palo, x, y, escala = 1, giro = 0 }: { palo: Palo; x: number; y: number; escala?: number; giro?: number }) {
  const S = SIMBOLO[palo]
  return <g transform={`translate(${x} ${y}) rotate(${giro}) scale(${escala})`}>{S()}</g>
}

// ---------------------------------------------------------------------------
// Distribución de los símbolos del 1 al 7
// ---------------------------------------------------------------------------

const CI = 21
const CD = 39
const POSICIONES: Record<number, [number, number][]> = {
  1: [[30, 46]],
  2: [
    [30, 28],
    [30, 64],
  ],
  3: [
    [30, 22],
    [30, 46],
    [30, 70],
  ],
  4: [
    [CI, 28],
    [CD, 28],
    [CI, 64],
    [CD, 64],
  ],
  5: [
    [CI, 25],
    [CD, 25],
    [30, 46],
    [CI, 67],
    [CD, 67],
  ],
  6: [
    [CI, 23],
    [CD, 23],
    [CI, 46],
    [CD, 46],
    [CI, 69],
    [CD, 69],
  ],
  7: [
    [CI, 20],
    [CD, 20],
    [30, 32.5],
    [CI, 45],
    [CD, 45],
    [CI, 71],
    [CD, 71],
  ],
}

function Numeral({ palo, n }: { palo: Palo; n: number }) {
  const alargado = palo === 'espadas' || palo === 'bastos'
  if (n === 1) return <Pinta palo={palo} x={30} y={46} escala={alargado ? 2.4 : 1.9} />
  if (alargado && n <= 3) {
    // El 2 y el 3 de espadas y de bastos van cruzados, como en la baraja tradicional.
    return (
      <>
        <Pinta palo={palo} x={30} y={46} escala={1.75} giro={-28} />
        <Pinta palo={palo} x={30} y={46} escala={1.75} giro={28} />
        {n === 3 && <Pinta palo={palo} x={30} y={46} escala={1.75} />}
      </>
    )
  }
  const escala = n === 2 ? 1 : n === 3 ? 0.86 : n <= 5 ? 0.85 : n === 6 ? 0.72 : 0.66
  return (
    <>
      {POSICIONES[n].map(([x, y], i) => (
        // Espadas y bastos se cruzan ligeramente, como en la baraja tradicional.
        <Pinta key={i} palo={palo} x={x} y={y} escala={escala} giro={alargado && n > 1 ? (x < 30 ? 14 : x > 30 ? -14 : 0) : 0} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Figuras
// ---------------------------------------------------------------------------

function Sota({ palo }: { palo: Palo }) {
  const c = COLOR[palo]
  return (
    <g stroke={TRAZO} strokeWidth={0.5} strokeLinejoin="round">
      <rect x={25.6} y={62} width={3.4} height={13} fill={c.oscuro} />
      <rect x={31} y={62} width={3.4} height={13} fill={c.oscuro} />
      <path d="M24,75 h5.5 v2.2 h-6.5 z M30.5,75 h5.5 l1,2.2 h-6.5 z" fill={TRAZO} />
      <path d="M22.5,37 L37.5,37 L41,64 L19,64 Z" fill={c.principal} />
      <path d="M30,37 V64" stroke={ORO} strokeWidth={1} />
      <rect x={20.6} y={50} width={18.8} height={2.2} fill={ORO} />
      <path d="M22.5,38 L17,52 L20,53 L24.5,42 Z" fill={c.principal} />
      <path d="M37.5,38 L42,47 L39.5,49 L35.5,42 Z" fill={c.principal} />
      <circle cx={18.4} cy={53} r={1.6} fill={PIEL} />
      <rect x={27.6} y={33.5} width={4.8} height={3.5} fill={PIEL} />
      <circle cx={30} cy={28.5} r={6} fill={PIEL} />
      <path d="M22.6,27 Q30,15.5 37.4,27 L37.8,24.2 Q30,13 22.2,24.2 Z" fill={c.oscuro} />
      <path d="M22,25.8 h16" stroke={ORO} strokeWidth={1.2} />
      <circle cx={28} cy={29} r={0.6} fill={TRAZO} stroke="none" />
      <circle cx={32} cy={29} r={0.6} fill={TRAZO} stroke="none" />
      <g stroke="none">
        <Pinta palo={palo} x={43} y={44} escala={0.62} giro={palo === 'espadas' || palo === 'bastos' ? -20 : 0} />
      </g>
    </g>
  )
}

function Caballo({ palo }: { palo: Palo }) {
  const c = COLOR[palo]
  return (
    <g stroke={TRAZO} strokeWidth={0.5} strokeLinejoin="round">
      <path d="M15,57 q-5,5 -2.5,12" fill="none" strokeWidth={1.6} />
      {[19, 23.5, 36.5, 41].map((x, i) => (
        <path key={x} d={`M${x},62 L${x + (i % 2 ? 1 : -1)},76`} strokeWidth={2.2} strokeLinecap="round" />
      ))}
      <ellipse cx={29} cy={59} rx={14.5} ry={7.2} fill="#f2e8d2" />
      <path d="M39,56 L44,43 L49.5,44.5 L51,48.5 L46,50 L44,59 Z" fill="#f2e8d2" />
      <path d="M44,43 L42.5,40.5 L45.6,42" fill="#f2e8d2" />
      <circle cx={47.4} cy={46} r={0.6} fill={TRAZO} stroke="none" />
      <path d="M22,55 Q29,49 37,55 L36,61 L23,61 Z" fill={c.principal} />
      <path d="M25,40 L34,40 L35.5,55 L24,55 Z" fill={c.principal} />
      <rect x={23.5} y={47} width={12.5} height={2} fill={ORO} />
      <path d="M33,41 L39,35 L41,37 L35.5,44 Z" fill={c.principal} />
      <circle cx={30} cy={34} r={5} fill={PIEL} />
      <path d="M24.4,33 Q30,23.5 35.6,33 Z" fill={c.oscuro} />
      <circle cx={28.4} cy={34.6} r={0.55} fill={TRAZO} stroke="none" />
      <circle cx={31.6} cy={34.6} r={0.55} fill={TRAZO} stroke="none" />
      <g stroke="none">
        <Pinta palo={palo} x={41.5} y={29} escala={0.58} giro={palo === 'espadas' || palo === 'bastos' ? 25 : 0} />
      </g>
    </g>
  )
}

function Rey({ palo }: { palo: Palo }) {
  const c = COLOR[palo]
  const armino = [20, 25, 30, 35, 40].map((x) => <circle key={x} cx={x} cy={73.2} r={0.6} fill={TRAZO} stroke="none" />)
  return (
    <g stroke={TRAZO} strokeWidth={0.5} strokeLinejoin="round">
      <path d="M21,39 L39,39 L43,75 L17,75 Z" fill={c.principal} />
      <rect x={17} y={71.4} width={26} height={3.6} fill="#fffaf0" />
      {armino}
      <path d="M30,39 V71.4" stroke={ORO} strokeWidth={1.2} />
      <path d="M21.5,40 L16.5,56 L19.6,57 L25,45 Z" fill={c.principal} />
      <path d="M38.5,40 L43,51 L40.6,52.8 L36,45 Z" fill={c.principal} />
      <circle cx={18} cy={57.5} r={1.7} fill={PIEL} />
      <rect x={27.5} y={35} width={5} height={4} fill={PIEL} />
      <circle cx={30} cy={30} r={6} fill={PIEL} />
      <path d="M24,31 Q30,44 36,31 Q33,35 30,35 Q27,35 24,31 Z" fill="#8a6a4a" />
      <path d="M23.2,26 L24,18.4 L27,22.4 L30,16.4 L33,22.4 L36,18.4 L36.8,26 Z" fill={ORO} stroke={ORO_OSCURO} />
      <circle cx={30} cy={19.6} r={0.9} fill="#c0392b" stroke="none" />
      <circle cx={28} cy={29.4} r={0.6} fill={TRAZO} stroke="none" />
      <circle cx={32} cy={29.4} r={0.6} fill={TRAZO} stroke="none" />
      <g stroke="none">
        <Pinta palo={palo} x={44} y={47} escala={0.64} giro={palo === 'espadas' || palo === 'bastos' ? -18 : 0} />
      </g>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Marco con pintas
// ---------------------------------------------------------------------------

/** Filete horizontal con `cortes` interrupciones centradas (las "pintas"). */
function filete(y: number, cortes: number): string {
  const x0 = 4.5
  const x1 = ANCHO - 4.5
  if (cortes === 0) return `M${x0},${y} H${x1}`
  const hueco = 3
  const paso = 6
  const centros = Array.from({ length: cortes }, (_, i) => ANCHO / 2 + (i - (cortes - 1) / 2) * paso)
  let d = `M${x0},${y}`
  for (const cx of centros) d += ` H${cx - hueco / 2} M${cx + hueco / 2},${y}`
  return d + ` H${x1}`
}

function CaraCarta({ carta }: { carta: TCarta }) {
  const n = numeroDe(carta)
  const palo = paloDe(carta)
  const c = COLOR[palo]
  const pintas = PINTAS[palo]
  return (
    <>
      <rect x={0.5} y={0.5} width={ANCHO - 1} height={ALTO - 1} rx={4.5} fill="#fffdf6" stroke="#cfc6b0" />
      <g stroke={c.principal} strokeWidth={0.8} fill="none">
        <path d={filete(4.5, pintas)} />
        <path d={filete(ALTO - 4.5, pintas)} />
        <path d={`M4.5,4.5 V${ALTO - 4.5} M${ANCHO - 4.5},4.5 V${ALTO - 4.5}`} />
      </g>
      <text x={7} y={13.5} className="carta__indice" fill={c.oscuro}>
        {n}
      </text>
      <text x={ANCHO - 7} y={ALTO - 13.5} className="carta__indice" fill={c.oscuro} transform={`rotate(180 ${ANCHO - 7} ${ALTO - 13.5})`}>
        {n}
      </text>
      {n <= 7 && <Numeral palo={palo} n={n} />}
      {n === 10 && <Sota palo={palo} />}
      {n === 11 && <Caballo palo={palo} />}
      {n === 12 && <Rey palo={palo} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Componentes públicos
// ---------------------------------------------------------------------------

const NOMBRE_FIGURA: Record<number, string> = { 1: 'As', 10: 'Sota', 11: 'Caballo', 12: 'Rey' }

function nombreCarta(carta: TCarta): string {
  const n = numeroDe(carta)
  return `${NOMBRE_FIGURA[n] ?? n} de ${paloDe(carta)}`
}

/** Símbolo suelto de un palo (iconos de la interfaz). */
export function IconoPalo({ palo, size = 22 }: { palo: Palo; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-13 -13 26 26" aria-hidden className="icono-palo">
      <Pinta palo={palo} x={0} y={0} escala={palo === 'espadas' || palo === 'bastos' ? 0.95 : 1.2} />
    </svg>
  )
}

interface Props {
  carta: TCarta
  tamano?: 'normal' | 'peque'
  onClick?: () => void
  etiqueta?: string
}

export function Carta({ carta, tamano = 'normal', onClick, etiqueta }: Props) {
  const nombre = nombreCarta(carta)
  const svg = (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="carta__svg" aria-hidden>
      <CaraCarta carta={carta} />
    </svg>
  )
  const clase = `carta carta--${tamano}`
  if (onClick) {
    return (
      <button type="button" className={`${clase} carta--boton`} onClick={onClick} title={etiqueta ?? nombre} aria-label={etiqueta ? `${etiqueta}: ${nombre}` : nombre}>
        {svg}
      </button>
    )
  }
  return (
    <span className={clase} title={nombre} role="img" aria-label={nombre}>
      {svg}
    </span>
  )
}

export function CartaOculta({ tamano = 'normal' }: { tamano?: 'normal' | 'peque' }) {
  return (
    <span className={`carta carta--${tamano}`} aria-label="Carta boca abajo" role="img">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="carta__svg" aria-hidden>
        <defs>
          <pattern id="dorso-rombos" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#8e1f22" />
            <path d="M0,0 H6 M0,0 V6" stroke="#b8393b" strokeWidth="1.2" />
          </pattern>
        </defs>
        <rect x={0.5} y={0.5} width={ANCHO - 1} height={ALTO - 1} rx={4.5} fill="#fffdf6" stroke="#cfc6b0" />
        <rect x={3.5} y={3.5} width={ANCHO - 7} height={ALTO - 7} rx={2.5} fill="url(#dorso-rombos)" />
        <rect x={6} y={6} width={ANCHO - 12} height={ALTO - 12} rx={1.5} fill="none" stroke="#f3d27a" strokeWidth={0.8} />
        <ellipse cx={ANCHO / 2} cy={ALTO / 2} rx={10} ry={14} fill="#8e1f22" stroke="#f3d27a" strokeWidth={0.8} />
        <g transform={`translate(${ANCHO / 2} ${ALTO / 2}) scale(0.8)`}>
          <Oro />
        </g>
      </svg>
    </span>
  )
}

export function Mano({ cartas, tamano }: { cartas: readonly TCarta[]; tamano?: 'normal' | 'peque' }) {
  return (
    <span className="mano">
      {cartas.map((c) => (
        <Carta key={c} carta={c} tamano={tamano} />
      ))}
    </span>
  )
}
