import { create } from "zustand"
import { on } from "@/shared/bridge"

export type Page = "dashboard" | "widgets" | "notch" | "share" | "personalize" | "settings" | "diagnostics"
export const PAGES: Page[] = ["dashboard", "widgets", "notch", "share", "personalize", "settings", "diagnostics"]
interface Nav { page: Page; params: Record<string, unknown>; go: (page: Page, params?: Record<string, unknown>) => void }
export const useNav = create<Nav>((set) => ({
  page: "dashboard", params: {},
  go: (page, params = {}) => set({ page, params }),
}))
on("nav", ({ page, params }: { page?: string; params?: Record<string, unknown> }) => {
  if (page && (PAGES as string[]).includes(page)) useNav.getState().go(page as Page, params ?? {})
})
