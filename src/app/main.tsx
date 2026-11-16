import { createRoot } from "react-dom/client"
import "@/shared/carbono.css"
import "@/shared/tw.css"
import "./app.css"
import { startState } from "@/shared/state"
import { App } from "./App"

startState()
createRoot(document.getElementById("root")!).render(<App />)
