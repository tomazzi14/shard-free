const { test } = require('brittle')
const planificar = require('../lib/shard-plan.js')

// 68MB por capa: 2GB dan 30 capas, 1GB da 15, 0.5GB da 7.
function peer(id, ofreceGB, address = '192.168.1.10') {
  return { id, address, ficha: { etiqueta: id, rpcPort: 50052, ofreceGB } }
}

test('un peer con memoria de sobra se lleva el modelo entero', (t) => {
  const plan = planificar({ peers: [peer('a', 4)] })

  t.ok(plan.completo, 'el modelo esta completo')
  t.is(plan.cubiertas, 28)
  t.is(plan.faltan, null)
  t.is(plan.asignaciones.length, 1)
  t.alike(
    plan.asignaciones[0],
    { id: 'a', etiqueta: 'a', rpc: '192.168.1.10:50052', desde: 0, hasta: 27, capas: 28 },
    'toma las 28 capas, no mas de las que tiene el modelo'
  )
})

test('dos peers chicos se reparten las capas sin huecos ni solapes', (t) => {
  const plan = planificar({ peers: [peer('a', 1, '192.168.1.10'), peer('b', 1, '192.168.1.11')] })

  t.ok(plan.completo)
  t.alike(
    plan.asignaciones.map((a) => [a.desde, a.hasta]),
    [
      [0, 14],
      [15, 27]
    ],
    'el segundo arranca justo donde termino el primero'
  )
  t.is(plan.rpc, '192.168.1.10:50052,192.168.1.11:50052')
  t.is(plan.tensorSplit, '15,13')
})

test('si la memoria no alcanza, dice exactamente que capas faltan', (t) => {
  const plan = planificar({ peers: [peer('a', 1)] })

  t.absent(plan.completo, 'el modelo esta incompleto')
  t.is(plan.cubiertas, 15)
  t.alike(plan.faltan, { desde: 15, hasta: 27 }, 'esto es lo que muestra la banda de estado')
})

test('sin peers no hay modelo', (t) => {
  const plan = planificar({ peers: [] })

  t.absent(plan.completo)
  t.is(plan.cubiertas, 0)
  t.alike(plan.faltan, { desde: 0, hasta: 27 })
  t.is(plan.rpc, '', 'lista rpc vacia: no hay nada que lanzar')
})

test('un peer que no presta memoria queda afuera de la lista rpc', (t) => {
  const plan = planificar({ peers: [peer('a', 0), peer('b', 4, '192.168.1.11')] })

  t.is(plan.asignaciones.length, 1, 'solo el que presta algo')
  t.is(plan.rpc, '192.168.1.11:50052')
  t.ok(plan.completo)
})

test('una ficha sin ofreceGB no rompe el plan', (t) => {
  const roto = { id: 'x', address: '192.168.1.9', ficha: { etiqueta: 'x', rpcPort: 50052 } }
  const plan = planificar({ peers: [roto, peer('z', 4, '192.168.1.11')] })

  t.is(plan.asignaciones.length, 1)
  t.ok(plan.completo, 'el peer sano cubre el modelo igual')
})

test('el reparto no depende del orden en que aparecieron los peers', (t) => {
  const a = peer('aaa', 1, '192.168.1.10')
  const b = peer('bbb', 1, '192.168.1.11')

  t.alike(planificar({ peers: [a, b] }), planificar({ peers: [b, a] }), 'mismo plan')
})

test('un peer sobrante no recibe capas', (t) => {
  const plan = planificar({ peers: [peer('a', 4, '192.168.1.10'), peer('b', 4, '192.168.1.11')] })

  t.is(plan.asignaciones.length, 1, 'el primero ya cubrio las 28 capas')
  t.ok(plan.completo)
})

test('acepta modelos de otro tamano', (t) => {
  const plan = planificar({ peers: [peer('a', 1)], capas: 16, bytesPorCapa: 32 * 1024 * 1024 })

  t.ok(plan.completo)
  t.is(plan.capas, 16)
  t.is(plan.asignaciones[0].hasta, 15)
})
