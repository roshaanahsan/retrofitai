import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  Tooltip,
} from 'recharts';
import type { SkillGapChartData } from '@/types';

interface Props {
  data: SkillGapChartData;
  topKeywords?: { keyword: string; count: number }[];
}

function scoreSkill(skill: string, strongMatches: string[], gaps: string[]): number {
  const s = skill.toLowerCase();
  const isMatch = strongMatches.some((m) => m.toLowerCase().includes(s) || s.includes(m.toLowerCase().split(' ')[0]));
  const isGap = gaps.some((g) => g.toLowerCase().includes(s) || s.includes(g.toLowerCase().split(' ')[0]));
  if (isMatch) return 82;
  if (isGap) return 32;
  return 55;
}

function buildChartLabels(
  data: SkillGapChartData,
  topKeywords?: { keyword: string; count: number }[],
): string[] {
  const { profileSkills, strongMatches, gaps } = data;
  const matchLabels = strongMatches.length > 0 ? strongMatches.slice(0, 4) : profileSkills.slice(0, 4);
  const gapLabels = gaps.length > 0
    ? gaps.slice(0, 3)
    : (topKeywords || []).map((k) => k.keyword).slice(0, 3);

  const labels = [...matchLabels, ...gapLabels].filter(Boolean);
  const seen = new Set<string>();
  const unique = labels.filter((l) => {
    const key = l.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length < 3) {
    for (const skill of profileSkills) {
      if (unique.length >= 3) break;
      const key = skill.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(skill);
      }
    }
  }

  return unique.slice(0, 7);
}

export default function SkillGapChart({ data, topKeywords }: Props) {
  const { strongMatches, gaps, profileSkills } = data;
  const allLabels = buildChartLabels(data, topKeywords);

  if (allLabels.length < 3) {
    return (
      <p style={{ fontSize: 11, color: '#94A3B8', margin: '12px 0 0', fontFamily: 'Poppins, sans-serif' }}>
        Add more job analyses to populate the skill radar.
      </p>
    );
  }

  const chartPoints = allLabels.map((label) => ({
    subject: label.length > 14 ? `${label.slice(0, 12)}…` : label,
    score: scoreSkill(label, strongMatches.length ? strongMatches : profileSkills, gaps),
    fullLabel: label,
  }));

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: 'Poppins, sans-serif' }}>
        Skill Match Radar
        {data.company ? (
          <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#94A3B8', marginLeft: 6 }}>
            · {data.company}
          </span>
        ) : null}
      </p>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 220, height: 180, minWidth: 220, minHeight: 180, flexShrink: 0 }}>
          <RadarChart width={220} height={180} data={chartPoints} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <PolarGrid stroke="#E2E8F0" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fontSize: 9, fill: '#64748B', fontFamily: 'Poppins, sans-serif' }}
            />
            <Radar
              name="Match"
              dataKey="score"
              stroke="#16A34A"
              fill="#16A34A"
              fillOpacity={0.25}
              strokeWidth={2}
            />
            <Tooltip
              formatter={(val: number, _name: string, props: { payload?: { fullLabel?: string } }) => [
                `${val}/100`,
                props.payload?.fullLabel || 'Score',
              ]}
              contentStyle={{ fontFamily: 'Poppins, sans-serif', fontSize: 11, borderRadius: 9, border: '1px solid #E2E8F0' }}
            />
          </RadarChart>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12, minWidth: 0 }}>
          {(strongMatches.length ? strongMatches : profileSkills).slice(0, 3).map((m) => (
            <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: '#16A34A', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#15803D', fontFamily: 'Poppins, sans-serif', fontWeight: 500 }}>{m}</span>
            </div>
          ))}
          {(gaps.length ? gaps : (topKeywords || []).map((k) => k.keyword)).slice(0, 3).map((g) => (
            <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: '#F59E0B', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#B45309', fontFamily: 'Poppins, sans-serif', fontWeight: 400 }}>{g}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
