import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';

interface Props {
  breakdown: {
    noResponse: number;
    phoneScreen: number;
    firstInterview: number;
    finalRound: number;
  };
  totalApplications: number;
}

export default function RejectionFunnelChart({ breakdown, totalApplications }: Props) {
  const data = [
    { stage: 'No Response', value: breakdown.noResponse, label: 'No Response' },
    { stage: 'Phone Screen', value: breakdown.phoneScreen, label: 'Phone Screen' },
    { stage: '1st Interview', value: breakdown.firstInterview, label: 'First Interview' },
    { stage: 'Final Round', value: breakdown.finalRound, label: 'Final Round' },
  ].filter((d) => totalApplications > 0);

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  if (data.every((d) => d.value === 0)) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: 'Poppins, sans-serif' }}>
        Rejection Funnel
      </p>
      <div style={{ width: '100%', height: 130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fontFamily: 'Poppins, sans-serif', fill: '#94A3B8' }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="stage"
              tick={{ fontSize: 10, fontFamily: 'Poppins, sans-serif', fill: '#475569' }}
              width={82}
            />
            <Tooltip
              formatter={(val: number, _name: string, props: { payload?: { label?: string } }) => [
                `${val} rejection${val !== 1 ? 's' : ''}`,
                props.payload?.label || 'Stage',
              ]}
              contentStyle={{ fontFamily: 'Poppins, sans-serif', fontSize: 11, borderRadius: 9, border: '1px solid #E2E8F0' }}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18}>
              {data.map((entry) => (
                <Cell
                  key={entry.stage}
                  fill={entry.value === maxVal ? '#16A34A' : '#86EFAC'}
                  opacity={entry.value === maxVal ? 1 : 0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
