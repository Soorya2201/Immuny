import { useRef, useState } from 'react';
import { scanLabelFiles } from '../utils/ocr';
import { reviewTextFor, summaryReviewText, type LabelScan, type ScanKind } from '../utils/labelScan';
import { CameraIcon } from './icons';

interface LabelScanButtonProps {
  label: string;
  kind: ScanKind;
  multiple?: boolean;
  /** text: what goes in this button's review box; summary: the AI label summary. */
  onExtracted: (text: string, summary: string, scan: LabelScan) => void;
}

// Reusable "scan a package photo" control. Amazon Nova Lite reads the label
// and returns the ingredients, allergens, nutrition and a summary, which the
// user checks before saving. Used for both the ingredients list (often several
// photos) and the nutrition facts panel, on the Health Logger and Food Tracker.
export default function LabelScanButton({ label, kind, multiple, onExtracted }: LabelScanButtonProps) {
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
      const scan = await scanLabelFiles(files);
      const text = scan ? reviewTextFor(kind, scan) : '';
      if (!scan || !text) {
        setError("Couldn't read that label. Try a clearer, well-lit photo of the label.");
      } else {
        onExtracted(text, summaryReviewText(scan), scan);
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
