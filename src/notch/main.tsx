import { createRoot } from "react-dom/client"
import "@/shared/carbono.css"
import "@/shared/tw.css"
import "./notch.css"
import { startState } from "@/shared/state"
import { NotchApp } from "./Notch"

startState()
createRoot(document.getElementById("root")!).render(<NotchApp />)
