# xReCON

A modern Web UI for CS2 Server RCON management.

## Tech Stack

- Framework: SvelteKit
- Runtime: Bun (Javascript)
- Styling: Custom CSS

## Setup

1. Install dependencies:

    ```bash
    bun install
    ```

2. Run development server:

    ```bash
    bun run dev
    ```

3. Build for production:
    ```bash
    bun run build
    ```

## Features

- **Connection Manager**: Persists Host/Port/Passwords in Browser LocalStorage.
- **RCON Console**: Send arbitrary commands and view output.
- **Player Management**: View connected players and kick them.
- **Quick Controls**: Restart game, Warmup end, Pause/Unpause,...
- **Map Manager**: Save your favorite Workshop maps for quick changing in Browser LocalStorage.

## Usage

- Open the app in your browser.
- Enter your CS2 Server details in the top toolbar and click "Save".
- Use the controls on the left or the console on the right.
