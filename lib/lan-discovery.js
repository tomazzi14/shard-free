// Descubrimiento de peers en la red local.
//
// bare-dgram sólo hace unicast (ver DISCOVERY.md), así que en vez de un broadcast
// mandamos un HELLO a cada dirección de la subred. El que lo recibe contesta con su
// ficha. Ruidoso pero fiable: no depende de que el router propague multicast.

// La app corre en Bare, pero en Node (para tests) los módulos nativos alcanzan.
let dgram, os, EventEmitter
try {
  dgram = require('bare-dgram')
  os = require('bare-os')
  EventEmitter = require('bare-events')
} catch {
  dgram = require('dgram')
  os = require('os')
  EventEmitter = require('events')
}

const PUERTO = 41234
const INTERVALO_BARRIDO = 10000 // ms entre barridos
const TANDA = 256 // ips por tanda, para no golpear la red de una
const PAUSA_TANDA = 40 // ms entre tandas
const TTL_PEER = 30000 // sin noticias -> lo damos por perdido
const MAX_IPS = 4096 // tope de seguridad: no barrer redes enormes

// Códigos que significan "en esa dirección no hay nadie". Barrer una /20 son 4093 envíos
// y casi todos fallan así: es el funcionamiento normal, no un problema. No van al log uno
// por uno (taparían todo lo demás) pero tampoco se tiran a la basura: se cuentan y el
// barrido siguiente los reporta agregados.
const SIN_NADIE = new Set(['EHOSTUNREACH', 'ENETUNREACH', 'EHOSTDOWN', 'ECONNREFUSED', 'ETIMEDOUT'])

// Primera IPv4 no interna. Devuelve null si la máquina está sin red.
function interfazLocal() {
  for (const direcciones of Object.values(os.networkInterfaces())) {
    for (const dir of direcciones) {
      if (dir.family === 'IPv4' && !dir.internal) return dir
    }
  }
  return null
}

const aEntero = (ip) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0
const aIP = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')

// Todas las direcciones asignables de la subred, salvo la propia.
function ipsDeSubred(address, netmask) {
  const base = (aEntero(address) & aEntero(netmask)) >>> 0
  const total = (~aEntero(netmask) >>> 0) + 1
  if (total > MAX_IPS) throw new Error(`subred demasiado grande (${total} ips, tope ${MAX_IPS})`)

  const propia = aEntero(address)
  const ips = []
  for (let i = 1; i < total - 1; i++) {
    const n = (base + i) >>> 0
    if (n !== propia) ips.push(aIP(n))
  }
  return ips
}

class LanDiscovery extends EventEmitter {
  // id: identificador estable del nodo. ficha: lo que publicamos (puerto rpc, ram, etc).
  // socket: inyectable, para poder probar la lógica sin tocar la red.
  constructor({ id, ficha = {}, puerto = PUERTO, socket = null }) {
    super()
    this.id = id
    this.ficha = ficha
    this.puerto = puerto
    this._socketInyectado = socket
    this.peers = new Map()
    this.socket = null
    this.intervalos = []
    this.tandas = []
    this.activo = false
    this.sinRespuesta = new Map() // código -> cuántas veces, en el barrido en curso
  }

  // 'error' sin oyentes lanza excepción y tumba el proceso. Los errores acá son
  // esperables (una subred está casi toda vacía), así que nunca deben matar la app.
  _fallo(err) {
    if (this.listenerCount('error') > 0) this.emit('error', err)
    else console.error('[lan-discovery]', err.message)
  }

  start() {
    this.activo = true
    this.socket = this._socketInyectado || dgram.createSocket('udp4')
    this.socket.on('message', (msg, rinfo) => this._onMensaje(msg, rinfo))
    this.socket.on('error', (err) => this._fallo(err))

    // bind lanza de forma síncrona (no por el evento 'error'): sin este try, un puerto
    // ocupado tumba la app con un stack trace en vez de decir qué pasa.
    try {
      this.socket.bind(this.puerto, '0.0.0.0', () => {
        const iface = interfazLocal()
        if (iface === null) {
          this._fallo(new Error('sin interfaz de red IPv4'))
          return
        }
        this.emit('listening', { puerto: this.puerto, ...iface })
        this._barrer()
        this.intervalos.push(setInterval(() => this._barrer(), INTERVALO_BARRIDO))
        this.intervalos.push(setInterval(() => this._limpiar(), TTL_PEER / 2))
      })
    } catch (err) {
      this.activo = false
      const detalle =
        err.code === 'EADDRINUSE'
          ? `el puerto ${this.puerto} ya esta ocupado (otra instancia corriendo?)`
          : err.message
      this._fallo(new Error(`no se pudo escuchar: ${detalle}`))
    }
  }

  _onMensaje(msg, rinfo) {
    let sobre
    try {
      sobre = JSON.parse(msg.toString())
    } catch (err) {
      this._fallo(new Error(`mensaje ilegible de ${rinfo.address}: ${err.message}`))
      return
    }

    if (sobre.id === this.id) return // eco propio
    if (sobre.t !== 'hello' && sobre.t !== 'here') return

    this._registrar(sobre, rinfo.address)
    if (sobre.t === 'hello') this._enviar({ t: 'here' }, rinfo.address)
  }

  _registrar(sobre, address) {
    const conocido = this.peers.get(sobre.id)
    const peer = { id: sobre.id, address, ficha: sobre.ficha, visto: Date.now() }
    this.peers.set(sobre.id, peer)
    if (!conocido) this.emit('peer', peer)
  }

  _limpiar() {
    const ahora = Date.now()
    for (const [id, peer] of this.peers) {
      if (ahora - peer.visto > TTL_PEER) {
        this.peers.delete(id)
        this.emit('peer-lost', peer)
      }
    }
  }

  _enviar(sobre, address) {
    if (!this.activo) return
    const buf = Buffer.from(JSON.stringify({ ...sobre, id: this.id, ficha: this.ficha }))
    this.socket.send(buf, 0, buf.byteLength, this.puerto, address, (err) => {
      if (!err) return
      if (SIN_NADIE.has(err.code)) {
        this.sinRespuesta.set(err.code, (this.sinRespuesta.get(err.code) || 0) + 1)
        return
      }
      this._fallo(err)
    })
  }

  _barrer() {
    if (!this.activo) return
    const iface = interfazLocal()
    if (iface === null) return

    let ips
    try {
      ips = ipsDeSubred(iface.address, iface.netmask)
    } catch (err) {
      this._fallo(err)
      return
    }

    // Los fallos del barrido anterior: llegan por callback, mucho después de lanzarlo.
    const sinRespuesta = Object.fromEntries(this.sinRespuesta)
    this.sinRespuesta.clear()
    this.emit('sweep', { total: ips.length, red: iface.cidr, sinRespuesta })

    // Un barrido entero dura menos que INTERVALO_BARRIDO, así que al llegar acá el
    // anterior ya terminó: descartamos sus timers en vez de acumularlos.
    this.tandas = []
    for (let i = 0; i < ips.length; i += TANDA) {
      const tanda = ips.slice(i, i + TANDA)
      const retraso = (i / TANDA) * PAUSA_TANDA
      this.tandas.push(
        setTimeout(() => {
          for (const ip of tanda) this._enviar({ t: 'hello' }, ip)
        }, retraso)
      )
    }
  }

  stop() {
    if (!this.activo) return
    this.activo = false
    for (const t of this.intervalos) clearInterval(t)
    for (const t of this.tandas) clearTimeout(t)
    this.intervalos = []
    this.tandas = []
    if (this.socket) this.socket.close()
  }
}

module.exports = LanDiscovery
module.exports.ipsDeSubred = ipsDeSubred // expuesto para tests
