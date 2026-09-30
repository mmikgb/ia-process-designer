// Server-only paths. out/ is shared with the Python side (settings, ledgers, logs).
import path from "node:path"

export const OUT = process.env.CS_OUT_DIR ?? path.join(process.cwd(), "..", "out")
export const PUBLIC = path.join(process.cwd(), "public")
