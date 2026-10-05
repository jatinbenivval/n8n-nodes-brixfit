// Checks every workflow template in /workflows against the built node definitions:
// valid JSON, connections point at real nodes, and each Brixfit node uses a real
// resource / operation / parameter / option value. Run after `npm run build`.
const fs = require('fs')
const path = require('path')
const { Brixfit } = require('../dist/nodes/Brixfit/Brixfit.node.js')
const { BrixfitTrigger } = require('../dist/nodes/Brixfit/BrixfitTrigger.node.js')

const defs = {
  'n8n-nodes-brixfit.brixfit': new Brixfit().description,
  'n8n-nodes-brixfit.brixfitTrigger': new BrixfitTrigger().description,
}
let failed = 0
const fail = (file, msg) => { failed++; console.error(`FAIL ${file}: ${msg}`) }

const shows = (prop, params) =>
  !prop.displayOptions?.show || Object.entries(prop.displayOptions.show).every(([k, vals]) => vals.includes(params[k]))

for (const file of fs.readdirSync(path.join(__dirname, '../workflows')).filter((f) => f.endsWith('.json'))) {
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '../workflows', file), 'utf8'))
  const names = new Set(wf.nodes.map((n) => n.name))
  if (names.size !== wf.nodes.length) fail(file, 'duplicate node names')
  for (const [from, outs] of Object.entries(wf.connections)) {
    if (!names.has(from)) fail(file, `connection from unknown node "${from}"`)
    for (const branch of outs.main) for (const c of branch) if (!names.has(c.node)) fail(file, `connection to unknown node "${c.node}"`)
  }
  for (const node of wf.nodes) {
    const def = defs[node.type]
    if (!def) continue
    const props = def.properties
    for (const key of Object.keys(node.parameters)) {
      const prop = props.find((p) => p.name === key && shows(p, node.parameters))
      if (!prop) { fail(file, `${node.name}: parameter "${key}" is not shown for this resource/operation`); continue }
      if (prop.type === 'options' && !prop.typeOptions?.loadOptionsMethod && !prop.options.some((o) => o.value === node.parameters[key]))
        fail(file, `${node.name}: "${node.parameters[key]}" is not a valid ${key}`)
      if (prop.type === 'multiOptions') for (const v of node.parameters[key]) if (!prop.options.some((o) => o.value === v)) fail(file, `${node.name}: "${v}" is not a valid ${key}`)
      if (prop.type === 'collection') for (const sub of Object.keys(node.parameters[key])) {
        const opt = prop.options.find((o) => o.name === sub)
        if (!opt) { fail(file, `${node.name}: ${key}.${sub} does not exist`); continue }
        const val = node.parameters[key][sub]
        if (opt.type === 'options' && !opt.options.some((o) => o.value === val)) fail(file, `${node.name}: ${key}.${sub}="${val}" is not allowed`)
      }
    }
    for (const prop of props) if (prop.required && shows(prop, node.parameters) && !(prop.name in node.parameters) && prop.default === '' && node.type.endsWith('brixfit'))
      fail(file, `${node.name}: required "${prop.name}" is missing`)
  }
  console.log(`ok   ${file}`)
}
process.exit(failed ? 1 : 0)
