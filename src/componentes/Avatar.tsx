import { useEffect, useState } from 'react'
import type { Sena } from '../engine/informacion'
import './Avatar.css'

/**
 * Cara de un jugador en la mesa. Parpadea de vez en cuando (como cualquiera:
 * por eso la seña de "ciego" se puede confundir) y hace los gestos de las
 * señas durante un instante. Hay que estar mirando para pillarlos.
 */

const PIELES = ['#f1c7a0', '#e8b58f', '#d9a079', '#f3d3b5', '#c98e66']
const PELOS = ['#3a2a1a', '#6b4423', '#1f1f1f', '#a0703c', '#8a8a8a', '#c4a35a']

function hash(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619)
  return h >>> 0
}

interface Props {
  semilla: string
  /** Color de la camiseta según el equipo. */
  nuestro: boolean
  gesto: Sena | null
  tamano?: number
  etiqueta: string
}

export function Avatar({ semilla, nuestro, gesto, tamano = 48, etiqueta }: Props) {
  const h = hash(semilla)
  const piel = PIELES[h % PIELES.length]
  const pelo = PELOS[(h >>> 4) % PELOS.length]
  const calvo = (h >>> 9) % 7 === 0
  const parpadea = useParpadeo(semilla)

  const g = gesto
  const ojosCerrados = g === 'ciego' || (parpadea && g === null)
  const guino = g === 'la31'
  const cejasArriba = g === 'duples'
  // Girar la cabeza y encoger el hombro también inclinan la cabeza: así se nota más.
  const transformCabeza = g === 'pares' ? 'translate(5 0) rotate(14 32 40)' : g === 'treinta' ? 'translate(-2 -1) rotate(-15 32 46)' : ''
  const hombro = g === 'treinta'

  return (
    <svg viewBox="0 0 64 64" width={tamano} height={tamano} className={`avatar ${g ? 'avatar--gesto' : ''}`} role="img" aria-label={etiqueta}>
      {/* Hombros y cuello */}
      <path
        d={hombro ? 'M6,64 C4,44 12,36 24,41 L40,46 C50,46 58,52 58,64 Z' : 'M6,64 C6,52 14,46 24,46 L40,46 C50,46 58,52 58,64 Z'}
        className={nuestro ? 'avatar__ropa--nos' : 'avatar__ropa--ellos'}
      />
      <rect x={27} y={39} width={10} height={9} fill={piel} />
      <g transform={transformCabeza}>
        {/* Cabeza */}
        <ellipse cx={32} cy={28} rx={g === 'pares' ? 12 : 13.5} ry={15.5} fill={piel} />
        <ellipse cx={18.5 + (g === 'pares' ? 2 : 0)} cy={29} rx={2.2} ry={3.4} fill={piel} />
        <ellipse cx={45.5 - (g === 'pares' ? 2 : 0)} cy={29} rx={2.2} ry={3.4} fill={piel} />
        {!calvo && <path d="M18.5,26 C17,12 26,9 32,9 C40,9 47,12 45.5,26 C43,19 38,16 32,16 C26,16 21,19 18.5,26 Z" fill={pelo} />}
        {/* Cejas */}
        <g stroke={pelo === '#8a8a8a' ? '#555' : pelo} strokeWidth={1.6} strokeLinecap="round">
          <line x1={23.5} y1={cejasArriba ? 15.5 : 21} x2={28.5} y2={cejasArriba ? 13.8 : 20.5} />
          <line x1={35.5} y1={cejasArriba ? 13.8 : 20.5} x2={40.5} y2={cejasArriba ? 15.5 : 21} />
        </g>
        {/* Ojos */}
        {ojosCerrados ? (
          <g stroke="#2a1d12" strokeWidth={1.4} strokeLinecap="round">
            <line x1={24} y1={25.5} x2={28.5} y2={25.5} />
            <line x1={35.5} y1={25.5} x2={40} y2={25.5} />
          </g>
        ) : (
          <g>
            <ellipse cx={26.2} cy={25.5} rx={1.9} ry={cejasArriba ? 2.9 : 2.2} fill="#2a1d12" />
            {guino ? (
              <path d="M35.5,26 Q37.8,24 40,26" stroke="#2a1d12" strokeWidth={1.5} fill="none" strokeLinecap="round" />
            ) : (
              <ellipse cx={37.8} cy={25.5} rx={1.9} ry={cejasArriba ? 2.9 : 2.2} fill="#2a1d12" />
            )}
          </g>
        )}
        {/* Nariz */}
        <path d="M32,27 L30.6,32 L32.6,32.4" stroke="#b07a55" strokeWidth={1} fill="none" strokeLinecap="round" />
        <Boca gesto={g} />
      </g>
    </svg>
  )
}

function Boca({ gesto }: { gesto: Sena | null }) {
  const labio = '#a8463a'
  switch (gesto) {
    case 'dosReyes':
    case 'tresReyes': {
      // Morderse el labio inferior (en el centro o por un lado).
      const dx = gesto === 'tresReyes' ? 3.5 : 0
      return (
        <g transform={`translate(${dx} 0)`}>
          <path d="M27,37.5 Q32,40.5 37,37.5" stroke={labio} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <rect x={29.6} y={35.6} width={4.8} height={2.3} rx={0.6} fill="#fffdf6" stroke="#ccc" strokeWidth={0.3} />
        </g>
      )
    }
    case 'dosPitos':
    case 'tresPitos': {
      // Asomar la punta de la lengua (en el centro o por un lado).
      const dx = gesto === 'tresPitos' ? 3.5 : 0
      return (
        <g>
          <path d="M27,36.5 Q32,38.5 37,36.5" stroke={labio} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <ellipse cx={32 + dx} cy={38.6} rx={2.2} ry={1.8} fill="#e0697a" />
        </g>
      )
    }
    case 'medias':
      // Torcer la boca.
      return <path d="M27.5,38.5 Q31,37 37,35" stroke={labio} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    case 'juego':
      // Fruncir los labios como para un beso.
      return <ellipse cx={32} cy={37} rx={2.2} ry={1.9} fill="none" stroke={labio} strokeWidth={1.8} />
    default:
      return <path d="M27.5,36.5 Q32,39 36.5,36.5" stroke={labio} strokeWidth={1.6} fill="none" strokeLinecap="round" />
  }
}

/** Parpadeo natural cada pocos segundos, distinto para cada jugador. */
function useParpadeo(semilla: string): boolean {
  const [cerrados, setCerrados] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    let vivo = true
    const siguiente = () => {
      t = setTimeout(
        () => {
          if (!vivo) return
          setCerrados(true)
          t = setTimeout(() => {
            if (!vivo) return
            setCerrados(false)
            siguiente()
          }, 130)
        },
        2200 + Math.random() * 4500,
      )
    }
    siguiente()
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [semilla])
  return cerrados
}
