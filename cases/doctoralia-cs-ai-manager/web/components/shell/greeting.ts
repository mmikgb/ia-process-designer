import type { Key } from "@/lib/i18n/es"

/** Greeting by the real hour (the data clock is a snapshot; the person is here now). */
export function greetingKey(now = new Date()): Key {
  const h = now.getHours()
  return h < 12 ? "greet.morning" : h < 19 ? "greet.afternoon" : "greet.evening"
}
