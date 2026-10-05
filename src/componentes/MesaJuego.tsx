import { useEffect, useRef, useState } from 'react'
import type { Carta as TCarta } from '../engine/cartas'
import { describirJugada } from '../engine/entrenadorCorte'
import type { AccionEnvite } from '../engine/envites'
import { evaluar } from '../engine/evaluacion'
import { SENAS, type Sena } from '../engine/informacion'
import type { AccionMano } from '../engine/mano'
import { NOMBRE_LANCE, NOMBRE_POSICION, type Posicion } from '../engine/mesa'
import type { Asiento } from '../engine/partida'
import { DURACION_GESTO_MS, type EventoVista, type VistaMesa } from '../engine/sala'
import { Avatar } from './Avatar'
import { Carta, CartaOculta } from './Carta'
import '../paginas/Partida.css'

/**
 * Piezas de la mesa de juego, alimentadas sólo por la `VistaMesa` del jugador:
 * se usan igual en la partida local contra bots y en las mesas online.
 */

export interface EtiquetaAsiento {
  nombre: string
  detalle?: string
}

/** Asiento que se dibuja abajo: el tuyo (o el 0 si miras como espectador). */
const base = (v: VistaMesa): Asiento => v.miAsiento ?? 0
const rel = (v: VistaMesa, k: number) => ((base(v) + k) % 4) as Asiento

function posicionEnMano(v: VistaMesa, a: Asiento): Posicion | null {
  return v.asientoMano === null ? null : (((a - v.asientoMano + 4) % 4) as Posicion)
}

export function MesaJuego({ v, etiqueta }: { v: VistaMesa; etiqueta: (a: Asiento) => EtiquetaAsiento }) {
  const m = v.mano
  const fin = m?.fase === 'fin'
  const gestos = useGestosActivos(v)

  const plaza = (a: Asiento, lugar: string) => {
    const pos = posicionEnMano(v, a)
    const soyYo = a === v.miAsiento
    const nuestra = v.miAsiento === null ? a % 2 === 0 : a % 2 === v.miAsiento % 2
    const cartas = m?.cartas[a] ?? null
    const ultima = m ? ultimaAccion(m.eventos, a, m.lance) : null
    const senasDe = (m?.senas ?? []).filter((s) => s.de === a)
    const j = v.jugadores[a]
    const et = etiqueta(a)
    return (
      <div className={`plaza plaza--${lugar} ${m?.turno === a ? 'plaza--turno' : ''} ${nuestra ? 'plaza--nuestra' : 'plaza--suya'}`}>
        <div className="plaza__cabeza">
          <Avatar
            semilla={j.tipo === 'humano' ? j.nombre : `${j.nombre}-${a}`}
            nuestro={nuestra}
            gesto={gestos[a] ?? null}
            tamano={soyYo ? 52 : 46}
            etiqueta={`Cara de ${et.nombre}`}
          />
        <div className="plaza__nombre">
          <strong>
            {et.nombre}
            {j.tipo === 'humano' && !j.conectado && <span className="desconectado"> · ausente</span>}
          </strong>
          <span>
            {pos !== null ? NOMBRE_POSICION[pos] : 'Esperando'}
            {et.detalle && ` · ${et.detalle}`}
          </span>
        </div>
        </div>
        <div className="plaza__dice" aria-live="polite">
          {ultima && <span className="bocadillo">{ultima}</span>}
        </div>
        {m && (
          <div className="mano">
            {cartas
              ? cartas.map((c) => <Carta key={c} carta={c} tamano={soyYo ? 'normal' : 'peque'} />)
              : [0, 1, 2, 3].map((i) => <CartaOculta key={i} tamano="peque" />)}
          </div>
        )}
        {cartas && (soyYo || fin) && (
          <div className={`plaza__jugada ${soyYo ? 'plaza__jugada--mia' : ''}`}>
            {soyYo && <span className="plaza__etiqueta">Tu jugada</span>}
            {describirJugada(evaluar(cartas, v.reglas))}
          </div>
        )}
        {senasDe.length > 0 && !fin && (
          <div className="nota-sena">
            <span className="plaza__etiqueta">
              {senasDe[0].como === 'propia' ? 'Seña a tu compañero' : senasDe[0].como === 'companero' ? 'Te pasa' : 'Le pillas'}
            </span>
            {senasDe.map((s) => SENAS[s.sena].nombre.toLowerCase()).join(', ')}
          </div>
        )}
      </div>
    )
  }

  const env = m?.envite
  return (
    <div className="mesa-partida tapete">
      {plaza(rel(v, 2), 'arriba')}
      {plaza(rel(v, 3), 'izquierda')}
      <div className="mesa-partida__centro">
        {m?.fase === 'envites' && m.lance && <div className="lance-actual">{NOMBRE_LANCE[m.lance]}</div>}
        {env && env.apostado > 0 && (
          <div className="bote">{env.ordago ? '¡Órdago!' : `Envite: ${env.apostado}${env.fase === 'respuesta' ? ` (no quiero: ${env.porqueNo})` : ''}`}</div>
        )}
        {m?.fase === 'mus' && <div className="lance-actual">{m.ronda === 0 ? 'Primeras dadas' : `Descartes: ${m.ronda}`}</div>}
        {!m && <div className="lance-actual">Esperando jugadores</div>}
      </div>
      {plaza(rel(v, 1), 'derecha')}
      {plaza(rel(v, 0), 'abajo')}
    </div>
  )
}

/** Lo último que ha dicho un jugador en la ronda actual. */
function ultimaAccion(eventos: EventoVista[], a: Asiento, lance: string | null): string | null {
  const ini = eventos.findLastIndex((x) => x.tipo === 'reparto')
  for (let i = eventos.length - 1; i > ini; i--) {
    const ev = eventos[i]
    if (ev.tipo === 'cierre') return null
    if ('asiento' in ev && ev.asiento === a) {
      if (ev.tipo === 'mus') return ev.corta ? '¡Corto!' : 'Mus'
      if (ev.tipo === 'envite') return ev.texto
      if (ev.tipo === 'declaracion' && lance === ev.lance) return `${ev.lance === 'pares' ? 'Pares' : 'Juego'} ${ev.tiene ? 'sí' : 'no'}`
      if (ev.tipo === 'descarte') return `Se descarta de ${ev.cartas}`
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

export function ControlesJuego({ v, onAccion }: { v: VistaMesa; onAccion: (a: AccionMano) => void }) {
  const [seleccion, setSeleccion] = useState<TCarta[]>([])
  const [cantidad, setCantidad] = useState(3)
  const m = v.mano
  if (!m || v.miAsiento === null || m.turno !== v.miAsiento) return null
  const misCartas = m.cartas[v.miAsiento] ?? []

  if (m.fase === 'mus') {
    return (
      <div className="acciones">
        <button type="button" className="boton" onClick={() => onAccion({ tipo: 'mus' })}>
          Mus
        </button>
        <button type="button" className="boton boton--primario" onClick={() => onAccion({ tipo: 'corto' })}>
          Corto
        </button>
      </div>
    )
  }

  if (m.fase === 'descarte') {
    const alternar = (c: TCarta) => setSeleccion((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))
    return (
      <div className="descarte">
        <p className="texto-suave">Toca las cartas que quieres soltar (al menos una).</p>
        <div className="mano">
          {misCartas.map((c) => (
            <span key={c} className={`seleccionable ${seleccion.includes(c) ? 'seleccionable--activa' : ''}`}>
              <Carta carta={c} onClick={() => alternar(c)} etiqueta={seleccion.includes(c) ? 'Conservar' : 'Descartar'} />
            </span>
          ))}
        </div>
        <button
          type="button"
          className="boton boton--primario"
          disabled={seleccion.length === 0}
          onClick={() => {
            onAccion({ tipo: 'descarte', cartas: seleccion })
            setSeleccion([])
          }}
        >
          Descartar {seleccion.length || ''}
        </button>
      </div>
    )
  }

  if (m.fase === 'envites' && m.envite) {
    const legales = m.envite.legales
    const jugar = (accion: AccionEnvite) => onAccion({ tipo: 'envite', accion })
    const respuesta = m.envite.fase === 'respuesta'
    return (
      <div className="acciones">
        {legales.includes('paso') && (
          <button type="button" className="boton" onClick={() => jugar({ tipo: 'paso' })}>
            {respuesta ? 'No quiero' : 'Paso'}
          </button>
        )}
        {legales.includes('quiero') && (
          <button type="button" className="boton boton--primario" onClick={() => jugar({ tipo: 'quiero' })}>
            Quiero
          </button>
        )}
        {legales.includes('envido') && (
          <>
            <button type="button" className="boton" onClick={() => jugar({ tipo: 'envido', piedras: 2 })}>
              {respuesta ? '2 más' : 'Envido'}
            </button>
            <span className="envite-libre">
              <button type="button" className="boton boton--peque" onClick={() => setCantidad((c) => Math.max(3, c - 1))} aria-label="Menos">
                −
              </button>
              <button type="button" className="boton" onClick={() => jugar({ tipo: 'envido', piedras: cantidad })}>
                {respuesta ? `${cantidad} más` : `Envido ${cantidad}`}
              </button>
              <button type="button" className="boton boton--peque" onClick={() => setCantidad((c) => Math.min(30, c + 1))} aria-label="Más">
                +
              </button>
            </span>
          </>
        )}
        {legales.includes('ordago') && (
          <button type="button" className="boton boton--ordago" onClick={() => jugar({ tipo: 'ordago' })}>
            Órdago
          </button>
        )}
      </div>
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// Recuento, registro y chat
// ---------------------------------------------------------------------------

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

/** Marcador de la mesa desde el punto de vista del jugador. */
export function MarcadorMesa({ v }: { v: VistaMesa }) {
  const mio = v.miAsiento === null ? 0 : v.miAsiento % 2
  const tantos = v.mano?.tantos ?? [0, 0]
  return (
    <div className="marcador-partida">
      <div>
        <span>{v.miAsiento === null ? 'Norte-Sur' : 'Nosotros'}</span>
        <strong>{tantos[mio]}</strong>
        <small>{v.juegos[mio]} juegos</small>
      </div>
      <div className="marcador-partida__sep">a {v.reglas.piedras}</div>
      <div>
        <span>{v.miAsiento === null ? 'Este-Oeste' : 'Ellos'}</span>
        <strong>{tantos[1 - mio]}</strong>
        <small>{v.juegos[1 - mio]} juegos</small>
      </div>
    </div>
  )
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


/**
 * Gestos que está haciendo cada avatar ahora mismo. Cada gesto nuevo (por id)
 * se muestra un instante; los que ya estaban al llegar no se repiten.
 */
function useGestosActivos(v: VistaMesa): Partial<Record<Asiento, Sena>> {
  const vistos = useRef<Set<number> | null>(null)
  const [activos, setActivos] = useState<Partial<Record<Asiento, Sena>>>({})
  useEffect(() => {
    if (vistos.current === null) {
      // Primera vista (o reconexión): no se reproducen gestos antiguos.
      vistos.current = new Set(v.gestos.map((g) => g.id))
      return
    }
    const nuevos = v.gestos.filter((g) => !vistos.current!.has(g.id))
    if (nuevos.length === 0) return
    const temporizadores: ReturnType<typeof setTimeout>[] = []
    nuevos.forEach((g, i) => {
      vistos.current!.add(g.id)
      // Si llegan varios a la vez del mismo jugador, se encadenan.
      const retraso = nuevos.slice(0, i).filter((x) => x.asiento === g.asiento).length * (DURACION_GESTO_MS + 250)
      temporizadores.push(setTimeout(() => setActivos((a) => ({ ...a, [g.asiento]: g.sena })), retraso))
      temporizadores.push(
        setTimeout(() => setActivos((a) => (a[g.asiento] === g.sena ? { ...a, [g.asiento]: undefined } : a)), retraso + (g.sena === 'ciego' ? 480 : DURACION_GESTO_MS)),
      )
    })
    return () => {
      // Los gestos ya empezados terminan aunque cambie la vista.
      void temporizadores
    }
  }, [v.gestos])
  return activos
}

/** Botones para hacer una seña con el avatar (sólo las que permite tu mano). */
export function PanelSenas({ v, onSena }: { v: VistaMesa; onSena: (s: Sena) => void }) {
  const [bloqueado, setBloqueado] = useState(false)
  if (v.modoSenas !== 'avatar' || v.misSenas.length === 0) return null
  return (
    <div className="panel-senas">
      <div className="panel-senas__cabecera">
        <strong>Hacer seña</strong>
        <span className="texto-suave">Dura un instante: tu compañero tiene que estar mirándote… y los rivales también pueden.</span>
      </div>
      <div className="chips">
        {v.misSenas.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            title={SENAS[s].gesto}
            disabled={bloqueado}
            onClick={() => {
              setBloqueado(true)
              setTimeout(() => setBloqueado(false), DURACION_GESTO_MS)
              onSena(s)
            }}
          >
            {SENAS[s].nombre}
          </button>
        ))}
      </div>
    </div>
  )
}
