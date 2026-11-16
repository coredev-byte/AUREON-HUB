// Biblioteca de imagens própria (substitui a do Widgy): escolher do PC, colar (Ctrl+V) ou arrastar.
// A imagem é reduzida para no máximo 1600 px e guardada no armazenamento local do app (até 40 imagens).
import { useEffect, useRef, useState } from "react"
import { Check, ImagePlus, Trash2, X } from "lucide-react"
import { useStore } from "./store"
import type { MediaItem } from "./types"

async function toItem(file: File): Promise<MediaItem | null> {
  if (!file.type.startsWith("image/") || file.size > 40 * 1024 * 1024) return null
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return null
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement("canvas")
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height)
  const data = c.toDataURL("image/webp", 0.85)
  return { id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), file: data, name: file.name, width: c.width, height: c.height, createdAt: Date.now() }
}
export async function addFiles(files: FileList | File[]) {
  const items = (await Promise.all([...files].map(toItem))).filter(Boolean) as MediaItem[]
  return items.length ? useStore.getState().addMedia(items) : []
}

export function MediaPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (ids: string[]) => void }) {
  const media = useStore((s) => s.media)
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  useEffect(() => {
    if (!open) return
    const paste = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files ?? [])]; if (f.length) void addFiles(f) }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    addEventListener("paste", paste); addEventListener("keydown", key)
    return () => { removeEventListener("paste", paste); removeEventListener("keydown", key) }
  }, [open])
  if (!open) return null
  return (
    <div role="dialog" aria-label="Suas imagens" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="surface w-full max-w-[720px] p-4" onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files) }}
        style={drag ? { outline: "2px dashed var(--accent)" } : undefined}>
        <div className="mb-3 flex items-center gap-2">
          <b className="grow">Suas imagens</b>
          <button type="button" className="btn btn-sm" onClick={() => input.current?.click()}><ImagePlus size={13} />Adicionar</button>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}><X size={15} /></button>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = "" }} />
        </div>
        {!media.length ? (
          <div className="py-10 text-center text-sm text-fg-muted">Nenhuma imagem ainda. Adicione, cole (Ctrl+V) ou arraste aqui.</div>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-4 gap-3 overflow-auto">
            {media.map((m) => (
              <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl">
                <button type="button" className="h-full w-full" onClick={() => { onPick([m.id]); onClose() }} title={m.name}>
                  <img src={m.file} alt="" className="h-full w-full object-cover" draggable={false} />
                </button>
                <button type="button" className="absolute top-1 right-1 hidden rounded-full bg-black/70 p-1 text-white group-hover:block" aria-label="Apagar imagem"
                  onClick={() => useStore.setState((s) => ({ media: s.media.filter((x) => x.id !== m.id) }))}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-xs text-fg-muted"><Check size={11} className="inline" /> As imagens ficam só neste PC.</div>
      </div>
    </div>
  )
}
