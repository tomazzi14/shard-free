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

// Primera IPv4 no interna. Devuelve null si la máquina está sin red.
function interfazLocal () {
  for (const [nombre, direcciones] of Object.entries(os.networkInterfaces())) {
    for (const dir of direcciones) {
      if (dir.family === 'IPv4' && !dir.internal) return { ...dir, nombre }
    }
  }
  return null
}

const aEntero = (ip) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0
const aIP = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')

// Todas las direcciones asignables de la subred, salvo la propia.
function ipsDeSubred (address, netmask) {
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

module.exports = class LanDiscovery extends EventEmitter {
  // id: identificador estable del nodo. ficha: lo que publicamos (puerto rpc, ram, etc).
  constructor ({ id, ficha = {}, puerto = PUERTO }) {
    super()
    this.id = id
    this.ficha = ficha
    this.puerto = puerto
    this.peers = new Map()
    this.socket = null
    this.timers = []
  }

  start () {
    this.socket = dgram.createSocket('udp4')
    this.socket.on('message', (msg, rinfo) => this._onMensaje(msg, rinfo))
    this.socket.on('error', (err) => this.emit('error', err))

    this.socket.bind(this.puerto, '0.0.0.0', () => {
      const iface = interfazLocal()
      if (iface === null) {
        this.emit('error', new Error('sin interfaz de red IPv4'))
        return
      }
      this.emit('listening', { puerto: this.puerto, ...iface })
      this._barrer()
      this.timers.push(setInterval(() => this._barrer(), INTERVALO_BARRIDO))
      this.timers.push(setInterval(() => this._limpiar(), TTL_PEER / 2))
    })
  }

  _onMensaje (msg, rinfo) {
    let sobre
    try {
      sobre = JSON.parse(msg.toString())
    } catch (err) {
      this.emit('error', new Error(`mensaje ilegible de ${rinfo.address}: ${err.message}`))
      return
    }

    if (sobre.id === this.id) return // eco propio
    if (sobre.t !== 'hello' && sobre.t !== 'here') return

    this._registrar(sobre, rinfo.address)
    if (sobre.t === 'hello') this._enviar({ t: 'here' }, rinfo.address)
  }

  _registrar (sobre, address) {
    const conocido = this.peers.get(sobre.id)
    const peer = { id: sobre.id, address, ficha: sobre.ficha, visto: Date.now() }
    this.peers.set(sobre.id, peer)
    if (!conocido) this.emit('peer', peer)
  }

  _limpiar () {
    const ahora = Date.now()
    for (const [id, peer] of this.peers) {
      if (ahora - peer.visto > TTL_PEER) {
        this.peers.delete(id)
        this.emit('peer-lost', peer)
      }
    }
  }

  _enviar (sobre, address) {
    const buf = Buffer.from(JSON.stringify({ ...sobre, id: this.id, ficha: this.ficha }))
    this.socket.send(buf, 0, buf.byteLength, this.puerto, address, (err) => {
      // Un peer inexistente no es un error digno de log: la mayoría de la subred está vacía.
      if (err && err.code !== 'EHOSTUNREACH') this.emit('error', err)
    })
  }

  _barrer () {
    const iface = interfazLocal()
    if (iface === null) return

    let ips
    try {
      ips = ipsDeSubred(iface.address, iface.netmask)
    } catch (err) {
      this.emit('error', err)
      return
    }

    this.emit('sweep', { total: ips.length, red: iface.cidr })

    for (let i = 0; i < ips.length; i += TANDA) {
      const tanda = ips.slice(i, i + TANDA)
      const retraso = (i / TANDA) * PAUSA_TANDA
      const t = setTimeout(() => {
        for (const ip of tanda) this._enviar({ t: 'hello' }, ip)
      }, retraso)
      this.timers.push(t)
    }
  }

  stop () {
    for (const t of this.timers) clearTimeout(t) && clearInterval(t)
    this.timers = []
    if (this.socket) this.socket.close()
  }
}
