import { numeroDe, paloDe, type Carta as TCarta, type Palo } from '../engine/cartas'
import './Carta.css'

const FIGURA: Record<number, string> = { 10: 'S', 11: 'C', 12: 'R' }
const NOMBRE_FIGURA: Record<number, string> = { 10: 'Sota', 11: 'Caballo', 12: 'Rey' }

export function IconoPalo({ palo, size = 22 }: { palo: Palo; size?: number }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true }
  switch (palo) {
    case 'oros':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" fill="var(--oros)" />
          <circle cx="12" cy="12" r="5.5" fill="none" stroke="#fff6d5" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="1.8" fill="#fff6d5" />
        </svg>
      )
    case 'copas':
      return (
        <svg {...props}>
          <path d="M5 4h14c0 5-2.6 8.2-5.5 9v3.2c0 .8 2.5 1.3 3.5 2.3V20H7v-1.5c1-1 3.5-1.5 3.5-2.3V13C7.6 12.2 5 9 5 4z" fill="var(--copas)" />
          <path d="M7.4 6.2h9.2" stroke="#ffd9d3" strokeWidth="1.2" />
        </svg>
      )
    case 'espadas':
      return (
        <svg {...props}>
          <path d="M12 1.8l2 4v10.4h-4V5.8z" fill="var(--espadas)" />
          <rect x="6.5" y="16" width="11" height="2" rx="1" fill="var(--espadas)" />
          <rect x="11" y="18" width="2" height="4.2" rx="1" fill="var(--espadas)" />
        </svg>
      )
    case 'bastos':
      return (
        <svg {...props}>
          <path d="M9 21.5l1.4-12.8a3.6 3.6 0 1 1 3.4-4.6 3 3 0 0 1 1 5.1L13.4 21.5z" fill="var(--bastos)" />
          <circle cx="12.6" cy="6.4" r="0.9" fill="#d6f0d8" />
          <circle cx="11.4" cy="12" r="0.8" fill="#d6f0d8" />
        </svg>
      )
  }
}

interface Props {
  carta: TCarta
  tamano?: 'normal' | 'peque'
  onClick?: () => void
  etiqueta?: string
}

export function Carta({ carta, tamano = 'normal', onClick, etiqueta }: Props) {
  const n = numeroDe(carta)
  const palo = paloDe(carta)
  const simbolo = FIGURA[n] ?? String(n)
  const nombre = `${NOMBRE_FIGURA[n] ?? n} de ${palo}`
  const contenido = (
    <>
      <span className="carta__esquina">{simbolo}</span>
      <span className="carta__centro">
        <IconoPalo palo={palo} size={tamano === 'peque' ? 18 : 26} />
      </span>
      <span className="carta__esquina carta__esquina--abajo">{simbolo}</span>
    </>
  )
  const clase = `carta carta--${tamano} carta--${palo}`
  if (onClick) {
    return (
      <button type="button" className={`${clase} carta--boton`} onClick={onClick} title={etiqueta ?? nombre} aria-label={etiqueta ?? nombre}>
        {contenido}
      </button>
    )
  }
  return (
    <span className={clase} title={nombre} role="img" aria-label={nombre}>
      {contenido}
    </span>
  )
}

export function CartaOculta({ tamano = 'normal' }: { tamano?: 'normal' | 'peque' }) {
  return <span className={`carta carta--${tamano} carta--oculta`} aria-label="Carta desconocida" role="img" />
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
