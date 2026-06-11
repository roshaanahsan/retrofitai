import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMomentumColor(score: number): string {
  if (score <= 40) return 'bg-red-100 text-red-700';
  if (score <= 70) return 'bg-amber-100 text-amber-700';
  return 'bg-green-100 text-green-700';
}

export function getVerdictStyle(verdict: string) {
  switch (verdict) {
    case 'APPLY_NOW':
      return { label: 'Apply Now', className: 'font-semibold text-sm text-green-700' };
    case 'APPLY_WITH_EDITS':
      return { label: 'Apply With Edits', className: 'font-semibold text-sm text-amber-700' };
    case 'SKIP':
      return { label: 'Skip This One', className: 'font-semibold text-sm text-red-600' };
    default:
      return { label: verdict, className: 'font-semibold text-sm text-slate-500' };
  }
}

export function getStatusBadgeStyle(status: string): Record<string, string | number> {
  switch (status) {
    case 'APPLIED':
      return { background: '#F1F5F9', color: '#475569' };
    case 'NO_RESPONSE':
      return { background: '#FFFBEB', color: '#92400E' };
    case 'PHONE_SCREEN':
      return { background: '#DCFCE7', color: '#15803D' };
    case 'INTERVIEW':
      return { background: '#F0FDF4', color: '#166534', fontWeight: 600 };
    case 'OFFER':
      return { background: '#16A34A', color: '#FFFFFF', fontWeight: 600 };
    case 'REJECTED':
      return { background: '#FEF2F2', color: '#991B1B' };
    default:
      return { background: '#F1F5F9', color: '#64748B' };
  }
}

export function formatStatus(status: string): string {
  switch (status) {
    case 'NO_RESPONSE':  return 'No Response';
    case 'PHONE_SCREEN': return 'Phone Screen';
    case 'APPLIED':      return 'Applied';
    case 'INTERVIEW':    return 'Interview';
    case 'OFFER':        return 'Offer';
    case 'REJECTED':     return 'Rejected';
    default:             return status;
  }
}

export function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export function formatRelativeDate(dateStr: string): string {
  const days = daysSince(dateStr);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

// Re-export for backwards compat
export function getStatusBadgeClass(_status: string): string { return ''; }
