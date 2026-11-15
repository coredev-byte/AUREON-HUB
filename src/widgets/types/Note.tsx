import { useEffect, useRef, useState } from "react"
import { cfg, type WidgetProps } from "../catalog"

export default function Note({ w, update }: WidgetProps) {
  const saved = cfg(w, "text", "")
  const [text, setText] = useState(saved)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // outra janela mudou o texto (ex.: perfil trocado): acompanha
  useEffect(() => { setText(saved) }, [saved])
  const change = (v: string) => {
    setText(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => update({ text: v.slice(0, 4000) }), 600)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return <textarea className="wg-note" value={text} placeholder="Escreva algo…" maxLength={4000} aria-label="Nota" onChange={(e) => change(e.target.value)} />
}
