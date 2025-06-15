import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { Provider } from "./components/ui/provider"

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Failed to find the root element")

const root = createRoot(rootElement)

root.render(
  <StrictMode>
    <Provider>
      <App />
    </Provider>
  </StrictMode>,
)
