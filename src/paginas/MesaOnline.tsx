import { useEffect, useState } from 'react'
import { AvisoJuego, ChatMesa, ControlesJuego, MarcadorMesa, MesaJuego, PanelSenas, RecuentoMano, RegistroJuego, type EtiquetaAsiento } from '../componentes/MesaJuego'
import { tituloFase } from '../componentes/mesaTextos'
import { Etiqueta, Panel } from '../componentes/ui'
import type { Asiento } from '../engine/partida'
import type { VistaMesa } from '../engine/sala'
import { hayServidor } from '../estado/api'
import { useMesaOnline, type MensajeMesa } from '../estado/useMesaOnline'
import { useSesion } from '../estado/sesion'
import './Partida.css'
import './MesaOnline.css'

const ROTULO_ASIENTO: Record<Asiento, string> = { 0: 'Norte', 1: 'Este', 2: 'Sur', 3: 'Oeste' }
/** Tras este tiempo buscando pareja rival, se ofrece jugar contra una pareja de bots. */
const OFRECER_BOTS_MS = 45_000

const TIPO_MESA: Record<VistaMesa['modo'], { texto: string; tono: 'ok' | 'oro' | 'neutro' }> = {
  amistosa: { texto: 'Amistosa · no puntúa', tono: 'neutro' },
  individual: { texto: 'Puntuable · individual', tono: 'oro' },
  parejas: { texto: 'Puntuable · parejas', tono: 'oro' },
}

export function MesaOnline({ codigo }: { codigo: string }) {
  const { usuario, cargando } = useSesion()
  if (!hayServidor) return <p className="texto-suave">El juego online no está disponible en esta versión.</p>
  if (cargando) return <p className="texto-suave">Comprobando tu sesión…</p>
  if (!usuario)
    return (
      <Panel titulo={`Mesa ${codigo}`}>
        <p>Te han invitado a una mesa de mus. Entra o crea una cuenta para sentarte.</p>
        <a className="boton boton--primario" href="#/cuenta">
          Entrar o crear cuenta
        </a>
      </Panel>
    )
  return <MesaConectada key={codigo} codigo={codigo} />
}

function MesaConectada({ codigo }: { codigo: string }) {
  const { vista, estado, error, aviso, enviar } = useMesaOnline(codigo)

  if (error)
    return (
      <Panel titulo={`Mesa ${codigo}`}>
        <p className="aviso aviso--mal">{error}</p>
        <a className="boton" href="#/online">
          Volver
        </a>
      </Panel>
    )
  if (!vista) return <p className="texto-suave">Conectando con la mesa {codigo}…</p>

  return (
    <>
      <CabeceraMesa v={vista} conexion={estado} />
      {aviso && (
        <p className="aviso aviso--mal" role="alert">
          {aviso}
        </p>
      )}
      {vista.fase === 'esperando' ? <SalaDeEspera v={vista} enviar={enviar} /> : <Juego v={vista} enviar={enviar} />}
    </>
  )
}

function CabeceraMesa({ v, conexion }: { v: VistaMesa; conexion: string }) {
  const [copiado, setCopiado] = useState(false)
  const enlace = `${location.origin}${location.pathname}#/mesa/${v.codigo}`
  const copiar = () => {
    navigator.clipboard
      ?.writeText(enlace)
      .then(() => {
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2000)
      })
      .catch(() => {})
  }
  const tipo = TIPO_MESA[v.modo]
  return (
    <div className="mesa-online__cabecera">
      <div>
        <a href="#/online" className="volver">
          ← Online
        </a>
        <h1>
          Mesa <span className="codigo-mesa">{v.codigo}</span>
        </h1>
        <div className="chips">
          <Etiqueta tono={tipo.tono}>{tipo.texto}</Etiqueta>
          <Etiqueta>
            a {v.reglas.piedras}, {v.reglas.reyes} reyes
          </Etiqueta>
          {v.modoSenas === 'avatar' && <Etiqueta>Señas con avatar</Etiqueta>}
          {conexion !== 'conectado' && <Etiqueta tono="mal">Reconectando…</Etiqueta>}
        </div>
      </div>
      {!v.publica && v.fase === 'esperando' && (
        <button type="button" className="boton" onClick={copiar}>
          {copiado ? 'Enlace copiado ✓' : 'Copiar enlace de invitación'}
        </button>
      )}
    </div>
  )
}

function SalaDeEspera({ v, enviar }: { v: VistaMesa; enviar: (m: MensajeMesa) => void }) {
  const sentados = v.jugadores.filter((j) => j.tipo === 'humano').length
  const pareja = v.jugadores[0].tipo === 'humano' && v.jugadores[2].tipo === 'humano'
  const rivalesLibres = v.jugadores[1].tipo === 'vacio' && v.jugadores[3].tipo === 'vacio' && !v.jugadores[1].reservado
  const buscando = v.buscandoDesde !== null
  const llegando = v.jugadores.some((j) => j.reservado)

  return (
    <div className="rejilla">
      <Panel titulo="Asientos">
        <p className="texto-suave">Los compañeros se sientan enfrente: Norte con Sur y Este con Oeste.{!buscando && !llegando && ' Toca un asiento libre para cambiarte.'}</p>
        <div className="asientos-espera">
          {v.jugadores.map((j) => (
            <button
              key={j.asiento}
              type="button"
              className={`asiento-espera asiento-espera--${j.asiento % 2 === 0 ? 'ns' : 'eo'} ${j.asiento === v.miAsiento ? 'asiento-espera--mio' : ''}`}
              disabled={j.tipo !== 'vacio' || j.reservado || buscando}
              onClick={() => enviar({ tipo: 'sentarse', asiento: j.asiento })}
            >
              <span className="asiento-espera__rotulo">{ROTULO_ASIENTO[j.asiento]}</span>
              <strong>{j.tipo === 'vacio' ? (j.reservado ? 'Llegando…' : 'Libre') : j.nombre}</strong>
              {j.asiento === v.miAsiento && <span className="asiento-espera__tu">Tú</span>}
            </button>
          ))}
        </div>

        {v.modo === 'individual' && (
          <p className="texto-suave">Partida puntuable individual: empieza sola en cuanto se llena o, si no, al poco tiempo con bots en los huecos.</p>
        )}

        {llegando && <p className="aviso">¡Pareja rival encontrada! Están entrando en la mesa…</p>}

        {buscando && !llegando && <Buscando desde={v.buscandoDesde!} enviar={enviar} />}

        {!buscando && !llegando && v.modo !== 'individual' && v.miAsiento !== null && (
          <div className="opciones-espera">
            {pareja && rivalesLibres && (
              <div className="opcion-espera">
                <button type="button" className="boton boton--primario" onClick={() => enviar({ tipo: 'buscarRivales' })}>
                  Buscar pareja rival (puntuable)
                </button>
                <span className="texto-suave">Os emparejamos con otra pareja de nivel parecido. Cuenta para el ranking de parejas.</span>
              </div>
            )}
            {!pareja && <p className="texto-suave">¿Quieres jugar puntuable con tu compañero? Pásale el enlace y, cuando esté sentado en Sur, podréis buscar pareja rival.</p>}
            <div className="opcion-espera">
              <button type="button" className="boton" onClick={() => enviar({ tipo: 'empezar' })}>
                Empezar amistosa {sentados < 4 ? `(${4 - sentados} bot${4 - sentados > 1 ? 's' : ''})` : ''}
              </button>
              <span className="texto-suave">No cuenta para el ranking.</span>
            </div>
          </div>
        )}
        {v.miAsiento === null && <p className="texto-suave">La mesa está completa: miras como espectador.</p>}
      </Panel>
      <Panel titulo="Mesa">
        <ChatMesa v={v} onDecir={(texto) => enviar({ tipo: 'chat', texto })} />
      </Panel>
    </div>
  )
}

function Buscando({ desde, enviar }: { desde: number; enviar: (m: MensajeMesa) => void }) {
  // El tiempo se cuenta desde que este navegador ve la búsqueda (el reloj del servidor puede diferir).
  const [inicio] = useState(() => Date.now())
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000)
    return () => clearInterval(t)
  }, [inicio, desde])
  return (
    <div className="buscando" role="status">
      <span className="buscando__punto" aria-hidden />
      <div>
        <strong>Buscando pareja rival… {segundos}s</strong>
        <span className="texto-suave">Cuando la encontremos, entrarán en vuestra mesa.</span>
      </div>
      <div className="acciones">
        {segundos * 1000 >= OFRECER_BOTS_MS && (
          <button type="button" className="boton boton--primario" onClick={() => enviar({ tipo: 'empezar' })}>
            Jugar contra una pareja de bots (puntúa)
          </button>
        )}
        <button type="button" className="boton" onClick={() => enviar({ tipo: 'dejarDeBuscar' })}>
          Dejar de buscar
        </button>
      </div>
    </div>
  )
}

function Juego({ v, enviar }: { v: VistaMesa; enviar: (m: MensajeMesa) => void }) {
  const etiqueta = (a: Asiento): EtiquetaAsiento => {
    const j = v.jugadores[a]
    if (a === v.miAsiento) return { nombre: `${j.nombre} (tú)` }
    return { nombre: j.nombre, detalle: j.tipo === 'bot' ? 'bot' : undefined }
  }
  const nombre = (a: Asiento) => (a === v.miAsiento ? 'Tú' : v.jugadores[a].nombre)
  const m = v.mano
  const listos = v.jugadores.filter((j) => j.tipo === 'humano' && v.listos[j.asiento]).length
  const humanos = v.jugadores.filter((j) => j.tipo === 'humano' && j.conectado).length
  const hayBot = v.jugadores.some((j) => j.tipo === 'bot')

  return (
    <>
      <div className="partida__cabecera">
        <MarcadorMesa v={v} />
        {v.miAsiento === null && hayBot && v.fase === 'jugando' && (
          <button type="button" className="boton boton--primario" onClick={() => enviar({ tipo: 'sentarse' })}>
            Sentarme en el sitio de un bot
          </button>
        )}
      </div>

      <MesaJuego v={v} etiqueta={etiqueta} />

      <div className="partida__inferior">
        <Panel titulo={v.fase === 'terminada' ? 'Fin de la partida' : tituloFase(v)}>
          {m && m.fase !== 'fin' && m.turno === v.miAsiento && <ControlesJuego v={v} onAccion={(accion) => enviar({ tipo: 'accion', accion })} />}
          {m && m.fase !== 'fin' && m.turno !== v.miAsiento && m.turno !== null && <p className="texto-suave">Habla {nombre(m.turno)}…</p>}
          <PanelSenas v={v} onSena={(sena) => enviar({ tipo: 'sena', sena })} />
          {m?.fase === 'fin' && (
            <div className="fin-mano">
              <AvisoJuego v={v} />
              <CambiosPuntos v={v} />
              <RecuentoMano v={v} />
              {v.fase === 'terminada' ? (
                <div className="acciones">
                  <a className="boton boton--primario" href="#/online">
                    Volver
                  </a>
                  <a className="boton" href="#/ranking">
                    Ver el ranking
                  </a>
                </div>
              ) : (
                v.miAsiento !== null && (
                  <div className="acciones">
                    <button type="button" className="boton boton--primario" disabled={v.listos[v.miAsiento]} onClick={() => enviar({ tipo: 'listo' })}>
                      {v.listos[v.miAsiento] ? 'Esperando a los demás…' : 'Siguiente mano →'}
                    </button>
                    <span className="texto-suave">
                      {listos} de {humanos} listos
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </Panel>
        <Panel titulo="Mesa">
          <ChatMesa v={v} onDecir={(texto) => enviar({ tipo: 'chat', texto })} />
          <details>
            <summary className="texto-suave">Lo que ha pasado en la mano</summary>
            <RegistroJuego v={v} nombre={nombre} />
          </details>
        </Panel>
      </div>
    </>
  )
}

/** Puntos ganados o perdidos al terminar una partida puntuable. */
function CambiosPuntos({ v }: { v: VistaMesa }) {
  const cambios = v.resultado?.cambios
  if (!cambios?.length) return null
  const mio = cambios.find((c) => c.asiento === v.miAsiento)
  return (
    <div className="cambios-puntos">
      {mio && (
        <p className={`cambio-mio ${mio.despues >= mio.antes ? 'cambio-mio--sube' : 'cambio-mio--baja'}`}>
          {v.modo === 'parejas' ? 'Vuestra pareja' : 'Tus puntos'}: {mio.antes} → <strong>{mio.despues}</strong> ({mio.despues >= mio.antes ? '+' : ''}
          {mio.despues - mio.antes})
        </p>
      )}
      <ul className="lista-limpia">
        {cambios
          .filter((c) => c.asiento !== v.miAsiento)
          .map((c) => (
            <li key={c.asiento} className="texto-suave">
              {v.jugadores[c.asiento].nombre}: {c.antes} → {c.despues} ({c.despues >= c.antes ? '+' : ''}
              {c.despues - c.antes})
            </li>
          ))}
      </ul>
    </div>
  )
}
