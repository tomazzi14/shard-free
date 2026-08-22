const { test } = require('brittle')
const servirCapas = require('../lib/servidor-capas.js')

// Red de mentira: deja decidir si el puerto contesta o no.
function netFalso(contestaAlIntento = 1) {
  let intentos = 0
  return {
    intentos: () => intentos,
    connect() {
      intentos++
      const zocalo = {
        oyentes: {},
        on(evento, fn) {
          this.oyentes[evento] = fn
          return this
        },
        destroy() {}
      }
      const contesta = intentos >= contestaAlIntento
      setTimeout(() => zocalo.oyentes[contesta ? 'connect' : 'error']?.(new Error('nope')), 0)
      return zocalo
    }
  }
}

function spawnFalso() {
  const oyentes = { stdout: {}, stderr: {}, proc: {} }
  const flujo = (donde) => ({
    on(evento, fn) {
      oyentes[donde][evento] = fn
    }
  })
  const fn = (binario, args) => {
    fn.binario = binario
    fn.args = args
    return {
      stdout: flujo('stdout'),
      stderr: flujo('stderr'),
      on(evento, cb) {
        oyentes.proc[evento] = cb
      },
      kill() {
        fn.matado = true
      }
    }
  }
  fn.stdout = (t) => oyentes.stdout.data(Buffer.from(t))
  fn.salir = (c) => oyentes.proc.exit(c)
  fn.romper = (err) => oyentes.proc.error(err)
  return fn
}

test('escucha en todas las interfaces, no solo en loopback', (t) => {
  const spawn = spawnFalso()
  const servidor = servirCapas({ puerto: 50052, spawn, net: netFalso(999) })

  t.alike(spawn.args, ['-H', '0.0.0.0', '-p', '50052'], 'si fuera 127.0.0.1 nadie lo alcanzaria')
  servidor.parar()
})

test('esta listo cuando el puerto acepta conexiones, no cuando lo dice por pantalla', (t) => {
  t.plan(1)
  // No miramos su salida: el binario es C y con stdout en un pipe se bufferea en bloques,
  // asi que el aviso nunca llega. Golpeamos el puerto.
  const servidor = servirCapas({ puerto: 50052, spawn: spawnFalso(), net: netFalso(1) })
  servidor.on('listo', (p) => {
    t.is(p, 50052)
    servidor.parar()
  })
})

test('sigue golpeando mientras el puerto no abre', (t) => {
  t.plan(2)
  const net = netFalso(3) // recien contesta al tercer intento

  const servidor = servirCapas({ puerto: 50052, spawn: spawnFalso(), net })
  servidor.on('listo', () => {
    t.is(net.intentos(), 3, 'no se rinde al primer rechazo: Metal tarda en compilar')
    t.pass('y avisa cuando abre')
    servidor.parar()
  })
})

test('si el puerto nunca abre, lo dice en vez de esperar para siempre', (t) => {
  t.plan(1)
  let reloj = 0
  const ahora = () => (reloj += 60000) // dos vueltas y se acabo la paciencia

  const servidor = servirCapas({ puerto: 50052, spawn: spawnFalso(), net: netFalso(999), ahora })
  servidor.on('error', (err) => {
    t.ok(/no abrio el puerto 50052/.test(err.message))
    servidor.parar()
  })
})

test('si se cae mientras servia, se reporta', (t) => {
  t.plan(1)
  const spawn = spawnFalso()
  const servidor = servirCapas({ puerto: 50052, spawn, net: netFalso(1) })

  servidor.on('listo', () => spawn.salir(1))
  servidor.on('error', (err) => {
    t.ok(/se cayo/.test(err.message))
    servidor.parar()
  })
})

test('si nunca arranco, lo dice distinto', (t) => {
  t.plan(1)
  const spawn = spawnFalso()

  const servidor = servirCapas({ puerto: 50052, spawn, net: netFalso(999) })
  servidor.on('error', (err) => {
    t.ok(/no llego a arrancar/.test(err.message), 'un puerto ocupado se distingue de una caida')
    servidor.parar()
  })

  spawn.salir(1)
})

test('si el binario no existe, el error llega', (t) => {
  t.plan(1)
  const spawn = spawnFalso()

  const servidor = servirCapas({ puerto: 50052, spawn, net: netFalso(999) })
  servidor.on('error', (err) => {
    t.is(err.code, 'ENOENT')
    servidor.parar()
  })

  spawn.romper(Object.assign(new Error('no such file'), { code: 'ENOENT' }))
})

test('parar mata el proceso', (t) => {
  const spawn = spawnFalso()
  servirCapas({ puerto: 50052, spawn, net: netFalso(999) }).parar()

  t.ok(spawn.matado, 'no queda un rpc-server huerfano ocupando el puerto')
})

test('si el binario no existe, lo dice y no tumba la app', (t) => {
  t.plan(2)
  // En Bare spawn lanza de forma sincrona, no avisa por evento.
  const spawnQueLanza = () => {
    throw Object.assign(new Error('no such file or directory'), { code: 'ENOENT' })
  }

  const servidor = servirCapas({ puerto: 50052, spawn: spawnQueLanza, net: netFalso(999) })
  servidor.on('error', (err) => {
    t.ok(/no encontre/.test(err.message), 'dice que falta y cual')
    t.is(err.code, 'ENOENT')
  })
  t.teardown(() => servidor.parar())
})
