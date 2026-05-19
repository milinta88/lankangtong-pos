import Badge from './Badge.jsx';

export default function StatusBadge({ children, tone = 'neutral' }) {
  return <Badge tone={tone}>{children}</Badge>;
}
