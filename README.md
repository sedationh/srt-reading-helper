# SRT Reading Helper

A web application built with React and Vite to help users read and manage SRT subtitle files.

## Features

- Modern React (v19) with TypeScript
- Chakra UI for beautiful and accessible components
- Video player integration with react-player
- SRT subtitle file support
- Fast development with Vite
- Code quality ensured with Biome
- Keyboard shortcuts for efficient control
- Auto-scrolling subtitles with manual override
- Direct subtitle navigation with timestamp buttons

## Keyboard Shortcuts

All keyboard shortcuts require holding the `Cmd` (⌘) key:

| Shortcut | Action |
|----------|--------|
| `Cmd + ↑` | Jump to previous subtitle |
| `Cmd + ↓` | Jump to next subtitle |
| `Cmd + R` | Replay current subtitle |
| `Cmd + Enter` | Toggle play/pause |

## Interactive Features

- Click the "播放" button on any subtitle to jump to its timestamp
- Auto-scrolling: Current subtitle automatically centers in view during playback
- Manual scroll override: Auto-scroll pauses for 1 second when you manually scroll
- Video controls: Standard video player controls (play, pause, seek, volume)
- Import options: 
  - Import video files
  - Import SRT files
  - Paste SRT content from clipboard

## Getting Started

### Prerequisites

- Node.js (LTS version recommended)
- pnpm (v10.8.1 or later)

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm lint` - Run Biome linter
- `pnpm lint:fix` - Run Biome linter and fix issues

## Tech Stack

- React 19
- TypeScript
- Vite
- Chakra UI
- React Router
- React Player
- Biome (for linting and formatting)

## License

This project is private and not licensed for public use.