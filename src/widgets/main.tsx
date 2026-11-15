import { createRoot } from "react-dom/client"
import "@/shared/carbono.css"
import "./widgets.css"
import { startState } from "@/shared/state"
import { Layer } from "./Layer"

startState()
createRoot(document.getElementById("root")!).render(<Layer />)
