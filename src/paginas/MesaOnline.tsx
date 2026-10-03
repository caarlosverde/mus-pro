import { useState } from 'react'
import { AvisoJuego, ChatMesa, ControlesJuego, MarcadorMesa, MesaJuego, RecuentoMano, RegistroJuego, type EtiquetaAsiento } from '../componentes/MesaJuego'
import { tituloFase } from '../componentes/mesaTextos'
import { Panel } from '../componentes/ui'
import type { Asiento } from '../engine/partida'
import type { VistaMesa } from '../engine/sala'
import { hayServidor } from '../estado/api'
import { useMesaOnline, type MensajeMesa } from '../estado/useMesaOnline'
import { useSesion } from '../estado/sesion'
import './Partida.css'
import './MesaOnline.css'

const ROTULO_ASIENTO: Record<Asiento, string> = { 0: 'Norte', 1: 'Este', 2: 'Sur', 3: 'Oeste' }

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
  return (
    <div className="mesa-online__cabecera">
      <div>
        <a href="#/online" className="volver">
          ← Online
        </a>
        <h1>
          Mesa <span className="codigo-mesa">{v.codigo}</span>
        </h1>
        <span className="texto-suave">
          {v.publica ? 'Mesa pública' : 'Mesa privada'} · a {v.reglas.piedras}, {v.reglas.reyes} reyes
          {conexion !== 'conectado' && ' · reconectando…'}
        </span>
      </div>
      {!v.publica && (
        <button type="button" className="boton" onClick={copiar}>
          {copiado ? 'Enlace copiado ✓' : 'Copiar enlace de invitación'}
        </button>
      )}
    </div>
  )
}

function SalaDeEspera({ v, enviar }: { v: VistaMesa; enviar: (m: MensajeMesa) => void }) {
  const sentados = v.jugadores.filter((j) => j.tipo === 'humano').length
  return (
    <div className="rejilla">
      <Panel titulo="Asientos">
        <p className="texto-suave">Los compañeros se sientan enfrente: Norte con Sur y Este con Oeste. Toca un asiento libre para cambiarte.</p>
        <div className="asientos-espera">
          {v.jugadores.map((j) => (
            <button
              key={j.asiento}
              type="button"
              className={`asiento-espera asiento-espera--${j.asiento % 2 === 0 ? 'ns' : 'eo'} ${j.asiento === v.miAsiento ? 'asiento-espera--mio' : ''}`}
              disabled={j.tipo !== 'vacio'}
              onClick={() => enviar({ tipo: 'sentarse', asiento: j.asiento })}
            >
              <span className="asiento-espera__rotulo">{ROTULO_ASIENTO[j.asiento]}</span>
              <strong>{j.tipo === 'vacio' ? 'Libre' : j.nombre}</strong>
              {j.asiento === v.miAsiento && <span className="asiento-espera__tu">Tú</span>}
            </button>
          ))}
        </div>
        <div className="acciones">
          <button type="button" className="boton boton--primario" onClick={() => enviar({ tipo: 'empezar' })} disabled={v.miAsiento === null}>
            Empezar {sentados < 4 ? `(${4 - sentados} bot${4 - sentados > 1 ? 's' : ''} en los huecos)` : ''}
          </button>
        </div>
        {v.publica && <p className="texto-suave">Mesa pública: empieza sola cuando se llena o, si no, al poco tiempo con bots.</p>}
        {v.miAsiento === null && <p className="texto-suave">La mesa está completa: miras como espectador.</p>}
      </Panel>
      <Panel titulo="Mesa">
        <ChatMesa v={v} onDecir={(texto) => enviar({ tipo: 'chat', texto })} />
      </Panel>
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
        {v.miAsiento === null && hayBot && (
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
          {m?.fase === 'fin' && (
            <div className="fin-mano">
              <AvisoJuego v={v} />
              <RecuentoMano v={v} />
              {v.fase === 'terminada' ? (
                <a className="boton boton--primario" href="#/online">
                  Volver
                </a>
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
