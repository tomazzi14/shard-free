const { test } = require('brittle')
const inferir = require('../lib/inferencia.js')
const { construirArgs } = inferir
const planificar = require('../lib/shard-plan.js')

function peer(id, ofreceGB, address) {
  return { id, address, ficha: { etiqueta: id, rpcPort: 50052, ofreceGB } }
}

const completo = planificar({ peers: [peer('a', 1, '10.0.0.1'), peer('b', 1, '10.0.0.2')] })
const incompleto = planificar({ peers: [peer('a', 1, '10.0.0.1')] })

// Proceso de mentira: registra como lo llamaron y deja empujar salida y salida de codigo.
function spawnFalso() {
  const llamadas = []
  const oyentes = { stdout: {}, stderr: {}, proc: {} }
  const flujo = (donde) => ({
    on(evento, fn) {
      oyentes[donde][evento] = fn
    }
  })
  const fn = (binario, args) => {
    llamadas.push({ binario, args })
    return {
      stdout: flujo('stdout'),
      stderr: flujo('stderr'),
      on(evento, cb) {
        oyentes.proc[evento] = cb
      },
      kill() {
        this.matado = true
      }
    }
  }
  fn.llamadas = llamadas
  fn.stdout = (txt) => oyentes.stdout.data(Buffer.from(txt))
  fn.stderr = (txt) => oyentes.stderr.data(Buffer.from(txt))
  fn.salir = (code) => oyentes.proc.exit(code)
  return fn
}

const opciones = (spawn) => ({
  modelo: '/m.gguf',
  prompt: 'cual es la capital de Argentina?',
  spawn
})

test('los argumentos salen del plan, no escritos a mano', (t) => {
  const args = construirArgs(completo, { modelo: '/m.gguf', prompt: 'hola' })

  t.is(args[args.indexOf('--rpc') + 1], '10.0.0.1:50052,10.0.0.2:50052', 'el rpc es el del plan')
  t.is(args[args.indexOf('-m') + 1], '/m.gguf')
  t.is(args[args.indexOf('-p') + 1], 'hola')
  t.ok(args.includes('-st'), '-st: una respuesta y termina, no abre el chat interactivo')
})

test('tensor-split no se pasa salvo que lo pidan', (t) => {
  t.absent(construirArgs(completo, { modelo: '/m.gguf', prompt: 'x' }).includes('--tensor-split'))

  const fijo = construirArgs(completo, { modelo: '/m.gguf', prompt: 'x', fijarSplit: true })
  t.is(fijo[fijo.indexOf('--tensor-split') + 1], '15,13')
})

test('con el modelo incompleto la inferencia se niega a arrancar', (t) => {
  t.plan(3)
  const spawn = spawnFalso()

  inferir(incompleto, opciones(spawn)).on('error', (err) => {
    t.ok(/faltan las capas 15-27/.test(err.message), 'dice exactamente que falta')
    t.alike(err.faltan, { desde: 15, hasta: 27 }, 'y lo trae estructurado, para el panel')
    t.is(spawn.llamadas.length, 0, 'no se lanzo nada')
  })
})

test('con el modelo completo lanza llama-cli una sola vez', (t) => {
  const spawn = spawnFalso()
  inferir(completo, opciones(spawn))

  t.is(spawn.llamadas.length, 1)
  t.is(spawn.llamadas[0].binario, inferir.BINARIO)
  t.ok(spawn.llamadas[0].args.includes('--rpc'))
})

test('lo que genera el modelo se emite a medida que sale', (t) => {
  const spawn = spawnFalso()
  const trozos = []
  inferir(completo, opciones(spawn)).on('salida', (s) => trozos.push(s))

  // El eco del prompt es lo que marca donde empieza la respuesta.
  spawn.stdout('> cual es la capital de Argentina?\nBuenos Aires es la ')
  spawn.stdout('capital.\n[ Prompt: 1 t/s ]')

  t.ok(trozos.length > 1, 'llega en streaming, no todo junto al final')
  t.is(trozos.join('').trim(), 'Buenos Aires es la capital.')
})

test('los logs de llama.cpp no se mezclan con la respuesta', (t) => {
  const spawn = spawnFalso()
  const salida = []
  const logs = []
  inferir(completo, opciones(spawn))
    .on('salida', (s) => salida.push(s))
    .on('log', (l) => logs.push(l))

  spawn.stderr('load_tensors: offloading 28 layers')

  t.is(salida.length, 0)
  t.is(logs.length, 1, 'stderr va por su canal')
})

test('un peer que se cae en plena inferencia se reporta, no se traga', (t) => {
  t.plan(1)
  const spawn = spawnFalso()

  inferir(completo, opciones(spawn)).on('error', (err) => {
    t.ok(/codigo 1/.test(err.message), 'el fallo de llama-cli llega al log del panel')
  })

  spawn.salir(1)
})

test('termina bien y avisa', (t) => {
  t.plan(1)
  const spawn = spawnFalso()

  inferir(completo, opciones(spawn)).on('fin', () => t.pass('emitio fin'))

  spawn.stdout('> cual es la capital de Argentina?\nBuenos Aires.\n[ Prompt: 1 t/s ]')
  spawn.salir(0)
})

test('salir con codigo 0 sin contestar nada no es terminar bien', (t) => {
  t.plan(2)
  const spawn = spawnFalso()

  // Lo que pasa de verdad cuando no hay un rpc-server escuchando: llama-cli se queja por
  // stderr, no contesta, y sale con codigo 0. Antes lo dabamos por bueno y el panel
  // quedaba mudo sin decir por que.
  inferir(completo, opciones(spawn))
    .on('fin', () => t.fail('no contesto nada, no puede ser un final feliz'))
    .on('error', (err) => {
      t.ok(/no devolvio nada/.test(err.message))
      t.ok(/Failed to connect/.test(err.message), 'y arrastra la queja de llama.cpp')
    })

  spawn.stderr('0.00.062 E Failed to connect to 127.0.0.1:50060\n')
  spawn.stdout('\nLoading model...\n')
  spawn.salir(0)
})

// La salida real de llama-cli, tal cual la capturamos del proceso.
const CRUDO =
  '\n\nLoading model... |\b-\b\\\b|\b/\b \b\n\n' +
  '▄▄ ▄▄\n██ ██\n\n' +
  'build      : b1-b21e4de\nmodel      : ./models/Llama-3.2-3B-Instruct-Q4_K_M.gguf\n\n' +
  'available commands:\n  /exit or Ctrl+C     stop or exit\n\n\n' +
  '> cual es la capital de Argentina?\n' +
  'La capital de Argentina es Buenos Aires.\n\n' +
  '[ Prompt: 165.7 t/s | Generation: 54.3 t/s ]\n\n\nExiting...'

const PREGUNTA = 'cual es la capital de Argentina?'

// Deja pasar la salida en pedazos de n caracteres, como llega de verdad.
function filtrar(texto, n) {
  const filtro = new inferir.Filtro(PREGUNTA)
  let salida = ''
  for (let i = 0; i < texto.length; i += n) salida += filtro.procesar(texto.slice(i, i + n))
  return salida
}

test('del ruido de llama-cli sale solo la respuesta', (t) => {
  t.is(filtrar(CRUDO, CRUDO.length).trim(), 'La capital de Argentina es Buenos Aires.')
})

test('la respuesta sale igual venga como venga cortada', (t) => {
  for (const n of [1, 3, 7, 64, 500]) {
    t.is(
      filtrar(CRUDO, n).trim(),
      'La capital de Argentina es Buenos Aires.',
      `cortando cada ${n} caracteres`
    )
  }
})

test('el logo y las estadisticas no pasan', (t) => {
  const salida = filtrar(CRUDO, 40)

  t.absent(salida.includes('build'), 'nada del encabezado')
  t.absent(salida.includes('/exit'), 'ni la lista de comandos')
  t.absent(salida.includes('Prompt:'), 'ni las estadisticas del final')
  t.absent(salida.includes('Exiting'), 'ni el saludo de salida')
})

test('la salida cruda sigue disponible para depurar', (t) => {
  t.plan(2)
  const spawn = spawnFalso()
  const crudos = []
  const limpios = []

  inferir(completo, opciones(spawn))
    .on('crudo', (c) => crudos.push(c))
    .on('salida', (s) => limpios.push(s))

  spawn.stdout(CRUDO)

  t.ok(crudos[0].includes('build'), 'nada se tira: el crudo va entero')
  t.absent(limpios.join('').includes('build'), 'pero al panel va solo la respuesta')
})
