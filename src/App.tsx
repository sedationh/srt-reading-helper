import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Icon,
  VStack,
} from "@chakra-ui/react"
import { useGetState } from "ahooks"
import { useEffect, useRef, useState } from "react"
import { FaFileUpload, FaVideo } from "react-icons/fa"
import ReactPlayer from "react-player"
import {
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom"
import useUrlState from "@ahooksjs/use-url-state"

// IndexedDB utility functions
const DB_NAME = "srt-reading-helper"
const STORE_NAME = "videos"
const SUBTITLES_STORE = "subtitles"
const DB_VERSION = 2

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME)
        store.createIndex("name", "name", { unique: true })
      }
      if (!db.objectStoreNames.contains(SUBTITLES_STORE)) {
        const store = db.createObjectStore(SUBTITLES_STORE)
        store.createIndex("videoKey", "videoKey", { unique: false })
      }
    }
  })
}

const saveVideo = async (file: File): Promise<string> => {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite")
    const store = transaction.objectStore(STORE_NAME)

    // 使用文件名作为唯一标识符
    const key = `${file.name}`
    const request = store.put(
      {
        file,
        name: file.name,
        lastModified: file.lastModified,
        type: file.type,
        size: file.size,
      },
      key,
    )

    request.onsuccess = () => {
      const url = URL.createObjectURL(file)
      resolve(url)
    }
    request.onerror = () => reject(request.error)
  })
}

const saveSubtitles = async (
  videoKey: string,
  subtitles: Subtitle[],
): Promise<void> => {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SUBTITLES_STORE, "readwrite")
    const store = transaction.objectStore(SUBTITLES_STORE)
    const request = store.put(
      {
        videoKey,
        subtitles,
        lastModified: Date.now(),
      },
      videoKey,
    )

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

const loadSubtitles = async (videoKey: string): Promise<Subtitle[] | null> => {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SUBTITLES_STORE, "readonly")
    const store = transaction.objectStore(SUBTITLES_STORE)
    const request = store.get(videoKey)

    request.onsuccess = () => {
      const data = request.result
      resolve(data?.subtitles || null)
    }
    request.onerror = () => reject(request.error)
  })
}

const loadVideo = async (key: string): Promise<string | null> => {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly")
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(key)

    request.onsuccess = () => {
      const data = request.result
      if (data?.file) {
        const url = URL.createObjectURL(data.file)
        resolve(url)
      } else {
        resolve(null)
      }
    }
    request.onerror = () => reject(request.error)
  })
}

const listVideos = async (): Promise<
  Array<{ key: string; name: string; size: number; type: string }>
> => {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly")
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      const videos = request.result.map((data) => ({
        key: `${data.name}`,
        name: data.name,
        size: data.size,
        type: data.type,
      }))
      resolve(videos)
    }
    request.onerror = () => reject(request.error)
  })
}

const deleteVideo = async (key: string): Promise<void> => {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, SUBTITLES_STORE], "readwrite")
    const videoStore = transaction.objectStore(STORE_NAME)
    const subtitlesStore = transaction.objectStore(SUBTITLES_STORE)

    // Delete video
    const videoRequest = videoStore.delete(key)
    // Delete associated subtitles
    const subtitlesRequest = subtitlesStore.delete(key)

    Promise.all([
      new Promise((res, rej) => {
        videoRequest.onsuccess = res
        videoRequest.onerror = rej
      }),
      new Promise((res, rej) => {
        subtitlesRequest.onsuccess = res
        subtitlesRequest.onerror = rej
      }),
    ])
      .then(() => resolve())
      .catch(reject)
  })
}

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
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [urlState, setUrlState] = useUrlState({
    currentVideoKey: "",
  })

  const [videos, setVideos] = useState<
    Array<{ key: string; name: string; size: number; type: string }>
  >([])
  const [subtitles, setSubtitles] = useState<Subtitle[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [isUserScrolling, setIsUserScrolling] = useGetState(false)
  const scrollTimeoutRef = useRef<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const subtitlesContainerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<ReactPlayer>(null)

  // Load videos list on mount
  useEffect(() => {
    listVideos()
      .then((videos) => {
        setVideos(videos)
      })
      .catch((error) => {
        console.error("Failed to load videos list:", error)
      })
  }, [])

  // Load video from IndexedDB on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (urlState.currentVideoKey) {
      loadVideo(urlState.currentVideoKey)
        .then((url) => {
          if (url) {
            setVideoUrl(url)
          }
        })
        .catch((error) => {
          console.error("Failed to load video from IndexedDB:", error)
        })

      // Load associated subtitles
      loadSubtitles(urlState.currentVideoKey)
        .then((subtitles) => {
          if (subtitles) {
            setSubtitles(subtitles)
          }
        })
        .catch((error) => {
          console.error("Failed to load subtitles from IndexedDB:", error)
        })
    }
  }, [urlState.currentVideoKey])

  const handleVideoImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const url = await saveVideo(file)
        setVideoUrl(url)
        // Refresh videos list
        const videos = await listVideos()
        setVideos(videos)
        // Set current video key
        const key = `${file.name}`
        setUrlState({ currentVideoKey: key })
      } catch (error) {
        console.error("Failed to save video:", error)
      }
    }
  }

  const handleVideoSelect = async (key: string) => {
    setUrlState({ currentVideoKey: key })
  }

  const handleVideoDelete = async (key: string) => {
    try {
      await deleteVideo(key)
      // Refresh videos list
      const videos = await listVideos()
      setVideos(videos)
      // Clear current video if deleted
      setUrlState({ currentVideoKey: "" })
      setVideoUrl(null)
      setSubtitles([])
      // Clear URL hash when deleting current video
    } catch (error) {
      console.error("Failed to delete video:", error)
    }
  }

  const handleSrtImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!urlState.currentVideoKey) {
      alert("Please select a video first")
      return
    }
    const file = e.target.files?.[0]
    if (file && urlState.currentVideoKey) {
      try {
        const text = await file.text()
        const parsedSubtitles = parseSRT(text)
        setSubtitles(parsedSubtitles)
        // Save subtitles to IndexedDB
        await saveSubtitles(urlState.currentVideoKey, parsedSubtitles)
      } catch (error) {
        console.error("Failed to import subtitles:", error)
      }
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
            {/* Video List */}
            <Box
              borderWidth={1}
              borderRadius="lg"
              p={4}
              maxH="200px"
              overflowY="auto"
            >
              <VStack align="stretch" gap={2}>
                {videos.map((video) => (
                  <Flex
                    key={video.key}
                    justify="space-between"
                    align="center"
                    p={2}
                    borderWidth={1}
                    borderRadius="md"
                    bg={
                      video.key === urlState.currentVideoKey
                        ? "blue.50"
                        : "white"
                    }
                    borderColor={
                      video.key === urlState.currentVideoKey
                        ? "blue.100"
                        : "gray.200"
                    }
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleVideoSelect(video.key)}
                      flex={1}
                      textAlign="left"
                      justifyContent="flex-start"
                      overflow="hidden"
                      textOverflow="ellipsis"
                      whiteSpace="nowrap"
                    >
                      {video.name}
                    </Button>
                    <Button
                      size="sm"
                      colorScheme="red"
                      variant="ghost"
                      onClick={() => handleVideoDelete(video.key)}
                    >
                      Delete
                    </Button>
                  </Flex>
                ))}
              </VStack>
            </Box>
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
