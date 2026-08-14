import { avatarFor } from '../utils/avatars';

/** Circular tinted disc holding a creature — the avatar as it appears in the UI. */
export default function PatientAvatar({ avatarKey, seed, size = 34 }: {
  avatarKey?: string | null;
  seed: string;
  size?: number;
}) {
  const { Icon, tint } = avatarFor(avatarKey, seed);
  return (
    <span
      className="patient-avatar"
      style={{ width: size, height: size, color: tint, background: `${tint}1F` }}
    >
      <Icon size={Math.round(size * 0.68)} />
    </span>
  );
}
