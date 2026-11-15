// Estado do app nas páginas: uma cópia do que o processo principal guarda, atualizada por eventos.
// Escrever = pedir ao principal (que valida, salva e avisa todas as janelas).
import { create } from "zustand"
import { invoke, on } from "./bridge"
import type { AppState, Section } from "./types"

interface Store { ready: boolean; state: AppState | null }
export const useAppStore = create<Store>(() => ({ ready: false, state: null }))

let started = false
export function startState() {
  if (started) return
  started = true
  void invoke<AppState>("store:get").then((state) => useAppStore.setState({ ready: true, state }))
  on("store:changed", ({ section, value }: { section: Section; value: unknown }) => {
    const cur = useAppStore.getState().state
    if (cur) useAppStore.setState({ state: { ...cur, [section]: value } as AppState })
  })
}

/** lê uma seção (reage só quando ela muda) */
export function useSection<K extends Section>(k: K): AppState[K] | null {
  return useAppStore((s) => (s.state ? s.state[k] : null))
}
export const getSection = <K extends Section>(k: K): AppState[K] | null => useAppStore.getState().state?.[k] ?? null

/** aplica na hora (sensação imediata) e confirma no processo principal */
export function patch<K extends Section>(k: K, value: Partial<AppState[K]>) {
  const cur = useAppStore.getState().state
  if (cur) useAppStore.setState({ state: { ...cur, [k]: { ...(cur[k] as object), ...value } } as AppState })
  return invoke(`store:patch`, k, value)
}
export function replace<K extends Section>(k: K, value: AppState[K]) {
  const cur = useAppStore.getState().state
  if (cur) useAppStore.setState({ state: { ...cur, [k]: value } })
  return invoke("store:replace", k, value)
}
