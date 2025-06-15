import { ChakraProvider } from "@chakra-ui/react"
import type { ReactNode } from "react"
import { system } from "../../theme"

interface ProviderProps {
  children: ReactNode
}

export function Provider({ children }: ProviderProps) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>
}
