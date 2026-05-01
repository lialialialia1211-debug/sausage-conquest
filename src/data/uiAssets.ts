export type UiAssetCategory = 'grill-hud' | 'judgement' | 'shop' | 'sticker';

export interface UiAssetDefinition {
  key: string;
  path: string;
  width: number;
  height: number;
  category: UiAssetCategory;
  usage: string;
}

export const UI_ASSET_BASE_PATH = 'ui/';

export const UI_ASSETS: UiAssetDefinition[] = [
  { key: 'ui-note-don', path: 'ui/ui-note-don.png', width: 256, height: 256, category: 'grill-hud', usage: 'D lane / DON rhythm note visual' },
  { key: 'ui-note-ka', path: 'ui/ui-note-ka.png', width: 256, height: 256, category: 'grill-hud', usage: 'F lane / KA rhythm note visual' },
  { key: 'ui-hit-zone', path: 'ui/ui-hit-zone.png', width: 256, height: 256, category: 'grill-hud', usage: 'Rhythm judgement target marker' },
  { key: 'ui-heat-up', path: 'ui/ui-heat-up.png', width: 512, height: 256, category: 'grill-hud', usage: 'Full grill heat-up feedback banner' },
  { key: 'ui-combo-badge', path: 'ui/ui-combo-badge.png', width: 512, height: 256, category: 'grill-hud', usage: 'Center rhythm combo badge base' },
  { key: 'ui-service-combo', path: 'ui/ui-service-combo.png', width: 512, height: 256, category: 'grill-hud', usage: 'Batch serve / service combo feedback' },
  { key: 'ui-warming-slot', path: 'ui/ui-warming-slot.png', width: 512, height: 256, category: 'grill-hud', usage: 'Warming zone slot frame' },
  { key: 'ui-grill-slot', path: 'ui/ui-grill-slot.png', width: 512, height: 256, category: 'grill-hud', usage: 'Grill slot frame' },
  { key: 'ui-fire-meter', path: 'ui/ui-fire-meter.png', width: 512, height: 128, category: 'grill-hud', usage: 'Heat / fire meter frame' },
  { key: 'ui-pause-overlay-icon', path: 'ui/ui-pause-overlay-icon.png', width: 256, height: 256, category: 'grill-hud', usage: 'External pause overlay icon' },
  { key: 'ui-customer-queue-bg', path: 'ui/ui-customer-queue-bg.png', width: 1024, height: 256, category: 'grill-hud', usage: 'Customer queue background frame' },
  { key: 'ui-customer-patience-bar', path: 'ui/ui-customer-patience-bar.png', width: 512, height: 128, category: 'grill-hud', usage: 'Customer patience meter frame' },
  { key: 'ui-rhythm-stats-panel', path: 'ui/ui-rhythm-stats-panel.png', width: 768, height: 256, category: 'grill-hud', usage: 'Rhythm judgement stats panel frame' },
  { key: 'ui-money-chip', path: 'ui/ui-money-chip.png', width: 512, height: 256, category: 'grill-hud', usage: 'Revenue HUD chip frame' },
  { key: 'ui-day-chip', path: 'ui/ui-day-chip.png', width: 512, height: 256, category: 'grill-hud', usage: 'Day HUD chip frame' },
  { key: 'ui-summary-grade-badge', path: 'ui/ui-summary-grade-badge.png', width: 512, height: 512, category: 'grill-hud', usage: 'Summary grade badge frame' },
  { key: 'ui-mode-hardcore-card', path: 'ui/ui-mode-hardcore-card.png', width: 768, height: 512, category: 'grill-hud', usage: 'Boot mode selection card for hardcore mode' },
  { key: 'ui-mode-casual-card', path: 'ui/ui-mode-casual-card.png', width: 768, height: 512, category: 'grill-hud', usage: 'Boot mode selection card for casual mode' },

  { key: 'judge-perfect', path: 'ui/judge-perfect.png', width: 768, height: 256, category: 'judgement', usage: 'PERFECT hit judgement popup' },
  { key: 'judge-great', path: 'ui/judge-great.png', width: 768, height: 256, category: 'judgement', usage: 'GREAT hit judgement popup' },
  { key: 'judge-good', path: 'ui/judge-good.png', width: 768, height: 256, category: 'judgement', usage: 'GOOD hit judgement popup' },
  { key: 'judge-miss', path: 'ui/judge-miss.png', width: 768, height: 256, category: 'judgement', usage: 'MISS hit judgement popup' },
  { key: 'judge-full-combo', path: 'ui/judge-full-combo.png', width: 1024, height: 384, category: 'judgement', usage: 'End-of-song full combo celebration' },

  { key: 'upgrade-rhythm-grill', path: 'ui/upgrade-rhythm-grill.png', width: 512, height: 512, category: 'shop', usage: 'grill-expand upgrade icon replacement' },
  { key: 'upgrade-fresh-box', path: 'ui/upgrade-fresh-box.png', width: 512, height: 512, category: 'shop', usage: 'mini-fridge upgrade icon replacement' },
  { key: 'upgrade-neon-sign-rhythm', path: 'ui/upgrade-neon-sign-rhythm.png', width: 512, height: 512, category: 'shop', usage: 'neon-sign upgrade icon replacement' },
  { key: 'upgrade-seat-buffer', path: 'ui/upgrade-seat-buffer.png', width: 512, height: 512, category: 'shop', usage: 'seating upgrade icon replacement' },
  { key: 'upgrade-auto-pack', path: 'ui/upgrade-auto-pack.png', width: 512, height: 512, category: 'shop', usage: 'auto-grill upgrade icon replacement' },
  { key: 'marketing-rhythm-flyer', path: 'ui/marketing-rhythm-flyer.png', width: 512, height: 512, category: 'shop', usage: 'flyer marketing item icon replacement' },
  { key: 'marketing-discount-beat', path: 'ui/marketing-discount-beat.png', width: 512, height: 512, category: 'shop', usage: 'discount-sign marketing item icon replacement' },
  { key: 'marketing-free-sample-hot', path: 'ui/marketing-free-sample-hot.png', width: 512, height: 512, category: 'shop', usage: 'free-sample marketing item icon replacement' },
  { key: 'marketing-sausage-box', path: 'ui/marketing-sausage-box.png', width: 512, height: 512, category: 'shop', usage: 'sausagebox marketing item icon replacement' },

  { key: 'sticker-sausage-energy', path: 'ui/sticker-sausage-energy.png', width: 512, height: 512, category: 'sticker', usage: 'High-energy combo or power-up sticker' },
  { key: 'sticker-too-hot', path: 'ui/sticker-too-hot.png', width: 512, height: 512, category: 'sticker', usage: 'Overheat / too spicy / heat warning sticker' },
  { key: 'sticker-censored-sausage', path: 'ui/sticker-censored-sausage.png', width: 512, height: 512, category: 'sticker', usage: 'Cheeky censored feedback sticker' },
  { key: 'sticker-customer-blush', path: 'ui/sticker-customer-blush.png', width: 512, height: 512, category: 'sticker', usage: 'Customer reaction sticker' },
];

export const SHOP_ICON_BY_ITEM_ID: Record<string, string> = {
  'grill-expand': 'ui/upgrade-rhythm-grill.png',
  'mini-fridge': 'ui/upgrade-fresh-box.png',
  'neon-sign': 'ui/upgrade-neon-sign-rhythm.png',
  seating: 'ui/upgrade-seat-buffer.png',
  'auto-grill': 'ui/upgrade-auto-pack.png',
  flyer: 'ui/marketing-rhythm-flyer.png',
  'discount-sign': 'ui/marketing-discount-beat.png',
  'free-sample': 'ui/marketing-free-sample-hot.png',
  sausagebox: 'ui/marketing-sausage-box.png',
};

export const JUDGEMENT_ASSET_BY_RESULT: Record<string, string> = {
  perfect: 'judge-perfect',
  great: 'judge-great',
  good: 'judge-good',
  miss: 'judge-miss',
};
