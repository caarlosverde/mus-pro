import { useEffect, useState, type ReactNode } from 'react'
import type { Carta as TCarta } from '../engine/cartas'
import { describirJugada } from '../engine/entrenadorCorte'
import type { AccionEnvite } from '../engine/envites'
import { evaluar } from '../engine/evaluacion'
import { SENAS, type Sena } from '../engine/informacion'
import type { AccionMano } from '../engine/mano'
import { NOMBRE_LANCE, NOMBRE_POSICION, type Posicion } from '../engine/mesa'
import type { Asiento } from '../engine/partida'
import { DURACION_GESTO_MS, type VistaMesa } from '../engine/sala'
import { ultimaAccion, ultimoCierre, useGestosActivos } from '../estado/gestos'
import { Avatar } from './Avatar'
import { Carta, CartaOculta } from './Carta'
import { AvisoJuego, RecuentoMano } from './PiezasMesa'
import './PantallaJuego.css'

/**
 * Pantalla de juego a pantalla completa: los cuatro jugadores, el lance, tus
 * cartas y tus opciones caben a la vez, en el ordenador y en el móvil. El
 * registro, el chat y la revisión van en un panel lateral.
 */

export interface EtiquetaJugador {
  nombre: string
  detalle?: string
}

export interface PestanaPanel {
  id: string
  titulo: string
  /** Símbolo corto para pantallas estrechas. */
  icono: string
  contenido: ReactNode
  /** Muestra un punto de aviso en el botón (p. ej. mensajes nuevos). */
  aviso?: boolean
}

interface Props {
  v: VistaMesa
  etiqueta: (a: Asiento) => EtiquetaJugador
  onAccion: (a: AccionMano) => void
  onSena: (s: Sena) => void
  onSalir: () => void
  textoSalir: string
  /** Si se da, pide confirmación antes de salir. */
  confirmarSalida?: string
  ayudas: boolean
  onAyudas: (v: boolean) => void
  /** Controles extra de la barra (p. ej. "rápido" en la partida local). */
  extraBarra?: ReactNode
  /** Botones y contenido del final de mano (siguiente mano, revisión, puntos...). */
  finMano: ReactNode
  pestanas: PestanaPanel[]
  /** Panel lateral abierto (opcional: para abrirlo desde fuera, p. ej. la revisión). */
  panel?: string | null
  onPanel?: (id: string | null) => void
  /** Si el jugador tiene que ver algo bajo su zona (p. ej. "esperando a los demás"). */
  aviso?: ReactNode
  /** Mensaje flotante breve (errores de conexión, acciones rechazadas...). */
  toast?: string | null
}

const rel = (v: VistaMesa, k: number) => (((v.miAsiento ?? 0) + k) % 4) as Asiento

function posicionEnMano(v: VistaMesa, a: Asiento): Posicion | null {
  return v.asientoMano === null ? null : (((a - v.asientoMano + 4) % 4) as Posicion)
}

export function PantallaJuego(p: Props) {
  const { v } = p
  const m = v.mano
  const gestos = useGestosActivos(v)
  const [panelInterno, setPanelInterno] = useState<string | null>(null)
  const panel = p.panel !== undefined ? p.panel : panelInterno
  const setPanel = p.onPanel ?? setPanelInterno
  const [confirmando, setConfirmando] = useState(false)
  const [seleccion, setSeleccion] = useState<TCarta[]>([])
  const yo = v.miAsiento
  const miTurno = m !== null && yo !== null && m.turno === yo && m.fase !== 'fin'
  const fin = m?.fase === 'fin'
  const misCartas = (yo !== null && m?.cartas[yo]) || []

  // Al cambiar de fase se olvida la selección del descarte.
  const claveDescarte = `${m?.fase}-${m?.ronda}`
  const [claveVista, setClaveVista] = useState(claveDescarte)
  if (claveVista !== claveDescarte) {
    setClaveVista(claveDescarte)
    setSeleccion([])
  }

  // Bloquea el scroll de la página mientras se juega.
  useEffect(() => {
    document.documentElement.classList.add('jugando')
    return () => document.documentElement.classList.remove('jugando')
  }, [])

  const mio = yo === null ? 0 : yo % 2
  const tantos = m?.tantos ?? [0, 0]
  const pestanaActiva = p.pestanas.find((x) => x.id === panel)

  return (
    <div className="juego">
      {/* Barra superior: salir, marcador, lance y menús */}
      <header className="juego__barra">
        <button type="button" className="juego__boton-barra" onClick={() => (p.confirmarSalida ? setConfirmando(true) : p.onSalir())} aria-label={p.textoSalir} title={p.textoSalir}>
          ←
        </button>
        <div className="juego__marcador" aria-label="Marcador">
          <span className="juego__equipo juego__equipo--nos">
            <small>{yo === null ? 'N-S' : 'Nos'}</small>
            <strong>{tantos[mio]}</strong>
          </span>
          <span className="juego__a">
            <span className="juego__a-objetivo">a {v.reglas.piedras}</span>
            <small>
              juegos {v.juegos[mio]}–{v.juegos[1 - mio]}
            </small>
          </span>
          <span className="juego__equipo juego__equipo--ellos">
            <small>{yo === null ? 'E-O' : 'Ellos'}</small>
            <strong>{tantos[1 - mio]}</strong>
          </span>
        </div>
        <div className="juego__barra-derecha">
          {p.extraBarra}
          <button type="button" className={`juego__boton-barra ${p.ayudas ? 'activo' : ''}`} aria-pressed={p.ayudas} onClick={() => p.onAyudas(!p.ayudas)} title="Ayuda: ver qué jugada llevas">
            ?
          </button>
          {p.pestanas.map((x) => (
            <button key={x.id} type="button" aria-label={x.titulo} title={x.titulo} className={`juego__boton-barra juego__boton-texto ${panel === x.id ? 'activo' : ''}`} onClick={() => setPanel(panel === x.id ? null : x.id)}>
              <span className="juego__boton-texto-largo">{x.titulo}</span>
              <span className="juego__boton-icono" aria-hidden>
                {x.icono}
              </span>
              {x.aviso && <span className="juego__punto-aviso" aria-label="novedades" />}
            </button>
          ))}
        </div>
      </header>

      {/* Mesa: compañero arriba, rivales a los lados, información en el centro */}
      <main className="juego__mesa">
        <Asiento p={p} a={rel(v, 2)} lugar="arriba" gesto={gestos[rel(v, 2)]} />
        <Asiento p={p} a={rel(v, 3)} lugar="izquierda" gesto={gestos[rel(v, 3)]} />
        <Asiento p={p} a={rel(v, 1)} lugar="derecha" gesto={gestos[rel(v, 1)]} />
        <Centro v={v} etiqueta={p.etiqueta} />

        {fin && (
          <div className="juego__fin" role="dialog" aria-label="Fin de la mano">
            <AvisoJuego v={v} />
            <ResumenMano v={v} />
            <details className="juego__fin-detalle">
              <summary>Ver el recuento</summary>
              <RecuentoMano v={v} />
            </details>
            {p.finMano}
          </div>
        )}
      </main>

      {/* Tu zona: avatar, cartas y acciones */}
      <section className={`juego__yo ${miTurno ? 'juego__yo--turno' : ''}`} aria-label="Tus cartas y acciones">
        {yo !== null && (
          <div className="juego__yo-cabeza">
            <Avatar semilla={v.jugadores[yo].nombre} nuestro gesto={gestos[yo] ?? null} tamano={40} etiqueta="Tu cara" />
            <div className="juego__yo-nombre">
              <strong>{p.etiqueta(yo).nombre}</strong>
              <span>{posicionEnMano(v, yo) !== null ? NOMBRE_POSICION[posicionEnMano(v, yo)!] : ''}</span>
            </div>
            <Bocadillo v={v} a={yo} />
          </div>
        )}
        {m && yo !== null && (
          <div className="juego__mis-cartas">
            {misCartas.map((c) =>
              m.fase === 'descarte' && miTurno ? (
                <span key={c} className={`juego__carta-sel ${seleccion.includes(c) ? 'juego__carta-sel--fuera' : ''}`}>
                  <Carta carta={c} onClick={() => setSeleccion((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))} etiqueta={seleccion.includes(c) ? 'Quedármela' : 'Descartarla'} />
                </span>
              ) : (
                <Carta key={c} carta={c} />
              ),
            )}
          </div>
        )}
        {p.ayudas && misCartas.length === 4 && <div className="juego__ayuda">{describirJugada(evaluar(misCartas, v.reglas))}</div>}
        {miTurno && <Acciones v={v} seleccion={seleccion} onAccion={p.onAccion} />}
        {!miTurno && m && !fin && m.turno !== null && <p className="juego__espera">Habla {p.etiqueta(m.turno).nombre}…</p>}
        {p.aviso}
        <BotonSenas v={v} onSena={p.onSena} />
      </section>

      {p.toast && (
        <div className="juego__toast" role="alert">
          {p.toast}
        </div>
      )}

      {confirmando && (
        <div className="juego__confirmar" role="alertdialog" aria-label={p.textoSalir}>
          <div>
            <p>{p.confirmarSalida}</p>
            <div className="acciones">
              <button type="button" className="boton" onClick={() => setConfirmando(false)}>
                Seguir jugando
              </button>
              <button type="button" className="boton boton--primario" onClick={p.onSalir}>
                Salir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel lateral: registro, chat, revisión */}
      {pestanaActiva && (
        <aside className="juego__panel" aria-label={pestanaActiva.titulo}>
          <header>
            <strong>{pestanaActiva.titulo}</strong>
            <button type="button" className="juego__boton-barra" onClick={() => setPanel(null)} aria-label="Cerrar panel">
              ×
            </button>
          </header>
          <div className="juego__panel-contenido">{pestanaActiva.contenido}</div>
        </aside>
      )}
    </div>
  )
}

function Asiento({ p, a, lugar, gesto }: { p: Props; a: Asiento; lugar: string; gesto: Sena | undefined }) {
  const { v } = p
  const m = v.mano
  const j = v.jugadores[a]
  const et = p.etiqueta(a)
  const pos = posicionEnMano(v, a)
  const cartas = m?.cartas[a] ?? null
  const turno = m?.turno === a && m.fase !== 'fin'
  const nuestro = v.miAsiento === null ? a % 2 === 0 : a % 2 === v.miAsiento % 2
  return (
    <div className={`juego__asiento juego__asiento--${lugar} ${turno ? 'juego__asiento--turno' : ''} ${nuestro ? 'juego__asiento--nos' : 'juego__asiento--ellos'}`}>
      <div className="juego__asiento-cabeza">
        <Avatar semilla={j.tipo === 'humano' ? j.nombre : `${j.nombre}-${a}`} nuestro={nuestro} gesto={gesto ?? null} tamano={40} etiqueta={`Cara de ${et.nombre}`} />
        <div className="juego__asiento-nombre">
          <strong title={et.nombre}>
            {et.nombre}
            {j.tipo === 'humano' && !j.conectado && <em> · ausente</em>}
          </strong>
          <span>
            {pos !== null ? NOMBRE_POSICION[pos] : ''}
            {et.detalle ? ` · ${et.detalle}` : ''}
          </span>
        </div>
      </div>
      <Bocadillo v={v} a={a} />
      {m && (
        <div className={`juego__cartas-ajenas ${cartas ? 'juego__cartas-ajenas--vistas' : ''}`}>
          {cartas ? cartas.map((c) => <Carta key={c} carta={c} tamano="peque" />) : [0, 1, 2, 3].map((i) => <CartaOculta key={i} tamano="peque" />)}
        </div>
      )}
      {cartas && m?.fase === 'fin' && <span className="juego__jugada-ajena">{describirJugada(evaluar(cartas, v.reglas))}</span>}
      {p.ayudas && m && m.fase !== 'fin' && <SenasEscritas v={v} a={a} />}
    </div>
  )
}

function Bocadillo({ v, a }: { v: VistaMesa; a: Asiento }) {
  const m = v.mano
  const texto = m ? ultimaAccion(m.eventos, a, m.lance) : null
  return <div className="juego__bocadillo-hueco">{texto && <span className="juego__bocadillo">{texto}</span>}</div>
}

function Centro({ v, etiqueta }: { v: VistaMesa; etiqueta: (a: Asiento) => EtiquetaJugador }) {
  const m = v.mano
  if (!m) return <div className="juego__centro">Esperando…</div>
  const env = m.envite
  const cierre = ultimoCierre(m.eventos)
  let titulo = ''
  if (m.fase === 'mus') titulo = m.ronda === 0 ? '¿Mus?' : `¿Mus? · ${m.ronda}º descarte`
  else if (m.fase === 'descarte') titulo = 'Descarte'
  else if (m.fase === 'envites' && m.lance) titulo = NOMBRE_LANCE[m.lance]
  else if (m.fase === 'fin') titulo = 'Recuento'
  return (
    <div className="juego__centro">
      <span className="juego__lance">{titulo}</span>
      <LancesHechos v={v} />
      {env && env.apostado > 0 && <span className="juego__bote">{env.ordago ? '¡Órdago!' : `${env.apostado} en juego`}</span>}
      {env && env.apostado > 0 && env.fase === 'respuesta' && !env.ordago && <span className="juego__bote-detalle">si no quieren: {env.porqueNo}</span>}
      {cierre && <span className="juego__cierre">{cierre}</span>}
      {m.turno !== null && m.fase !== 'fin' && m.turno !== v.miAsiento && <span className="juego__turno">Turno de {etiqueta(m.turno).nombre}</span>}
    </div>
  )
}

/** Fila de lances con su estado: jugado, en juego o pendiente. */
function LancesHechos({ v }: { v: VistaMesa }) {
  const m = v.mano!
  if (m.fase !== 'envites' && m.fase !== 'fin') return null
  const orden = ['grandes', 'chicas', 'pares', 'juego'] as const
  const actual = m.lance === 'punto' ? 'juego' : m.lance
  const idx = actual ? orden.indexOf(actual) : orden.length
  return (
    <ol className="juego__lances" aria-label="Lances">
      {orden.map((l, i) => (
        <li key={l} className={m.fase === 'fin' || i < idx ? 'hecho' : i === idx ? 'actual' : ''}>
          {l === 'juego' && m.lance === 'punto' ? 'Punto' : NOMBRE_LANCE[l]}
        </li>
      ))}
    </ol>
  )
}

function Acciones({ v, seleccion, onAccion }: { v: VistaMesa; seleccion: TCarta[]; onAccion: (a: AccionMano) => void }) {
  const [cantidad, setCantidad] = useState(3)
  const m = v.mano!
  if (m.fase === 'mus')
    return (
      <div className="juego__acciones">
        <button type="button" className="jb jb--secundario" onClick={() => onAccion({ tipo: 'mus' })}>
          Mus
        </button>
        <button type="button" className="jb jb--primario" onClick={() => onAccion({ tipo: 'corto' })}>
          Corto
        </button>
      </div>
    )
  if (m.fase === 'descarte')
    return (
      <div className="juego__acciones">
        <span className="juego__instruccion">Toca las cartas que quieres soltar</span>
        <button type="button" className="jb jb--primario" disabled={seleccion.length === 0} onClick={() => onAccion({ tipo: 'descarte', cartas: seleccion })}>
          Descartar {seleccion.length > 0 ? seleccion.length : ''}
        </button>
      </div>
    )
  if (m.fase === 'envites' && m.envite) {
    const l = m.envite.legales
    const respuesta = m.envite.fase === 'respuesta'
    const jugar = (accion: AccionEnvite) => onAccion({ tipo: 'envite', accion })
    return (
      <div className="juego__acciones">
        {l.includes('paso') && (
          <button type="button" className="jb jb--secundario" onClick={() => jugar({ tipo: 'paso' })}>
            {respuesta ? 'No quiero' : 'Paso'}
          </button>
        )}
        {l.includes('quiero') && (
          <button type="button" className="jb jb--primario" onClick={() => jugar({ tipo: 'quiero' })}>
            Quiero
          </button>
        )}
        {l.includes('envido') && (
          <>
            <button type="button" className="jb" onClick={() => jugar({ tipo: 'envido', piedras: 2 })}>
              {respuesta ? '2 más' : 'Envido'}
            </button>
            <span className="jb-grupo">
              <button type="button" className="jb jb--mini" onClick={() => setCantidad((c) => Math.max(3, c - 1))} aria-label="Menos piedras">
                −
              </button>
              <button type="button" className="jb" onClick={() => jugar({ tipo: 'envido', piedras: cantidad })}>
                {respuesta ? `${cantidad} más` : `Envido ${cantidad}`}
              </button>
              <button type="button" className="jb jb--mini" onClick={() => setCantidad((c) => Math.min(30, c + 1))} aria-label="Más piedras">
                +
              </button>
            </span>
          </>
        )}
        {l.includes('ordago') && (
          <button type="button" className="jb jb--ordago" onClick={() => jugar({ tipo: 'ordago' })}>
            Órdago
          </button>
        )}
      </div>
    )
  }
  return null
}

/** Botón de señas con su menú: sólo las que permite tu mano. */
function BotonSenas({ v, onSena }: { v: VistaMesa; onSena: (s: Sena) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [bloqueado, setBloqueado] = useState(false)
  if (v.modoSenas !== 'avatar' || v.misSenas.length === 0) return null
  return (
    <div className="juego__senas">
      <button type="button" className={`jb jb--senas ${abierto ? 'activo' : ''}`} aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        Hacer seña
      </button>
      {abierto && (
        <div className="juego__senas-menu" role="menu">
          <span className="juego__senas-ayuda">Tu cara la hará un instante: tu compañero tiene que estar mirando… y los rivales también pueden.</span>
          {v.misSenas.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              className="chip"
              disabled={bloqueado}
              title={SENAS[s].gesto}
              onClick={() => {
                onSena(s)
                setAbierto(false)
                setBloqueado(true)
                setTimeout(() => setBloqueado(false), DURACION_GESTO_MS)
              }}
            >
              {SENAS[s].nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Señas en texto (sólo existen en el modo aprendizaje, con señas automáticas). */
function SenasEscritas({ v, a }: { v: VistaMesa; a: Asiento }) {
  const senas = (v.mano?.senas ?? []).filter((s) => s.de === a && s.como !== 'propia')
  if (senas.length === 0) return null
  return (
    <span className="juego__senas-escritas">
      {senas[0].como === 'companero' ? 'Te pasa' : 'Le pillas'}: {senas.map((s) => SENAS[s.sena].nombre.toLowerCase()).join(', ')}
    </span>
  )
}

/** Piedras de cada pareja en la mano recién terminada. */
function ResumenMano({ v }: { v: VistaMesa }) {
  const r = v.mano?.recuento
  if (!r) return null
  const mio = v.miAsiento === null ? 0 : v.miAsiento % 2
  const suma = (eq: number) => r.filter((x) => x.equipo === eq).reduce((s, x) => s + x.piedras, 0)
  return (
    <p className="juego__resumen">
      <span className="juego__resumen-nos">Vosotros +{suma(mio)}</span>
      <span className="juego__resumen-ellos">Ellos +{suma(1 - mio)}</span>
    </p>
  )
}
