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

const opciones = (spawn) => ({ modelo: '/m.gguf', prompt: 'hola', spawn })

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

  spawn.stdout('Buenos ')
  spawn.stdout('Aires')

  t.alike(trozos, ['Buenos ', 'Aires'], 'llega en streaming, no al final')
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
  spawn.salir(0)
})
