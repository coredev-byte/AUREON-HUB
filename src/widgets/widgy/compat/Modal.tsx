import type { ReactNode } from "react"
import { X } from "lucide-react"
/** janela simples por cima (usada pelo seletor de fontes portado do Widgy) */
export function Modal({ open, onClose, title, width = 560, children }: { open: boolean; onClose: () => void; title: string; width?: number; children: ReactNode }) {
  if (!open) return null
  return (
    <div role="dialog" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="surface max-h-[85vh] w-full overflow-auto p-4" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2"><b className="grow">{title}</b><button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}><X size={15} /></button></div>
        {children}
      </div>
    </div>
  )
}
