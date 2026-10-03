import { Etiqueta } from '../componentes/ui'
import { PROBLEMAS } from '../datos/problemas'
import './Inicio.css'

const ENTRENADORES = [
  {
    ruta: 'corte',
    titulo: 'Entrenador de corte',
    texto: '¿Mus o no hay mus? Situaciones infinitas con posición, marcador y señas. Cada respuesta se evalúa jugando la mano cientos de veces.',
    etiqueta: 'Ilimitado',
  },
  {
    ruta: 'problemas',
    titulo: 'Problemas de final',
    texto: 'Situaciones de "estar dentro" con la solución calculada: orden de cobro, órdagos y el envite justo.',
    etiqueta: `${PROBLEMAS.length} problemas`,
  },
  {
    ruta: 'jugar',
    titulo: 'Revisión de envites',
    texto: 'Juega contra los bots y, al acabar cada mano, revisa tus decisiones: cuánta probabilidad de ganar el juego daba cada opción.',
    etiqueta: 'En la partida',
  },
]

export function Entrenar() {
  return (
    <>
      <div className="titulo-pagina">
        <h1>Entrenar</h1>
        <p>Ejercicios para afinar las decisiones que de verdad ganan partidas.</p>
      </div>
      <div className="rejilla">
        {ENTRENADORES.map((m) => (
          <a key={m.ruta} className="modulo panel modulo--activo" href={`#/${m.ruta}`}>
            <div className="modulo__cabecera">
              <h2>{m.titulo}</h2>
              <Etiqueta tono="ok">{m.etiqueta}</Etiqueta>
            </div>
            <p className="texto-suave">{m.texto}</p>
          </a>
        ))}
        <div className="modulo panel modulo--pronto">
          <div className="modulo__cabecera">
            <h2>Lectura del rival</h2>
            <Etiqueta>Próximamente</Etiqueta>
          </div>
          <p className="texto-suave">Qué manos le quedan posibles a un rival según lo que ha hecho y dicho.</p>
        </div>
      </div>
    </>
  )
}
