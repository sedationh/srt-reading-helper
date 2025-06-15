import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  VStack,
  Icon,
  Tooltip,
} from "@chakra-ui/react"
import { FaVideo, FaFileUpload, FaPaste, FaCopy } from "react-icons/fa"
import { useGetState } from "ahooks"
import { useEffect, useRef, useState } from "react"
import ReactPlayer from "react-player"
import {
  useNavigate,
  useLocation,
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom"
import * as LZString from "lz-string"

interface Subtitle {
  id: number
  startTime: string
  endTime: string
  text: string
}

function parseSRT(srtContent: string): Subtitle[] {
  const subtitles: Subtitle[] = []
  const blocks = srtContent.trim().split("\n\n")

  for (const block of blocks) {
    const lines = block.split("\n")
    if (lines.length >= 3) {
      const id = Number.parseInt(lines[0])
      const [startTime, endTime] = lines[1].split(" --> ")
      const text = lines.slice(2).join("\n")

      subtitles.push({
        id,
        startTime,
        endTime,
        text,
      })
    }
  }

  return subtitles
}

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [subtitles, setSubtitles] = useState<Subtitle[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [isUserScrolling, setIsUserScrolling] = useGetState(false)
  const scrollTimeoutRef = useRef<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const subtitlesContainerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<ReactPlayer>(null)

  // Load subtitles from URL on mount
  useEffect(() => {
    const hash = location.hash.slice(1) // Remove the # symbol
    if (hash) {
      try {
        const decompressedSubtitles =
          LZString.decompressFromEncodedURIComponent(hash)
        if (decompressedSubtitles) {
          const parsedSubtitles = parseSRT(decompressedSubtitles)
          setSubtitles(parsedSubtitles)
        }
      } catch (error) {
        console.error("Failed to decompress subtitles from URL:", error)
      }
    }
  }, [location.hash])

  const handleVideoImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      setVideoUrl(url)
    }
  }

  const updateSubtitlesUrl = (srtContent: string) => {
    if (srtContent === "") {
      navigate("/")
      return
    }
    // Compress full content for hash
    const compressed = LZString.compressToEncodedURIComponent(srtContent)

    // Use first 20 chars for path
    const truncatedContent = srtContent.slice(0, 20)
    const pathContent = LZString.compressToEncodedURIComponent(
      truncatedContent,
    ).replace(/[^a-zA-Z]/g, "")
    navigate(`/${pathContent}#${compressed}`)
  }

  const handleSrtImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const text = await file.text()
      const parsedSubtitles = parseSRT(text)
      setSubtitles(parsedSubtitles)
      updateSubtitlesUrl(text)
    }
  }

  const handleSrtPaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsedSubtitles = parseSRT(text)
      setSubtitles(parsedSubtitles)
      updateSubtitlesUrl(text)
    } catch (error) {
      console.error("Failed to read clipboard:", error)
    }
  }

  const timeToSeconds = (timeStr: string): number => {
    const [hours, minutes, seconds] = timeStr.split(":")
    const [secs, ms] = seconds.split(",")
    return (
      Number.parseInt(hours) * 3600 +
      Number.parseInt(minutes) * 60 +
      Number.parseInt(secs) +
      Number.parseInt(ms) / 1000
    )
  }

  const handleProgress = (state: { playedSeconds: number }) => {
    setCurrentTime(state.playedSeconds)
  }

  const getCurrentSubtitles = () => {
    return subtitles.filter(
      (subtitle) =>
        currentTime >= timeToSeconds(subtitle.startTime) &&
        currentTime <= timeToSeconds(subtitle.endTime),
    )
  }

  // Handle user scrolling
  const handleScroll = () => {
    setIsUserScrolling(true)

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current)
    }

    // Set new timeout
    const timeout = window.setTimeout(() => {
      setIsUserScrolling(false)
    }, 1000) // Reset after 1 second of no scrolling

    scrollTimeoutRef.current = timeout
  }

  // Auto-scroll to current subtitle
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const currentSubs = getCurrentSubtitles()
    if (
      currentSubs.length > 0 &&
      !isUserScrolling &&
      subtitlesContainerRef.current &&
      isPlaying
    ) {
      const currentSubElement = document.getElementById(
        `subtitle-${currentSubs[0].id}`,
      )
      if (currentSubElement) {
        currentSubElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        })
      }
    }
  }, [currentTime, isUserScrolling])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  const handleSeek = (timeStr: string) => {
    const seconds = timeToSeconds(timeStr)
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, "seconds")
      setIsPlaying(true)
    }
  }

  // Get current subtitle index
  const getCurrentSubtitleIndex = () => {
    return subtitles.findIndex(
      (subtitle) =>
        currentTime >= timeToSeconds(subtitle.startTime) &&
        currentTime <= timeToSeconds(subtitle.endTime),
    )
  }

  const handleSrtCopy = () => {
    const srtContent = subtitles.map((subtitle) => subtitle.text).join("\n")
    navigator.clipboard.writeText(srtContent)
  }

  // Handle keyboard shortcuts
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if Cmd (Meta) key is pressed
      if (e.metaKey) {
        const currentIndex = getCurrentSubtitleIndex()

        switch (e.key) {
          case "ArrowUp":
            e.preventDefault()
            if (currentIndex > 0) {
              handleSeek(subtitles[currentIndex - 1].startTime)
            }
            break
          case "ArrowDown":
            e.preventDefault()
            if (currentIndex < subtitles.length - 1) {
              handleSeek(subtitles[currentIndex + 1].startTime)
            }
            break
          case "r": {
            e.preventDefault()
            const currentSubs = getCurrentSubtitles()
            if (currentSubs.length > 0) {
              handleSeek(currentSubs[0].startTime)
            }
            break
          }
          case "Enter":
            e.preventDefault()
            setIsPlaying(!isPlaying)
            break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [subtitles, currentTime, isPlaying])

  return (
    <Container maxW="container.xl" py={8}>
      <Flex gap={6}>
        <Box w="600px" position="fixed" top="2rem">
          <VStack gap={4} align="stretch" h="80vh">
            <Box
              flex={1}
              borderWidth={1}
              borderRadius="lg"
              overflow="hidden"
              bg="gray.100"
            >
              {videoUrl ? (
                <ReactPlayer
                  ref={playerRef}
                  url={videoUrl}
                  width="100%"
                  height="100%"
                  controls
                  playing={isPlaying}
                  onProgress={handleProgress}
                  onPause={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                />
              ) : (
                <Flex h="100%" align="center" justify="center">
                  No video selected
                </Flex>
              )}
            </Box>
            <HStack className="notranslate" gap={6} justify="center">
              <Button
                as="label"
                cursor="pointer"
                size="md"
                variant="outline"
                borderWidth="1.5px"
                borderColor="gray.200"
                color="gray.700"
                bg="white"
                px={5}
                py={6}
                fontSize="14px"
                fontWeight="500"
                borderRadius="xl"
                flex={1}
                _hover={{
                  bg: "gray.50",
                  borderColor: "blue.400",
                  color: "blue.500",
                  shadow: "sm",
                }}
                _active={{
                  bg: "gray.100",
                  transform: "scale(0.98)",
                }}
                transition="all 0.15s ease"
              >
                <Icon as={FaVideo} boxSize="16px" mr={2} color="gray.500" />
                Import Video
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoImport}
                  style={{ display: "none" }}
                />
              </Button>
              <Button
                flex={1}
                as="label"
                cursor="pointer"
                size="md"
                variant="outline"
                borderWidth="1.5px"
                borderColor="gray.200"
                color="gray.700"
                bg="white"
                px={5}
                py={6}
                fontSize="14px"
                fontWeight="500"
                borderRadius="xl"
                _hover={{
                  bg: "gray.50",
                  borderColor: "teal.400",
                  color: "teal.500",
                  shadow: "sm",
                }}
                _active={{
                  bg: "gray.100",
                  transform: "scale(0.98)",
                }}
                transition="all 0.15s ease"
              >
                <Icon
                  as={FaFileUpload}
                  boxSize="16px"
                  mr={2}
                  color="gray.500"
                />
                Import Subtitles
                <input
                  type="file"
                  accept=".srt"
                  onChange={handleSrtImport}
                  style={{ display: "none" }}
                />
              </Button>
            </HStack>
            <HStack className="notranslate" gap={6} justify="center">
              <Button
                flex={1}
                size="md"
                variant="outline"
                borderWidth="1.5px"
                borderColor="gray.200"
                color="gray.700"
                bg="white"
                px={5}
                py={6}
                fontSize="14px"
                fontWeight="500"
                borderRadius="xl"
                onClick={handleSrtPaste}
                _hover={{
                  bg: "gray.50",
                  borderColor: "purple.400",
                  color: "purple.500",
                  shadow: "sm",
                }}
                _active={{
                  bg: "gray.100",
                  transform: "scale(0.98)",
                }}
                transition="all 0.15s ease"
              >
                <Icon as={FaPaste} boxSize="16px" mr={2} color="gray.500" />
                Paste Subtitles
              </Button>
              <Button
                flex={1}
                size="md"
                variant="outline"
                borderWidth="1.5px"
                borderColor="gray.200"
                color="gray.700"
                bg="white"
                px={5}
                py={6}
                fontSize="14px"
                fontWeight="500"
                borderRadius="xl"
                onClick={handleSrtCopy}
                _hover={{
                  bg: "gray.50",
                  borderColor: "orange.400",
                  color: "orange.500",
                  shadow: "sm",
                }}
                _active={{
                  bg: "gray.100",
                  transform: "scale(0.98)",
                }}
                transition="all 0.15s ease"
              >
                <Icon as={FaCopy} boxSize="16px" mr={2} color="gray.500" />
                Copy Subtitles
              </Button>
            </HStack>
          </VStack>
        </Box>

        <Box flex={1} ml="calc(600px + 1.5rem)">
          <Box
            ref={subtitlesContainerRef}
            borderWidth={1}
            borderRadius="lg"
            p={4}
            overflowY="auto"
            h="calc(100vh - 4rem)"
            onScroll={handleScroll}
            bg="white"
            shadow="sm"
          >
            {subtitles.map((subtitle) => {
              const isCurrentSubtitle =
                currentTime >= timeToSeconds(subtitle.startTime) &&
                currentTime <= timeToSeconds(subtitle.endTime)

              return (
                <Box
                  id={`subtitle-${subtitle.id}`}
                  key={subtitle.id}
                  mb={2}
                  p={3}
                  borderWidth={1}
                  borderRadius="md"
                  bg={isCurrentSubtitle ? "blue.50" : "white"}
                  borderColor={isCurrentSubtitle ? "blue.100" : "gray.200"}
                >
                  <Flex justify="space-between" align="center" mb={1.5}>
                    <Button
                      size="xs"
                      variant="ghost"
                      colorScheme={isCurrentSubtitle ? "blue" : "gray"}
                      onClick={() => handleSeek(subtitle.startTime)}
                      height="24px"
                      minWidth="60px"
                      padding="0 8px"
                      _hover={{
                        bg: "orange.100",
                        color: "orange.700",
                      }}
                    >
                      <Icon as={() => <span>⏱</span>} mr={1} fontSize="14px" />
                      播放
                    </Button>
                    <Box
                      fontSize="xs"
                      color={isCurrentSubtitle ? "blue.600" : "gray.500"}
                    >
                      {subtitle.startTime} → {subtitle.endTime}
                    </Box>
                  </Flex>
                  <Box
                    fontSize="md"
                    color={isCurrentSubtitle ? "blue.800" : "gray.700"}
                  >
                    {subtitle.text}
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Box>
      </Flex>
    </Container>
  )
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/*" element={<AppContent />} />
      </Routes>
    </Router>
  )
}

export default App
