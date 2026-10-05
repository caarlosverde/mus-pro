import { useEffect, useRef, useState } from 'react'
import { NOMBRE_LANCE } from '../engine/mesa'
import type { Asiento } from '../engine/partida'
import type { EventoVista, VistaMesa } from '../engine/sala'
import '../paginas/Partida.css'

/**
 * Piezas de la mesa que se muestran en paneles: recuento de la mano,
 * registro de lo que ha pasado, chat y aviso de juego ganado.
 */

export function RecuentoMano({ v }: { v: VistaMesa }) {
  const m = v.mano
  if (!m?.recuento) return null
  const mio = v.miAsiento === null ? 0 : v.miAsiento % 2
  return (
    <ul className="lista-limpia recuento">
      {m.recuento.map((ev, i) => (
        <li key={i} className={ev.equipo === mio ? 'recuento--nos' : 'recuento--ellos'}>
          <span>{ev.motivo}</span>
          <strong>
            {ev.equipo === mio ? 'Vosotros' : 'Ellos'} +{ev.piedras}
          </strong>
        </li>
      ))}
    </ul>
  )
}

export function RegistroJuego({ v, nombre }: { v: VistaMesa; nombre: (a: Asiento) => string }) {
  const lineas = (v.mano?.eventos ?? []).map((ev) => textoEvento(ev, nombre))
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [lineas.length])
  return (
    <ol className="registro" ref={ref}>
      {lineas.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ol>
  )
}

function textoEvento(ev: EventoVista, nombre: (a: Asiento) => string): string {
  switch (ev.tipo) {
    case 'reparto':
      return ev.ronda === 0 ? 'Se reparten las cartas.' : `Se reparten los descartes (ronda ${ev.ronda}).`
    case 'mus':
      return `${nombre(ev.asiento)}: ${ev.corta ? '¡corto!' : 'mus'}`
    case 'descarte':
      return `${nombre(ev.asiento)} se descarta de ${ev.cartas}.`
    case 'declaracion':
      return `${nombre(ev.asiento)}: ${ev.lance} ${ev.tiene ? 'sí' : 'no'}`
    case 'envite':
      return `${NOMBRE_LANCE[ev.lance]} · ${nombre(ev.asiento)}: ${ev.texto}`
    case 'cierre':
      return `→ ${ev.texto}`
  }
}

/** Frases típicas de mesa para no tener que escribir desde el móvil. */
const FRASES = ['Te pongo pares', 'Te pongo juego', 'Corta tú', 'Voy ciego', '¡Buena!', 'Vaya cartas…', 'Que corten ellos', '¡Vamos!']

export function ChatMesa({ v, onDecir }: { v: VistaMesa; onDecir: (texto: string) => void }) {
  const [texto, setTexto] = useState('')
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [v.chat.length])
  const enviar = (t: string) => {
    if (t.trim()) onDecir(t)
    setTexto('')
  }
  return (
    <div className="chat">
      <ol className="chat__mensajes" ref={ref}>
        {v.chat.length === 0 && <li className="texto-suave">En el mus se habla (y se miente). Di algo a la mesa.</li>}
        {v.chat.map((c, i) => (
          <li key={i}>
            <strong>{c.nombre}:</strong> {c.texto}
          </li>
        ))}
      </ol>
      <div className="chat__frases">
        {FRASES.map((f) => (
          <button key={f} type="button" className="chip" onClick={() => enviar(f)}>
            {f}
          </button>
        ))}
      </div>
      <form
        className="chat__escribir"
        onSubmit={(e) => {
          e.preventDefault()
          enviar(texto)
        }}
      >
        <input id="chat-texto" value={texto} maxLength={140} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe a la mesa…" aria-label="Mensaje para la mesa" />
        <button type="submit" className="boton boton--peque">
          Decir
        </button>
      </form>
    </div>
  )
}

/** Aviso de juego o vaca ganada al terminar una mano. */
export function AvisoJuego({ v }: { v: VistaMesa }) {
  const m = v.mano
  if (!m?.ganadorJuego && m?.ganadorJuego !== 0) return null
  const mio = v.miAsiento === null ? 0 : v.miAsiento % 2
  const nuestro = m.ganadorJuego === mio
  return (
    <p className={`aviso ${nuestro ? 'aviso--ok' : 'aviso--mal'}`}>
      {nuestro ? '¡Juego para vosotros!' : 'Juego para ellos.'}{' '}
      {v.resultado && (v.resultado.ganador === mio ? '¡Y la vaca! 🏆' : 'Se llevan la vaca.')}
    </p>
  )
}
