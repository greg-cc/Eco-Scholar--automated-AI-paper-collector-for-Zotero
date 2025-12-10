# EcoScholar AI

EcoScholar AI is an energy-efficient academic paper filter that uses semantic pre-filtering and adaptive AI verification to minimize computational overhead.

## Features

- **Semantic Pre-filtering**: Uses vector embeddings to filter papers before expensive LLM analysis.
- **Turbo Mode**: Adaptive sampling that skips full AI analysis if the "yield" (quality) of papers is high enough.
- **Fail Fast**: Automatically skips queries that produce low-quality results early in the process.
- **Zotero Integration**: Uploads qualified papers directly to your Zotero library.
- **Multi-Provider Support**: Works with Google Gemini (Cloud) or Ollama (Local).

## Setup & Running

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Configure API Key**
    Create a file named `.env` in the root directory (this file is ignored by git).
    Add your Google Gemini API key:
    ```env
    API_KEY=your_actual_api_key_here
    ```

3.  **Run Locally**
    ```bash
    npm run dev
    ```

## Configuration Defaults

The application is pre-configured with the thresholds from your dataset:
- **Vector Minimum**: 0.59
- **Composite Minimum**: 4.2
- **Probability Minimum**: 5 (Normalized from 50 on a 0-10 scale)
Developed with the openthinker model running in ollama.
You can check `App.tsx` to see the initialization queue matching your CSV queries (Lyme flavonoids, Carotenoids, etc.).
