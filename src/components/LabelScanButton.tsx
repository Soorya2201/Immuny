import { useRef, useState } from 'react';
import { extractTextFromFiles } from '../utils/ocr';
import { CameraIcon } from './icons';

interface LabelScanButtonProps {
  label: string;
  multiple?: boolean;
  onExtracted: (text: string) => void;
}

// Reusable "scan a package photo and OCR it" control — used for both the
// ingredients list (usually several photos for a multi-panel package) and
// the nutrition facts panel (one photo) across the Health Logger and Food
// Tracker pages.
export default function LabelScanButton({ label, multiple, onExtracted }: LabelScanButtonProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setScanning(true);
    setError(null);
    try {
      const text = await extractTextFromFiles(files);
      if (!text) {
        setError("Couldn't read any text from that photo — try a clearer, well-lit shot.");
      } else {
        onExtracted(text);
      }
    } catch (err) {
      console.error('Label scan failed:', err);
      setError('Scan failed. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="label-scan-control">
      <button
        type="button"
        className="label-scan-btn"
        onClick={() => inputRef.current?.click()}
        disabled={scanning}
      >
        <CameraIcon /> {scanning ? 'Reading label…' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={e => void handleChange(e)}
        style={{ display: 'none' }}
      />
      {error && <p className="label-scan-error">{error}</p>}
    </div>
  );
}
