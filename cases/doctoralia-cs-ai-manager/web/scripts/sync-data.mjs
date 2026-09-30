// Copies what `python3 src/bundle.py` writes into this app: the overview data,
// one doctor-dossier file and one day-plan file per specialist, and the search
// index. Python computes every number, every draft and every queue order; this
// app only displays them.
//
// An out/ from an older bundle.py (a lower meta.web_schema than the committed
// data/overview.json) is not copied: it would replace the branch's data with a
// shape the screens no longer read. Rebuild it instead (the message says how).
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"

const out = new URL("../../out/", import.meta.url)
const overview = new URL("overview.json", out)
const committed = new URL("../data/overview.json", import.meta.url)

const schema = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8")).meta?.web_schema ?? 0
  } catch {
    return 0
  }
}

if (!existsSync(overview)) {
  console.log("data: out/overview.json not found, using the committed data (run python3 src/bundle.py to refresh)")
  process.exit(0)
}
const have = schema(overview)
const need = existsSync(committed) ? schema(committed) : 0
if (have < need) {
  console.warn(
    `data: out/ is from an older bundle.py (web_schema ${have} < ${need}); keeping the committed data.\n` +
      "      Refresh it with: python3 src/pipeline.py && python3 src/bundle.py",
  )
  process.exit(0)
}

copyFileSync(overview, committed)
console.log("data: synced out/overview.json")

for (const dir of ["doctors", "queue"]) {
  const from = new URL(`${dir}/`, out)
  if (!existsSync(from)) continue
  const to = new URL(`../public/${dir}/`, import.meta.url)
  rmSync(to, { recursive: true, force: true })
  mkdirSync(to, { recursive: true })
  cpSync(from, to, { recursive: true })
  console.log(`data: synced out/${dir}/`)
}

const search = new URL("search.json", out)
if (existsSync(search)) {
  copyFileSync(search, new URL("../public/search.json", import.meta.url))
  console.log("data: synced out/search.json")
}
