import useUrlState from "@ahooksjs/use-url-state"
import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Icon,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useDebounceFn, useGetState, useLocalStorageState } from "ahooks"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  FaFileUpload,
  FaKeyboard,
  FaVideo,
  FaVolumeMute,
  FaVolumeUp,
} from "react-icons/fa"
import { MdEdit } from "react-icons/md"
import ReactPlayer from "react-player"
import { Route, BrowserRouter as Router, Routes } from "react-router-dom"
import { EditSubtitleDialog } from "./components/EditSubtitleDialog"

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
    const transaction = db.transaction(
      [STORE_NAME, SUBTITLES_STORE],
      "readwrite",
    )
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

const DEFAULT_LEFT_PANEL_WIDTH = 600

function AppContent() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [urlState, setUrlState] = useUrlState({
    currentVideoKey: "",
  })
  const [selectedSubtitle, setSelectedSubtitle] = useState<Subtitle | null>(
    null,
  )
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isControlModeEnabled, setIsControlModeEnabled] = useLocalStorageState(
    "isControlModeEnabled",
    {
      defaultValue: true,
    },
  )
  const [isSubtitlesVisible, setIsSubtitlesVisible] = useState(true)
  const [leftPanelWidth, setLeftPanelWidth] = useLocalStorageState(
    "leftPanelWidth",
    {
      defaultValue: DEFAULT_LEFT_PANEL_WIDTH,
    },
  )
  const widthInputRef = useRef<HTMLInputElement>(null)

  const [videos, setVideos] = useState<
    Array<{ key: string; name: string; size: number; type: string }>
  >([])
  const [subtitles, setSubtitles] = useState<Subtitle[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [isUserScrolling, setIsUserScrolling] = useGetState(false)
  const scrollTimeoutRef = useRef<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useLocalStorageState("volume", {
    defaultValue: 0.8,
  })
  const [isMuted, setIsMuted] = useLocalStorageState("isMuted", {
    defaultValue: false,
  })
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

  const secondsToTimeStr = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`
  }

  const handleProgress = (state: { playedSeconds: number }) => {
    setCurrentTime(state.playedSeconds)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const getCurrentSubtitles = useCallback(() => {
    return subtitles.filter(
      (subtitle) =>
        currentTime >= timeToSeconds(subtitle.startTime) &&
        currentTime <= timeToSeconds(subtitle.endTime),
    )
  }, [subtitles, currentTime])

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

  const handleSeek = useCallback((timeStr: string) => {
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
    const seconds = timeToSeconds(timeStr)
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, "seconds")
      setIsPlaying(true)
    }
  }, [])

  // Get current subtitle index
  const getCurrentSubtitleIndex = useCallback(() => {
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

    // First try to find exact match (current time within subtitle range)
    const exactIndex = subtitles.findIndex(
      (subtitle) =>
        currentTime >= timeToSeconds(subtitle.startTime) &&
        currentTime <= timeToSeconds(subtitle.endTime),
    )

    if (exactIndex !== -1) {
      return exactIndex
    }

    // If no exact match, find the last subtitle that has started (previous subtitle)
    // Search backwards to find the most recent subtitle that has started
    for (let i = subtitles.length - 1; i >= 0; i--) {
      if (timeToSeconds(subtitles[i].startTime) <= currentTime) {
        return i
      }
    }

    return -1
  }, [subtitles, currentTime])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isControlModeEnabled || isEditDialogOpen) return

      const currentIndex = getCurrentSubtitleIndex()

      switch (e.key.toLowerCase()) {
        case "a":
          e.preventDefault()
          if (currentIndex > 0) {
            handleSeek(subtitles[currentIndex - 1].startTime)
          }
          break
        case "d":
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
        case "s":
          e.preventDefault()
          setIsPlaying(!isPlaying)
          break
        case "h":
          e.preventDefault()
          setIsSubtitlesVisible(!isSubtitlesVisible)
          break
        case "m":
          e.preventDefault()
          handleMuteToggle()
          break
        case "arrowup":
          e.preventDefault()
          handleVolumeChange(Math.min(1, volume + 0.1))
          break
        case "arrowdown":
          e.preventDefault()
          handleVolumeChange(Math.max(0, volume - 0.1))
          break
        case "e":
          e.preventDefault()
          handleEditCurrentSubtitle()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    subtitles,
    isPlaying,
    isControlModeEnabled,
    getCurrentSubtitleIndex,
    handleSeek,
    getCurrentSubtitles,
    isSubtitlesVisible,
    isEditDialogOpen,
    volume,
  ])

  const handleEditSubtitle = (subtitle: Subtitle) => {
    setSelectedSubtitle(subtitle)
    setIsEditDialogOpen(true)
  }

  const handleEditCurrentSubtitle = () => {
    // 暂停视频播放
    setIsPlaying(false)

    const currentSubs = getCurrentSubtitles()
    if (currentSubs.length > 0) {
      // 编辑当前字幕，将起始时间设置为当前时间
      const currentSubtitle = {
        ...currentSubs[0],
        startTime: secondsToTimeStr(currentTime),
      }
      setSelectedSubtitle(currentSubtitle)
      setIsEditDialogOpen(true)
    } else {
      // 如果没有当前字幕，寻找最近的字幕进行编辑
      const currentIndex = getCurrentSubtitleIndex()
      if (currentIndex !== -1 && currentIndex < subtitles.length) {
        const subtitle = {
          ...subtitles[currentIndex],
          startTime: secondsToTimeStr(currentTime),
        }
        setSelectedSubtitle(subtitle)
        setIsEditDialogOpen(true)
      }
    }
  }

  const handleSaveSubtitle = async (editedSubtitle: Subtitle) => {
    if (!urlState.currentVideoKey) return

    const updatedSubtitles = subtitles.map((sub) =>
      sub.id === editedSubtitle.id ? editedSubtitle : sub,
    )
    setSubtitles(updatedSubtitles)

    // Save updated subtitles to IndexedDB
    try {
      await saveSubtitles(urlState.currentVideoKey, updatedSubtitles)
    } catch (error) {
      console.error("Failed to save edited subtitles:", error)
    }
  }

  const handleConfirmWidth = () => {
    if (widthInputRef.current) {
      setLeftPanelWidth(Number(widthInputRef.current.value))
    }
  }

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume)
    if (newVolume === 0) {
      setIsMuted(true)
    } else if (isMuted) {
      setIsMuted(false)
    }
  }

  const handleMuteToggle = () => {
    setIsMuted(!isMuted)
  }

  const { run: handleVolumeChangeDebounced } = useDebounceFn(
    handleVolumeChange,
    {
      wait: 100,
    },
  )

  return (
    <Container maxW="container.xl" py={4}>
      <Flex gap={4}>
        <Box
          className="notranslate"
          w={`${leftPanelWidth}px`}
          position="fixed"
          overflowY="auto"
          h="calc(100vh - 4rem)"
          paddingRight={4}
        >
          <VStack gap={4} align="stretch">
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
                  playing={isPlaying}
                  volume={isMuted ? 0 : volume}
                  controls={!isControlModeEnabled}
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
                Import Media
                <input
                  type="file"
                  accept="video/*,audio/*"
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
            {/* Control Mode Button */}
            <Box
              borderWidth={1}
              borderRadius="lg"
              p={4}
              bg={isControlModeEnabled ? "green.50" : "gray.50"}
              borderColor={isControlModeEnabled ? "green.200" : "gray.200"}
            >
              <VStack gap={2}>
                <Button
                  size="md"
                  variant={isControlModeEnabled ? "solid" : "outline"}
                  colorScheme={isControlModeEnabled ? "green" : "gray"}
                  onClick={() => setIsControlModeEnabled(!isControlModeEnabled)}
                  w="full"
                >
                  <Icon as={FaKeyboard} mr={2} />
                  {isControlModeEnabled ? "控制模式已开启" : "开启控制模式"}
                </Button>
                {isControlModeEnabled && (
                  <Box textAlign="center" fontSize="sm" color="gray.600">
                    <Text fontWeight="medium" mb={1}>
                      快捷键：
                    </Text>
                    <HStack justify="center" gap={4} wrap="wrap">
                      <Badge colorScheme="blue">A - 上一句</Badge>
                      <Badge colorScheme="blue">D - 下一句</Badge>
                      <Badge colorScheme="blue">R - 重复</Badge>
                      <Badge colorScheme="blue">S - 暂停/播放</Badge>
                      <Badge colorScheme="blue">H - 隐藏/显示字幕</Badge>
                      <Badge colorScheme="blue">E - 编辑当前字幕</Badge>
                      <Badge colorScheme="blue">M - 静音/取消静音</Badge>
                      <Badge colorScheme="blue">↑ - 音量+</Badge>
                      <Badge colorScheme="blue">↓ - 音量-</Badge>
                    </HStack>
                  </Box>
                )}
              </VStack>
            </Box>

            {/* Volume Control */}
            {isControlModeEnabled && (
              <Box
                borderWidth={1}
                borderRadius="lg"
                p={4}
                bg={isMuted ? "red.50" : "purple.50"}
                borderColor={isMuted ? "red.200" : "purple.200"}
              >
                <VStack gap={3}>
                  <HStack justify="space-between" w="full">
                    <Text fontSize="sm" fontWeight="medium" color="gray.700">
                      音量控制
                    </Text>
                    <Button
                      size="sm"
                      variant="ghost"
                      colorScheme={isMuted ? "red" : "purple"}
                      onClick={handleMuteToggle}
                      px={2}
                    >
                      <Icon
                        as={isMuted ? FaVolumeMute : FaVolumeUp}
                        boxSize="16px"
                      />
                    </Button>
                  </HStack>

                  <Box w="full">
                    <HStack gap={2} align="center">
                      <Icon as={FaVolumeMute} boxSize="12px" color="gray.500" />
                      <Box flex={1} position="relative">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={isMuted ? 0 : undefined}
                          onChange={(e) =>
                            handleVolumeChangeDebounced(Number(e.target.value))
                          }
                          style={{
                            width: "100%",
                            height: "6px",
                            borderRadius: "3px",
                            background: `linear-gradient(to right, #805ad5 0%, #805ad5 ${(isMuted ? 0 : volume) * 100}%, #e2e8f0 ${(isMuted ? 0 : volume) * 100}%, #e2e8f0 100%)`,
                            outline: "none",
                            cursor: "pointer",
                          }}
                        />
                      </Box>
                      <Icon as={FaVolumeUp} boxSize="12px" color="gray.500" />
                    </HStack>
                  </Box>

                  <Box textAlign="center" fontSize="sm" color="gray.600">
                    <Text fontWeight="medium" mb={1}>
                      音量状态：
                    </Text>
                    <Badge colorScheme={isMuted ? "red" : "purple"}>
                      {isMuted ? "已静音" : `${Math.round(volume * 100)}%`}
                    </Badge>
                  </Box>
                </VStack>
              </Box>
            )}

            {/* Width Input */}
            <Box>
              <Text fontSize="sm" color="gray.600" mb={1}>
                左侧面板宽度
              </Text>
              <HStack>
                <Input
                  ref={widthInputRef}
                  min={300}
                  max={800}
                  defaultValue={DEFAULT_LEFT_PANEL_WIDTH}
                  size="sm"
                  w="100px"
                />
                <Text fontSize="sm" color="gray.500">
                  px
                </Text>
                <Button
                  size="sm"
                  colorScheme="blue"
                  onClick={handleConfirmWidth}
                >
                  确认
                </Button>
              </HStack>
              <Box mt={4}>
                <Text fontSize="sm" color="gray.600" mb={1}>
                  快速选择宽度
                </Text>
                <HStack>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setLeftPanelWidth(500)
                      if (widthInputRef.current) {
                        widthInputRef.current.value = "500"
                      }
                    }}
                  >
                    500px
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setLeftPanelWidth(600)
                      if (widthInputRef.current) {
                        widthInputRef.current.value = "600"
                      }
                    }}
                  >
                    600px
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setLeftPanelWidth(700)
                      if (widthInputRef.current) {
                        widthInputRef.current.value = "700"
                      }
                    }}
                  >
                    700px
                  </Button>
                </HStack>
              </Box>
            </Box>
            {/* Subtitle Visibility Toggle */}
            <Box
              borderWidth={1}
              borderRadius="lg"
              p={4}
              bg={isSubtitlesVisible ? "blue.50" : "gray.50"}
              borderColor={isSubtitlesVisible ? "blue.200" : "gray.200"}
              className="mt-2"
            >
              <VStack gap={2}>
                <Button
                  size="md"
                  variant={isSubtitlesVisible ? "solid" : "outline"}
                  colorScheme={isSubtitlesVisible ? "blue" : "gray"}
                  onClick={() => setIsSubtitlesVisible(!isSubtitlesVisible)}
                  w="full"
                >
                  <Icon as={() => <span>👁</span>} mr={2} />
                  {isSubtitlesVisible ? "隐藏字幕" : "显示字幕"}
                </Button>
                <Box textAlign="center" fontSize="sm" color="gray.600">
                  <Text fontWeight="medium" mb={1}>
                    字幕状态：
                  </Text>
                  <Badge colorScheme={isSubtitlesVisible ? "blue" : "gray"}>
                    {isSubtitlesVisible ? "显示中" : "已隐藏"}
                  </Badge>
                </Box>
              </VStack>
            </Box>
          </VStack>
        </Box>

        <Box flex={1} ml={`${leftPanelWidth + 24}px`} position="relative">
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
            position="relative"
            zIndex={isSubtitlesVisible ? 1 : -1}
            opacity={isSubtitlesVisible ? 1 : 0}
            transition="opacity 0.3s ease"
            pointerEvents={isSubtitlesVisible ? "auto" : "none"}
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
                    <HStack gap={2}>
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
                        <Icon
                          as={() => <span>⏱</span>}
                          mr={1}
                          fontSize="14px"
                        />
                        播放
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme={isCurrentSubtitle ? "blue" : "gray"}
                        onClick={() => handleEditSubtitle(subtitle)}
                        height="24px"
                        minWidth="60px"
                        padding="0 8px"
                        _hover={{
                          bg: "teal.100",
                          color: "teal.700",
                        }}
                      >
                        <Icon as={MdEdit} mr={1} fontSize="14px" />
                        编辑
                      </Button>
                    </HStack>
                    <Box
                      fontSize="xs"
                      color={isCurrentSubtitle ? "blue.600" : "gray.500"}
                    >
                      {subtitle.startTime} → {subtitle.endTime}
                    </Box>
                  </Flex>
                  <Box
                    className="notranslate"
                    fontSize="md"
                    color={isCurrentSubtitle ? "blue.800" : "gray.700"}
                  >
                    {subtitle.text}
                  </Box>
                </Box>
              )
            })}
          </Box>
          {/* Hidden state overlay */}
          <Box
            position="absolute"
            top="0"
            left="0"
            right="0"
            bottom="0"
            borderWidth={1}
            borderRadius="lg"
            p={4}
            h="calc(100vh - 4rem)"
            bg="gray.50"
            display="flex"
            alignItems="center"
            justifyContent="center"
            zIndex={isSubtitlesVisible ? -1 : 1}
            opacity={isSubtitlesVisible ? 0 : 1}
            transition="opacity 0.3s ease"
            pointerEvents={isSubtitlesVisible ? "none" : "auto"}
          >
            <VStack gap={2}>
              <Icon as={() => <span>👁</span>} boxSize="8" color="gray.400" />
              <Text color="gray.500" fontSize="lg">
                字幕已隐藏
              </Text>
              <Text color="gray.400" fontSize="sm">
                按 H 键或点击按钮显示字幕
              </Text>
            </VStack>
          </Box>
        </Box>
      </Flex>
      <EditSubtitleDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        subtitle={
          selectedSubtitle ?? {
            id: 0,
            startTime: "",
            endTime: "",
            text: "",
          }
        }
        onSave={handleSaveSubtitle}
      />
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
