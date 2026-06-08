export interface AvatarInfo {
  id: string;
  emoji: string;
  name: string;
  color: string;
}

export const AVATARS: AvatarInfo[] = [
  { id: 'avatar_1', emoji: '🐓', name: 'Le Coq Bleu', color: 'from-[#2b5bff] to-[#0a1b3d]' },
  { id: 'avatar_2', emoji: '🦁', name: "Le Lion d'Or", color: 'from-[#f6c648] to-[#5a4400]' },
  { id: 'avatar_3', emoji: '⚡', name: "L'Éclair Néon", color: 'from-[#9db4ff] to-[#2b5bff]' },
  { id: 'avatar_4', emoji: '🏆', name: 'Le Champion', color: 'from-[#ffd97a] to-[#c79b1e]' },
  { id: 'avatar_5', emoji: '⚽', name: 'Le Buteur', color: 'from-[#7da4ff] to-[#16284f]' },
  { id: 'avatar_6', emoji: '🔥', name: 'Le Fervent', color: 'from-[#ff8a87] to-[#8c0009]' },
];

export const getAvatarConfig = (avatarKey: string): AvatarInfo => {
  return AVATARS.find(a => a.id === avatarKey) || {
    id: 'unknown',
    emoji: '👤',
    name: 'Inconnu',
    color: 'from-white/10 to-white/5'
  };
};
