import type { ReactNode } from 'react'
import { pct } from './formato'

export function Panel({ titulo, children, extra, className = '' }: { titulo?: ReactNode; children: ReactNode; extra?: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(titulo || extra) && (
        <header className="panel__cabecera">
          {titulo && <h2>{titulo}</h2>}
          {extra}
        </header>
      )}
      {children}
    </section>
  )
}

interface PropsBarra {
  etiqueta: ReactNode
  valor: number
  detalle?: ReactNode
  tono?: 'nosotros' | 'ellos' | 'neutro'
}

/** Barra horizontal de probabilidad con su etiqueta y porcentaje. */
export function Barra({ etiqueta, valor, detalle, tono = 'nosotros' }: PropsBarra) {
  const ancho = Math.max(0, Math.min(1, Number.isFinite(valor) ? valor : 0)) * 100
  return (
    <div className="barra">
      <div className="barra__fila">
        <span className="barra__etiqueta">{etiqueta}</span>
        <span className="barra__valor">{pct(valor)}</span>
      </div>
      <div className="barra__pista" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ancho)}>
        <div className={`barra__relleno barra__relleno--${tono}`} style={{ width: `${ancho}%` }} />
      </div>
      {detalle && <div className="barra__detalle">{detalle}</div>}
    </div>
  )
}

interface OpcionSeg<T> {
  valor: T
  texto: ReactNode
}

export function Segmentado<T extends string | number | boolean | undefined>({
  opciones,
  valor,
  onChange,
  etiqueta,
  peque = false,
}: {
  opciones: OpcionSeg<T>[]
  valor: T
  onChange: (v: T) => void
  etiqueta: string
  peque?: boolean
}) {
  return (
    <div className={`segmentado ${peque ? 'segmentado--peque' : ''}`} role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          className={o.valor === valor ? 'activo' : ''}
          onClick={() => onChange(o.valor)}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

export function Chip({ activo, onClick, children, title }: { activo: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" className={`chip ${activo ? 'chip--activo' : ''}`} aria-pressed={activo} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

export function Etiqueta({ children, tono = 'neutro' }: { children: ReactNode; tono?: 'neutro' | 'ok' | 'mal' | 'oro' }) {
  return <span className={`etiqueta etiqueta--${tono}`}>{children}</span>
}
