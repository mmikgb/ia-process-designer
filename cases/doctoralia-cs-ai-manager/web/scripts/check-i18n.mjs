// Fails when a key exists in one dictionary and not the other.
// es.ts is the source of the keys; en.ts must mirror it exactly.
import { readFileSync } from "node:fs"

const keys = (file) => {
  const text = readFileSync(new URL(`../lib/i18n/${file}`, import.meta.url), "utf8")
  return new Set([...text.matchAll(/^\s*"([a-z0-9_.]+)":/gim)].map((m) => m[1]))
}

const es = keys("es.ts")
const en = keys("en.ts")
const onlyEs = [...es].filter((k) => !en.has(k))
const onlyEn = [...en].filter((k) => !es.has(k))

if (onlyEs.length || onlyEn.length) {
  if (onlyEs.length) console.error(`i18n: missing in en.ts: ${onlyEs.join(", ")}`)
  if (onlyEn.length) console.error(`i18n: missing in es.ts: ${onlyEn.join(", ")}`)
  process.exit(1)
}
console.log(`i18n: ${es.size} keys, es and en match`)
