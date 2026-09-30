// Copies what `python3 src/bundle.py` writes into this app: the overview data,
// one doctor-dossier file and one day-plan file per specialist, and the search
// index. Python computes every number, every draft and every queue order; this
// app only displays them.
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs"

const out = new URL("../../out/", import.meta.url)
const overview = new URL("overview.json", out)

if (existsSync(overview)) {
  copyFileSync(overview, new URL("../data/overview.json", import.meta.url))
  console.log("data: synced out/overview.json")
} else {
  console.log("data: out/overview.json not found, using the committed data/overview.json (run python3 src/bundle.py to refresh)")
}

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
