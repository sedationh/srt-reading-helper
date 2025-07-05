import {
  Box,
  Button,
  Dialog,
  Input,
  Portal,
  Text,
  Textarea,
} from "@chakra-ui/react"
import { useEffect, useState } from "react"

interface EditSubtitleDialogProps {
  isOpen: boolean
  onClose: () => void
  subtitle: {
    id: number
    startTime: string
    endTime: string
    text: string
  }
  onSave: (editedSubtitle: {
    id: number
    startTime: string
    endTime: string
    text: string
  }) => void
}

export function EditSubtitleDialog({
  isOpen,
  onClose,
  subtitle,
  onSave,
}: EditSubtitleDialogProps) {
  const [editedSubtitle, setEditedSubtitle] = useState(subtitle)

  useEffect(() => {
    setEditedSubtitle(subtitle)
  }, [subtitle])

  const handleSave = () => {
    onSave(editedSubtitle)
    onClose()
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={({ open }) => !open && onClose()}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            bg="white"
            rounded="2xl"
            shadow="xl"
            maxW="480px"
            mx={4}
          >
            <Dialog.Header
              pt={6}
              px={6}
              pb={4}
              fontSize="lg"
              fontWeight="600"
              color="gray.800"
            >
              编辑字幕
            </Dialog.Header>

            <Dialog.Body px={6} py={4}>
              <Box display="flex" flexDirection="column" gap={6}>
                <Box>
                  <Text
                    mb={2.5}
                    fontSize="sm"
                    fontWeight="500"
                    color="gray.600"
                  >
                    开始时间
                  </Text>
                  <Input
                    value={editedSubtitle.startTime}
                    onChange={(e) =>
                      setEditedSubtitle({
                        ...editedSubtitle,
                        startTime: e.target.value,
                      })
                    }
                    placeholder="00:00:00,000"
                    bg="gray.50"
                    border="none"
                    rounded="lg"
                    fontSize="sm"
                    color="gray.800"
                    h="40px"
                    _placeholder={{ color: "gray.400" }}
                    _hover={{ bg: "gray.100" }}
                    _focus={{ bg: "gray.100", ring: 2, ringColor: "blue.500" }}
                  />
                </Box>
                <Box>
                  <Text
                    mb={2.5}
                    fontSize="sm"
                    fontWeight="500"
                    color="gray.600"
                  >
                    结束时间
                  </Text>
                  <Input
                    value={editedSubtitle.endTime}
                    onChange={(e) =>
                      setEditedSubtitle({
                        ...editedSubtitle,
                        endTime: e.target.value,
                      })
                    }
                    placeholder="00:00:00,000"
                    bg="gray.50"
                    border="none"
                    rounded="lg"
                    fontSize="sm"
                    color="gray.800"
                    h="40px"
                    _placeholder={{ color: "gray.400" }}
                    _hover={{ bg: "gray.100" }}
                    _focus={{ bg: "gray.100", ring: 2, ringColor: "blue.500" }}
                  />
                </Box>
                <Box>
                  <Text
                    mb={2.5}
                    fontSize="sm"
                    fontWeight="500"
                    color="gray.600"
                  >
                    字幕内容
                  </Text>
                  <Textarea
                    value={editedSubtitle.text}
                    onChange={(e) =>
                      setEditedSubtitle({
                        ...editedSubtitle,
                        text: e.target.value,
                      })
                    }
                    rows={4}
                    bg="gray.50"
                    border="none"
                    rounded="lg"
                    fontSize="sm"
                    color="gray.800"
                    _placeholder={{ color: "gray.400" }}
                    _hover={{ bg: "gray.100" }}
                    _focus={{ bg: "gray.100", ring: 2, ringColor: "blue.500" }}
                    resize="vertical"
                  />
                </Box>
              </Box>
            </Dialog.Body>

            <Dialog.Footer px={6} py={4} gap={3}>
              <Dialog.CloseTrigger asChild>
                <Button
                  bg="gray.100"
                  color="gray.700"
                  fontSize="sm"
                  fontWeight="500"
                  h="40px"
                  px={4}
                  rounded="lg"
                  _hover={{ bg: "gray.200" }}
                  _active={{ bg: "gray.300" }}
                >
                  取消
                </Button>
              </Dialog.CloseTrigger>
              <Button
                onClick={handleSave}
                bg="blue.500"
                color="white"
                fontSize="sm"
                fontWeight="500"
                h="40px"
                px={4}
                rounded="lg"
                _hover={{ bg: "blue.600" }}
                _active={{ bg: "blue.700" }}
              >
                保存
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
