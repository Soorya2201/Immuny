// The aquatic-avatar registry: which creatures exist, what they're called, and
// which colour each is tinted. Kept apart from the drawings themselves so both
// files export one kind of thing and Fast Refresh stays happy.

import {
  ClownfishAvatar,
  CrabAvatar,
  DolphinAvatar,
  JellyfishAvatar,
  OctopusAvatar,
  PufferfishAvatar,
  SeahorseAvatar,
  StarfishAvatar,
  TurtleAvatar,
  WhaleAvatar,
  type AvatarProps,
} from '../components/AquaticAvatars';

export interface AvatarSpec {
  key: string;
  label: string;
  Icon: (props: AvatarProps) => React.ReactElement;
  tint: string;
}

// Tints are chosen to stay distinct from each other at chip size while sitting
// comfortably beside the app's teal.
export const AQUATIC_AVATARS: readonly AvatarSpec[] = [
  { key: 'octopus',    label: 'Octopus',     Icon: OctopusAvatar,    tint: '#8B6FD4' },
  { key: 'seahorse',   label: 'Seahorse',    Icon: SeahorseAvatar,   tint: '#E0913A' },
  { key: 'clownfish',  label: 'Clownfish',   Icon: ClownfishAvatar,  tint: '#F0733F' },
  { key: 'jellyfish',  label: 'Jellyfish',   Icon: JellyfishAvatar,  tint: '#D96BA8' },
  { key: 'turtle',     label: 'Sea turtle',  Icon: TurtleAvatar,     tint: '#3D9E6E' },
  { key: 'whale',      label: 'Whale',       Icon: WhaleAvatar,      tint: '#3E7FC1' },
  { key: 'starfish',   label: 'Starfish',    Icon: StarfishAvatar,   tint: '#D9A62C' },
  { key: 'crab',       label: 'Crab',        Icon: CrabAvatar,       tint: '#DC5B4E' },
  { key: 'dolphin',    label: 'Dolphin',     Icon: DolphinAvatar,    tint: '#2FA8C4' },
  { key: 'pufferfish', label: 'Pufferfish',  Icon: PufferfishAvatar, tint: '#5FA857' },
] as const;

export type AvatarKey = (typeof AQUATIC_AVATARS)[number]['key'];

/**
 * Resolve a stored avatar key to its spec, falling back to a creature derived
 * from `seed`. The fallback is a hash rather than a random pick so someone who
 * never chose an avatar still sees the same one on every device and every
 * reload — an avatar that changes is worse than no avatar at all.
 */
export function avatarFor(key: string | null | undefined, seed: string): AvatarSpec {
  const match = key ? AQUATIC_AVATARS.find(a => a.key === key) : undefined;
  if (match) return match;

  let hash = 5381;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) + hash + seed.charCodeAt(i)) >>> 0;
  return AQUATIC_AVATARS[hash % AQUATIC_AVATARS.length];
}
