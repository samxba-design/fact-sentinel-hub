import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2, X, Check } from 'lucide-react';

// Lazy-load pdfjs-dist to keep initial bundle small
async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    pages.push(pageText);
  }

  return pages.join('\n\n');
}

interface PdfUploaderProps {
  onTextExtracted: (text: string, fileName: string) => void;
  label?: string;
  disabled?: boolean;
}

const PdfUploader: React.FC<PdfUploaderProps> = ({
  onTextExtracted,
  label = 'Upload PDF',
  disabled = false,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.type !== 'application/pdf') {
        setError('Please upload a PDF file.');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError('File too large. Max 10MB.');
        return;
      }

      setIsProcessing(true);
      setError(null);
      setFileName(file.name);

      try {
        const text = await extractPdfText(file);
        onTextExtracted(text, file.name);
        setFileName(file.name);
      } catch (err: any) {
        setError(err.message || 'Failed to extract text from PDF.');
        setFileName(null);
      } finally {
        setIsProcessing(false);
        // Reset input so the same file can be re-uploaded
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [onTextExtracted]
  );

  const clear = () => {
    setFileName(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFile}
        className="hidden"
        disabled={disabled || isProcessing}
        id={`pdf-upload-${label.replace(/\s+/g, '-')}`}
      />

      {fileName ? (
        <div className="flex items-center gap-2 p-2 rounded bg-green-500/10 border border-green-500/20 text-xs">
          <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
          <span className="text-green-600 truncate flex-1">{fileName}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 hover:bg-red-500/10"
            onClick={clear}
            disabled={disabled}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <label
          htmlFor={`pdf-upload-${label.replace(/\s+/g, '-')}`}
          className={`flex items-center gap-2 p-2 rounded border border-dashed border-border text-xs text-muted-foreground cursor-pointer hover:border-primary/50 hover:text-primary transition-colors ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Extracting text...
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5" />
              {label}
            </>
          )}
        </label>
      )}

      {error && (
        <p className="text-[10px] text-destructive">{error}</p>
      )}
    </div>
  );
};

export default PdfUploader;