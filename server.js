// Load environment variables from .env file if it exists
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Get OpenAI API key from environment variables (loaded from .env file by dotenv)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : '';

console.log('🔍 Checking API key configuration...');
if (OPENAI_API_KEY) {
    console.log('✅ OpenAI API key loaded successfully');
    console.log(`   Key starts with: ${OPENAI_API_KEY.substring(0, 10)}...`);
} else {
    console.warn('⚠️  Warning: OPENAI_API_KEY not found in environment variables.');
    console.warn('   Please check your .env file exists and contains: OPENAI_API_KEY=your-key');
}

// Endpoint to extract caption information using AI
app.post('/api/extract-caption', async (req, res) => {
    try {
        if (!OPENAI_API_KEY) {
            return res.status(500).json({ 
                error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in Cursor secrets.' 
            });
        }

        const { captionText } = req.body;

        if (!captionText) {
            return res.status(400).json({ error: 'captionText is required' });
        }

        const prompt = `Extract the following information from this legal deposition transcript caption section. Return ONLY a valid JSON object with no additional text or explanation.

Requirements:
1. Jurisdiction: Extract the full court jurisdiction. For state courts, it will mention "county" (e.g., "Superior Court of the State of California, County of Sacramento"). For federal courts, it will mention "district" (e.g., "United States District Court for the Northern District of California"). The jurisdiction may be split across multiple lines. Return the complete jurisdiction text.

2. Case Name: Extract the case name which will be in the format "Party Name v. Party Name" or "Party Name vs. Party Name". The case name MUST contain "v." or "vs". Do NOT include jurisdiction text in the case name. If there are multiple case names, return them as an array.

3. Participants: Extract the names of all participants in the deposition. These are typically the parties involved in the case (plaintiffs and defendants). Look for names that appear in the case caption or are listed as parties. Return as an array of participant names.

4. Attorneys: Extract attorney information from the "Appearances" section (or similar sections like "Appearing", "Attorneys for", "Counsel for"). Attorneys are typically denoted by "Esq." or "Esquire" following their name. Extract the full name of each attorney (including "Esq." if present) and their affiliation (which party they represent, if mentioned). Return as an array of attorney objects with "name" and "affiliation" fields. If affiliation is not clear, use an empty string.

5. Deposition Date: Extract the date of the deposition. Look for phrases like "Deposition taken on", "Taken on", "Date:", or similar date indicators. The date may be in various formats (e.g., "September 18, 2023", "9/18/2023", "18-Sep-2023"). Return the date as a string in the format found, or in a standard format if possible.

Return the result in this exact JSON format:
{
  "jurisdiction": "full jurisdiction text or empty string if not found",
  "caseNames": ["case name 1", "case name 2"] or [] if not found,
  "participants": ["participant name 1", "participant name 2"] or [] if not found,
  "attorneys": [
    {"name": "Attorney Name, Esq.", "affiliation": "Plaintiff" or "Defendant" or ""},
    {"name": "Attorney Name, Esq.", "affiliation": "Plaintiff" or "Defendant" or ""}
  ] or [] if not found,
  "depositionDate": "date string or empty string if not found"
}

Caption text:
${captionText.substring(0, 3000)}`;

        // Use native fetch (Node.js 18+) - if using older Node, install node-fetch
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a legal document parser. Extract information accurately and return only valid JSON.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`OpenAI API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || '{}';
        
        // Parse JSON response
        let result;
        try {
            // Remove any markdown code blocks if present
            const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            result = JSON.parse(cleanedContent);
        } catch (parseError) {
            console.error('Failed to parse AI response:', content);
            throw new Error('AI returned invalid JSON format');
        }

        res.json({
            jurisdiction: result.jurisdiction || '',
            caseNames: Array.isArray(result.caseNames) ? result.caseNames : (result.caseNames ? [result.caseNames] : []),
            participants: Array.isArray(result.participants) ? result.participants : [],
            attorneys: Array.isArray(result.attorneys) ? result.attorneys : [],
            depositionDate: result.depositionDate || ''
        });

    } catch (error) {
        console.error('Error extracting caption:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to extract caption information' 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        hasApiKey: !!OPENAI_API_KEY
    });
});

// Restart endpoint (resets server state)
app.post('/api/restart', (req, res) => {
    // In a real application, you might want to restart the server
    // For now, we'll just return success
    res.json({ 
        status: 'restarted',
        message: 'Server state reset'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📝 Serving files from: ${path.resolve('.')}`);
    if (OPENAI_API_KEY) {
        console.log('✅ OpenAI API key configured');
    } else {
        console.log('⚠️  OpenAI API key not configured');
    }
});

