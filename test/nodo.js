const { test } = require('brittle')
const Nodo = require('../lib/nodo.js')

const { EventEmitter } = require('../lib/runtime.js')

// Descubrimiento de mentira: deja meter y sacar peers a mano.
class DiscoveryFalso extends EventEmitter {
  constructor() {
    super()
    this.peers = new Map()
    this.arrancado = false
  }
  start() {
    this.arrancado = true
    this.emit('listening', { address: '10.0.0.1', puerto: 41234 })
  }
  stop() {
    this.arrancado = false
  }
  entra(id, ofreceGB, address) {
    const peer = { id, address, ficha: { etiqueta: id, rpcPort: 50052, ofreceGB } }
    this.peers.set(id, peer)
    this.emit('peer', peer)
  }
  sale(id) {
    const peer = this.peers.get(id)
    this.peers.delete(id)
    this.emit('peer-lost', peer)
  }
}

// Servidor de capas de mentira: el nodo lo arranca solo, y en los tests no queremos
// levantar un proceso de verdad.
function servidorFalso() {
  const fn = (opciones) => {
    fn.puerto = opciones.puerto
    fn.emisor = new EventEmitter()
    fn.emisor.parar = () => (fn.parado = true)
    return fn.emisor
  }
  return fn
}

function nodo(extra = {}) {
  const discovery = new DiscoveryFalso()
  const servidor = servidorFalso()
  const n = new Nodo({ etiqueta: 'yo', ofreceGB: 1, discovery, servidor, ...extra })
  return { discovery, servidor, nodo: n }
}

test('el nodo se cuenta a si mismo entre los shards', (t) => {
  const { nodo: n } = nodo()
  const plan = n.plan()

  t.is(plan.cubiertas, 15, '1GB propio son 15 capas')
  t.is(plan.asignaciones[0].rpc, '127.0.0.1:50052', 'se ve a si mismo por loopback')
  t.absent(plan.completo)
})

test('avisa el estado al arrancar, antes de encontrar a nadie', (t) => {
  t.plan(2)
  const { nodo: n } = nodo()

  n.on('estado', (plan) => {
    t.absent(plan.completo, 'arranca incompleto')
    t.alike(plan.faltan, { desde: 15, hasta: 27 })
  })
  n.start()
})

test('cuando entra un peer el estado pasa a completo', (t) => {
  const { nodo: n, discovery } = nodo()
  const estados = []
  n.on('estado', (plan) => estados.push(plan.completo))

  n.start()
  discovery.entra('zzz', 1, '10.0.0.9')

  t.alike(estados, [false, true], 'incompleto y despues completo')
})

test('cuando se cae el peer vuelve a incompleto', (t) => {
  const { nodo: n, discovery } = nodo()
  const estados = []
  n.on('estado', (plan) => estados.push(plan))

  n.start()
  discovery.entra('zzz', 1, '10.0.0.9')
  discovery.sale('zzz')

  t.ok(estados[1].completo)
  t.absent(estados[2].completo, 'se cayo una capa, se cayo el modelo')
  t.alike(estados[2].faltan, { desde: 15, hasta: 27 })
})

test('preguntar usa el plan del momento', (t) => {
  const planes = []
  const { nodo: n, discovery } = nodo({ inferir: (plan) => planes.push(plan) })

  n.start()
  n.preguntar('hola')
  discovery.entra('zzz', 1, '10.0.0.9')
  n.preguntar('hola')

  t.absent(planes[0].completo, 'la primera pregunta va con el modelo incompleto')
  t.ok(planes[1].completo, 'la segunda ya tiene todas las capas')
})

test('preguntar le pasa el modelo, el binario y el prompt a la inferencia', (t) => {
  t.plan(3)
  const { nodo: n } = nodo({
    modelo: '/m.gguf',
    binario: '/opt/llama-cli',
    inferir: (plan, opciones) => {
      t.is(opciones.modelo, '/m.gguf')
      t.is(opciones.binario, '/opt/llama-cli', 'el motor tampoco viaja con la app')
      t.is(opciones.prompt, 'cual es la capital?')
    }
  })
  n.preguntar('cual es la capital?')
})

test('start y stop llegan al descubrimiento', (t) => {
  const { nodo: n, discovery } = nodo()

  n.start()
  t.ok(discovery.arrancado)
  n.stop()
  t.absent(discovery.arrancado)
})

test('el nodo levanta su propio servidor de capas, en el puerto que anuncia', (t) => {
  const { nodo: n, servidor } = nodo({ rpcPort: 50055 })
  n.start()

  t.is(servidor.puerto, 50055, 'anunciar un puerto y no servirlo seria mentir')
  n.stop()
  t.ok(servidor.parado, 'y al parar no deja el proceso huerfano')
})

test('si el servidor de capas se rompe, el error sale por el nodo', (t) => {
  t.plan(1)
  const { nodo: n, servidor } = nodo()

  n.on('error', (err) => t.is(err.message, 'el servidor de capas se cayo (codigo 1)'))
  n.start()
  servidor.emisor.emit('error', new Error('el servidor de capas se cayo (codigo 1)'))
})

test('los errores del descubrimiento salen por el nodo', (t) => {
  t.plan(1)
  const { nodo: n, discovery } = nodo()

  n.on('error', (err) => t.is(err.message, 'algo se rompio'))
  n.start()
  discovery.emit('error', new Error('algo se rompio'))
})
