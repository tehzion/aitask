/**
 * Fiverr-style "requirements" prompts per service. They start a good brief:
 * each prompt becomes an empty "Label: " line the PM fills in. Labels are
 * message keys, translated when inserted.
 */
const TEMPLATES: Record<string, readonly string[]> = {
  Design: ['Size and format', 'Colours and fonts', 'Logo and brand assets', 'Text to include'],
  'Social Media': ['Platform', 'Posting date', 'Caption language', 'Hashtags or tags'],
  Video: ['Length', 'Aspect ratio', 'Music or voice-over', 'Call to action'],
  Website: ['Pages needed', 'Domain and hosting', 'Content ready', 'Reference sites'],
  SEO: ['Target keywords', 'Target location', 'Competitors'],
  Ads: ['Platform', 'Budget', 'Audience', 'Offer'],
  Branding: ['Brand name', 'Style and mood', 'Logo versions needed', 'Deliverables'],
};
const GENERIC = ['Goal', 'Audience', 'Items that must be included'] as const;

export const getBriefPrompts = (serviceType: string | undefined): readonly string[] => (
  (serviceType && TEMPLATES[serviceType]) || GENERIC
);

/**
 * Adds a "Label: " line for each prompt that is not already in the text,
 * keeping everything the PM already wrote. Returns the text unchanged when
 * every prompt is present, and never grows past `maxLength`.
 */
export const applyBriefPrompts = (current: string, labels: readonly string[], maxLength = 1000): string => {
  const missing = labels.filter(label => !current.toLowerCase().includes(`${label.toLowerCase()}:`));
  if (missing.length === 0) return current;
  const base = current.trim() ? (current.endsWith('\n') ? current : `${current}\n`) : '';
  return `${base}${missing.map(label => `${label}: `).join('\n')}`.slice(0, maxLength);
};
