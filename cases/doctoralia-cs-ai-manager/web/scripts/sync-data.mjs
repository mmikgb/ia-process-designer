// Copies what `python3 src/bundle.py` writes into this app: the overview data
// and one doctor-dossier file per specialist. Python computes every number and
// every draft; this app only displays them.
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs"

const out = new URL("../../out/", import.meta.url)
const overview = new URL("overview.json", out)
const doctors = new URL("doctors/", out)

if (existsSync(overview)) {
  copyFileSync(overview, new URL("../data/overview.json", import.meta.url))
  console.log("data: synced out/overview.json")
} else {
  console.log("data: out/overview.json not found, using the committed data/overview.json (run python3 src/bundle.py to refresh)")
}

if (existsSync(doctors)) {
  const to = new URL("../public/doctors/", import.meta.url)
  rmSync(to, { recursive: true, force: true })
  mkdirSync(to, { recursive: true })
  cpSync(doctors, to, { recursive: true })
  console.log("data: synced out/doctors/")
}
