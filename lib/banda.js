// La banda de estado, en texto. Devuelve líneas en vez de imprimir para poder testearla,
// y porque el panel web va a querer los mismos datos con otra pintura.

const ANCHO = 64

function titulo(plan) {
  if (plan.completo) return `MODEL COMPLETE - ${plan.capas}/${plan.capas} capas servidas`
  return (
    `MODEL INCOMPLETE - faltan las capas ${plan.faltan.desde}-${plan.faltan.hasta} ` +
    `(${plan.cubiertas}/${plan.capas} cubiertas)`
  )
}

// La versión va en el borde de arriba: es lo que cambia en cámara cuando entra una
// actualización OTA, y no le roba lugar al estado del modelo.
function borde(version) {
  if (!version) return '-'.repeat(ANCHO)
  const tag = ` shard v${version}`
  return '-'.repeat(Math.max(0, ANCHO - tag.length)) + tag
}

function banda(plan, version) {
  const lineas = [borde(version), titulo(plan)]

  for (const a of plan.asignaciones) {
    const rango = `${String(a.desde).padStart(2)}-${String(a.hasta).padEnd(2)}`
    lineas.push(`  capas ${rango}  ${a.rpc}  ${a.etiqueta}`)
  }

  lineas.push(`  --rpc ${plan.rpc || '(vacio)'}`, '-'.repeat(ANCHO))
  return lineas
}

module.exports = banda
module.exports.titulo = titulo
module.exports.borde = borde
