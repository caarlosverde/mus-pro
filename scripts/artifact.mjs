// Empaqueta la app como Artifact de claude.ai: una página con el CSS y el JS
// incrustados (el visor añade su propio <html>/<head>/<body>) y los workers
// como archivos aparte, junto a la página.
//
// Uso: npm run artifact  →  dist-artifact/
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

execSync('npm run build', { stdio: 'inherit' })

const html = readFileSync('dist/index.html', 'utf8')
const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/)?.[1]
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/)?.[1]
if (!js || !css) throw new Error('No se encuentran el JS o el CSS en dist/index.html')

// Un "</script" dentro del código cerraría la etiqueta antes de tiempo.
const codigo = readFileSync(join('dist', js), 'utf8').replace(/<\/script/gi, '<\\/script')
const estilos = readFileSync(join('dist', css), 'utf8')

const salida = 'dist-artifact'
rmSync(salida, { recursive: true, force: true })
mkdirSync(salida)

writeFileSync(
  join(salida, 'index.html'),
  `<title>Mus Pro</title>
<meta name="description" content="Entrenador de mus de nivel avanzado: probabilidades, problemas de final de juego y estrategia.">
<style>${estilos}</style>
<div id="root"></div>
<script type="module">${codigo}</script>
`,
)

// Los workers se resuelven respecto a la URL del script, que ahora es la de la página.
const workers = readdirSync('dist/assets').filter((f) => f.includes('.worker-'))
for (const w of workers) copyFileSync(join('dist/assets', w), join(salida, w))
console.log(`Artifact listo en ${salida}/: index.html + ${workers.join(', ')}`)
