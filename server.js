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

// Endpoint to identify the beginning of the examination section
app.post('/api/identify-examination', async (req, res) => {
    try {
        if (!OPENAI_API_KEY) {
            return res.status(500).json({ 
                error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in Cursor secrets.' 
            });
        }

        const { transcriptText } = req.body;

        if (!transcriptText) {
            return res.status(400).json({ error: 'transcriptText is required' });
        }

        const prompt = `Identify the beginning of the examination section in this deposition transcript. 

The examination section typically:
1. Is labeled "EXAMINATION" or "TESTIMONY" 
2. Comes after the "appearance" section where attorneys identify themselves
3. Begins with the first question asked by the noticing party (the attorney taking the deposition)

From the appearance section, extract:
- Date of the deposition (look for date formats like "SEPTEMBER 16, 2025" or "9/16/2025")
- Court reporter name (look for "THE REPORTER:" or "My name is [Name]" or "CSR No.")
- Attorney names and their roles (look for "MR.", "MS.", "MRS." followed by name and "represent" or "represents")
- Deponent name (the person being deposed, often mentioned in "represents Defendants and the deponent, [Name]")

Find the exact position where the examination/testimony begins. This is typically:
- After all attorney appearances are complete
- When the first question is asked (usually starts with "Q." or attorney name followed by a question)
- Or when you see a clear "EXAMINATION" or "TESTIMONY" header

Return ONLY a valid JSON object with no additional text or explanation:
{
  "examinationStartIndex": number (character position where examination begins, or -1 if not found),
  "examinationStartLine": number (line number where examination begins, or -1 if not found),
  "examinationStartText": "first few words of the examination section",
  "depositionDate": "date string or empty string",
  "courtReporter": "reporter name or empty string",
  "attorneys": [
    {"name": "Attorney Name", "role": "Plaintiff" or "Defendant" or "Noticing Party" or "Taking Party" or ""}
  ] or [],
  "deponent": "deponent name or empty string",
  "appearanceSection": "the full appearance section text or empty string"
}

Transcript text (first 5000 characters):
${transcriptText.substring(0, 5000)}`;

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
                        content: 'You are a legal document parser. Identify the examination section start accurately and return only valid JSON.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 800
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

        // Also do a fallback regex search for examination section markers
        const lines = transcriptText.split('\n');
        let examinationLineIndex = -1;
        let examinationCharIndex = -1;
        
        // Look for common examination section markers
        const examinationMarkers = [
            /^EXAMINATION\s*(?:BY|OF|$)/i,
            /^TESTIMONY\s*(?:BY|OF|$)/i,
            /^DIRECT\s+EXAMINATION/i,
            /^CROSS\s+EXAMINATION/i,
            /^EXAMINATION\s+BY\s+[A-Z]/i
        ];

        // Also look for Q&A patterns that indicate start of questioning
        const questionPatterns = [
            /^Q\.\s+/i,
            /^Q\s+/i,
            /^BY\s+[A-Z][A-Za-z\s]+:\s*[A-Z]/i  // "BY MR. SMITH: Question text"
        ];

        // Search through lines
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check for examination markers
            for (const marker of examinationMarkers) {
                if (marker.test(line)) {
                    examinationLineIndex = i;
                    // Calculate character index
                    let charCount = 0;
                    for (let j = 0; j < i; j++) {
                        charCount += lines[j].length + 1; // +1 for newline
                    }
                    examinationCharIndex = charCount;
                    break;
                }
            }
            
            if (examinationLineIndex !== -1) break;
            
            // Check for question patterns (but only after we've seen appearance section)
            // Look for patterns that suggest we're past the appearance section
            if (i > 10) { // Skip first 10 lines (likely caption/appearance)
                for (const pattern of questionPatterns) {
                    if (pattern.test(line) && line.length > 20) { // Must be a substantial question
                        examinationLineIndex = i;
                        let charCount = 0;
                        for (let j = 0; j < i; j++) {
                            charCount += lines[j].length + 1;
                        }
                        examinationCharIndex = charCount;
                        break;
                    }
                }
            }
            
            if (examinationLineIndex !== -1) break;
        }

        // Determine examination start position
        const examStartIndex = result.examinationStartIndex !== undefined && result.examinationStartIndex >= 0 
            ? result.examinationStartIndex 
            : examinationCharIndex;
        const examStartLine = result.examinationStartLine !== undefined && result.examinationStartLine >= 0
            ? result.examinationStartLine
            : examinationLineIndex >= 0 ? examinationLineIndex + 1 : -1;

        // Extract first few pages of examination section for detailed analysis
        let examinationSectionText = '';
        let questioningAttorney = '';
        let defendingAttorney = '';
        let examinationAttorneys = [];

        if (examStartIndex >= 0 && examStartIndex < transcriptText.length) {
            // Extract first ~8000 characters of examination section (roughly 3-5 pages)
            examinationSectionText = transcriptText.substring(examStartIndex, Math.min(examStartIndex + 8000, transcriptText.length));

            // Use AI to analyze the examination section for attorney roles
            try {
                const analysisPrompt = `Analyze the first few pages of this deposition examination section to identify attorney roles and extract information.

From the examination section text, identify:

1. Attorney Names: Extract all attorney names that appear in the examination. Look for patterns like:
   - "MR. [NAME]:" or "MS. [NAME]:" or "MRS. [NAME]:"
   - "BY MR. [NAME]:"
   - Attorney names mentioned in questions or objections

2. Questioning Attorney (Noticing Party/Taking Party): Identify which attorney is asking the questions. This attorney:
   - Asks questions (typically marked with "Q." or their name followed by a question)
   - Is the one conducting the examination
   - May be referred to as the "noticing party" or "taking party"
   - Usually asks the first question

3. Defending Attorney: Identify which attorney is defending or making objections. This attorney:
   - Makes objections (look for "OBJECTION" followed by attorney name or "MR./MS. [NAME]: Objection")
   - May say "I object" or make statements defending the deponent
   - Represents the deponent or the opposing party
   - May say things like "I'll object" or "Objection, [reason]"

4. Deposition Date: If a date appears in the examination section (not just the appearance section), extract it.

Return ONLY a valid JSON object with no additional text or explanation:
{
  "questioningAttorney": "full name of attorney asking questions or empty string",
  "defendingAttorney": "full name of attorney making objections/defending or empty string",
  "examinationAttorneys": [
    {"name": "Attorney Name", "role": "Questioning" or "Defending" or "Unknown"}
  ] or [],
  "depositionDate": "date from examination section or empty string if not found"
}

Examination section text:
${examinationSectionText}`;

                const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
                                content: 'You are a legal document parser. Analyze the examination section to identify attorney roles accurately and return only valid JSON.'
                            },
                            {
                                role: 'user',
                                content: analysisPrompt
                            }
                        ],
                        temperature: 0.1,
                        max_tokens: 600
                    })
                });

                if (analysisResponse.ok) {
                    const analysisData = await analysisResponse.json();
                    const analysisContent = analysisData.choices[0]?.message?.content || '{}';
                    
                    try {
                        const cleanedAnalysis = analysisContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                        const analysisResult = JSON.parse(cleanedAnalysis);
                        
                        questioningAttorney = analysisResult.questioningAttorney || '';
                        defendingAttorney = analysisResult.defendingAttorney || '';
                        examinationAttorneys = Array.isArray(analysisResult.examinationAttorneys) ? analysisResult.examinationAttorneys : [];
                        
                        // Use examination date if found, otherwise keep the one from appearance section
                        if (analysisResult.depositionDate && !result.depositionDate) {
                            result.depositionDate = analysisResult.depositionDate;
                        }
                    } catch (parseError) {
                        console.warn('Failed to parse examination analysis response:', parseError);
                    }
                }
            } catch (analysisError) {
                console.warn('Error analyzing examination section:', analysisError);
                // Continue without examination analysis
            }
        }

        // Use AI result if available, otherwise use regex result
        const finalResult = {
            examinationStartIndex: examStartIndex,
            examinationStartLine: examStartLine,
            examinationStartText: result.examinationStartText || (examinationLineIndex >= 0 ? lines[examinationLineIndex].substring(0, 100) : ''),
            depositionDate: result.depositionDate || '',
            courtReporter: result.courtReporter || '',
            attorneys: Array.isArray(result.attorneys) ? result.attorneys : [],
            deponent: result.deponent || '',
            appearanceSection: result.appearanceSection || '',
            questioningAttorney: questioningAttorney,
            defendingAttorney: defendingAttorney,
            examinationAttorneys: examinationAttorneys
        };

        res.json(finalResult);

    } catch (error) {
        console.error('Error identifying examination section:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to identify examination section' 
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

