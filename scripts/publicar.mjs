// Publica la app compilada en el repositorio público de GitHub Pages.
// El código fuente sigue en el repositorio privado; aquí sólo va dist/.
//
// Uso: npm run publicar
import { execSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = process.env.MUS_PAGES_REPO ?? 'caarlosverde/mus-pro-app'
const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })
const salida = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8' }).trim()

sh('npm run build')

const version = salida('git rev-parse --short HEAD')
const email = salida('git config user.email')
const tmp = mkdtempSync(join(tmpdir(), 'mus-pages-'))
try {
  cpSync('dist', tmp, { recursive: true })
  // Sin Jekyll: GitHub Pages sirve los archivos tal cual.
  writeFileSync(join(tmp, '.nojekyll'), '')
  writeFileSync(
    join(tmp, 'README.md'),
    `# Mus Pro\n\nEntrenador de mus de nivel avanzado. Versión publicada (compilada desde ${version}).\n\nhttps://${REPO.split('/')[0]}.github.io/${REPO.split('/')[1]}/\n`,
  )
  const git = `git -c user.name="Carlos" -c user.email="${email}"`
  sh('git init -q -b main', tmp)
  sh(`${git} add -A`, tmp)
  sh(`${git} commit -q -m "Publicar ${version}"`, tmp)
  sh(`git push -q -f https://github.com/${REPO}.git main`, tmp)
  console.log(`\nPublicado ${version} en https://github.com/${REPO}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
