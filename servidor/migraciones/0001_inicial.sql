-- Cuentas: sólo nombre de usuario (único sin distinguir mayúsculas) y contraseña.
CREATE TABLE usuarios (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  nombre_min TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL,
  sal TEXT NOT NULL,
  -- Código de recuperación (hasheado) para restablecer la contraseña sin email.
  recuperacion_hash TEXT NOT NULL,
  creado INTEGER NOT NULL
);

-- Sesiones: se guarda sólo el hash del token.
CREATE TABLE sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado INTEGER NOT NULL,
  expira INTEGER NOT NULL
);
CREATE INDEX sesiones_usuario ON sesiones(usuario_id);

-- Billetes de un solo uso para conectarse por WebSocket a una mesa.
CREATE TABLE billetes (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  mesa TEXT NOT NULL,
  expira INTEGER NOT NULL
);

-- Intentos fallidos de inicio de sesión (para frenar ataques de fuerza bruta).
CREATE TABLE intentos (
  clave TEXT PRIMARY KEY,
  fallos INTEGER NOT NULL,
  desde INTEGER NOT NULL
);

-- Progreso del entrenamiento: un documento JSON por módulo.
CREATE TABLE progreso (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  clave TEXT NOT NULL,
  valor TEXT NOT NULL,
  actualizado INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, clave)
);

-- Partidas terminadas (online o contra bots).
CREATE TABLE partidas (
  id TEXT PRIMARY KEY,
  modo TEXT NOT NULL CHECK (modo IN ('online', 'bots')),
  mesa TEXT,
  creada INTEGER NOT NULL,
  juegos_0 INTEGER NOT NULL,
  juegos_1 INTEGER NOT NULL,
  ganador INTEGER NOT NULL
);

CREATE TABLE partida_jugadores (
  partida_id TEXT NOT NULL REFERENCES partidas(id) ON DELETE CASCADE,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  equipo INTEGER NOT NULL,
  gano INTEGER NOT NULL,
  PRIMARY KEY (partida_id, usuario_id)
);
CREATE INDEX partida_jugadores_usuario ON partida_jugadores(usuario_id);
