# Mus Pro · Entrenador de mus

**App publicada:** https://caarlosverde.github.io/mus-pro-app/

Aplicación web (instalable en el móvil) para **mejorar en el mus a nivel avanzado**: cuándo cortar, cuánto envidar, cuándo ver un órdago y qué llevan los demás. Las reglas básicas están en un apartado secundario; el foco es la estrategia.

## Qué hay ahora

| Módulo | Qué hace |
| --- | --- |
| **Jugar contra bots** | Vaca completa contra bots con personalidad (equilibrado, bravo, conservador, farolero, mandíbula de cristal), con señas que el compañero te pasa y que a veces pillas a los rivales. Al acabar cada mano, **revisión de tus decisiones**: probabilidad de ganar el juego con cada alternativa. |
| **Entrenador de corte** | Situaciones ilimitadas de "¿mus o no hay mus?" con posición, marcador y señas. Cada respuesta se evalúa jugando la mano cientos de veces con cada opción. |
| **Laboratorio** | Metes tu mano, tu posición, las señas que has visto, las declaraciones de pares/juego y con cuántas cartas se quedó cada uno. Simula 20.000 repartos compatibles y te da: probabilidad de ganar cada lance, qué llevan rivales y compañero, el mejor juego rival, el valor de tus cartas si todo queda en paso y una lectura rápida en lenguaje natural. |
| **Problemas de final** | Situaciones de "estar dentro" (orden de cobro, órdagos, el envite justo). Tras responder, ves la probabilidad de ganar el juego con cada opción, calculada en directo. |
| **Reglas** | Variante configurable (8/4 reyes, juegos a 30/40, con o sin la Real), resumen, señas y glosario. |

## Cómo se calcula

- **Motor de reglas puro** (`src/engine`): sin dependencias de interfaz, configurable por variante y cubierto por tests.
- **Muestreo exacto condicionado**: para cada jugador con señas o declaraciones se enumeran una vez todas sus manos compatibles y se combinan al azar, rechazando solapes. Todos los repartos compatibles son igual de probables, así que las probabilidades son las reales (hay un test que lo compara con la enumeración exhaustiva).
- **Modelo de descarte**: "se quedó con N cartas" se interpreta suponiendo que se guardan reyes y cartas emparejadas. Es un modelo de comportamiento, no una certeza.
- **Recuento fiel**: los "porque no" se cobran en el momento; el resto en orden (grandes, chicas, pares, juego/punto) y el juego termina en cuanto alguien llega.
- **Problemas verificados**: un test comprueba que la respuesta marcada como correcta es la que más probabilidad de ganar da.
- **Bots con personalidad**: cada decisión es una distribución de probabilidad (corte, envite, respuesta) a partir de tablas de fuerza por lance, las señas del compañero y el marcador. Los órdagos se valoran en probabilidad de ganar el juego. El bot equilibrado gana ~58% de las vacas al bravo.
- **Evaluación de decisiones por simulación (rollouts)**: se generan repartos compatibles con lo que sabías, se ponderan por la verosimilitud de lo que hicieron los rivales (inferencia bayesiana con las propias políticas de los bots) y se juega la mano hasta el final con cada alternativa, con números aleatorios comunes.
- Los cálculos pesados corren en **Web Workers** para no bloquear la interfaz.

## Cuentas y juego online

El servidor está en `servidor/` (Cloudflare Workers, gratis):

- **Cuentas** con nombre de usuario único y contraseña (PBKDF2, 100.000 iteraciones), sin email. Al registrarse se entrega un código de recuperación. Sesiones con token (sólo se guarda su hash), límite de intentos fallidos.
- **Mesas online** como Durable Objects: el servidor reparte y guarda las cartas y envía a cada jugador sólo su vista (no se puede hacer trampa mirando el tráfico). Bots en los huecos; si alguien se desconecta, un bot juega por él a los 45 s hasta que vuelve.
- **Con amigos** (código o enlace de invitación) o **con gente nueva** (el vestíbulo te sienta en una mesa pública; arranca al llenarse o a los 40 s con bots).
- **Perfil y progreso** sincronizados entre dispositivos: vacas online y contra bots, entrenador de corte, problemas y precisión de las decisiones, con gráficas por semana.

### Probarlo en local

```bash
cd servidor
npm install
npm run db:local          # crea la base de datos local
npm run dev               # servidor en http://127.0.0.1:8787
node pruebas/integracion.mjs   # prueba de punta a punta
```

Con el servidor local en marcha, `npm run dev` en la raíz usa el modo online automáticamente.

### Ponerlo en internet

1. Crea una cuenta gratuita en Cloudflare y, en `servidor/`, ejecuta `npx wrangler login`.
2. `npx wrangler d1 create mus-pro` y copia el `database_id` en `servidor/wrangler.jsonc`.
3. `npm run db:remoto` y `npm run deploy` (te da la dirección `https://mus-pro.<tu-subdominio>.workers.dev`).
4. En la raíz, crea `.env.production` con `VITE_API_URL=https://mus-pro.<tu-subdominio>.workers.dev` y ejecuta `npm run publicar`.

## Desarrollo

Requisitos: Node 20 o superior.

```bash
npm install
npm run dev        # servidor de desarrollo
npm run check      # tipos + lint + tests
npm run build      # build de producción en dist/
npm run artifact   # empaqueta la app para publicarla como Artifact de claude.ai
npm run publicar   # compila y publica en GitHub Pages (repositorio público mus-pro-app)
```

## Estructura

```
src/
  engine/        Motor: cartas, evaluación, recuento, simulación, análisis, problemas
  datos/         Contenido: problemas, consejos, glosario
  componentes/   Cartas, mesa, selector de mano, controles
  paginas/       Inicio, Laboratorio, Problemas, Reglas
  estado/        Ajustes, sesión, progreso sincronizado, API, rutas, workers
servidor/        Cloudflare Worker: API, mesas (Durable Objects), base de datos D1
```

## Próximos pasos

1. Lectura del rival: rangos de manos según sus acciones (la inferencia ya existe en el evaluador).
2. Análisis de tus partidas: estadísticas de decisiones a lo largo del tiempo.
3. Más problemas de final y descartes evaluados.
