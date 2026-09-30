// Copies the web view that `python3 src/bundle.py` writes into this app.
// Python computes every number; this app only displays them.
import { copyFileSync, existsSync } from "node:fs"

const from = new URL("../../out/overview.json", import.meta.url)
const to = new URL("../data/overview.json", import.meta.url)

if (existsSync(from)) {
  copyFileSync(from, to)
  console.log("data: synced out/overview.json")
} else {
  console.log("data: out/overview.json not found, using the committed data/overview.json (run python3 src/bundle.py to refresh)")
}
