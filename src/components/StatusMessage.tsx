import { CheckCircleIcon, XCircleIcon } from './icons';

interface StatusMessageProps {
  type: 'success' | 'error';
  text: string;
  className?: string;
}

export default function StatusMessage({ type, text, className }: StatusMessageProps) {
  const Icon = type === 'success' ? CheckCircleIcon : XCircleIcon;
  return (
    <span className={`status-message status-message--${type}${className ? ` ${className}` : ''}`}>
      <Icon /> {text}
    </span>
  );
}
