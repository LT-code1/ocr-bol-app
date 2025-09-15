const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const OpenAI = require('openai');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// OCR and GPT processing function
async function processImageForBOLData(imagePath, ocrText) {
  try {
    // Read image as base64 for ChatGPT Vision API
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const prompt = `
    Analyze this image and the OCR text below to extract BOL (Bill of Lading) information.
    
    OCR Text:
    ${ocrText}
    
    Please extract and return ONLY:
    1. BOL Number (Bill of Lading number)
    2. Weight - Priority order (return the FIRST one you find):
       - Net Weight or Net (highest priority)
       - Shipping Weight (second priority)  
       - Any other weight including Gross Weight (lowest priority)
    3. Weight Type - specify which type was found (e.g., "Net Weight", "Shipping Weight", "Gross Weight", "Weight")
    
    Return the response in this exact JSON format:
    {
      "bolNumber": "extracted BOL number or null if not found",
      "weight": "extracted weight with units or null if not found",
      "weightType": "type of weight found (Net Weight, Shipping Weight, Gross Weight, etc.) or null"
    }
    
    If you cannot find either value, return null for that field.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 300,
      temperature: 0.1
    });

    const result = response.choices[0].message.content;
    
    try {
      // Strip markdown code blocks if present
      const cleanResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      console.log('cleaned result:', cleanResult);
      
      // Try to parse as JSON
      return JSON.parse(cleanResult);
    } catch (parseError) {
      // If JSON parsing fails, try to extract manually from the result
      console.log('JSON parsing failed, attempting manual extraction');
      
      // Try to extract from the ChatGPT response using regex
      const bolMatch = result.match(/"bolNumber":\s*"([^"]+)"/);
      const weightMatch = result.match(/"weight":\s*"([^"]+)"/);
      const weightTypeMatch = result.match(/"weightType":\s*"([^"]+)"/);
      
      return {
        bolNumber: bolMatch ? bolMatch[1] : null,
        weight: weightMatch ? weightMatch[1] : null,
        weightType: weightTypeMatch ? weightTypeMatch[1] : null
      };
    }

  } catch (error) {
    console.error('Error processing with ChatGPT:', error);
    throw error;
  }
}

// Main endpoint for processing images
app.post('/api/process-image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  const imagePath = req.file.path;
  
  try {
    console.log('Starting OCR processing...');
    
    // Perform OCR using Tesseract
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
      logger: m => console.log(m)
    });
    
    console.log('OCR completed. Tesseract Text length:', text.length);
    console.log('OCR completed. Tesseract Text:', text);
    
    // Process with ChatGPT
    console.log('Processing with ChatGPT...');
    const extractedData = await processImageForBOLData(imagePath, text);
    
    console.log('Extracted data:', extractedData);
    
    // Clean up uploaded file
    fs.unlinkSync(imagePath);
    
    // Return the extracted data
    res.json({
      success: true,
      data: {
        bolNumber: extractedData.bolNumber,
        weight: extractedData.weight,
        weightType: extractedData.weightType,
        rawOcrText: text.substring(0, 500)
      }
    });

  } catch (error) {
    console.error('Error processing image:', error);
    
    // Clean up uploaded file in case of error
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    res.status(500).json({ 
      error: 'Failed to process image', 
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  res.status(500).json({ error: error.message });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});