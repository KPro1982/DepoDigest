# Deposition Digest

A legal deposition transcript summarization tool that helps paralegals quickly extract and analyze caption information from deposition transcripts.

## Features

- Upload and process deposition transcripts (TXT, PDF, RTF formats)
- AI-powered extraction of:
  - Jurisdiction information
  - Case names
  - Case numbers
  - Witness/Deponent names
  - Attorney names
- Clean, modern web interface
- Secure API key management using Cursor secrets

## Setup

### Prerequisites

- Node.js 18+ (for native fetch support)
- OpenAI API key

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up your OpenAI API key:

   **Option A: Using Cursor Secrets (Recommended)**
   - Press `Ctrl + ,` (Windows/Linux) or `Cmd + ,` (Mac) to open Settings
   - Search for "secrets" in the settings search bar
   - Click "Add Secret" or the "+" button
   - Name: `OPENAI_API_KEY`
   - Value: Your OpenAI API key
   
   **Option B: Using Environment Variable**
   - Windows (PowerShell): `$env:OPENAI_API_KEY="your-api-key-here"`
   - Windows (CMD): `set OPENAI_API_KEY=your-api-key-here`
   - Mac/Linux: `export OPENAI_API_KEY="your-api-key-here"`
   
   Or create a `.env` file in the project root:
   ```
   OPENAI_API_KEY=your-api-key-here
   ```

3. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3000` by default.

### API Key Configuration

The server reads the `OPENAI_API_KEY` from environment variables. You can set it using:

1. **Cursor Secrets** (if available in your Cursor version)
2. **Environment variables** (set before running `npm start`)
3. **`.env` file** (create a `.env` file in the project root with `OPENAI_API_KEY=your-key`)

To verify the API key is configured, check the server console output when starting. You should see:
- ✅ OpenAI API key configured (if set)
- ⚠️ OpenAI API key not configured (if not set)

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Click "Start" on the landing page
3. Upload a deposition transcript file (TXT, PDF, or RTF)
4. The app will automatically extract caption information using AI
5. Review the extracted information displayed on the page

## File Structure

- `index.html` - Landing page
- `app.html` - Main application page with upload interface
- `styles.css` - Styling
- `server.js` - Backend server (handles AI extraction)
- `package.json` - Node.js dependencies
- `Transcripts/` - Folder for storing uploaded transcripts

## API Endpoints

- `POST /api/extract-caption` - Extract caption information from text
- `GET /api/health` - Health check endpoint

## Security

- API keys are stored securely using Cursor secrets
- API keys never exposed to the client-side code
- All OpenAI API calls are made server-side

## Customization

You can easily customize:
- Colors in the `:root` CSS variables in `styles.css`
- Content in the HTML files
- AI extraction prompts in `server.js`
