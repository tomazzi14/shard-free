const { test } = require('brittle')
const banda = require('../lib/banda.js')
const planificar = require('../lib/shard-plan.js')

const peer = (id, ofreceGB, address) => ({
  id,
  address,
  ficha: { etiqueta: id, rpcPort: 50052, ofreceGB }
})

const completo = planificar({ peers: [peer('a', 1, '10.0.0.1'), peer('b', 1, '10.0.0.2')] })
const incompleto = planificar({ peers: [peer('a', 1, '10.0.0.1')] })
const vacio = planificar({ peers: [] })

test('con el modelo completo dice cuantas capas se sirven', (t) => {
  t.is(banda.titulo(completo), 'MODEL COMPLETE - 28/28 capas servidas')
})

test('con el modelo incompleto nombra el rango que falta', (t) => {
  t.is(
    banda.titulo(incompleto),
    'MODEL INCOMPLETE - faltan las capas 15-27 (15/28 cubiertas)',
    'el rango exacto es el punto: no alcanza con decir que falta algo'
  )
})

test('lista una linea por maquina, con sus capas', (t) => {
  const lineas = banda(completo)

  t.ok(lineas.some((l) => l.includes('capas  0-14') && l.includes('10.0.0.1:50052')))
  t.ok(lineas.some((l) => l.includes('capas 15-27') && l.includes('10.0.0.2:50052')))
})

test('sin peers no imprime una lista vacia enganosa', (t) => {
  const lineas = banda(vacio)

  t.ok(banda.titulo(vacio).startsWith('MODEL INCOMPLETE'))
  t.ok(
    lineas.some((l) => l.includes('(vacio)')),
    'deja claro que no hay a quien preguntarle'
  )
})
