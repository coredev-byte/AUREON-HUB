export const cn = (...c: unknown[]) => c.filter((x) => typeof x === "string" && x).join(" ")
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
