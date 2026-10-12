import itemImages from '../data/item-images.json';

// Item icons are served by farmrpg.com (paths synced from buddy.farm, which
// links them the same way). Items without a known icon render nothing.
const images = itemImages as Record<string, string>;

export function ItemIcon({ item, size = 16 }: { item: string; size?: number }) {
  const path = images[item];
  if (!path) return null;
  return (
    <img
      src={`https://farmrpg.com${path}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="inline-block flex-shrink-0"
      style={{ width: size, height: size, objectFit: 'contain', verticalAlign: 'middle', marginRight: '0.3em' }}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}
