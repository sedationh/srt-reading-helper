import { Box, Button, Container, Flex, HStack, VStack } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";

interface Subtitle {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
}

function parseSRT(srtContent: string): Subtitle[] {
  const subtitles: Subtitle[] = [];
  const blocks = srtContent.trim().split('\n\n');

  blocks.forEach((block) => {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const id = parseInt(lines[0]);
      const [startTime, endTime] = lines[1].split(' --> ');
      const text = lines.slice(2).join('\n');
      
      subtitles.push({
        id,
        startTime,
        endTime,
        text,
      });
    }
  });

  return subtitles;
}

function App() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [scrollTimeout, setScrollTimeout] = useState<number | null>(null);
  const subtitlesContainerRef = useRef<HTMLDivElement>(null);

  const handleVideoImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
    }
  };

  const handleSrtImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const text = await file.text();
      const parsedSubtitles = parseSRT(text);
      setSubtitles(parsedSubtitles);
    }
  };

  const timeToSeconds = (timeStr: string): number => {
    const [hours, minutes, seconds] = timeStr.split(':');
    const [secs, ms] = seconds.split(',');
    return (
      parseInt(hours) * 3600 +
      parseInt(minutes) * 60 +
      parseInt(secs) +
      parseInt(ms) / 1000
    );
  };

  const handleProgress = (state: { playedSeconds: number }) => {
    setCurrentTime(state.playedSeconds);
  };

  const getCurrentSubtitles = () => {
    return subtitles.filter(
      (subtitle) =>
        currentTime >= timeToSeconds(subtitle.startTime) &&
        currentTime <= timeToSeconds(subtitle.endTime)
    );
  };

  // Handle user scrolling
  const handleScroll = () => {
    setIsUserScrolling(true);
    
    // Clear existing timeout
    if (scrollTimeout) {
      window.clearTimeout(scrollTimeout);
    }
    
    // Set new timeout
    const timeout = window.setTimeout(() => {
      setIsUserScrolling(false);
    }, 1000); // Reset after 1 second of no scrolling
    
    setScrollTimeout(timeout);
  };

  // Auto-scroll to current subtitle
  useEffect(() => {
    const currentSubs = getCurrentSubtitles();
    if (currentSubs.length > 0 && !isUserScrolling && subtitlesContainerRef.current) {
      const currentSubElement = document.getElementById(`subtitle-${currentSubs[0].id}`);
      if (currentSubElement) {
        currentSubElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentTime, isUserScrolling]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeout) {
        window.clearTimeout(scrollTimeout);
      }
    };
  }, [scrollTimeout]);

  return (
    <Container maxW="container.xl" py={8}>
      <Flex gap={6}>
        <Box w="600px" position="fixed" top="2rem">
          <VStack gap={4} align="stretch" h="80vh">
            <Box flex={1} borderWidth={1} borderRadius="lg" overflow="hidden" bg="gray.100">
              {videoUrl ? (
                <ReactPlayer
                  url={videoUrl}
                  width="100%"
                  height="100%"
                  controls
                  onProgress={handleProgress}
                />
              ) : (
                <Flex h="100%" align="center" justify="center">
                  No video selected
                </Flex>
              )}
            </Box>
            <HStack gap={4} justify="center">
              <Button as="label" cursor="pointer" colorPalette="brand">
                Import SRT
                <input
                  type="file"
                  accept=".srt"
                  onChange={handleSrtImport}
                  style={{ display: 'none' }}
                />
              </Button>
              <Button as="label" cursor="pointer" colorPalette="brand">
                Import Video
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoImport}
                  style={{ display: 'none' }}
                />
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
            css={{
              '&::-webkit-scrollbar': {
                width: '4px',
              },
              '&::-webkit-scrollbar-track': {
                width: '6px',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: 'var(--chakra-colors-gray-300)',
                borderRadius: '24px',
              },
            }}
            onScroll={handleScroll}
          >
            {subtitles.map((subtitle) => (
              <Box
                id={`subtitle-${subtitle.id}`}
                key={subtitle.id}
                mb={4}
                p={2}
                borderWidth={1}
                borderRadius="md"
                bg={
                  currentTime >= timeToSeconds(subtitle.startTime) &&
                  currentTime <= timeToSeconds(subtitle.endTime)
                    ? 'brand.100'
                    : 'transparent'
                }
                transition="background-color 0.3s"
              >
                <Box fontSize="sm" color="gray.500" mb={1}>
                  {subtitle.startTime} → {subtitle.endTime}
                </Box>
                {subtitle.text}
              </Box>
            ))}
          </Box>
        </Box>
      </Flex>
    </Container>
  );
}

export default App;
