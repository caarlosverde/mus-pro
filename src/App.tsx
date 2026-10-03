import './App.css'
import { IconoPalo } from './componentes/Carta'
import { useRuta } from './estado/ruta'
import { Inicio } from './paginas/Inicio'
import { Laboratorio } from './paginas/Laboratorio'
import { Problemas } from './paginas/Problemas'
import { ReglasPagina } from './paginas/Reglas'

const SECCIONES = [
  { ruta: '', texto: 'Inicio', palo: 'oros' },
  { ruta: 'laboratorio', texto: 'Laboratorio', palo: 'copas' },
  { ruta: 'problemas', texto: 'Problemas', palo: 'espadas' },
  { ruta: 'reglas', texto: 'Reglas', palo: 'bastos' },
] as const

export default function App() {
  const [seccion = '', ...resto] = useRuta()

  let pagina
  switch (seccion) {
    case 'laboratorio':
      pagina = <Laboratorio />
      break
    case 'problemas':
      pagina = <Problemas id={resto[0]} />
      break
    case 'reglas':
      pagina = <ReglasPagina />
      break
    default:
      pagina = <Inicio />
  }

  return (
    <div className="app">
      <header className="cabecera">
        <div className="cabecera__dentro">
          <a className="marca" href="#/">
            <span className="marca__logo">
              <IconoPalo palo="oros" size={22} />
            </span>
            <span>
              Mus Pro
              <small>Entrenador de mus</small>
            </span>
          </a>
          <nav className="nav" aria-label="Secciones">
            {SECCIONES.map((s) => (
              <a key={s.ruta} href={`#/${s.ruta}`} className={seccion === s.ruta ? 'activo' : ''} aria-current={seccion === s.ruta ? 'page' : undefined}>
                <IconoPalo palo={s.palo} size={18} />
                {s.texto}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="contenido">{pagina}</main>
      <footer className="pie">Las probabilidades se calculan por simulación sobre miles de repartos compatibles con lo que sabes.</footer>
    </div>
  )
}
