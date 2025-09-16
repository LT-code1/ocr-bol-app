import React, { useState, useCallback } from 'react';

interface ProcessedData {
  bolNumber: string | null;
  weight: string | null;
  weightType: string | null;
  rawOcrText: string;
}

interface ApiResponse {
  success: boolean;
  data: ProcessedData;
  error?: string;
}

const App: React.FC = () => {
  const [bolNumber, setBolNumber] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [weightType, setWeightType] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        processImage(file);
      } else {
        setMessage('Please drop an image file (PNG, JPG, etc.)');
      }
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  };

  const processImage = async (file: File): Promise<void> => {
    setIsProcessing(true);
    setMessage('Processing image...');
    setBolNumber('');
    setWeight('');

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setUploadedImage(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch(`${BACKEND_URL}/api/process-image`, {
        method: 'POST',
        body: formData,
      });

      const result: ApiResponse = await response.json();

      if (result.success) {
        setBolNumber(result.data.bolNumber || '');
        setWeight(result.data.weight || '');
        setWeightType(result.data.weightType || '');
        setMessage('Image processed successfully!');
        
        if (!result.data.bolNumber && !result.data.weight) {
          setMessage('No BOL number or weight found in the image. Please try a clearer image.');
        }
      } else {
        setMessage(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error:', error);
      setMessage(`Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearData = (): void => {
    setBolNumber('');
    setWeight('');
    setWeightType('');
    setMessage('');
    setUploadedImage(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            BOL OCR Processor
          </h1>
          
          <p className="text-gray-600 mb-6 text-center">
            Drop an image of a Bill of Lading to extract BOL number and weight information
          </p>

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 transition-all duration-200 ${
              dragOver 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            } ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600">Processing image...</p>
                <p className="text-sm text-gray-500 mt-2">This may take 10-30 seconds</p>
              </div>
            ) : (
              <div>
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-lg text-gray-600 mb-2">
                  Drop your BOL image here
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  or
                </p>
                <label className="bg-blue-600 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors duration-200">
                  Choose File
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileInput}
                    className="hidden"
                    disabled={isProcessing}
                  />
                </label>
                <p className="text-xs text-gray-500 mt-2">
                  Supports PNG, JPG, JPEG, GIF, BMP
                </p>
              </div>
            )}
          </div>

          {uploadedImage && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">Uploaded Image:</h3>
              <div className="border rounded-lg p-4 bg-gray-50">
                <img 
                  src={uploadedImage} 
                  alt="Uploaded BOL" 
                  className="max-w-full max-h-64 mx-auto rounded"
                />
              </div>
            </div>
          )}

          {message && (
            <div className={`p-4 rounded-lg mb-6 ${
              message.includes('Error') || message.includes('Failed')
                ? 'bg-red-50 text-red-700 border border-red-200'
                : message.includes('successfully')
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {message}
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                BOL Number
              </label>
              <input
                type="text"
                value={bolNumber}
                onChange={(e) => setBolNumber(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                placeholder="BOL number will appear here..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Weight {weightType && <span className="text-gray-500">({weightType})</span>}
              </label>
              <input
                type="text"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                placeholder="Weight will appear here..."
              />
            </div>

            {(bolNumber || weight || uploadedImage) && (
              <button
                onClick={clearData}
                className="w-full bg-gray-600 text-white py-3 px-4 rounded-lg hover:bg-gray-700 transition-colors duration-200 font-medium"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="mt-8 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-2">Tips for best results:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Use high-quality, well-lit images</li>
              <li>• Ensure text is clearly visible and not blurry</li>
              <li>• BOL documents work best when the entire document is visible</li>
              <li>• Processing typically takes 10-30 seconds</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;