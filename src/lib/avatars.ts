export interface AvatarInfo {
  id: string;
  emoji: string;
  name: string;
  color: string;
  imagePath?: string;
}

export const AVATARS: AvatarInfo[] = [
  { id: 'avatar_zidane', emoji: '🇫🇷', name: 'Zinédine Zidane', color: 'from-[#1e3b8a] to-[#0f172a]', imagePath: '/Avatar/Zidane_hugging_soccer_ball_202606082220.webp' },
  { id: 'avatar_maradona', emoji: '🇦🇷', name: 'Diego Maradona', color: 'from-[#0284c7] to-[#0f172a]', imagePath: '/Avatar/Maradona_wearing_Argentina_jersey_202606082220.webp' },
  { id: 'avatar_pele', emoji: '🇧🇷', name: 'Pelé', color: 'from-[#eab308] to-[#14532d]', imagePath: '/Avatar/Pele_wearing_Brazil_jersey_202606082220.webp' },
  { id: 'avatar_ronaldinho', emoji: '🇧🇷', name: 'Ronaldinho', color: 'from-[#eab308] to-[#1e3b8a]', imagePath: '/Avatar/Ronaldinho_in_Brazil_jersey_202606082220.webp' },
  { id: 'avatar_ronaldo_nazario', emoji: '🇧🇷', name: 'Ronaldo Nazário', color: 'from-[#eab308] to-[#0f172a]', imagePath: '/Avatar/Ronaldo_Nazario_soccer_ball_yell…_202606082219.webp' },
  { id: 'avatar_cristiano', emoji: '🇵🇹', name: 'C. Ronaldo', color: 'from-[#dc2626] to-[#14532d]', imagePath: '/Avatar/Cristiano_Ronaldo_standing_with_…_202606082220.webp' },
  { id: 'avatar_mbappe', emoji: '🇫🇷', name: 'Kylian Mbappé', color: 'from-[#1e3b8a] to-[#dc2626]', imagePath: '/Avatar/Cartoon_avatar_wearing_France_je…_202606082218.webp' },
  { id: 'avatar_haaland', emoji: '🇳🇴', name: 'Erling Haaland', color: 'from-[#0284c7] to-[#eab308]', imagePath: '/Avatar/Erling_Haaland_with_soccer_ball_202606082219.webp' },
  { id: 'avatar_neymar', emoji: '🇧🇷', name: 'Neymar Jr', color: 'from-[#eab308] to-[#0284c7]', imagePath: '/Avatar/Neymar_Jr_winking_soccer_ball_202606082219.webp' },
  { id: 'avatar_zlatan', emoji: '🇸🇪', name: 'Zlatan Ibrahimović', color: 'from-[#dc2626] to-[#0f172a]', imagePath: '/Avatar/Zlatan_Ibrahimovic_AC_Milan_jersey_202606082219.webp' },
  { id: 'avatar_modric', emoji: '🇭🇷', name: 'Luka Modrić', color: 'from-[#dc2626] to-[#0284c7]', imagePath: '/Avatar/Cartoon_avatar_wearing_Croatia_j…_202606082219.webp' },
  { id: 'avatar_pirlo', emoji: '🇮🇹', name: 'Andrea Pirlo', color: 'from-[#1e3b8a] to-[#0f172a]', imagePath: '/Avatar/Andrea_Pirlo_with_soccer_ball_202606082219.webp' },
  { id: 'avatar_buffon', emoji: '🇮🇹', name: 'Gianluigi Buffon', color: 'from-[#6b7280] to-[#0f172a]', imagePath: '/Avatar/Cartoon_avatar_Gianluigi_Buffon_…_202606082219.webp' },
  { id: 'avatar_eto', emoji: '🇨🇲', name: "Samuel Eto'o", color: 'from-[#15803d] to-[#dc2626]', imagePath: '/Avatar/Cartoon_avatar_wearing_Cameroon_…_202606082218.webp' },
  { id: 'avatar_drogba', emoji: '🇨🇮', name: 'Didier Drogba', color: 'from-[#f97316] to-[#15803d]', imagePath: '/Avatar/Didier_Drogba_wearing_Ivory_Coas…_202606082219.webp' },
  { id: 'avatar_henry', emoji: '🇫🇷', name: 'Thierry Henry', color: 'from-[#dc2626] to-[#1e3b8a]', imagePath: '/Avatar/Thierry_Henry_wearing_Arsenal_je…_202606082219.webp' },
  { id: 'avatar_cruyff', emoji: '🇳🇱', name: 'Johan Cruyff', color: 'from-[#f97316] to-[#1e3b8a]', imagePath: '/Avatar/Johan_Cruyff_in_orange_jersey_202606082222.webp' },
  { id: 'avatar_beckenbauer', emoji: '🇩🇪', name: 'F. Beckenbauer', color: 'from-[#ffffff] to-[#0f172a]', imagePath: '/Avatar/Cartoon_avatar_Franz_Beckenbauer…_202606082222.webp' },
  { id: 'avatar_beckham', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', name: 'David Beckham', color: 'from-[#ffffff] to-[#1e3b8a]', imagePath: '/Avatar/David_Beckham_in_England_jersey_202606082222.webp' },
  { id: 'avatar_de_bruyne', emoji: '🇧🇪', name: 'Kevin De Bruyne', color: 'from-[#0284c7] to-[#dc2626]', imagePath: '/Avatar/Kevin_De_Bruyne_soccer_ball_202606082219.webp' },
  { id: 'avatar_benzema', emoji: '🇫🇷', name: 'Karim Benzema', color: 'from-[#ffffff] to-[#1e3a8a]', imagePath: '/Avatar/Karim_Benzema_holding_soccer_ball_202606082219.webp' },
  { id: 'avatar_salah', emoji: '🇪🇬', name: 'Mohamed Salah', color: 'from-[#dc2626] to-[#14532d]', imagePath: '/Avatar/Mohamed_Salah_soccer_ball_profile_202606082222.webp' },
  { id: 'avatar_ribery', emoji: '🇫🇷', name: 'Franck Ribéry', color: 'from-[#1e3b8a] to-[#dc2626]', imagePath: '/Avatar/Franck_Ribery_holding_soccer_ball_202606082222.webp' },
];

export const getAvatarConfig = (avatarKey: string): AvatarInfo => {
  return AVATARS.find(a => a.id === avatarKey) || {
    id: 'unknown',
    emoji: '👤',
    name: 'Inconnu',
    color: 'from-white/10 to-white/5'
  };
};
